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
  | "map_min_zoom"
  | "coverage_tile_zoom"
  | "legal_info"
  | "mqtt_onboarding";

export interface LegalInfo {
  companyName: string;
  companyType: string;
  companySiret: string;
  companyAddress: string;
  hostingProvider: string;
  hostingLocation: string;
}

export interface MqttOnboarding {
  mobileBroker: string;
  rootTopic: string;
  encryptionEnabled: boolean;
  jsonOutputEnabled: boolean;
  tlsEnabled: boolean;
  mapReportEnabled: boolean;
}

// Type de la valeur pour chaque clé.
interface SettingValues {
  misconfig_max_packets_24h: number;
  public_channels: string[];
  map_bounds: MapBounds | null;
  map_min_zoom: number;
  coverage_tile_zoom: number;
  legal_info: LegalInfo;
  mqtt_onboarding: MqttOnboarding;
}

export const DEFAULT_MAX_PACKETS_24H = 1000;
const DEFAULT_PUBLIC_CHANNELS = ["Fr_Balise", "Fr_EMCOM", "Fr_BlaBla"];
const REUNION_BOUNDS: MapBounds = { west: 54.7, south: -21.9, east: 56.3, north: -20.4 };
const DEFAULT_MIN_ZOOM = 8;

// Maille des tuiles de couverture radio (cf. lib/tiles.ts, coverage-tiles.ts).
// z15 ≈ 1,15 km de côté à La Réunion : le relief (remparts, cirques) fait
// basculer la couverture sur quelques centaines de mètres, une maille plus
// grossière moyennerait les deux versants d'une crête en une seule valeur.
// Plage VOLONTAIREMENT ÉTROITE :
//  - plancher 12 (~9 km) : au-delà la couche ne dit plus rien d'utile ;
//  - plafond 16 (~570 m) : au-delà on descend SOUS le flou de 500 m appliqué
//    aux marqueurs publics (snapToGrid), donc la couche agrégée exposerait une
//    granularité plus fine que le reste de la carte — et le nombre de tuiles
//    explose (×4 par niveau).
export const DEFAULT_COVERAGE_TILE_ZOOM = 15;
export const MIN_COVERAGE_TILE_ZOOM = 12;
export const MAX_COVERAGE_TILE_ZOOM = 16;
const DEFAULT_LEGAL_INFO: LegalInfo = {
  companyName: "À compléter",
  companyType: "À compléter",
  companySiret: "À compléter",
  companyAddress: "À compléter",
  hostingProvider: "À compléter",
  hostingLocation: "À compléter",
};
const DEFAULT_MQTT_ONBOARDING: MqttOnboarding = {
  mobileBroker: "mqtt.la-forge-numerique.com:1883",
  rootTopic: "msh/EU_868",
  encryptionEnabled: true,
  jsonOutputEnabled: true,
  tlsEnabled: false,
  mapReportEnabled: true,
};

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

// --- Maille des tuiles de couverture : ENTIER dans [12,16] ---
// Entier obligatoire (≠ map_min_zoom qui accepte les décimaux) : il sert
// d'exposant à 2^z côté SQL. Un z20 par faute de frappe générerait des millions
// de tuiles, d'où la plage stricte.
const isTileZoom = (n: number): boolean =>
  Number.isInteger(n) &&
  n >= MIN_COVERAGE_TILE_ZOOM &&
  n <= MAX_COVERAGE_TILE_ZOOM;

export function parseCoverageTileZoom(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return isTileZoom(n) ? n : fallback;
}

export function requireCoverageTileZoom(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!isTileZoom(n)) {
    throw new Error(
      `maille invalide : entier dans [${MIN_COVERAGE_TILE_ZOOM},${MAX_COVERAGE_TILE_ZOOM}] attendu`,
    );
  }
  return n;
}

const LEGAL_FIELDS: (keyof LegalInfo)[] = [
  "companyName",
  "companyType",
  "companySiret",
  "companyAddress",
  "hostingProvider",
  "hostingLocation",
];

function isLegalInfo(raw: unknown): raw is Record<keyof LegalInfo, string> {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return LEGAL_FIELDS.every((field) => typeof o[field] === "string");
}

function pickLegalInfo(raw: Record<keyof LegalInfo, string>): LegalInfo {
  return {
    companyName: raw.companyName.trim(),
    companyType: raw.companyType.trim(),
    companySiret: raw.companySiret.trim(),
    companyAddress: raw.companyAddress.trim(),
    hostingProvider: raw.hostingProvider.trim(),
    hostingLocation: raw.hostingLocation.trim(),
  };
}

export function parseLegalInfo(raw: unknown, fallback: LegalInfo): LegalInfo {
  return isLegalInfo(raw) ? pickLegalInfo(raw) : fallback;
}

export function requireLegalInfo(raw: unknown): LegalInfo {
  if (!isLegalInfo(raw)) {
    throw new Error("mentions légales invalides : objet incomplet");
  }
  const info = pickLegalInfo(raw);
  for (const field of LEGAL_FIELDS) {
    if (!info[field] || info[field].length > 500) {
      throw new Error("mentions légales invalides : champ vide ou trop long");
    }
  }
  return info;
}

function isMqttOnboarding(
  raw: unknown,
): raw is Record<keyof MqttOnboarding, string | boolean> {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.mobileBroker === "string" &&
    typeof o.rootTopic === "string" &&
    typeof o.encryptionEnabled === "boolean" &&
    typeof o.jsonOutputEnabled === "boolean" &&
    typeof o.tlsEnabled === "boolean" &&
    typeof o.mapReportEnabled === "boolean"
  );
}

function pickMqttOnboarding(
  raw: Record<keyof MqttOnboarding, string | boolean>,
): MqttOnboarding {
  return {
    mobileBroker: String(raw.mobileBroker).trim(),
    rootTopic: String(raw.rootTopic).trim(),
    encryptionEnabled: Boolean(raw.encryptionEnabled),
    jsonOutputEnabled: Boolean(raw.jsonOutputEnabled),
    tlsEnabled: Boolean(raw.tlsEnabled),
    mapReportEnabled: Boolean(raw.mapReportEnabled),
  };
}

export function parseMqttOnboarding(
  raw: unknown,
  fallback: MqttOnboarding,
): MqttOnboarding {
  return isMqttOnboarding(raw) ? pickMqttOnboarding(raw) : fallback;
}

export function requireMqttOnboarding(raw: unknown): MqttOnboarding {
  if (!isMqttOnboarding(raw)) {
    throw new Error("configuration MQTT invalide : objet incomplet");
  }
  const info = pickMqttOnboarding(raw);
  for (const field of ["mobileBroker", "rootTopic"] as const) {
    if (!info[field] || info[field].length > 120) {
      throw new Error("configuration MQTT invalide : champ vide ou trop long");
    }
  }
  return info;
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
  coverage_tile_zoom: {
    default: DEFAULT_COVERAGE_TILE_ZOOM,
    parseStored: (raw) =>
      parseCoverageTileZoom(raw, DEFAULT_COVERAGE_TILE_ZOOM),
    validateInput: (raw) => requireCoverageTileZoom(raw),
  },
  legal_info: {
    default: DEFAULT_LEGAL_INFO,
    parseStored: (raw) => parseLegalInfo(raw, DEFAULT_LEGAL_INFO),
    validateInput: (raw) => requireLegalInfo(raw),
  },
  mqtt_onboarding: {
    default: DEFAULT_MQTT_ONBOARDING,
    parseStored: (raw) => parseMqttOnboarding(raw, DEFAULT_MQTT_ONBOARDING),
    validateInput: (raw) => requireMqttOnboarding(raw),
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
