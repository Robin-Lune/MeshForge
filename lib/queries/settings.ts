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
  | "mqtt_onboarding"
  | "retention_days";

export interface LegalInfo {
  companyName: string;
  companyType: string;
  companySiret: string;
  companyAddress: string;
  publisherEmail: string;
  publisherWebsite: string;
  publicationDirector: string;
  hostingProvider: string;
  hostingLocation: string;
  dataControllerName: string;
  privacyContactEmail: string;
  processingPurposes: string;
  additionalNoticeTitle: string;
  additionalNoticeBody: string;
  additionalNoticeLinkLabel: string;
  additionalNoticeLinkUrl: string;
  networkName: string;
  initiativeName: string;
  initiativeWebsite: string;
}

export class LegalInfoValidationError extends Error {
  constructor(
    public readonly field: keyof LegalInfo,
    message: string,
  ) {
    super(`mentions légales invalides : ${message}`);
    this.name = "LegalInfoValidationError";
  }
}

export interface MqttOnboarding {
  mobileBroker: string;
  rootTopic: string;
  encryptionEnabled: boolean;
  jsonOutputEnabled: boolean;
  tlsEnabled: boolean;
  mapReportEnabled: boolean;
  userChatEnabled: boolean;
  announcementNodeId: string;
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
  retention_days: number;
}

export const DEFAULT_MAX_PACKETS_24H = 1000;
// Aucun canal sensible ici : tout canal listé est ingéré, déchiffré si sa clé
// est connue, et exposé. Un canal d'urgence ou privé ne doit simplement pas y figurer.
export const DEFAULT_PUBLIC_CHANNELS = ["Fr_Balise", "Fr_BlaBla"];
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
// Durée de conservation (jours) : politique TimescaleDB de `packets` + purge des
// tables simples et des nodes muets (lib/queries/retention.ts). Plancher = fenêtre
// de la toile (7 j) ; plafond 2 ans. Affichée telle quelle sur /mentions-legales.
export const DEFAULT_RETENTION_DAYS = 60;
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 730;
const DEFAULT_LEGAL_INFO: LegalInfo = {
  companyName: "À compléter",
  companyType: "À compléter",
  companySiret: "À compléter",
  companyAddress: "À compléter",
  publisherEmail: "contact@example.invalid",
  publisherWebsite: "https://example.invalid",
  publicationDirector: "À compléter",
  hostingProvider: "À compléter",
  hostingLocation: "À compléter",
  dataControllerName: "À compléter",
  privacyContactEmail: "contact@example.invalid",
  processingPurposes:
    "Suivi en temps réel et historique d’un réseau Meshtastic communautaire.",
  additionalNoticeTitle: "",
  additionalNoticeBody: "",
  additionalNoticeLinkLabel: "",
  additionalNoticeLinkUrl: "",
  networkName: "Réseau Meshtastic communautaire",
  initiativeName: "À compléter",
  initiativeWebsite: "https://example.invalid",
};

// Préserve l'affichage historique lors de la première lecture d'une ancienne
// valeur `legal_info` limitée aux six champs initiaux. Une installation neuve
// reçoit les valeurs génériques ci-dessus.
const LEGACY_LEGAL_INFO_FALLBACK: LegalInfo = {
  ...DEFAULT_LEGAL_INFO,
  publisherEmail: "contact@la-forge-numerique.com",
  publisherWebsite: "https://la-forge-numerique.com",
  publicationDirector: "Robin LEBON",
  dataControllerName: "La Forge Numérique",
  privacyContactEmail: "contact@la-forge-numerique.com",
  processingPurposes:
    "Monitoring en temps réel et historique du réseau LoRa Meshtastic communautaire de La Réunion (couverture, qualité des liaisons, santé des relais).",
  networkName: "Le réseau LoRa citoyen Mesh de La Réunion",
  initiativeName: "Meteor-oi.re",
  initiativeWebsite:
    "https://www.meteor-oi.re/index.php/projets/reseau-lora-citoyen-mesh-la-reunion/foire-aux-questions/",
};
const DEFAULT_MQTT_ONBOARDING: MqttOnboarding = {
  mobileBroker: "mqtt.la-forge-numerique.com:1883",
  rootTopic: "msh/EU_868",
  encryptionEnabled: true,
  jsonOutputEnabled: true,
  tlsEnabled: false,
  mapReportEnabled: true,
  userChatEnabled: false,
  announcementNodeId: "",
};

// Noms de canaux : alphanumérique + _ - (anti-injection : on n'accepte rien d'autre).
const CHANNEL_RE = /^[A-Za-z0-9_-]{1,40}$/;
const NODE_ID_RE = /^![0-9a-fA-F]{8}$/;

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

// --- Durée de conservation : ENTIER dans [MIN_RETENTION_DAYS, MAX_RETENTION_DAYS] ---
const isRetentionDays = (n: number): boolean =>
  Number.isInteger(n) && n >= MIN_RETENTION_DAYS && n <= MAX_RETENTION_DAYS;

export function parseRetentionDays(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return isRetentionDays(n) ? n : fallback;
}

export function requireRetentionDays(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!isRetentionDays(n)) {
    throw new Error(
      `durée invalide : entier dans [${MIN_RETENTION_DAYS},${MAX_RETENTION_DAYS}] jours attendu`,
    );
  }
  return n;
}

const LEGACY_LEGAL_FIELDS: (keyof LegalInfo)[] = [
  "companyName",
  "companyType",
  "companySiret",
  "companyAddress",
  "hostingProvider",
  "hostingLocation",
];

const EXTENDED_LEGAL_FIELDS: (keyof LegalInfo)[] = [
  "publisherEmail",
  "publisherWebsite",
  "publicationDirector",
  "dataControllerName",
  "privacyContactEmail",
  "processingPurposes",
  "additionalNoticeTitle",
  "additionalNoticeBody",
  "additionalNoticeLinkLabel",
  "additionalNoticeLinkUrl",
  "networkName",
  "initiativeName",
  "initiativeWebsite",
];

const LEGAL_FIELDS: (keyof LegalInfo)[] = [
  ...LEGACY_LEGAL_FIELDS,
  ...EXTENDED_LEGAL_FIELDS,
];

function hasLegacyLegalInfo(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return LEGACY_LEGAL_FIELDS.every((field) => typeof o[field] === "string");
}

function hasOnlyLegacyLegalInfo(raw: unknown): boolean {
  if (!hasLegacyLegalInfo(raw)) return false;
  return EXTENDED_LEGAL_FIELDS.every(
    (field) => typeof raw[field] !== "string",
  );
}

function pickLegalInfo(
  raw: Record<string, unknown>,
  fallback: LegalInfo,
): LegalInfo {
  const text = (field: keyof LegalInfo): string =>
    typeof raw[field] === "string" ? raw[field].trim() : fallback[field];
  return {
    companyName: text("companyName"),
    companyType: text("companyType"),
    companySiret: text("companySiret"),
    companyAddress: text("companyAddress"),
    publisherEmail: text("publisherEmail"),
    publisherWebsite: text("publisherWebsite"),
    publicationDirector: text("publicationDirector"),
    hostingProvider: text("hostingProvider"),
    hostingLocation: text("hostingLocation"),
    dataControllerName: text("dataControllerName"),
    privacyContactEmail: text("privacyContactEmail"),
    processingPurposes: text("processingPurposes"),
    additionalNoticeTitle: text("additionalNoticeTitle"),
    additionalNoticeBody: text("additionalNoticeBody"),
    additionalNoticeLinkLabel: text("additionalNoticeLinkLabel"),
    additionalNoticeLinkUrl: text("additionalNoticeLinkUrl"),
    networkName: text("networkName"),
    initiativeName: text("initiativeName"),
    initiativeWebsite: text("initiativeWebsite"),
  };
}

const LEGAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseLegalInfo(raw: unknown, fallback: LegalInfo): LegalInfo {
  if (!hasLegacyLegalInfo(raw)) return fallback;
  const info = pickLegalInfo(raw, fallback);
  for (const field of LEGAL_FIELDS) {
    if (!info[field] || info[field].length > 500) info[field] = fallback[field];
  }
  if (!LEGAL_EMAIL_RE.test(info.publisherEmail)) {
    info.publisherEmail = fallback.publisherEmail;
  }
  if (!LEGAL_EMAIL_RE.test(info.privacyContactEmail)) {
    info.privacyContactEmail = fallback.privacyContactEmail;
  }
  if (!isHttpUrl(info.publisherWebsite)) {
    info.publisherWebsite = fallback.publisherWebsite;
  }
  if (!isHttpUrl(info.initiativeWebsite)) {
    info.initiativeWebsite = fallback.initiativeWebsite;
  }
  if (
    info.additionalNoticeLinkUrl &&
    !isHttpUrl(info.additionalNoticeLinkUrl)
  ) {
    info.additionalNoticeLinkUrl = fallback.additionalNoticeLinkUrl;
    info.additionalNoticeLinkLabel = fallback.additionalNoticeLinkLabel;
  }
  return info;
}

export function requireLegalInfo(raw: unknown): LegalInfo {
  const submitted =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  for (const field of LEGAL_FIELDS) {
    if (typeof submitted[field] !== "string") {
      throw new LegalInfoValidationError(field, "champ non transmis");
    }
  }
  const info = pickLegalInfo(submitted, DEFAULT_LEGAL_INFO);
  const optionalFields = new Set<keyof LegalInfo>([
    "additionalNoticeTitle",
    "additionalNoticeBody",
    "additionalNoticeLinkLabel",
    "additionalNoticeLinkUrl",
  ]);
  for (const field of LEGAL_FIELDS) {
    if (!optionalFields.has(field) && !info[field]) {
      throw new LegalInfoValidationError(field, "champ obligatoire");
    }
    if (info[field].length > 500) {
      throw new LegalInfoValidationError(field, "500 caractères maximum");
    }
  }
  for (const field of ["publisherEmail", "privacyContactEmail"] as const) {
    if (!LEGAL_EMAIL_RE.test(info[field])) {
      throw new LegalInfoValidationError(field, "adresse e-mail invalide");
    }
  }
  for (const field of [
    "publisherWebsite",
    "initiativeWebsite",
  ] as const) {
    if (!isHttpUrl(info[field])) {
      throw new LegalInfoValidationError(field, "URL HTTP(S) invalide");
    }
  }
  const hasNoticeTitle = Boolean(info.additionalNoticeTitle);
  const hasNoticeBody = Boolean(info.additionalNoticeBody);
  if (hasNoticeTitle !== hasNoticeBody) {
    const field = hasNoticeTitle
      ? "additionalNoticeBody"
      : "additionalNoticeTitle";
    throw new LegalInfoValidationError(
      field,
      hasNoticeTitle
        ? "renseignez aussi le texte du bloc"
        : "renseignez aussi le titre du bloc",
    );
  }
  const hasNoticeLinkLabel = Boolean(info.additionalNoticeLinkLabel);
  const hasNoticeLinkUrl = Boolean(info.additionalNoticeLinkUrl);
  if (hasNoticeLinkLabel !== hasNoticeLinkUrl) {
    const field = hasNoticeLinkLabel
      ? "additionalNoticeLinkUrl"
      : "additionalNoticeLinkLabel";
    throw new LegalInfoValidationError(
      field,
      hasNoticeLinkLabel
        ? "renseignez aussi l’URL du lien"
        : "renseignez aussi le libellé du lien",
    );
  }
  if (hasNoticeLinkUrl && !hasNoticeTitle) {
    throw new LegalInfoValidationError(
      "additionalNoticeTitle",
      "ajoutez un titre et un texte avant le lien",
    );
  }
  if (hasNoticeLinkUrl && !isHttpUrl(info.additionalNoticeLinkUrl)) {
    throw new LegalInfoValidationError(
      "additionalNoticeLinkUrl",
      "URL HTTP(S) invalide",
    );
  }
  return info;
}

function isMqttOnboarding(
  raw: unknown,
): raw is Record<string, unknown> {
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
  raw: Record<string, unknown>,
  fallback: MqttOnboarding,
): MqttOnboarding {
  return {
    mobileBroker: String(raw.mobileBroker).trim(),
    rootTopic: String(raw.rootTopic).trim(),
    encryptionEnabled: Boolean(raw.encryptionEnabled),
    jsonOutputEnabled: Boolean(raw.jsonOutputEnabled),
    tlsEnabled: Boolean(raw.tlsEnabled),
    mapReportEnabled: Boolean(raw.mapReportEnabled),
    userChatEnabled:
      typeof raw.userChatEnabled === "boolean"
        ? raw.userChatEnabled
        : fallback.userChatEnabled,
    announcementNodeId:
      typeof raw.announcementNodeId === "string"
        ? raw.announcementNodeId.trim().toLowerCase()
        : fallback.announcementNodeId,
  };
}

export function parseMqttOnboarding(
  raw: unknown,
  fallback: MqttOnboarding,
): MqttOnboarding {
  return isMqttOnboarding(raw) ? pickMqttOnboarding(raw, fallback) : fallback;
}

export function requireMqttOnboarding(raw: unknown): MqttOnboarding {
  if (
    !isMqttOnboarding(raw) ||
    typeof raw.userChatEnabled !== "boolean" ||
    typeof raw.announcementNodeId !== "string"
  ) {
    throw new Error("configuration MQTT invalide : objet incomplet");
  }
  const info = pickMqttOnboarding(raw, DEFAULT_MQTT_ONBOARDING);
  for (const field of ["mobileBroker", "rootTopic"] as const) {
    if (!info[field] || info[field].length > 120) {
      throw new Error("configuration MQTT invalide : champ vide ou trop long");
    }
  }
  if (!NODE_ID_RE.test(info.announcementNodeId)) {
    throw new Error("NodeID d'annonce invalide : format !xxxxxxxx attendu");
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
    parseStored: (raw) =>
      parseLegalInfo(
        raw,
        hasOnlyLegacyLegalInfo(raw)
          ? LEGACY_LEGAL_INFO_FALLBACK
          : DEFAULT_LEGAL_INFO,
      ),
    validateInput: (raw) => requireLegalInfo(raw),
  },
  mqtt_onboarding: {
    default: DEFAULT_MQTT_ONBOARDING,
    parseStored: (raw) => parseMqttOnboarding(raw, DEFAULT_MQTT_ONBOARDING),
    validateInput: (raw) => requireMqttOnboarding(raw),
  },
  retention_days: {
    default: DEFAULT_RETENTION_DAYS,
    parseStored: (raw) => parseRetentionDays(raw, DEFAULT_RETENTION_DAYS),
    validateInput: (raw) => requireRetentionDays(raw),
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
