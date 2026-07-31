-- Jeu de démonstration des PASTILLES de la carte : fraîcheur (5 paliers),
-- badge de rôle, badge compteur des passerelles, anneau « pont » et précision
-- de position. Complète seed-reunion-mesh.sql, qui couvre la toile mesh mais
-- pas ces cas — ses nœuds sont tous récents, tous fixes et presque tous CLIENT.
--
-- Volontairement placés au large de l'ouest, en grille régulière : ils se
-- lisent d'un coup d'œil et ne se mêlent pas au maillage réaliste.
-- Base de dev uniquement.

DELETE FROM packets WHERE gateway_id LIKE '!b%' OR node_id LIKE '!b%';
DELETE FROM nodes WHERE node_id LIKE '!b%';

-- ── Rangée 1 : les cinq paliers de fraîcheur, à rôle et gateway constants.
--    Seul last_seen change → la rampe bleue doit se lire de gauche à droite.
INSERT INTO nodes (node_id,long_name,short_name,hw_model,role,is_mobile,
                   last_lat,last_lon,last_battery,last_seen,first_seen,gateway_override) VALUES
 ('!b01','Fraîcheur <1h','F1h','HELTEC_V4','CLIENT', FALSE,-21.05,55.10, 95, NOW()-INTERVAL '2 min',   NOW()-INTERVAL '60 days', FALSE),
 ('!b02','Fraîcheur <24h','F24','HELTEC_V4','CLIENT',FALSE,-21.05,55.13, 80, NOW()-INTERVAL '9 hours', NOW()-INTERVAL '60 days', FALSE),
 ('!b03','Fraîcheur <7j','F7j','HELTEC_V4','CLIENT', FALSE,-21.05,55.16, 60, NOW()-INTERVAL '4 days',  NOW()-INTERVAL '60 days', FALSE),
 ('!b04','Fraîcheur <14j','F14','HELTEC_V4','CLIENT',FALSE,-21.05,55.19, 40, NOW()-INTERVAL '11 days', NOW()-INTERVAL '60 days', FALSE),
 ('!b05','Fraîcheur >14j','FVx','HELTEC_V4','CLIENT',FALSE,-21.05,55.22, 20, NOW()-INTERVAL '30 days', NOW()-INTERVAL '60 days', FALSE),

-- ── Rangée 2 : toute la famille des rôles. Les CLIENT_* ne doivent porter
--    AUCUN badge ; le rôle hors catalogue ('99', valeur brute renvoyée par le
--    décodeur pour un enum inconnu) doit afficher « ? » et non rien.
 ('!b10','Rôle ROUTER','RTR','HELTEC_V4','ROUTER',              FALSE,-21.09,55.10, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b11','Rôle ROUTER_CLIENT','RTC','HELTEC_V4','ROUTER_CLIENT',FALSE,-21.09,55.13, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b12','Rôle ROUTER_LATE','RTL','HELTEC_V4','ROUTER_LATE',    FALSE,-21.09,55.16, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b13','Rôle REPEATER','RPT','HELTEC_V4','REPEATER',          FALSE,-21.09,55.19, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b14','Rôle SENSOR','SNS','RAK4631','SENSOR',                FALSE,-21.09,55.22, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b15','Rôle TRACKER','TRK','TBEAM','TRACKER',                TRUE, -21.09,55.25, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b16','Rôle TAK_TRACKER','TKT','TBEAM','TAK_TRACKER',        TRUE, -21.09,55.28, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b17','Rôle TAK','TAK','TBEAM','TAK',                        FALSE,-21.09,55.31, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),

 ('!b20','Rôle CLIENT','CLI','HELTEC_V4','CLIENT',              FALSE,-21.13,55.10, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b21','Rôle CLIENT_MUTE','CLM','HELTEC_V4','CLIENT_MUTE',    FALSE,-21.13,55.13, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b22','Rôle CLIENT_HIDDEN','CLH','HELTEC_V4','CLIENT_HIDDEN',FALSE,-21.13,55.16, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b23','Rôle CLIENT_BASE','CLB','HELTEC_V4','CLIENT_BASE',    FALSE,-21.13,55.19, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b24','Rôle LOST_AND_FOUND','LAF','HELTEC_V4','LOST_AND_FOUND',FALSE,-21.13,55.22,90,NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b25','Rôle hors catalogue','HCa','HELTEC_V4','99',          FALSE,-21.13,55.25, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),
 ('!b26','Rôle absent','RAb','HELTEC_V4',NULL,                  FALSE,-21.13,55.28, 90, NOW()-INTERVAL '3 min', NOW()-INTERVAL '50 days', FALSE),

-- ── Rangée 3 : précision de position (infobulle). is_mobile TRUE = défaut
--    prudent, position floutée ~1,5 km ; FALSE = relais fixe confirmé.
 ('!b30','Position exacte','PEx','HELTEC_V4','ROUTER',FALSE,-21.17,55.10, 90, NOW()-INTERVAL '4 min', NOW()-INTERVAL '40 days', FALSE),
 ('!b31','Position floutée','PFl','TBEAM','CLIENT',   TRUE, -21.17,55.13, 90, NOW()-INTERVAL '4 min', NOW()-INTERVAL '40 days', FALSE),

-- ── Rangée 4 : passerelles. gateway_override force le statut sans dépendre du
--    trafic, pour que le badge compteur soit testable dans les deux états.
 ('!b40','Gateway active','GWA','HELTEC_V4','ROUTER',FALSE,-21.21,55.10, 99, NOW()-INTERVAL '1 min',  NOW()-INTERVAL '60 days', TRUE),
 ('!b41','Gateway silencieuse','GWS','HELTEC_V4','ROUTER',FALSE,-21.21,55.16, 99, NOW()-INTERVAL '2 hours', NOW()-INTERVAL '60 days', TRUE),
 ('!b42','Gateway vieille','GWV','HELTEC_V4','ROUTER',FALSE,-21.21,55.22, 15, NOW()-INTERVAL '20 days', NOW()-INTERVAL '60 days', TRUE),

-- ── Rangée 5 : nœud « pont », entendu par les DEUX passerelles à moins de
--    20 km. Doit porter l'anneau ambre.
 ('!b50','Pont deux gateways','PNT','HELTEC_V4','CLIENT',FALSE,-21.21,55.13, 70, NOW()-INTERVAL '5 min', NOW()-INTERVAL '30 days', FALSE);

-- ── Paquets.
--    !b40 capte 3 nœuds EN DIRECT dans l'heure  → badge « 3 ».
--    !b41 n'a capté qu'en dehors de la fenêtre, et un seul lien relayé dedans
--         → badge « 0 » : le compteur ne compte QUE le hop 0 récent, et le
--         badge doit rester affiché (c'est lui qui identifie la passerelle).
CREATE TEMP TABLE badge_edges(gw text, nd text, snr real, rssi int,
                              hop smallint, cnt int, age_min int);
INSERT INTO badge_edges VALUES
 -- Passerelle active : 3 nœuds distincts en direct, tous dans l'heure.
 ('!b40','!b01', -2, -100, 0, 6,  5),
 ('!b40','!b50', -5, -108, 0, 4, 12),
 ('!b40','!b10', -7, -112, 0, 3, 30),
 -- ... plus un lien relayé récent, qui ne doit PAS compter.
 ('!b40','!b02', -9, -118, 2, 3, 20),
 -- Passerelle silencieuse : direct mais TROP VIEUX (fenêtre = 1 h).
 ('!b41','!b03', -6, -110, 0, 5, 240),
 ('!b41','!b50', -8, -114, 0, 4, 300),
 -- ... et un relayé récent, qui ne compte pas davantage.
 ('!b41','!b04',-11, -120, 1, 2, 10),
 -- Passerelle vieille : plus rien depuis longtemps.
 ('!b42','!b05',-13, -124, 0, 2, 40000);

INSERT INTO packets (received_at, gateway_id, node_id, packet_type, channel, snr, rssi, hop_count)
SELECT
  NOW() - (e.age_min * INTERVAL '1 minute'),
  e.gw, e.nd, 'position', 'Fr_Balise', e.snr, e.rssi, e.hop
FROM badge_edges e CROSS JOIN LATERAL generate_series(1, e.cnt) g;

DROP TABLE badge_edges;

-- Attendu sur la carte :
--   rangée 1 : cinq bleus de plus en plus fades, de gauche à droite
--   rangée 2 : badges R R R R C T T T, puis 4 CLIENT_* sans badge, « ? » (rôle
--              hors catalogue) ×2, et une dernière sans badge (rôle absent)
--   rangée 3 : infobulle « Position exacte » vs « Position approximative »
--   rangée 4 : badges compteur 3 / 0 / 0, les trois affichés
--   !b50     : anneau ambre (entendu par !b40 et !b41, tous deux < 20 km)
