// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Barème couleur IDENTIQUE à la carte officielle Meshtastic (meshtastic/web,
// getSignalColor) : le SNR classe le lien, le RSSI est un critère SECONDAIRE
// qui rétrograde un lien au SNR correct mais au RSSI faible. Un RSSI inconnu
// (null — ex: arêtes synthétiques NeighborInfo/Traceroute) est ignoré.

export const SNR_GOOD_THRESHOLD = -7;
export const SNR_FAIR_THRESHOLD = -15;
export const RSSI_GOOD_THRESHOLD = -115;
export const RSSI_FAIR_THRESHOLD = -126;

export const SNR_GOOD = "#00ff00";
export const SNR_FAIR = "#ffe600";
export const SNR_BAD = "#f7931a";
export const SNR_UNKNOWN_COLOR = "#9ca3af";

// snr null -> qualité inconnue (gris). Sinon règle Meshtastic à 2 paliers,
// chacun conditionné au RSSI quand il est disponible.
export function signalColor(
  snr: number | null,
  rssi: number | null = null,
): string {
  if (snr === null || Number.isNaN(snr)) return SNR_UNKNOWN_COLOR;
  if (snr > SNR_GOOD_THRESHOLD && (rssi === null || rssi > RSSI_GOOD_THRESHOLD)) {
    return SNR_GOOD;
  }
  if (snr > SNR_FAIR_THRESHOLD && (rssi === null || rssi > RSSI_FAIR_THRESHOLD)) {
    return SNR_FAIR;
  }
  return SNR_BAD;
}
