-- Seed de démo (complément de seed-stacked-nodes.sql) : nœuds dispersés autour
-- de la pile + arêtes packets pour alimenter la toile de liaisons (drawMesh).
-- Objectif : vérifier le rendu des tracés direct (hop 0) vs relais (n hops) quand
-- on survole un nœud de la pile, après le correctif d'ancrage du popup.
--
-- Rappel data-flow : les positions viennent de `nodes`, les arêtes de `packets`
-- (gateway_id = nœud de la pile qui « entend », node_id = nœud dispersé, hop_count
-- = 0 direct / >0 relais). getObservations() agrège MIN(hop_count) sur 7 j.

-- 1) Nœuds dispersés (positions exactes, ~2-5 km autour du centre -21.115,55.536).
INSERT INTO nodes
  (node_id, long_name, short_name, hw_model, role, is_mobile,
   last_lat, last_lon, last_battery, last_seen, first_seen)
VALUES
  ('!disp01', 'Nord direct',   'N-0',  'HELTEC_V4', 'CLIENT', FALSE, -21.0950, 55.5360, 88, NOW(), NOW()),
  ('!disp02', 'Est direct',    'E-0',  'HELTEC_V4', 'CLIENT', FALSE, -21.1150, 55.5620, 84, NOW(), NOW()),
  ('!disp03', 'Sud 2 hops',    'S-2',  'HELTEC_V4', 'CLIENT', FALSE, -21.1420, 55.5360, 70, NOW(), NOW()),
  ('!disp04', 'Ouest 3 hops',  'W-3',  'HELTEC_V4', 'CLIENT', FALSE, -21.1150, 55.5010, 61, NOW(), NOW()),
  ('!disp05', 'NE 1 hop',      'NE-1', 'HELTEC_V4', 'CLIENT', FALSE, -21.0980, 55.5560, 79, NOW(), NOW()),
  ('!disp06', 'SO direct',     'SO-0', 'HELTEC_V4', 'CLIENT', FALSE, -21.1360, 55.5100, 66, NOW(), NOW()),
  ('!disp07', 'SE 2 hops',     'SE-2', 'HELTEC_V4', 'CLIENT', FALSE, -21.1380, 55.5620, 58, NOW(), NOW())
ON CONFLICT (node_id) DO UPDATE SET
  last_lat = EXCLUDED.last_lat, last_lon = EXCLUDED.last_lon,
  last_seen = NOW(), excluded = FALSE;

-- 2) Arêtes (une trame par lien suffit : la vue agrège MIN(hop)/AVG(snr)).
--    On repart d'un état propre pour ces liens de démo.
DELETE FROM packets WHERE node_id LIKE '!disp%' AND gateway_id LIKE '!seed%';

INSERT INTO packets
  (received_at, gateway_id, node_id, packet_type, channel, snr, hop_count)
VALUES
  -- MiK3 (!seed0001) : 2 directs + 1 relais 2 hops + 1 relais 3 hops
  (NOW(), '!seed0001', '!disp01', 'position', 'Fr_Balise',  6.5, 0),
  (NOW(), '!seed0001', '!disp02', 'position', 'Fr_Balise',  4.0, 0),
  (NOW(), '!seed0001', '!disp03', 'position', 'Fr_Balise', -2.0, 2),
  (NOW(), '!seed0001', '!disp04', 'position', 'Fr_Balise', -6.5, 3),
  -- PAM (!seed0002) : 1 direct + 1 relais 1 hop
  (NOW(), '!seed0002', '!disp06', 'position', 'Fr_Balise',  5.0, 0),
  (NOW(), '!seed0002', '!disp05', 'position', 'Fr_Balise',  1.0, 1),
  -- MiK2 (!seed0003) : 1 relais 2 hops (croise les liens de MiK3)
  (NOW(), '!seed0003', '!disp07', 'position', 'Fr_Balise', -3.0, 2),
  -- Lien partagé : disp01 aussi entendu par PAM en 1 hop (2 gateways pour 1 node)
  (NOW(), '!seed0002', '!disp01', 'position', 'Fr_Balise',  2.5, 1);

-- Nettoyage (avec seed-stacked-nodes.sql) :
-- DELETE FROM packets WHERE node_id LIKE '!disp%' OR gateway_id LIKE '!seed%';
-- DELETE FROM nodes WHERE node_id LIKE '!disp%' OR node_id LIKE '!seed%';
