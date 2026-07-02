import type { ParsedPacket, RawMeshtasticPacket } from "../../../types";
import { parseChannelKeys, parseEncryptedPacket } from "./encrypted-packet";
import { jsonMeshEdges, parseMessage } from "./json-packet";
import { parseMapReport } from "./map-report";

// Un message MQTT peut produire PLUSIEURS trames : NeighborInfo/Traceroute
// donnent une trame de base + N arêtes synthétiques. On renvoie toujours un
// tableau (vide = rien à insérer) que le worker parcourt.
export function parseMqttPacket(
  topic: string,
  message: Buffer,
  publicChannels: string[],
  debug?: (message: string) => void,
): ParsedPacket[] {
  const result = parseOne(topic, message, publicChannels, debug);
  if (result == null) return [];
  return Array.isArray(result) ? result : [result];
}

function parseOne(
  topic: string,
  message: Buffer,
  publicChannels: string[],
  debug?: (message: string) => void,
): ParsedPacket | ParsedPacket[] | null {
  if (topic.includes("/json/")) {
    const raw = JSON.parse(message.toString()) as RawMeshtasticPacket;
    const base = parseMessage(topic, raw, publicChannels);
    if (!base) return null; // canal privé filtré ou émetteur inconnu
    // NeighborInfo/Traceroute JSON : trame de base + arêtes reconstruites.
    const edges = jsonMeshEdges(raw, base.channel);
    return edges.length > 0 ? [base, ...edges] : base;
  }

  if (topic.includes("/map/")) {
    return parseMapReport(topic, message, publicChannels);
  }

  if (topic.includes("/e/")) {
    const channelKeys = parseChannelKeys(process.env.MESHTASTIC_CHANNEL_KEYS);
    return parseEncryptedPacket(topic, message, publicChannels, channelKeys, debug);
  }

  return null;
}
