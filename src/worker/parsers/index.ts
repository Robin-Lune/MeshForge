import type { ParsedPacket, RawMeshtasticPacket } from "../../../types";
import { parseChannelKeys, parseEncryptedPacket } from "./encrypted-packet";
import { parseMessage } from "./json-packet";
import { parseMapReport } from "./map-report";

// Aiguillage par topic. NeighborInfo/Traceroute attachent leurs données
// diagnostiques (voisins / segments) à la trame de base ; le worker les route
// vers les tables dédiées.
export function parseMqttPacket(
  topic: string,
  message: Buffer,
  publicChannels: string[],
  debug?: (message: string) => void,
): ParsedPacket | null {
  if (topic.includes("/json/")) {
    const raw = JSON.parse(message.toString()) as RawMeshtasticPacket;
    return parseMessage(topic, raw, publicChannels, debug);
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
