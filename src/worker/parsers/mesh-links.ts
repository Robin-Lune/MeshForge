// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Reconstruction d'arêtes "toile mesh" à partir de NeighborInfo et Traceroute,
// partagée par les parsers protobuf (/e/) et JSON (/json/).
//
// Modèle : une arête = "gateway a entendu node" en DIRECT (hop 0), exactement
// comme une trame captée -> alimente `observations` sans code dédié. Ces arêtes
// sont `edgeOnly` : le worker les INSÈRE mais n'upsert AUCUN node (l'émetteur
// d'une arête ne relaie pas forcément vers MQTT), et un packet_type distinct
// ('neighbor'/'traceroute_hop') les exclut de la détection isGateway.
import type { ParsedPacket } from "../../../types";

// NodeNum réservés : 0 (inconnu) et 0xFFFFFFFF (broadcast). Jamais une arête.
const BROADCAST_NUM = 0xffffffff;

// Traceroute : les SNR sont des int8 ×4 (résolution 0,25 dB) ; INT8_MIN (-128)
// = « SNR inconnu ».
export const SNR_UNKNOWN = -128;

function toNodeId(num: number): string {
  return "!" + (num >>> 0).toString(16).padStart(8, "0");
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isRealNode(num: number): boolean {
  return Number.isFinite(num) && num !== 0 && (num >>> 0) !== BROADCAST_NUM;
}

// SNR traceroute protobuf : int8 ×4 -> dB ; INT8_MIN -> inconnu (null).
export function decodeTraceSnr(list: number[] | undefined): (number | null)[] {
  if (!Array.isArray(list)) return [];
  return list.map((v) => {
    const n = numOrNull(v);
    return n === null || n === SNR_UNKNOWN ? null : n / 4;
  });
}

// Arête synthétique "gateway a entendu node" en direct (hop 0). edgeOnly.
function edgePacket(
  gatewayId: string,
  nodeId: string,
  channel: string,
  snr: number | null,
  packetType: "neighbor" | "traceroute_hop",
  fromNum: number,
): ParsedPacket {
  return {
    gatewayId,
    nodeId,
    packetType,
    channel,
    lat: null,
    lon: null,
    altitude: null,
    rssi: null,
    snr,
    hopCount: 0,
    batteryPct: null,
    voltage: null,
    channelUtil: null,
    airUtilTx: null,
    longName: null,
    shortName: null,
    hwModel: null,
    firmware: null,
    role: null,
    edgeOnly: true,
    raw: {
      source: packetType === "neighbor" ? "neighborinfo" : "traceroute",
      from: fromNum,
      sender: gatewayId,
      type: packetType,
      snr: snr ?? undefined,
    },
  };
}

// NeighborInfo : le reporter diffuse ses voisins DIRECTS + le SNR de réception.
// Arête = reporter (récepteur/gateway) -> chaque voisin (node entendu).
export function neighborInfoEdges(
  reporterNum: number,
  neighbors: { node_id?: number; snr?: number }[] | undefined,
  channel: string,
): ParsedPacket[] {
  if (!isRealNode(reporterNum)) return [];
  const reporterId = toNodeId(reporterNum);
  const edges: ParsedPacket[] = [];
  for (const neighbor of neighbors ?? []) {
    const num = numOrNull(neighbor?.node_id);
    if (num === null || !isRealNode(num) || (num >>> 0) === (reporterNum >>> 0)) continue;
    edges.push(
      edgePacket(reporterId, toNodeId(num), channel, numOrNull(neighbor?.snr), "neighbor", num),
    );
  }
  return edges;
}

// Traceroute (RouteDiscovery) : révèle des liens radio DIRECTS le long d'une
// route. On ne trace QUE les sauts réellement parcourus. Le sens (aller/retour)
// détermine le rattachement des extrémités :
//   - isRequest = true  : requête en vol, `from` = origine, `route` déjà traversé,
//                         la destination `to` n'est PAS encore atteinte.
//   - isRequest = false : réponse, origine = `to`, destination = `from` ; l'aller
//                         `route` est complet, le retour `route_back` peut être partiel.
//   - isRequest = undefined (ex: JSON sans want_response) : sens inconnu -> on ne
//                         relie QUE les relais consécutifs (toujours voisins directs),
//                         jamais les extrémités (rattachement ambigu = risque de faux lien).
export function tracerouteEdges(
  opts: {
    from: number;
    to: number | null;
    route: number[];
    snrTowards: (number | null)[];
    routeBack: number[];
    snrBack: (number | null)[];
    isRequest: boolean | undefined;
  },
  channel: string,
): ParsedPacket[] {
  const { from, to, route, snrTowards, routeBack, snrBack, isRequest } = opts;

  let forward: number[];
  let back: number[];
  if (isRequest === true) {
    forward = [from, ...route];
    back = [];
  } else if (isRequest === false) {
    forward = [to ?? from, ...route, from];
    back = [from, ...routeBack];
  } else {
    forward = route;
    back = routeBack;
  }

  return [
    ...buildEdges(forward, snrTowards, channel),
    ...buildEdges(back, snrBack, channel),
  ];
}

// Arêtes d'un chemin ordonné : fp[i] (émetteur) -> fp[i+1] (récepteur = gateway).
// snr[i] = qualité mesurée au récepteur fp[i+1].
function buildEdges(
  path: number[],
  snr: (number | null)[],
  channel: string,
): ParsedPacket[] {
  const edges: ParsedPacket[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const sender = path[i];
    const receiver = path[i + 1];
    if (!isRealNode(sender) || !isRealNode(receiver) || (sender >>> 0) === (receiver >>> 0)) {
      continue;
    }
    edges.push(
      edgePacket(toNodeId(receiver), toNodeId(sender), channel, snr[i] ?? null, "traceroute_hop", sender),
    );
  }
  return edges;
}
