import { EventEmitter } from "node:events";
import { Client } from "pg";
import type { NodeUpdate } from "../types";

// Canal Postgres LISTEN/NOTIFY. Le worker fait pg_notify('node_update', ...)
// après upsert d'un node PUBLIC (cf. upsertNode + isPubliclyVisible).
const CHANNEL = "node_update";

// Parsing défensif du payload NOTIFY (du bruit/JSON malformé ne doit jamais
// casser le flux SSE). Renvoie null si la forme minimale n'est pas respectée.
export function parseNotification(payload: string): NodeUpdate | null {
  let obj: unknown;
  try {
    obj = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.nodeId !== "string") return null;
  if (typeof o.lat !== "number" || typeof o.lon !== "number") return null;
  return {
    nodeId: o.nodeId,
    longName: typeof o.longName === "string" ? o.longName : null,
    shortName: typeof o.shortName === "string" ? o.shortName : null,
    lat: o.lat,
    lon: o.lon,
    batteryPct: typeof o.batteryPct === "number" ? o.batteryPct : null,
    lastSeen: typeof o.lastSeen === "string" ? o.lastSeen : null,
  };
}

// Bus temps réel partagé par tout le process : UN seul client pg en LISTEN,
// fan-out vers tous les abonnés SSE via un EventEmitter (1 connexion DB pour
// les notifs quel que soit le nombre d'onglets). Singleton globalThis pour
// survivre au HMR de Next en dev — même pattern que lib/db.ts.
type Bus = { emitter: EventEmitter; client: Client | null; started: boolean };
const globalForRealtime = globalThis as unknown as { realtimeBus?: Bus };
const bus: Bus = (globalForRealtime.realtimeBus ??= {
  emitter: new EventEmitter(),
  client: null,
  started: false,
});
bus.emitter.setMaxListeners(0); // pas de warning au-delà de 10 abonnés SSE

// Démarre le LISTEN au 1er abonné (lazy). En cas d'échec de connexion ou de
// coupure, on réarme `started=false` pour qu'un prochain subscribe retente.
async function ensureListening(): Promise<void> {
  if (bus.started) return;
  bus.started = true;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  bus.client = client;

  const reset = (): void => {
    bus.started = false;
    bus.client = null;
  };
  client.on("notification", (msg) => {
    if (msg.channel !== CHANNEL || !msg.payload) return;
    const update = parseNotification(msg.payload);
    if (update) bus.emitter.emit("update", update);
  });
  client.on("error", reset);
  client.on("end", reset);

  try {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
  } catch {
    reset();
    client.end().catch(() => {});
  }
}

// Abonne un callback aux mises à jour de nodes. Renvoie la fonction de
// désabonnement (à appeler à la fermeture du flux SSE).
export function subscribe(cb: (u: NodeUpdate) => void): () => void {
  void ensureListening();
  bus.emitter.on("update", cb);
  return () => bus.emitter.off("update", cb);
}
