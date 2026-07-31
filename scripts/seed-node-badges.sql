-- Démonstration des pastilles : fraîcheur, badge de rôle, badge compteur,
-- anneau « pont », précision de position. Base de dev uniquement.
--
-- Préfixe '!zb' : 'z' n'est PAS un chiffre hexadécimal, donc ces DELETE ne
-- peuvent atteindre aucun node réel (les node_id Meshtastic sont "!" + hex(8)).
-- Ne jamais préfixer un seed par une lettre hexadécimale nue.
--
-- Les dates sont figées à l'INSERTION : un node semé « il y a 2 min » quitte le
-- palier « < 1 h » une heure plus tard. Rejouer le seed (npm run seed) pour
-- retrouver les paliers récents.

DELETE FROM packets WHERE gateway_id LIKE '!zb%' OR node_id LIKE '!zb%';
DELETE FROM nodes WHERE node_id LIKE '!zb%';

-- Rangée 1 : les cinq paliers de fraîcheur, tout le reste constant.
INSERT INTO nodes (node_id,long_name,short_name,hw_model,role,is_mobile,
                   last_lat,last_lon,last_battery,last_seen,first_seen,gateway_override) VALUES
 ('!zb01','Fraîcheur <1h','F1h','HELTEC_V4','CLIENT', FALSE,-21.05,55.10, 95, NOW()-INTERVAL '2 min',   NOW()-INTERVAL '60 days', FALSE),
 ('!zb02','Fraîcheur <24h','F24','HELTEC_V4','CLIENT',FALSE,-21.05,55.13, 80, NOW()-INTERVAL '9 hours', NOW()-INTERVAL '60 days', FALSE),
 ('!zb03','Fraîcheur <7j','F7j','HELTEC_V4','CLIENT', FALSE,-21.05,55.16, 60, NOW()-INTERVAL '4 days',  NOW()-INTERVAL '60 days', FALSE),
 ('!zb04','Fraîcheur <14j','F14','HELTEC_V4','CLIENT',FALSE,-21.05,55.19, 40, NOW()-INTERVAL '11 days', NOW()-INTERVAL '60 days', FALSE),
 ('!zb05','Fraîcheur >14j','FVx','HELTEC_V4','CLIENT',FALSE,-21.05,55.22, 20, NOW()-INTERVAL '30 days', NOW()-INTERVAL '60 days', FALSE),

-- Rangée 2 : tous les rôles. Les CLIENT_* ne portent aucun badge ; '99' est une
-- valeur d'enum inconnue du décodeur, qui doit sortir « ? » et non rien.
 ('!zb10','Rôle ROUTER','RTR','HELTEC_V4','ROUTER',              FALSE,-21.09,55.10, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb11','Rôle ROUTER_CLIENT','RTC','HELTEC_V4','ROUTER_CLIENT',FALSE,-21.09,55.13, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb12','Rôle ROUTER_LATE','RTL','HELTEC_V4','ROUTER_LATE',    FALSE,-21.09,55.16, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb13','Rôle REPEATER','RPT','HELTEC_V4','REPEATER',          FALSE,-21.09,55.19, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb14','Rôle SENSOR','SNS','RAK4631','SENSOR',                FALSE,-21.09,55.22, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb15','Rôle TRACKER','TRK','TBEAM','TRACKER',                TRUE, -21.09,55.25, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb16','Rôle TAK_TRACKER','TKT','TBEAM','TAK_TRACKER',        TRUE, -21.09,55.28, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb17','Rôle TAK','TAK','TBEAM','TAK',                        FALSE,-21.09,55.31, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),

 ('!zb20','Rôle CLIENT','CLI','HELTEC_V4','CLIENT',              FALSE,-21.13,55.10, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb21','Rôle CLIENT_MUTE','CLM','HELTEC_V4','CLIENT_MUTE',    FALSE,-21.13,55.13, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb22','Rôle CLIENT_HIDDEN','CLH','HELTEC_V4','CLIENT_HIDDEN',FALSE,-21.13,55.16, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb23','Rôle CLIENT_BASE','CLB','HELTEC_V4','CLIENT_BASE',    FALSE,-21.13,55.19, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb24','Rôle LOST_AND_FOUND','LAF','HELTEC_V4','LOST_AND_FOUND',FALSE,-21.13,55.22,90,NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb25','Rôle hors catalogue','HCa','HELTEC_V4','99',          FALSE,-21.13,55.25, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!zb26','Rôle absent','RAb','HELTEC_V4',NULL,                  FALSE,-21.13,55.28, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),

-- Rangée 3 : précision de position (infobulle). TRUE = défaut prudent, position
-- floutée ; FALSE = fixité confirmée par un admin, position exacte.
 ('!zb30','Position exacte','PEx','HELTEC_V4','ROUTER',FALSE,-21.17,55.10, 90, NOW()-INTERVAL '4 min', NOW()-INTERVAL '40 days', FALSE),
 ('!zb31','Position floutée','PFl','TBEAM','CLIENT',   TRUE, -21.17,55.13, 90, NOW()-INTERVAL '4 min', NOW()-INTERVAL '40 days', FALSE),

-- Rangée 4 : passerelles. gateway_override force le statut indépendamment du
-- trafic, pour tester le badge compteur dans ses trois états.
 ('!zb40','Gateway active','GWA','HELTEC_V4','ROUTER',FALSE,-21.21,55.10, 99, NOW()-INTERVAL '1 min',  NOW()-INTERVAL '60 days', TRUE),
 ('!zb41','Gateway silencieuse','GWS','HELTEC_V4','ROUTER',FALSE,-21.21,55.16, 99, NOW()-INTERVAL '2 hours', NOW()-INTERVAL '60 days', TRUE),
 ('!zb42','Gateway vieille','GWV','HELTEC_V4','ROUTER',FALSE,-21.21,55.22, 15, NOW()-INTERVAL '20 days', NOW()-INTERVAL '60 days', TRUE),

-- Nœud « pont » : entendu par les deux passerelles à moins de 20 km.
 ('!zb50','Pont deux gateways','PNT','HELTEC_V4','CLIENT',FALSE,-21.21,55.13, 70, NOW()-INTERVAL '5 min', NOW()-INTERVAL '30 days', FALSE),

-- Nœuds INVISIBLES sur la carte, mais comptés par le badge : l'un sans
-- position, l'autre retiré (opt-out RGPD). C'est la raison d'être du compteur.
 ('!zb60','Sans position','SPo','RAK4631','SENSOR',FALSE,NULL,NULL, 55, NOW()-INTERVAL '6 min', NOW()-INTERVAL '30 days', FALSE),
 ('!zb61','Retiré RGPD','RGP','RAK4631','SENSOR',  FALSE,-21.21,55.19, 55, NOW()-INTERVAL '7 min', NOW()-INTERVAL '30 days', FALSE);

UPDATE nodes SET excluded = TRUE WHERE node_id = '!zb61';

-- Paquets. Le compteur ne retient que hop 0 sur la dernière heure.
CREATE TEMP TABLE badge_edges(gw text, nd text, snr real, rssi int,
                              hop smallint, cnt int, age_min int);
INSERT INTO badge_edges VALUES
 -- Gateway active : 3 nodes affichables + 2 invisibles, tous en direct → 5.
 ('!zb40','!zb01', -2, -100, 0, 6,  5),
 ('!zb40','!zb50', -5, -108, 0, 4, 12),
 ('!zb40','!zb10', -7, -112, 0, 3, 30),
 ('!zb40','!zb60', -9, -115, 0, 3, 15),
 ('!zb40','!zb61', -9, -115, 0, 3, 18),
 -- Lien relayé récent : ne compte pas.
 ('!zb40','!zb02', -9, -118, 2, 3, 20),
 -- hop_count NULL : inconnu, donc pas « direct ». Ne compte pas non plus.
 ('!zb40','!zb03', -9, -118, NULL, 2, 25),
 -- Gateway silencieuse : direct mais hors de la fenêtre d'une heure → 0.
 ('!zb41','!zb03', -6, -110, 0, 5, 240),
 ('!zb41','!zb50', -8, -114, 0, 4, 300),
 ('!zb41','!zb04',-11, -120, 1, 2, 10),
 -- Gateway vieille : plus rien depuis longtemps.
 ('!zb42','!zb05',-13, -124, 0, 2, 40000);

INSERT INTO packets (received_at, gateway_id, node_id, packet_type, channel, snr, rssi, hop_count)
SELECT
  NOW() - (e.age_min * INTERVAL '1 minute'),
  e.gw, e.nd, 'position', 'Fr_Balise', e.snr, e.rssi, e.hop
FROM badge_edges e CROSS JOIN LATERAL generate_series(1, e.cnt) g;

DROP TABLE badge_edges;

-- Attendu : compteurs 5 / 0 / 0, les trois affichés ; !zb50 porte l'anneau ;
-- rangée 2 = R R R R C T T T, puis 4 sans badge, ? ?, puis 1 sans badge.
