// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Grille de tuiles « slippy » (Web Mercator, convention OSM/XYZ) — la maille de
// la couche de couverture radio. Isomorphe : le serveur agrège en (x,y) via le
// même calcul en SQL, le client reconstruit les polygones avec tileToBounds.
// C'est pourquoi la réponse d'API ne transporte que (x,y) + stats, pas de
// géométrie (~115 Ko au lieu de ~570 Ko à z15 sur La Réunion).
//
// COÏNCIDENCE UTILE, exploitée par coverage-tiles.ts : une tuile de zoom Z fait
// exactement 360/2^Z degrés de large, et Meshtastic tronque la position aux N
// bits de poids fort, soit une résolution de 360/2^N degrés. Donc
// `precision_bits = N` produit EXACTEMENT la grille longitudinale du zoom N :
// un node réglé à precision_bits >= Z tombe dans une seule tuile de zoom Z.

// Limite de la projection Mercator (au-delà, y diverge).
export const MAX_MERCATOR_LAT = 85.05112878;

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
