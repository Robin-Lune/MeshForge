// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import type { MapBounds } from "../../types";

// Configuration runtime stockée en DB (table `settings`), éditable par les
// admins (/admin/config). SÉCURITÉ :
//  - Clés ALLOWLISTÉES en dur (SPECS). Aucune clé/colonne dynamique issue du
//    client -> pas de SQLi (clé + valeur passées en paramètres $1/$2).
//  - Lecture tolérante (parseStored -> défaut si valeur corrompue).
//  - Écriture STRICTE (validateInput jette) : une saisie invalide est refusée,
//    jamais silencieusement remplacée par un défaut.

export type SettingKey =
  | "misconfig_max_packets_24h"
  | "public_channels"
  | "map_bounds"
  | "map_min_zoom";

// Type de la valeur pour chaque clé.
interface SettingValues {
  misconfig_max_packets_24h: number;
  public_channels: string[];
  map_bounds: MapBounds | null;
  map_min_zoom: number;
}

export const DEFAULT_MAX_PACKETS_24H = 1000;
const DEFAULT_PUBLIC_CHANNELS = ["Fr_Balise", "Fr_EMCOM", "Fr_BlaBla"];
const REUNION_BOUNDS: MapBounds = { west: 54.7, south: -21.9, east: 56.3, north: -20.4 };
const DEFAULT_MIN_ZOOM = 8;

// Noms de canaux : alphanumérique + _ - (anti-injection : on n'accepte rien d'autre).
const CHANNEL_RE = /^[A-Za-z0-9_-]{1,40}$/;

// --- Entier positif (seuil bavard) ---
// Entier > 0 sinon `fallback` (lecture tolérante, logique pure testée).
export function parsePositiveInt(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Entier > 0 strict (validation écriture) : jette sinon (logique pure testée).
export function requirePositiveInt(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("valeur invalide : entier strictement positif attendu");
  }
  return n;
}

// --- Whitelist canaux ---
// Lecture tolérante : garde les noms valides (trim + dédup), sinon `fallback`.
export function parseChannelList(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const out = [
    ...new Set(
      raw
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim())
        .filter((c) => CHANNEL_RE.test(c)),
    ),
  ];
  return out.length > 0 ? out : fallback;
}

// Écriture stricte : tableau NON vide de noms valides ; jette sinon (interdit
// vider l'allowlist = couper l'ingestion par accident, et bloque l'injection).
export function requireChannelList(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("au moins un canal requis (tableau non vide)");
  }
  const out = raw.map((c) => {
    if (typeof c !== "string" || !CHANNEL_RE.test(c.trim())) {
      throw new Error(`nom de canal invalide : ${String(c)}`);
    }
    return c.trim();
  });
  return [...new Set(out)];
}

// --- Bornes carte ---
function isValidBounds(b: unknown): b is MapBounds {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  const inLon = (v: unknown) => typeof v === "number" && v >= -180 && v <= 180;
  const inLat = (v: unknown) => typeof v === "number" && v >= -90 && v <= 90;
  return (
    inLon(o.west) &&
    inLon(o.east) &&
    inLat(o.south) &&
    inLat(o.north) &&
    (o.west as number) < (o.east as number) &&
    (o.south as number) < (o.north as number)
  );
}

const pickBounds = (b: MapBounds): MapBounds => ({
  west: b.west,
  south: b.south,
  east: b.east,
  north: b.north,
});

// null = carte ouverte. Lecture tolérante : `fallback` si invalide.
export function parseMapBounds(
  raw: unknown,
  fallback: MapBounds | null,
): MapBounds | null {
  if (raw === null) return null;
  return isValidBounds(raw) ? pickBounds(raw) : fallback;
}

// Écriture stricte : null (ouvert) ou bornes valides ; jette sinon.
export function requireMapBounds(raw: unknown): MapBounds | null {
  if (raw === null) return null;
  if (!isValidBounds(raw)) {
    throw new Error(
      "bornes invalides : west<east, south<north, lon∈[-180,180], lat∈[-90,90]",
    );
  }
  return pickBounds(raw);
}

// --- Zoom minimum [0,22] (plage MapLibre) ---
export function parseZoom(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 22 ? n : fallback;
}

export function requireZoom(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 22) {
    throw new Error("zoom invalide : nombre dans [0,22] attendu");
  }
  return n;
}

interface Spec<K extends SettingKey> {
  default: SettingValues[K];
  parseStored: (raw: unknown) => SettingValues[K]; // lecture
  validateInput: (raw: unknown) => SettingValues[K]; // écriture (jette)
}

const SPECS: { [K in SettingKey]: Spec<K> } = {
  misconfig_max_packets_24h: {
    default: DEFAULT_MAX_PACKETS_24H,
    parseStored: (raw) => parsePositiveInt(raw, DEFAULT_MAX_PACKETS_24H),
    validateInput: (raw) => requirePositiveInt(raw),
  },
  public_channels: {
    default: DEFAULT_PUBLIC_CHANNELS,
    parseStored: (raw) => parseChannelList(raw, DEFAULT_PUBLIC_CHANNELS),
    validateInput: (raw) => requireChannelList(raw),
  },
  map_bounds: {
    default: REUNION_BOUNDS,
    parseStored: (raw) => parseMapBounds(raw, REUNION_BOUNDS),
    validateInput: (raw) => requireMapBounds(raw),
  },
  map_min_zoom: {
    default: DEFAULT_MIN_ZOOM,
    parseStored: (raw) => parseZoom(raw, DEFAULT_MIN_ZOOM),
    validateInput: (raw) => requireZoom(raw),
  },
};

const KEYS = Object.keys(SPECS) as SettingKey[];

function assertKey(key: string): asserts key is SettingKey {
  if (!Object.prototype.hasOwnProperty.call(SPECS, key)) {
    throw new Error(`clé de configuration inconnue : ${key}`);
  }
}

// Cache mémoire court : les pages admin sont force-dynamic, faible trafic ;
// setSetting rafraîchit la clé immédiatement (édition vue tout de suite).
const TTL_MS = 30_000;
const cache = new Map<SettingKey, { value: unknown; at: number }>();

const SELECT_SETTING = `SELECT value FROM settings WHERE key = $1`;
const UPSERT_SETTING = `
  INSERT INTO settings (key, value, updated_at)
  VALUES ($1, $2::jsonb, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
`;
const NOTIFY_SETTINGS = `SELECT pg_notify('settings_changed', $1)`;

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<SettingValues[K]> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.value as SettingValues[K];
  }
  const { rows } = await pool.query<{ value: unknown }>(SELECT_SETTING, [key]);
  const value = rows[0]
    ? SPECS[key].parseStored(rows[0].value)
    : SPECS[key].default;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: unknown,
): Promise<SettingValues[K]> {
  assertKey(key);
  const validated = SPECS[key].validateInput(value); // refuse l'invalide
  await pool.query(UPSERT_SETTING, [key, JSON.stringify(validated)]);
  cache.set(key, { value: validated, at: Date.now() });
  await pool.query(NOTIFY_SETTINGS, [key]); // notifie worker / autres instances
  return validated;
}

export async function getAllSettings(): Promise<SettingValues> {
  const entries = await Promise.all(
    KEYS.map(async (k) => [k, await getSetting(k)] as const),
  );
  return Object.fromEntries(entries) as unknown as SettingValues;
}
