// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Vérifie que la projection SQL et son jumeau TypeScript rangent un point dans
// LA MÊME tuile.
//
// POURQUOI CE SCRIPT PLUTÔT QU'UN TEST UNITAIRE : c'est le SQL (TILE_XY) qui
// range réellement les paquets, `lonLatToTile` n'a aucun appelant en production
// — il ne sert qu'à reconstruire la géométrie côté client via tileToBounds.
// Un test vitest ne pourrait éprouver que la fonction TS, donc du code mort :
// il resterait vert alors même que le SQL dérive. Or une divergence d'une seule
// cellule décale chaque tuile de ~1,15 km à z15 : la carte montrerait de la
// couverture sur un terrain jamais mesuré, et c'est là-dessus qu'on déciderait
// d'implanter un relais.
//
// Usage : DATABASE_URL=... yarn tsx scripts/check-tile-parity.ts
// Sortie : code 0 si parité totale, 1 au premier écart (détaillé).
import "../src/worker/env";
import { pool } from "../lib/db";
import { TILE_XY } from "../lib/queries/coverage-tiles";
import { lonLatToTile } from "../lib/tiles";
import {
  MAX_COVERAGE_TILE_ZOOM,
  MIN_COVERAGE_TILE_ZOOM,
} from "../lib/queries/settings";

// Grille couvrant La Réunion + les cas limites qui ont motivé le clamp.
function testPoints(): { lat: number; lon: number; label: string }[] {
  const pts: { lat: number; lon: number; label: string }[] = [];

  for (let lat = -21.9; lat <= -20.4; lat += 0.05) {
    for (let lon = 54.7; lon <= 56.3; lon += 0.05) {
      pts.push({ lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)), label: "réunion" });
    }
  }

  pts.push(
    { lat: 0, lon: 0, label: "origine" },
    { lat: 0, lon: 180, label: "antiméridien est (clamp)" },
    { lat: 0, lon: -180, label: "antiméridien ouest" },
    { lat: 85, lon: 0, label: "limite mercator nord" },
    { lat: -85, lon: 0, label: "limite mercator sud" },
    { lat: -20.8789, lon: 55.4481, label: "Saint-Denis" },
    { lat: -21.3393, lon: 55.4781, label: "Saint-Pierre" },
  );
  return pts;
}

async function main(): Promise<void> {
  const pts = testPoints();
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);

  // La MÊME expression que la requête de production, appliquée à des points
  // fournis en paramètres (aucune interpolation de valeur).
  const sql = `
    SELECT p.lat, p.lon,
${TILE_XY}
    FROM unnest($2::double precision[], $3::double precision[]) AS p(lat, lon)
  `;

  let ecarts = 0;
  let comparaisons = 0;

  for (let z = MIN_COVERAGE_TILE_ZOOM; z <= MAX_COVERAGE_TILE_ZOOM; z++) {
    const { rows } = await pool.query<{
      lat: number;
      lon: number;
      tx: number;
      ty: number;
    }>(sql, [z, lats, lons]);

    rows.forEach((row, i) => {
      const attendu = lonLatToTile(row.lon, row.lat, z);
      comparaisons++;
      if (attendu.x !== Number(row.tx) || attendu.y !== Number(row.ty)) {
        ecarts++;
        if (ecarts <= 10) {
          console.error(
            `✗ z${z} ${pts[i].label} (${row.lat}, ${row.lon}) : ` +
              `SQL (${row.tx}, ${row.ty}) ≠ TS (${attendu.x}, ${attendu.y})`,
          );
        }
      }
    });
  }

  const zooms = MAX_COVERAGE_TILE_ZOOM - MIN_COVERAGE_TILE_ZOOM + 1;
  if (ecarts > 0) {
    console.error(
      `\n✗ PARITÉ ROMPUE : ${ecarts} écart(s) sur ${comparaisons} comparaisons ` +
        `(${pts.length} points × ${zooms} zooms).`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `✓ Parité SQL ↔ TypeScript vérifiée : ${comparaisons} comparaisons ` +
      `(${pts.length} points × ${zooms} zooms, z${MIN_COVERAGE_TILE_ZOOM}–z${MAX_COVERAGE_TILE_ZOOM}).`,
  );
}

main()
  .catch((err: Error) => {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
