// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import type { RawMeshtasticPacket, ParsedPacket } from "../../../types";
import { hardwareModelName, deviceRoleName } from "../meshtastic/enums";
import { neighborReports } from "./neighbor-info";
import { tracerouteInfo } from "./traceroute";
import { matchingTextMarker } from "./text-message";

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
  debug?: (message: string) => void,
): ParsedPacket | null {
  // Topic : msh/<region>/<gwnum>/json/<channel>/<gateway_id>
  // Barrière privacy : on filtre sur le NOM du canal (segment du topic), jamais
  // sur l'index `channel` du JSON (les DM "PKI" affichent 0 = faux Fr_Balise).
  const channel = topic.split("/")[4];
  if (!channel || !publicChannels.includes(channel)) return null;

  if (typeof raw.from !== "number") return null; // émetteur inconnu -> drop
  if (raw.type === "text") {
    const marker = matchingTextMarker(raw);
    if (!marker) {
      debug?.(`drop: texte sans marqueur autorisé (${channel})`);
      return null;
    }
    debug?.(`allow: texte ${marker} (${channel})`);
  }

  const payload = typeof raw.payload === "object" && raw.payload !== null ? raw.payload : {};
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
    // NeighborInfo / Traceroute : données diagnostiques attachées à la trame.
    // JSON : le barème SNR des traceroute n'est pas fiable -> SNR par saut null ;
    // sans want_response, le sens est indéterminé -> pas de segments (cf. tracerouteInfo).
    neighbors:
      raw.type === "neighborinfo"
        ? neighborReports(raw.from, asNeighbors(payload.neighbors))
        : undefined,
    traceroute:
      raw.type === "traceroute"
        ? tracerouteInfo({
            from: raw.from,
            to: numOrNull(raw.to),
            packetId: numOrNull(raw.id),
            route: asNumArray(payload.route),
            snrTowards: [],
            routeBack: asNumArray(payload.route_back),
            snrBack: [],
            isRequest:
              typeof raw.want_response === "boolean" ? raw.want_response : undefined,
          }) ?? undefined
        : undefined,
    raw,
  };
}

function asNeighbors(v: unknown): { node_id?: number; snr?: number }[] | undefined {
  return Array.isArray(v) ? (v as { node_id?: number; snr?: number }[]) : undefined;
}

function asNumArray(v: unknown): number[] {
  return Array.isArray(v) ? v.map(Number) : [];
}
