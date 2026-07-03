// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Décodage Traceroute (RouteDiscovery, portnum 70) : reconstruit le chemin
// bout-à-bout A→…→D (aller) et …→A (retour) en SEGMENTS par saut, avec le SNR
// mesuré au récepteur de chaque saut. Le worker enregistre ces segments dans
// `traceroute_segments` pour rejouer le trajet à la lettre (nœuds intermédiaires,
// couleur par SNR, sens du signal).
import type { TracerouteInfo, TracerouteSegment } from "../../../types";
import { isRealNode, numOrNull, toNodeId } from "./parser-utils";

// Champs RouteDiscovery utiles (déjà décodés / normalisés par l'appelant).
export interface RawRouteDiscovery {
  from: number; // émetteur du paquet capté
  to: number | null; // destinataire du paquet capté
  packetId: number | null;
  route: number[];
  snrTowards: (number | null)[]; // en dB (aligné sur les sauts aller)
  routeBack: number[];
  snrBack: (number | null)[]; // en dB (aligné sur les sauts retour)
  // true = requête en vol, false = réponse, undefined = sens indéterminé
  // (ex: JSON sans want_response) -> pas de reconstruction fiable.
  isRequest: boolean | undefined;
}

// Reconstruit le traceroute. Renvoie null si le sens est indéterminé, si les
// extrémités sont invalides, ou si aucun saut exploitable.
//   - Requête (isRequest true)  : origine = `from`, dest = `to` (pas atteinte) ;
//     aller = [from, ...route] ; pas de retour.
//   - Réponse (isRequest false) : origine = `to`, dest = `from` ; aller complet
//     = [to, ...route, from] ; retour complet = [from, ...route_back, to].
export function tracerouteInfo(rd: RawRouteDiscovery): TracerouteInfo | null {
  const { from, to, packetId, route, snrTowards, routeBack, snrBack, isRequest } = rd;
  if (isRequest === undefined) return null;

  const origin = isRequest ? from : to;
  const dest = isRequest ? to : from;
  if (
    origin === null ||
    dest === null ||
    !isRealNode(origin) ||
    !isRealNode(dest) ||
    (origin >>> 0) === (dest >>> 0)
  ) {
    return null;
  }

  const segments: TracerouteSegment[] = [];
  const forward = isRequest ? [origin, ...route] : [origin, ...route, dest];
  pushSegments(segments, forward, snrTowards, "forward");
  if (!isRequest) {
    // Retour COMPLET dest → …route_back… → origin : on ferme le chemin sur
    // `origin`, sinon le dernier saut retour (dont le cas direct dest→origin,
    // route_back vide) est perdu et l'atteignabilité orientée retour disparaît.
    pushSegments(segments, [dest, ...routeBack, origin], snrBack, "back");
  }
  if (segments.length === 0) return null;

  return {
    sourceNode: toNodeId(origin),
    targetNode: toNodeId(dest),
    packetId,
    segments,
  };
}

// Un segment par paire consécutive du chemin : path[i] (émetteur) -> path[i+1]
// (récepteur). snr[i] = SNR mesuré au récepteur du saut i.
function pushSegments(
  out: TracerouteSegment[],
  path: number[],
  snr: (number | null)[],
  direction: "forward" | "back",
): void {
  for (let i = 0; i + 1 < path.length; i++) {
    const a = numOrNull(path[i]);
    const b = numOrNull(path[i + 1]);
    if (a === null || b === null || !isRealNode(a) || !isRealNode(b) || (a >>> 0) === (b >>> 0)) {
      continue;
    }
    out.push({
      direction,
      step: i,
      fromNode: toNodeId(a),
      toNode: toNodeId(b),
      snr: snr[i] ?? null,
    });
  }
}
