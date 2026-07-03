-- Démo réaliste : maillage étalé sur toute La Réunion (villes réelles),
-- topologie en anneau côtier + liaisons intérieures (pas une étoile), plusieurs
-- gateways, et variations de qualité SNR/RSSI, nombre de paquets, dates de
-- dernière réception (last_seen + received_at). Base de dev uniquement.

-- Repart propre (anciens jeux de démo).
DELETE FROM packets WHERE gateway_id LIKE '!r%' OR node_id LIKE '!r%'
                       OR gateway_id LIKE '!demo%' OR node_id LIKE '!demo%';
DELETE FROM nodes WHERE node_id LIKE '!r%' OR node_id LIKE '!demo%';

-- ── Nœuds : villes réelles, last_seen ÉTALÉ (min -> jours), batteries variées.
--    gateway_override TRUE = passerelle MQTT (5, réparties N/E/S/O/centre-sud).
INSERT INTO nodes (node_id,long_name,short_name,hw_model,role,is_mobile,
                   last_lat,last_lon,last_battery,last_seen,first_seen,gateway_override) VALUES
 ('!r01','Saint-Denis','StD','HELTEC_V4','ROUTER',    FALSE,-20.8823,55.4504, 98, NOW()-INTERVAL '1 min',  NOW()-INTERVAL '60 days', TRUE),
 ('!r02','Sainte-Marie','StM','HELTEC_V4','CLIENT',   FALSE,-20.8970,55.5490, 91, NOW()-INTERVAL '4 min',  NOW()-INTERVAL '50 days', NULL),
 ('!r03','Sainte-Suzanne','StS','TBEAM','CLIENT',     FALSE,-20.9050,55.6060, 74, NOW()-INTERVAL '12 min', NOW()-INTERVAL '48 days', NULL),
 ('!r04','Saint-André','StA','HELTEC_V4','CLIENT',    FALSE,-20.9630,55.6510, 66, NOW()-INTERVAL '38 min', NOW()-INTERVAL '40 days', NULL),
 ('!r05','Bras-Panon','BrP','RAK4631','CLIENT',       FALSE,-21.0000,55.6790, 55, NOW()-INTERVAL '2 hours',NOW()-INTERVAL '30 days', NULL),
 ('!r06','Saint-Benoît','StB','HELTEC_V4','ROUTER',   FALSE,-21.0340,55.7130, 90, NOW()-INTERVAL '2 min',  NOW()-INTERVAL '55 days', TRUE),
 ('!r07','Sainte-Rose','StR','TBEAM','CLIENT',        FALSE,-21.1260,55.7920, 42, NOW()-INTERVAL '6 hours',NOW()-INTERVAL '20 days', NULL),
 ('!r08','Saint-Philippe','StP','RAK4631','CLIENT',   FALSE,-21.3590,55.7670, 38, NOW()-INTERVAL '3 days', NOW()-INTERVAL '25 days', NULL),
 ('!r09','Saint-Joseph','StJ','HELTEC_V4','CLIENT',   FALSE,-21.3830,55.6200, 61, NOW()-INTERVAL '55 min', NOW()-INTERVAL '35 days', NULL),
 ('!r10','Saint-Pierre','StP','HELTEC_V4','ROUTER',   FALSE,-21.3410,55.4780, 96, NOW()-INTERVAL '1 min',  NOW()-INTERVAL '58 days', TRUE),
 ('!r11','Le Tampon','Tam','HELTEC_V4','ROUTER',      FALSE,-21.2780,55.5160, 88, NOW()-INTERVAL '3 min',  NOW()-INTERVAL '52 days', TRUE),
 ('!r12','Saint-Louis','StL','TBEAM','CLIENT',        FALSE,-21.2860,55.4120, 70, NOW()-INTERVAL '18 min', NOW()-INTERVAL '30 days', NULL),
 ('!r13','Étang-Salé','EtS','RAK4631','CLIENT',       FALSE,-21.2630,55.3630, 49, NOW()-INTERVAL '5 hours',NOW()-INTERVAL '22 days', NULL),
 ('!r14','Saint-Leu','StLe','HELTEC_V4','CLIENT',     FALSE,-21.1700,55.2880, 57, NOW()-INTERVAL '80 min', NOW()-INTERVAL '28 days', NULL),
 ('!r15','Saint-Paul','StPa','HELTEC_V4','ROUTER',    FALSE,-21.0090,55.2700, 93, NOW()-INTERVAL '2 min',  NOW()-INTERVAL '57 days', TRUE),
 ('!r16','Le Port','LeP','TBEAM','CLIENT',            FALSE,-20.9390,55.2910, 82, NOW()-INTERVAL '9 min',  NOW()-INTERVAL '33 days', NULL),
 ('!r17','Cilaos','Cil','RAK4631','CLIENT',           FALSE,-21.1350,55.4720, 31, NOW()-INTERVAL '9 hours',NOW()-INTERVAL '14 days', NULL),
 ('!r18','Plaine-des-Palmistes','PdP','TBEAM','CLIENT',FALSE,-21.1320,55.6330,44, NOW()-INTERVAL '4 hours',NOW()-INTERVAL '18 days', NULL),
 ('!r19','Plaine-des-Cafres','PdC','HELTEC_V4','CLIENT',FALSE,-21.2040,55.5730,63, NOW()-INTERVAL '25 min', NOW()-INTERVAL '26 days', NULL),
 ('!r20','Salazie','Sal','RAK4631','CLIENT',          FALSE,-21.0300,55.5400, 27, NOW()-INTERVAL '2 days', NOW()-INTERVAL '12 days', NULL),
 -- Pile : 2 relais quasi superposés (~3 m) près de Saint-Pierre (arc courbé).
 ('!r21','Relais SP-A','SP-A','HELTEC_V4','CLIENT',   FALSE,-21.3400,55.4770, 84, NOW()-INTERVAL '3 min',  NOW()-INTERVAL '20 days', NULL),
 ('!r22','Relais SP-B','SP-B','HELTEC_V4','CLIENT',   FALSE,-21.34003,55.47703,79,NOW()-INTERVAL '7 min',  NOW()-INTERVAL '20 days', NULL);

-- ── Paquets du maillage (carte principale). (gw,nd) = qui a entendu qui ;
--    base_snr/base_rssi = qualité moyenne ; hop (0 direct, >0 relais) ; cnt =
--    nb de paquets ; max_age_h = fraîcheur (paquets étalés sur cette fenêtre).
CREATE TEMP TABLE demo_edges(gw text, nd text, base_snr real, base_rssi int,
                             hop smallint, cnt int, ptype text, max_age_h int);
INSERT INTO demo_edges VALUES
 -- Anneau côtier (direct), qualité dégradée avec la distance.
 ('!r01','!r02',  8, -82, 0, 34,'position', 24),
 ('!r02','!r03',  6, -90, 0, 22,'position', 24),
 ('!r03','!r04',  3, -98, 0, 15,'position', 24),
 ('!r04','!r05', -2,-104, 0, 11,'position', 24),
 ('!r05','!r06',  5, -92, 0, 26,'position', 12),
 ('!r06','!r07', -9,-112, 0,  7,'position', 24),
 ('!r07','!r08',-16,-121, 0,  3,'position',168),  -- très faible, ancien (voir en 7j)
 ('!r08','!r09', -6,-108, 0,  6,'position', 72),
 ('!r09','!r10',  2,-100, 0, 18,'position', 24),
 ('!r10','!r11',  9, -80, 0, 40,'position',  1),   -- proche, très récent
 ('!r10','!r12',  4, -95, 0, 20,'position', 24),
 ('!r12','!r13', -1,-103, 0,  9,'position', 24),
 ('!r13','!r14', -8,-110, 0,  8,'position', 48),
 ('!r14','!r15',  1,-101, 0, 14,'position', 24),
 ('!r15','!r16',  7, -85, 0, 28,'position', 24),
 ('!r16','!r01',  0,-102, 0, 12,'position', 24),   -- ferme l'anneau
 -- Liaisons intérieures (faibles) + multi-gateway (bridge).
 ('!r11','!r19',  3, -97, 0, 16,'position', 24),
 ('!r10','!r19', -3,-106, 0, 10,'position', 24),   -- r19 vu par 2 gateways (bridge)
 ('!r01','!r04', -5,-107, 0,  7,'position', 24),   -- r04 vu par r01 ET r06 (bridge)
 ('!r19','!r18',-12,-116, 0,  4,'position', 24),
 ('!r10','!r17',-14,-119, 0,  3,'position', 24),   -- Cilaos, très faible
 -- Relais (multi-hop) : alimentent la couche "relais" + filtre hops.
 ('!r06','!r18',  0, -99, 2, 12,'position', 24),
 ('!r15','!r17',  0, -99, 2,  8,'position', 24),
 ('!r10','!r07',  0, -99, 3,  5,'position', 24),
 ('!r06','!r20',  0, -99, 1,  6,'position', 48),
 -- Pile Saint-Pierre (positions quasi identiques) : liens directs r21/r22.
 ('!r21','!r22',  6, -88, 0, 13,'position', 24),
 ('!r10','!r21',  5, -90, 0, 21,'position', 24),
 ('!r10','!r22',  4, -93, 0, 17,'position', 24);

-- Développe chaque arête en `cnt` paquets, avec SNR/RSSI/date jittérés.
INSERT INTO packets (received_at, gateway_id, node_id, packet_type, channel, snr, rssi, hop_count)
SELECT
  NOW() - (random() * e.max_age_h) * INTERVAL '1 hour',
  e.gw, e.nd, e.ptype, 'Fr_Balise',
  CASE WHEN e.base_snr  IS NULL THEN NULL ELSE round((e.base_snr + (random()*4 - 2))::numeric, 2) END,
  CASE WHEN e.base_rssi IS NULL THEN NULL ELSE (e.base_rssi + (random()*10 - 5))::int END,
  e.hop
FROM demo_edges e CROSS JOIN LATERAL generate_series(1, e.cnt) g;

DROP TABLE demo_edges;

-- ── Diagnostic « Voisinage réseau » (fiche node). Tables dédiées (créées ici
--    aussi pour les bases de dev antérieures). Vitrine : /node/!r10 (Saint-Pierre).
CREATE TABLE IF NOT EXISTS node_neighbors (
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  node_id TEXT NOT NULL, neighbor_id TEXT NOT NULL, snr REAL, gateway_id TEXT, channel TEXT
);
CREATE TABLE IF NOT EXISTS traceroute_segments (
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), packet_id BIGINT, channel TEXT,
  source_node TEXT NOT NULL, target_node TEXT NOT NULL, gateway_id TEXT,
  direction TEXT NOT NULL, step SMALLINT NOT NULL, from_node TEXT NOT NULL, to_node TEXT NOT NULL, snr REAL, raw JSONB
);
DELETE FROM node_neighbors WHERE node_id LIKE '!r%';
DELETE FROM traceroute_segments WHERE source_node LIKE '!r%';

-- NeighborInfo : voisins directs déclarés par r10 (SNR variés -> couleurs).
INSERT INTO node_neighbors (node_id, neighbor_id, snr) VALUES
 ('!r10','!r11', 8.5), ('!r10','!r09', 3.0), ('!r10','!r12', 4.2),
 ('!r10','!r19', -10.0), ('!r10','!r21', 5.0), ('!r10','!r13', -16.0);

-- Traceroute : r10 -> r19 via r12 (montre un intermédiaire + SNR par saut,
-- aller/retour) ; et r10 <-> r11 direct.
INSERT INTO traceroute_segments (packet_id, channel, source_node, target_node, gateway_id, direction, step, from_node, to_node, snr) VALUES
 (2001,'Fr_Balise','!r10','!r19','!r10','forward',0,'!r10','!r12', 6.0),
 (2001,'Fr_Balise','!r10','!r19','!r10','forward',1,'!r12','!r19', 2.0),
 (2001,'Fr_Balise','!r10','!r19','!r10','back',   0,'!r19','!r12', 1.0),
 (2001,'Fr_Balise','!r10','!r19','!r10','back',   1,'!r12','!r10', 5.5),
 (2002,'Fr_Balise','!r10','!r11','!r10','forward',0,'!r10','!r11', 8.0),
 (2002,'Fr_Balise','!r10','!r11','!r10','back',   0,'!r11','!r10', 7.5);
