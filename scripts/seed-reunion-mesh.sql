-- Démo réaliste et COHÉRENTE : maillage étalé sur toute La Réunion (villes
-- réelles). Les liens directs (0 hop) ne relient que des nœuds réellement à
-- portée (< 20 km, ligne de vue crédible) ; le massif central isole les cirques
-- (Cilaos, Salazie) et coupe le sud-est (gap volcan Sainte-Rose <-> St-Philippe).
-- Les observations multi-hop (hop 1/2/3) sont CALCULÉES par plus court chemin sur
-- ce graphe : chaque saut correspond à un vrai relais, lui-même visible (vert)
-- via NeighborInfo. => aucune arête « dans le vide », aucune incohérence visuelle.
-- Base de dev uniquement. Fichier généré (scratchpad/gen_full_seed.py).

DELETE FROM packets WHERE gateway_id LIKE '!r%' OR node_id LIKE '!r%'
                       OR gateway_id LIKE '!demo%' OR node_id LIKE '!demo%';
DELETE FROM nodes WHERE node_id LIKE '!r%' OR node_id LIKE '!demo%';

-- ── Nœuds : villes réelles, last_seen ÉTALÉ, batteries variées.
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
 ('!r22','Relais SP-B','SP-B','HELTEC_V4','CLIENT',   FALSE,-21.34003,55.47703,79,NOW()-INTERVAL '7 min',  NOW()-INTERVAL '20 days', NULL),
 -- Relais sur la descente de Cilaos : entend Cilaos en direct, relaie vers le sud.
 ('!r23','Bras-Sec','BrS','RAK4631','CLIENT',         FALSE,-21.2000, 55.4800,  62,NOW()-INTERVAL '9 min',  NOW()-INTERVAL '15 days', NULL);

-- ── Observations (carte principale). (gw,nd) = quelle gateway a entendu quel
--    node ; hop = nb de relais du PLUS COURT CHEMIN (0 direct). base_snr/base_rssi
--    = qualité ; cnt = nb de paquets ; max_age_h = fraîcheur. Bloc généré : les
--    hops et les liens directs sont dérivés du graphe de portée (cf. en-tête).
CREATE TEMP TABLE demo_edges(gw text, nd text, base_snr real, base_rssi int,
                             hop smallint, cnt int, ptype text, max_age_h int);
INSERT INTO demo_edges VALUES
 ('!r01','!r02', -1, -105, 0, 18,'position', 24),
 ('!r01','!r03', -4, -108, 1, 10,'position', 24),
 ('!r01','!r04', -9, -116, 2,  6,'position', 48),
 ('!r01','!r05',-13, -121, 3,  4,'position', 48),
 ('!r01','!r13',-13, -121, 3,  4,'position', 48),
 ('!r01','!r14', -9, -116, 2,  6,'position', 48),
 ('!r01','!r15', -4, -108, 1, 10,'position', 24),
 ('!r01','!r16', -9, -121, 0,  9,'position', 24),
 ('!r01','!r20',-13, -121, 3,  4,'position', 48),
 ('!r06','!r02',-13, -121, 3,  4,'position', 48),
 ('!r06','!r03', -9, -116, 2,  6,'position', 48),
 ('!r06','!r04', -4, -108, 1, 10,'position', 24),
 ('!r06','!r05',  4,  -93, 0, 24,'position', 24),
 ('!r06','!r07', -4, -111, 0, 14,'position', 24),
 ('!r06','!r09',-13, -121, 3,  4,'position', 48),
 ('!r06','!r10',-13, -121, 3,  4,'position', 48),
 ('!r06','!r11', -9, -116, 2,  6,'position', 48),
 ('!r06','!r12',-13, -121, 3,  4,'position', 48),
 ('!r06','!r18', -5, -112, 0, 14,'position', 24),
 ('!r06','!r19', -4, -108, 1, 10,'position', 24),
 ('!r06','!r20', -9, -116, 2,  6,'position', 48),
 ('!r10','!r06',-13, -121, 3,  4,'position', 48),
 ('!r10','!r08', -4, -108, 1, 10,'position', 24),
 ('!r10','!r09', -6, -116, 0, 11,'position', 24),
 ('!r10','!r11',  1, -100, 0, 20,'position', 24),
 ('!r10','!r12',  0, -102, 0, 19,'position', 24),
 ('!r10','!r13', -4, -108, 1, 10,'position', 24),
 ('!r10','!r14', -9, -116, 2,  6,'position', 48),
 ('!r10','!r15',-13, -121, 3,  4,'position', 48),
 ('!r10','!r17', -4, -108, 1, 10,'position', 24),
 ('!r10','!r18', -9, -116, 2,  6,'position', 48),
 ('!r10','!r19', -4, -108, 1, 10,'position', 24),
 ('!r10','!r21',  9,  -82, 0, 30,'position', 24),
 ('!r10','!r22',  9,  -82, 0, 30,'position', 24),
 ('!r10','!r23', -7, -116, 0, 11,'position', 24),
 ('!r11','!r05',-13, -121, 3,  4,'position', 48),
 ('!r11','!r06', -9, -116, 2,  6,'position', 48),
 ('!r11','!r07',-13, -121, 3,  4,'position', 48),
 ('!r11','!r08', -4, -108, 1, 10,'position', 24),
 ('!r11','!r09', -7, -117, 0, 11,'position', 24),
 ('!r11','!r10',  1, -100, 0, 20,'position', 24),
 ('!r11','!r12', -2, -106, 0, 17,'position', 24),
 ('!r11','!r13', -4, -108, 1, 10,'position', 24),
 ('!r11','!r14', -9, -116, 2,  6,'position', 48),
 ('!r11','!r15',-13, -121, 3,  4,'position', 48),
 ('!r11','!r17', -9, -116, 2,  6,'position', 48),
 ('!r11','!r18', -4, -108, 1, 10,'position', 24),
 ('!r11','!r19', -1, -104, 0, 18,'position', 24),
 ('!r11','!r21', -4, -108, 1, 10,'position', 24),
 ('!r11','!r22', -4, -108, 1, 10,'position', 24),
 ('!r11','!r23', -4, -108, 1, 10,'position', 24),
 ('!r15','!r01', -4, -108, 1, 10,'position', 24),
 ('!r15','!r02', -9, -116, 2,  6,'position', 48),
 ('!r15','!r03',-13, -121, 3,  4,'position', 48),
 ('!r15','!r10',-13, -121, 3,  4,'position', 48),
 ('!r15','!r11',-13, -121, 3,  4,'position', 48),
 ('!r15','!r12', -9, -116, 2,  6,'position', 48),
 ('!r15','!r13', -4, -108, 1, 10,'position', 24),
 ('!r15','!r14', -9, -122, 0,  8,'position', 24),
 ('!r15','!r16',  1, -100, 0, 20,'position', 24),
 ('!r15','!r23',-13, -121, 3,  4,'position', 48),
 ('!r10','!r11',  1, -100, 0,  3,'text', 24),
 ('!r10','!r12',  0, -102, 0,  4,'text', 24),
 ('!r11','!r19', -1, -104, 0,  5,'text', 24),
 ('!r10','!r09', -6, -116, 0,  6,'text', 24),
 ('!r01','!r02', -1, -105, 0,  7,'text', 24),
 ('!r15','!r16',  1, -100, 0,  3,'text', 24),
 ('!r05','!r06',  4,  -93, 0,  4,'text', 24),
 ('!r12','!r13',  3,  -95, 0,  5,'text', 24),
 ('!r17','!r23',  2,  -98, 0,  6,'text', 24),
 ('!r10','!r11',  1, -100, 0,  8,'telemetry', 24),
 ('!r11','!r19', -1, -104, 0,  9,'telemetry', 24),
 ('!r15','!r16',  1, -100, 0, 10,'telemetry', 24),
 ('!r06','!r18', -5, -112, 0, 11,'telemetry', 24),
 ('!r10','!r23', -7, -116, 0,  8,'telemetry', 24),
 ('!r12','!r13',  3,  -95, 0,  9,'telemetry', 24),
 ('!r09','!r10', -6, -116, 0, 10,'telemetry', 24),
 ('!r11','!r10',  1, -100, 0,  2,'traceroute', 24),
 ('!r12','!r10',  0, -102, 0,  3,'traceroute', 24),
 ('!r09','!r10', -6, -116, 0,  4,'traceroute', 24),
 ('!r06','!r07', -4, -111, 0,  2,'traceroute', 24);

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

-- NeighborInfo : chaque node déclare ses voisins DIRECTS (émis des deux côtés, si
-- bien que chaque fiche node est peuplée). SNR selon la distance. Bloc généré.
INSERT INTO node_neighbors (node_id, neighbor_id, snr) VALUES
 ('!r01','!r02', -1.4),
 ('!r02','!r01', -1.4),
 ('!r02','!r03',  3.0),
 ('!r03','!r02',  3.0),
 ('!r03','!r04',  1.0),
 ('!r04','!r03',  1.0),
 ('!r04','!r05',  4.0),
 ('!r05','!r04',  4.0),
 ('!r05','!r06',  3.8),
 ('!r06','!r05',  3.8),
 ('!r06','!r07', -4.1),
 ('!r07','!r06', -4.1),
 ('!r08','!r09', -6.5),
 ('!r09','!r08', -6.5),
 ('!r09','!r10', -6.4),
 ('!r10','!r09', -6.4),
 ('!r10','!r12', -0.2),
 ('!r12','!r10', -0.2),
 ('!r12','!r13',  3.3),
 ('!r13','!r12',  3.3),
 ('!r13','!r14', -3.9),
 ('!r14','!r13', -3.9),
 ('!r14','!r15', -9.0),
 ('!r15','!r14', -9.0),
 ('!r15','!r16',  0.9),
 ('!r16','!r15',  0.9),
 ('!r16','!r01', -8.7),
 ('!r01','!r16', -8.7),
 ('!r10','!r11',  1.0),
 ('!r11','!r10',  1.0),
 ('!r11','!r12', -1.8),
 ('!r12','!r11', -1.8),
 ('!r11','!r19', -1.1),
 ('!r19','!r11', -1.1),
 ('!r09','!r11', -6.9),
 ('!r11','!r09', -6.9),
 ('!r19','!r18', -1.1),
 ('!r18','!r19', -1.1),
 ('!r18','!r06', -4.7),
 ('!r06','!r18', -4.7),
 ('!r17','!r23',  1.7),
 ('!r23','!r17',  1.7),
 ('!r23','!r12', -2.9),
 ('!r12','!r23', -2.9),
 ('!r23','!r10', -6.7),
 ('!r10','!r23', -6.7),
 ('!r20','!r04', -4.7),
 ('!r04','!r20', -4.7),
 ('!r10','!r21',  8.8),
 ('!r21','!r10',  8.8),
 ('!r10','!r22',  8.9),
 ('!r22','!r10',  8.9),
 ('!r21','!r22',  9.0),
 ('!r22','!r21',  9.0);

-- Traceroute : chemins cohérents avec le graphe (chaque segment est un lien direct).
INSERT INTO traceroute_segments (packet_id, channel, source_node, target_node, gateway_id, direction, step, from_node, to_node, snr) VALUES
 -- r10 -> r19 via r11 (montre un intermédiaire + SNR par saut, aller/retour).
 (2001,'Fr_Balise','!r10','!r19','!r10','forward',0,'!r10','!r11', 6.0),
 (2001,'Fr_Balise','!r10','!r19','!r10','forward',1,'!r11','!r19', 2.0),
 (2001,'Fr_Balise','!r10','!r19','!r10','back',   0,'!r19','!r11', 1.0),
 (2001,'Fr_Balise','!r10','!r19','!r10','back',   1,'!r11','!r10', 5.5),
 -- r10 <-> r11 direct.
 (2002,'Fr_Balise','!r10','!r11','!r10','forward',0,'!r10','!r11', 8.0),
 (2002,'Fr_Balise','!r10','!r11','!r10','back',   0,'!r11','!r10', 7.5),
 -- r10 -> r06 (Saint-Benoît) via r11,r19,r18 : 3 sauts -> arête reach pointillée
 -- (hop 3) au survol, distincte des liens directs. Chemin réel du graphe.
 (2003,'Fr_Balise','!r10','!r06','!r10','forward',0,'!r10','!r11', 5.0),
 (2003,'Fr_Balise','!r10','!r06','!r10','forward',1,'!r11','!r19', 4.0),
 (2003,'Fr_Balise','!r10','!r06','!r10','forward',2,'!r19','!r18', -6.0),
 (2003,'Fr_Balise','!r10','!r06','!r10','forward',3,'!r18','!r06', -9.0),
 (2003,'Fr_Balise','!r10','!r06','!r10','back',   0,'!r06','!r18', -8.0),
 (2003,'Fr_Balise','!r10','!r06','!r10','back',   1,'!r18','!r19', -5.0),
 (2003,'Fr_Balise','!r10','!r06','!r10','back',   2,'!r19','!r11',  2.0),
 (2003,'Fr_Balise','!r10','!r06','!r10','back',   3,'!r11','!r10',  3.0),
 -- Liaison ASYMÉTRIQUE r07 <-> r05 : à l'aller r07 n'atteint r05 qu'en passant
 -- par r06 (relais), mais au retour r05 est entendu EN DIRECT par r07. Donne,
 -- au survol : r07->r05 pointillé 1 hop, r05->r07 vert 0 hop. (r05-r07 n'est
 -- volontairement pas un lien direct du graphe : 18 km marginal.)
 (2004,'Fr_Balise','!r07','!r05','!r07','forward',0,'!r07','!r06', 3.0),
 (2004,'Fr_Balise','!r07','!r05','!r07','forward',1,'!r06','!r05', 5.0),
 (2004,'Fr_Balise','!r07','!r05','!r07','back',   0,'!r05','!r07',-2.0);

-- Anneau « pont » attendu (nodes captés par >=2 gateways dans les 20 km) :
--   !r03 (Sainte-Suzanne)
--   !r09 (Saint-Joseph)
--   !r12 (Saint-Louis)
--   !r13 (Étang-Salé)
--   !r16 (Le Port)
--   !r19 (Plaine-des-Cafres)
--   !r20 (Salazie)
--   !r21 (Relais SP-A)
--   !r22 (Relais SP-B)
--   !r23 (Bras-Sec)
