// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import type { RawMeshtasticPacket, ParsedPacket } from "../../../types";
import { hardwareModelName, deviceRoleName } from "../meshtastic/enums";
import { neighborInfoEdges, tracerouteEdges } from "./mesh-links";

// NodeNum entier -> NodeID hex Meshtastic. Ex: 4134129428 -> "!f669cf14".
// `>>> 0` force l'interprétation non signée (NodeNum va jusqu'à 0xFFFFFFFF).
function toNodeId(num: number): string {
  return "!" + (num >>> 0).toString(16).padStart(8, "0");
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// Normalise un message MQTT vers un ParsedPacket prêt pour la DB.
// Renvoie null si le paquet doit être ignoré : canal non public (barrière
// privacy), ou émetteur inconnu.
export function parseMessage(
  topic: string,
  raw: RawMeshtasticPacket,
  publicChannels: string[],
): ParsedPacket | null {
  // Topic : msh/<region>/<gwnum>/json/<channel>/<gateway_id>
  // Barrière privacy : on filtre sur le NOM du canal (segment du topic), jamais
  // sur l'index `channel` du JSON (les DM "PKI" affichent 0 = faux Fr_Balise).
  const channel = topic.split("/")[4];
  if (!channel || !publicChannels.includes(channel)) return null;

  if (typeof raw.from !== "number") return null; // émetteur inconnu -> drop

  const payload = raw.payload ?? {};
  const isNodeInfo = raw.type === "nodeinfo";

  return {
    gatewayId: strOrNull(raw.sender),
    nodeId: toNodeId(raw.from),
    packetType: strOrNull(raw.type),
    channel,
    lat: numOrNull(payload.latitude_i) !== null ? payload.latitude_i! / 1e7 : null,
    lon: numOrNull(payload.longitude_i) !== null ? payload.longitude_i! / 1e7 : null,
    altitude: numOrNull(payload.altitude),
    rssi: numOrNull(raw.rssi),
    snr: numOrNull(raw.snr),
    hopCount: numOrNull(raw.hops_away), // hops_away = hops parcourus (0 = direct)
    batteryPct: numOrNull(payload.battery_level),
    voltage: numOrNull(payload.voltage),
    channelUtil: numOrNull(payload.channel_utilization),
    airUtilTx: numOrNull(payload.air_util_tx),
    // Vrais noms de clés du payload nodeinfo MQTT : longname/shortname, et
    // hardware/role en NOMBRES (enums) -> libellés via meshtastic-enums.
    // firmware n'est PAS dans ce payload (cf. dump réel) -> toujours null.
    longName: isNodeInfo ? strOrNull(payload.longname) : null,
    shortName: isNodeInfo ? strOrNull(payload.shortname) : null,
    hwModel: isNodeInfo ? hardwareModelName(payload.hardware) : null,
    firmware: null,
    role: isNodeInfo ? deviceRoleName(payload.role) : null,
    raw,
  };
}

// Arêtes "toile mesh" dérivées d'un paquet JSON NeighborInfo/Traceroute (en plus
// de la trame de base renvoyée par parseMessage). Le compositeur (parsers/index)
// appelle ceci sur le même canal validé. Renvoie [] pour tout autre type.
// Nuance JSON : le champ want_response n'est pas garanti (sens req/rép parfois
// inconnu -> arêtes conservatrices), et le barème SNR des traceroute JSON n'est
// pas fiable -> on n'y attache PAS de SNR (l'arête, elle, reste correcte).
export function jsonMeshEdges(
  raw: RawMeshtasticPacket,
  channel: string,
): ParsedPacket[] {
  if (typeof raw.from !== "number") return [];
  const payload = raw.payload ?? {};

  if (raw.type === "neighborinfo") {
    return neighborInfoEdges(raw.from, asNeighbors(payload.neighbors), channel);
  }

  if (raw.type === "traceroute") {
    return tracerouteEdges(
      {
        from: raw.from,
        to: numOrNull(raw.to),
        route: asNumArray(payload.route),
        snrTowards: [],
        routeBack: asNumArray(payload.route_back),
        snrBack: [],
        isRequest:
          typeof raw.want_response === "boolean" ? raw.want_response : undefined,
      },
      channel,
    );
  }

  return [];
}

function asNeighbors(v: unknown): { node_id?: number; snr?: number }[] | undefined {
  return Array.isArray(v) ? (v as { node_id?: number; snr?: number }[]) : undefined;
}

function asNumArray(v: unknown): number[] {
  return Array.isArray(v) ? v.map(Number) : [];
}
