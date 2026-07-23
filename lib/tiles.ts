// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Grille de tuiles « slippy » (Web Mercator, convention OSM/XYZ) — la maille de
// la couche de couverture radio. Isomorphe : le serveur agrège en (x,y) via le
// même calcul en SQL, le client reconstruit les polygones avec tileToBounds.
// C'est pourquoi la réponse d'API ne transporte que (x,y) + stats, pas de
// géométrie (~115 Ko au lieu de ~570 Ko à z15 sur La Réunion).
//
// IMPORTANT : `precision_bits` Meshtastic n'est PAS un zoom cartographique.
// Le firmware masque les bits faibles des coordonnées entières (degrés × 1e7)
// puis publie le centre de la zone possible. coverage-tiles.ts vérifie donc que
// cette zone entière tient dans une seule tuile avant d'y attribuer une mesure.

// Limite de la projection Mercator (au-delà, y diverge).
export const MAX_MERCATOR_LAT = 85.05112878;
export const MESHTASTIC_COORDINATE_SCALE = 10_000_000;

export interface TileBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

// Nombre de tuiles par côté au zoom z.
export function tileCount(z: number): number {
  return 2 ** z;
}

// Demi-largeur, en degrés, de la zone possible autour d'une coordonnée publiée.
// À N < 32, PositionPrecision.cpp conserve N bits de poids fort et recentre la
// valeur dans une cellule de 2^(32-N) unités. À 32, la coordonnée est exacte à
// l'unité du protocole. Une valeur absente, nulle ou non entière reste ambiguë.
export function meshtasticPrecisionHalfSpan(
  precisionBits: number,
): number | null {
  if (
    !Number.isInteger(precisionBits) ||
    precisionBits < 1 ||
    precisionBits > 32
  ) {
    return null;
  }
  return precisionBits === 32
    ? 0
    : 2 ** (31 - precisionBits) / MESHTASTIC_COORDINATE_SCALE;
}

// (lon, lat) -> indices de tuile. Latitude bornée à la limite Mercator et
// indices bornés à [0, n-1] : une coordonnée aberrante ne doit jamais produire
// un index hors grille (elle sera de toute façon filtrée en amont).
export function lonLatToTile(
  lon: number,
  lat: number,
  z: number,
): { x: number; y: number } {
  const n = tileCount(z);
  const latRad = (clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT) * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1) };
}

// Une position imprécise n'est attribuable à une tuile que si ses quatre
// extrêmes possibles restent dans cette même tuile. On préfère perdre une
// mesure située sur une frontière plutôt que peindre arbitrairement un côté.
export function positionUncertaintyFitsTile(
  lon: number,
  lat: number,
  precisionBits: number,
  z: number,
): boolean {
  const halfSpan = meshtasticPrecisionHalfSpan(precisionBits);
  if (halfSpan === null) return false;

  const west = lon - halfSpan;
  const east = lon + halfSpan;
  const south = lat - halfSpan;
  const north = lat + halfSpan;
  if (
    west < -180 ||
    east > 180 ||
    south < -MAX_MERCATOR_LAT ||
    north > MAX_MERCATOR_LAT
  ) {
    return false;
  }

  const center = lonLatToTile(lon, lat, z);
  return (
    lonLatToTile(west, lat, z).x === center.x &&
    lonLatToTile(east, lat, z).x === center.x &&
    lonLatToTile(lon, south, z).y === center.y &&
    lonLatToTile(lon, north, z).y === center.y
  );
}

// Bord ouest de la colonne x.
export function tileToLon(x: number, z: number): number {
  return (x / tileCount(z)) * 360 - 180;
}

// Bord nord de la ligne y.
export function tileToLat(y: number, z: number): number {
  const t = Math.PI * (1 - (2 * y) / tileCount(z));
  return (Math.atan(Math.sinh(t)) * 180) / Math.PI;
}

// Emprise géographique d'une tuile. y croît vers le SUD (convention XYZ) :
// north = bord y, south = bord y+1.
export function tileToBounds(x: number, y: number, z: number): TileBounds {
  return {
    west: tileToLon(x, z),
    east: tileToLon(x + 1, z),
    north: tileToLat(y, z),
    south: tileToLat(y + 1, z),
  };
}

// Anneau GeoJSON fermé (5 points, sens horaire) d'une tuile.
export function tileToRing(
  x: number,
  y: number,
  z: number,
): [number, number][] {
  const b = tileToBounds(x, y, z);
  return [
    [b.west, b.north],
    [b.east, b.north],
    [b.east, b.south],
    [b.west, b.south],
    [b.west, b.north],
  ];
}
