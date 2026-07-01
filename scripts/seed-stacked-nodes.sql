-- Seed de démo : 4 nœuds fixes quasi-superposés (~3 m d'écart) pour reproduire
-- la pile de pastilles (MiK3 / PAM / MiK2 / MIKL) et tester l'ancrage du popup.
-- is_mobile = FALSE -> position exacte (pas de snap ~500 m qui les rendrait
-- pixel-identiques). gateway_override = TRUE -> style « gateway » (liseré bleu).
INSERT INTO nodes
  (node_id, long_name, short_name, hw_model, role, is_mobile,
   last_lat, last_lon, last_battery, last_seen, first_seen, gateway_override)
VALUES
  ('!seed0001', 'MiK3 (démo)', 'MiK3', 'HELTEC_V4', 'CLIENT', FALSE,
   -21.11500, 55.53600, 92, NOW(), NOW(), TRUE),
  ('!seed0002', 'PAM (démo)',  'PAM',  'HELTEC_V4', 'CLIENT', FALSE,
   -21.11503, 55.53603, 87, NOW(), NOW(), TRUE),
  ('!seed0003', 'MiK2 (démo)', 'MiK2', 'HELTEC_V4', 'CLIENT', FALSE,
   -21.11506, 55.53606, 81, NOW(), NOW(), TRUE),
  ('!seed0004', 'MIKL (démo)', 'MIKL', 'HELTEC_V4', 'CLIENT', FALSE,
   -21.11509, 55.53609, 76, NOW(), NOW(), TRUE)
ON CONFLICT (node_id) DO UPDATE SET
  last_lat  = EXCLUDED.last_lat,
  last_lon  = EXCLUDED.last_lon,
  last_seen = NOW(),
  gateway_override = TRUE,
  excluded  = FALSE;

-- Nettoyage (à lancer quand tu as fini) :
-- DELETE FROM nodes WHERE node_id LIKE '!seed%';
