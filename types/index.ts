// Types partagés MeshForge (worker MQTT + API Next.js).

// Forme brute d'un paquet JSON publié par une gateway Meshtastic sur MQTT.
// Tout est optionnel : le mesh envoie des paquets hétérogènes (telemetry au
// payload vide, position sans batterie, etc.). Le parsing reste défensif.
export interface RawMeshtasticPacket {
  from?: number; // NodeNum entier de l'émetteur d'origine
  to?: number; // NodeNum destinataire (4294967295 = broadcast)
  sender?: string; // gateway qui a publié, déjà au format "!xxxxxxxx"
  type?: string; // position / telemetry / nodeinfo / text / ...
  channel?: number; // index de canal (peu fiable : PKI affiche 0)
  rssi?: number;
  snr?: number;
  hop_start?: number;
  hops_away?: number; // nb de hops parcourus jusqu'à la gateway
  id?: number;
  timestamp?: number;
  payload?: {
    latitude_i?: number;
    longitude_i?: number;
    altitude?: number;
    battery_level?: number;
    voltage?: number;
    channel_utilization?: number;
    air_util_tx?: number;
    long_name?: string;
    short_name?: string;
    hw_model?: string;
    firmware?: string;
    role?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Paquet normalisé, prêt pour l'INSERT dans `packets` et l'upsert `nodes`.
export interface ParsedPacket {
  gatewayId: string | null;
  nodeId: string; // NodeID hex "!xxxxxxxx" dérivé de `from`
  packetType: string | null;
  channel: string; // nom du canal (segment du topic), pas l'index
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  rssi: number | null;
  snr: number | null;
  hopCount: number | null;
  batteryPct: number | null;
  voltage: number | null;
  channelUtil: number | null;
  airUtilTx: number | null;
  // Renseignés uniquement sur les paquets nodeinfo (null sinon).
  longName: string | null;
  shortName: string | null;
  hwModel: string | null;
  firmware: string | null;
  role: string | null;
  raw: RawMeshtasticPacket;
}
