import "./env"; // charge .env.local AVANT lib/db (qui lit DATABASE_URL)
import mqtt from "mqtt";
import { pool } from "../../lib/db";
import { insertPacket } from "../../lib/queries/packets";
import { upsertNode } from "../../lib/queries/nodes";
import { parseMessage } from "./parser";
import type { RawMeshtasticPacket } from "../../types";

const MQTT_URL = process.env.MQTT_URL ?? "mqtt://localhost:1883";
// Uniquement le flux JSON (`+/+/json`) : exclut les topics binaires `/e/`
// (protobuf chiffré) et `/map/` qui feraient échouer JSON.parse pour rien.
const TOPIC = "msh/+/+/json/#";

// Allowlist privacy : seuls ces canaux sont stockés (cf. MQTT_PUBLIC_CHANNELS).
const PUBLIC_CHANNELS = (process.env.MQTT_PUBLIC_CHANNELS ?? "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

function log(...args: unknown[]): void {
  console.log(new Date().toISOString(), ...args);
}

const client = mqtt.connect(MQTT_URL, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
});

client.on("connect", () => {
  log(`[mqtt] connecté à ${MQTT_URL}`);
  log(`[privacy] canaux publics : ${PUBLIC_CHANNELS.join(", ") || "(aucun !)"}`);
  client.subscribe(TOPIC, (err) => {
    if (err) log("[mqtt] échec subscribe", err.message);
    else log(`[mqtt] subscribe ${TOPIC}`);
  });
});

client.on("message", async (topic, message) => {
  try {
    const raw = JSON.parse(message.toString()) as RawMeshtasticPacket;
    const parsed = parseMessage(topic, raw, PUBLIC_CHANNELS);
    if (!parsed) return; // bruit, canal privé filtré, ou émetteur inconnu

    await insertPacket(parsed);
    await upsertNode(parsed);
    log(`[pkt] ${parsed.channel} ${parsed.packetType} ${parsed.nodeId}`);
  } catch (err) {
    // Silencieux : le mesh envoie du bruit / JSON malformé, erreur DB ponctuelle.
    // Ne jamais crasher le worker (il doit tourner indéfiniment).
    log("[pkt] ignoré:", (err as Error).message);
  }
});

client.on("reconnect", () => log("[mqtt] reconnexion..."));
client.on("error", (err) => log("[mqtt] erreur:", err.message));

// Arrêt propre : ferme le client MQTT puis la Pool DB.
async function shutdown(): Promise<void> {
  log("[worker] arrêt...");
  client.end();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
