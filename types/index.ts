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
  // Voisins DIRECTS déclarés par ce node (paquet NeighborInfo). Le worker les
  // enregistre dans `node_neighbors` (diagnostic « Voisinage réseau » de la
  // fiche node). Absent sur les autres types de paquets.
  neighbors?: NeighborReport[];
  // Traceroute décodé (RouteDiscovery) : chemin bout-à-bout + segments par saut.
  // Le worker les enregistre dans `traceroute_segments`. Absent sinon.
  traceroute?: TracerouteInfo;
  raw: RawMeshtasticPacket;
}

// Un voisin direct rapporté par un NeighborInfo (SNR de réception au reporter).
export interface NeighborReport {
  neighborId: string;
  snr: number | null;
}

// Un saut d'un traceroute : `direction` = aller (forward) / retour (back),
// `step` = index du saut dans cette direction, SNR mesuré au récepteur `toNode`.
export interface TracerouteSegment {
  direction: "forward" | "back";
  step: number;
  fromNode: string;
  toNode: string;
  snr: number | null;
}

// Traceroute complet reconstruit : extrémités logiques (A atteint D) + segments.
export interface TracerouteInfo {
  sourceNode: string; // origine A (émetteur de la requête)
  targetNode: string; // destination D
  packetId: number | null; // id du MeshPacket (regroupe les segments)
  segments: TracerouteSegment[];
}

// ---------------------------------------------------------------------------
// Frontend carte  — formes exposées par l'API publique.
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
  gatewayOverride: boolean | null; // null = auto, true/false = override admin
  lastSnr: number | null;
  excluded: boolean; // opt-out RGPD (droit de retrait)
}

// Arête de la toile mesh (API /api/observations) : un gateway a entendu un node.
// bestHop = 0 → lien radio DIRECT (portée réelle) ; > 0 → via le mesh.
export interface Observation {
  gatewayId: string;
  nodeId: string;
  bestHop: number | null;
  snr: number | null;
  packets: number; // nb de paquets (toutes catégories) captés pour cette paire
}

// ---------------------------------------------------------------------------
// Diagnostic « Voisinage réseau » de la fiche node (/node/[id]).
// ---------------------------------------------------------------------------

// Un voisin DIRECT d'un node (issu de ses paquets NeighborInfo), avec position
// pour la mini-carte. snr = dernier SNR rapporté ; lat/lon null -> non tracé.
export interface NodeNeighbor {
  nodeId: string;
  name: string | null;
  snr: number | null;
  lat: number | null;
  lon: number | null;
  lastSeen: string | null; // ISO 8601 — dernier NeighborInfo le mentionnant
}

// Un voisin radio direct du nœud consulté (mini-carte « Voisinage réseau ») :
// NeighborInfo en source principale, complété par les paquets directs hop_count=0.
export interface NodeMapLink {
  nodeId: string;
  name: string | null;
  snr: number | null;
  hop: number | null;
  lat: number | null;
  lon: number | null;
  sources: Record<string, number>; // ex: {neighborinfo:1, direct_packets:12}
}

// Un traceroute complet impliquant le node consulté : chemin ordonné par saut,
// dans chaque sens, avec le SNR par saut (pour colorer + flécher au survol).
export interface NodeTraceroute {
  sourceNode: string;
  targetNode: string;
  otherNode: string; // l'extrémité qui n'est PAS le node consulté
  receivedAt: string; // ISO 8601
  hops: TracerouteHop[];
}

// Un saut affichable : émetteur -> récepteur, SNR, sens.
export interface TracerouteHop {
  direction: "forward" | "back";
  step: number;
  fromNode: string;
  fromName: string | null;
  fromLat: number | null;
  fromLon: number | null;
  toNode: string;
  toName: string | null;
  toLat: number | null;
  toLon: number | null;
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
  distanceKm: number | null; // distance node ↔ gateway (null si position inconnue)
  lastHeard: string; // ISO 8601 — dernier paquet capté par ce gateway
}

// Node entendu par le node sujet (qui agit comme relais/gateway). Miroir de
// NodeGatewayLink : ici le node sujet est le récepteur. hasPosition = false ->
// node jamais localisé (aucun paquet position) mais bel et bien entendu.
export interface NodeHeardLink {
  nodeId: string;
  nodeName: string | null;
  snr: number | null;
  bestHop: number | null; // 0 = lien radio direct
  packets: number;
  lastHeard: string; // ISO 8601 — dernier paquet capté de ce node
  distanceKm: number | null; // distance node sujet ↔ node entendu (null si position inconnue)
  hasPosition: boolean;
}

// Dernières métriques "device" d'un node (déjà captées en colonnes packets).
export interface NodeDeviceMetrics {
  voltage: number | null; // tension batterie (V)
  channelUtil: number | null; // utilisation du canal (%)
  airUtilTx: number | null; // temps d'émission sur l'air (%)
}

// ---------------------------------------------------------------------------
// Vues listes nodes — page /nodes. Dérivé de `nodes` (+ packets 24h).
// ---------------------------------------------------------------------------

// Raison pour laquelle un node est considéré « mal configuré » (un node peut
// en cumuler plusieurs). Critères dérivés des seules données disponibles.
export type MisconfigReason =
  | "no-nodeinfo" // long_name NULL : n'a jamais émis son nodeinfo
  | "no-position" // last_lat/last_lon NULL : GPS off ou position non partagée
  | "low-battery" // last_battery < seuil : alim sous-dimensionnée
  | "too-chatty"; // trop de transmissions / 24h : sature le mesh

// Une ligne des vues listes (actifs / batterie faible / mal configurés).
export interface NodeListItem {
  nodeId: string;
  longName: string | null;
  shortName: string | null;
  hwModel: string | null;
  role: string | null;
  batteryPct: number | null;
  lastSeen: string | null; // ISO 8601
  isMobile: boolean;
  isGateway: boolean;
  active: boolean; // vu dans les dernières 24h
  packets24h: number; // transmissions DISTINCTES sur 24h (pas les réceptions)
  misconfig: MisconfigReason[];
}

// Bornes géographiques de la carte (config `map_bounds`). null = carte ouverte
// (aucune limite). Sinon MapLibre `maxBounds` = [[west,south],[east,north]].
export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

// Ligne de l'aperçu gateways (page /admin/trames). Diagnostic de charge/portée :
// combien de trames un gateway capte et combien de nodes distincts il entend.
export interface GatewayStat {
  gatewayId: string;
  name: string | null; // long_name du node gateway si connu
  packets24h: number; // trames captées sur 24h (Fr_EMCOM exclu)
  nodes24h: number; // nodes distincts entendus sur 24h
  lastSeen: string | null; // ISO 8601, dernière trame captée
}

// Ligne du flux debug « Trames » (page /admin/trames, admin only). Paquet brut
// capté ; Fr_EMCOM exclu en amont (privacy). `raw` = payload MQTT complet.
export interface Trame {
  receivedAt: string; // ISO 8601
  gatewayId: string | null;
  nodeId: string | null;
  packetType: string | null;
  channel: string | null;
  rssi: number | null;
  snr: number | null;
  hopCount: number | null;
  raw: RawMeshtasticPacket;
}

// Payload poussé en temps réel (pg_notify 'node_update' -> SSE /api/stream).
// Sous-ensemble de PublicNode : juste ce qu'il faut pour bouger un marker.
export interface NodeUpdate {
  nodeId: string;
  longName: string | null;
  shortName: string | null;
  role: string | null;
  lat: number;
  lon: number;
  batteryPct: number | null;
  lastSeen: string | null; // ISO 8601
  isGateway: boolean;
}

// Statistiques agrégées (API /api/stats + barre de stats SSR de la page).
export interface Stats {
  nodesTotal: number;
  nodesOnline: number;
  packets24h: number;
  lastPacketAt: string | null; // ISO 8601
}

// ---------------------------------------------------------------------------
// Statistiques réseau — page /stats. CONTRAIREMENT à Stats/PublicNode,
// agrégats sur TOUT le réseau capté (aucun filtre privacy : un agrégat n'expose
// aucun individu). La barrière privacy reste sur la carte + temps réel.
// Cf. docs/analytics.md.
// ---------------------------------------------------------------------------

// Une barre d'une répartition.
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
