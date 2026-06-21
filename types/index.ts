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
    // nodeinfo : noms réels du payload MQTT ; hardware/role sont des enums (nombres).
    longname?: string;
    shortname?: string;
    hardware?: number;
    role?: number;
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

// ---------------------------------------------------------------------------
// Frontend carte (Phase 3) — formes exposées par l'API publique.
// ---------------------------------------------------------------------------

// Node affiché sur la carte publique (sortie de getPublicNodes, API /api/nodes).
// Public par défaut : tous les nodes fixes localisés (cf. isPubliclyVisible).
// lat/lon non nullables : la requête filtre les nodes sans position.
export interface PublicNode {
  nodeId: string;
  longName: string | null;
  shortName: string | null;
  hwModel: string | null;
  role: string | null;
  lat: number;
  lon: number;
  batteryPct: number | null;
  lastSeen: string | null; // ISO 8601
  isGateway: boolean; // relaie vers MQTT (apparaît comme gateway_id) → marker vert
  lastSnr: number | null; // dernier SNR reçu (signal), pour la fiche au survol
  isMobile: boolean; // true → position approximative (snappée ~1,5 km)
}

// Détail complet d'un node (page /node/[id], au clic sur un marker).
export interface NodeDetail {
  nodeId: string;
  longName: string | null;
  shortName: string | null;
  hwModel: string | null;
  firmware: string | null;
  role: string | null;
  lat: number | null;
  lon: number | null;
  batteryPct: number | null;
  lastSeen: string | null; // ISO 8601
  firstSeen: string | null; // ISO 8601
  isMobile: boolean;
  isGateway: boolean;
  lastSnr: number | null;
}

// Arête de la toile mesh (API /api/observations) : un gateway a entendu un node.
// bestHop = 0 → lien radio DIRECT (portée réelle) ; > 0 → via le mesh.
export interface Observation {
  gatewayId: string;
  nodeId: string;
  bestHop: number | null;
  snr: number | null;
}

// Page détail node — point de la série journalière (courbes 30j).
export interface NodeHistoryPoint {
  day: string; // YYYY-MM-DD
  snr: number | null;
  battery: number | null;
  packets: number;
}

// Lien d'un node vers un gateway qui l'entend (multi-SNR si nœud-pont).
export interface NodeGatewayLink {
  gatewayId: string;
  gatewayName: string | null;
  snr: number | null;
  bestHop: number | null; // 0 = lien radio direct
  packets: number;
}

// Payload poussé en temps réel (pg_notify 'node_update' -> SSE /api/stream).
// Sous-ensemble de PublicNode : juste ce qu'il faut pour bouger un marker.
export interface NodeUpdate {
  nodeId: string;
  longName: string | null;
  shortName: string | null;
  lat: number;
  lon: number;
  batteryPct: number | null;
  lastSeen: string | null; // ISO 8601
}

// Statistiques agrégées (API /api/stats + barre de stats SSR de la page).
export interface Stats {
  nodesTotal: number;
  nodesOnline: number;
  packets24h: number;
  lastPacketAt: string | null; // ISO 8601
}

// ---------------------------------------------------------------------------
// Statistiques réseau (Phase 4) — page /stats. CONTRAIREMENT à Stats/PublicNode,
// agrégats sur TOUT le réseau capté (aucun filtre privacy : un agrégat n'expose
// aucun individu). La barrière privacy reste sur la carte + temps réel.
// Cf. docs/analytics.md.
// ---------------------------------------------------------------------------

// Une barre d'une répartition (rendu en barres horizontales, pas camembert).
export interface StatBucket {
  label: string;
  count: number;
}

export interface NetworkStats {
  nodesTotal: number; // tous les nodes connus
  nodesActive24h: number; // vus dans les 24h
  packets24h: number;
  packetsPerMin: number; // moyenne sur 24h
  avgChannelUtil: number | null; // % moyen, null si aucun paquet
  avgAirUtilTx: number | null;
  lastPacketAt: string | null; // ISO 8601
  byPacketType: StatBucket[]; // activité 24h (packets)
  byHopCount: StatBucket[]; // activité 24h (packets)
  byHwModel: StatBucket[]; // parc (table nodes)
  byRole: StatBucket[];
}
