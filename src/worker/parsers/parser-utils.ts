// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Petits utilitaires partagés par les parsers (conversion NodeNum, garde des
// NodeNum réservés, décodage SNR traceroute). Volontairement minimal : la
// logique NeighborInfo et Traceroute vit dans leurs modules dédiés.

// NodeNum réservés : 0 (inconnu) et 0xFFFFFFFF (broadcast).
export const BROADCAST_NUM = 0xffffffff;

// Traceroute : SNR en int8 ×4 (0,25 dB) ; INT8_MIN = « inconnu ».
export const SNR_UNKNOWN = -128;

// NodeNum entier -> NodeID hex "!xxxxxxxx" (`>>> 0` = non signé).
export function toNodeId(num: number): string {
  return "!" + (num >>> 0).toString(16).padStart(8, "0");
}

export function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function decodePosition(
  latitudeI: unknown,
  longitudeI: unknown,
): { lat: number | null; lon: number | null } {
  const latRaw = numOrNull(latitudeI);
  const lonRaw = numOrNull(longitudeI);
  if (latRaw === null || lonRaw === null || (latRaw === 0 && lonRaw === 0)) {
    return { lat: null, lon: null };
  }
  const lat = latRaw / 1e7;
  const lon = lonRaw / 1e7;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { lat: null, lon: null };
  }
  return { lat, lon };
}

// Data.bitfield (Meshtastic ≥ 2.5) : bit 0 = OK_TO_MQTT, consentement du node
// émetteur à l'uplink MQTT (réglage « OK to MQTT » de l'appareil). STRICT :
// absent = pas de consentement ; les autres bits (WANT_RESPONSE = 2) ne valent rien.
export const OK_TO_MQTT_MASK = 0x01;

export function isOkToMqtt(data: { bitfield?: number }): boolean {
  return ((data.bitfield ?? 0) & OK_TO_MQTT_MASK) !== 0;
}

export function isRealNode(num: number): boolean {
  return Number.isFinite(num) && num !== 0 && (num >>> 0) !== BROADCAST_NUM;
}

// SNR traceroute (int8 ×4 -> dB ; INT8_MIN -> null). Aligné sur l'index des sauts.
export function decodeTraceSnr(list: number[] | undefined): (number | null)[] {
  if (!Array.isArray(list)) return [];
  return list.map((v) => {
    const n = numOrNull(v);
    return n === null || n === SNR_UNKNOWN ? null : n / 4;
  });
}
