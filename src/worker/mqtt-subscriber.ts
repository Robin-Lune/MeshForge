// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import "./env"; // charge .env.local AVANT lib/db (qui lit DATABASE_URL)
import mqtt from "mqtt";
import { pool } from "../../lib/db";
import { insertPacket } from "../../lib/queries/packets";
import { upsertGatewayNode, upsertNode } from "../../lib/queries/nodes";
import { getSetting } from "../../lib/queries/settings";
import { parseMessage } from "./parser";
import type { RawMeshtasticPacket } from "../../types";

const MQTT_URL = process.env.MQTT_URL ?? "mqtt://localhost:1883";
// Uniquement le flux JSON (`+/+/json`) : exclut les topics binaires `/e/`
// (protobuf chiffré) et `/map/` qui feraient échouer JSON.parse pour rien.
const TOPIC = "msh/+/+/json/#";

function log(...args: unknown[]): void {
  console.log(new Date().toISOString(), ...args);
}

const client = mqtt.connect(MQTT_URL, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
});

client.on("connect", async () => {
  log(`[mqtt] connecté à ${MQTT_URL}`);
  // Allowlist privacy : la liste vient de la config DB (settings.public_channels),
  // éditable sur /admin/config. getSetting met en cache (30s) -> refresh auto.
  try {
    const channels = await getSetting("public_channels");
    log(`[privacy] canaux publics : ${channels.join(", ") || "(aucun !)"}`);
  } catch {
    log("[privacy] config canaux indisponible (DB) — paquets droppés en attendant");
  }
  client.subscribe(TOPIC, (err) => {
    if (err) log("[mqtt] échec subscribe", err.message);
    else log(`[mqtt] subscribe ${TOPIC}`);
  });
});

client.on("message", async (topic, message) => {
  try {
    const raw = JSON.parse(message.toString()) as RawMeshtasticPacket;
    // Allowlist relue à chaque message (cache 30s) : un changement de config
    // est pris en compte sans redémarrer le worker. DB indispo -> getSetting
    // jette -> message droppé (fail-closed, sûr pour la privacy).
    const publicChannels = await getSetting("public_channels");
    const parsed = parseMessage(topic, raw, publicChannels);
    if (!parsed) return; // bruit, canal privé filtré, ou émetteur inconnu

    await insertPacket(parsed);
    await upsertNode(parsed);
    await upsertGatewayNode(parsed);
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
