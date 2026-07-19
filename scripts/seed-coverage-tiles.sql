-- Démo de la COUCHE DE COUVERTURE (tuiles). Base de dev uniquement.
--
-- POURQUOI UN SEED DÉDIÉ : les autres seeds ne renseignent que `nodes.last_lat`
-- et laissent `packets.lat/lon` à NULL. Or la couche de couverture s'appuie
-- délibérément sur la position portée PAR LE PAQUET (position et SNR sur la même
-- ligne = même instant, même point, aucune jointure vers une position qui a pu
-- bouger depuis). Sans position sur les paquets, la couche est donc vide — c'est
-- correct, pas un bug. Ce script comble ce manque.
--
-- MODÈLE SIMULÉ : des sondes mobiles parcourent les grands axes de l'île (RN
-- littorale, RN3 des Plaines, montées de Cilaos et Salazie). Chaque point du
-- parcours est entendu par les passerelles à portée, avec un SNR qui décroît
-- avec la distance. Les cirques subissent une pénalité de relief : depuis le
-- fond d'un cirque, une passerelle littorale n'est pas en ligne de vue. C'est ce
-- qui donne à la carte son intérêt — et le contrôle de plausibilité qui va avec :
-- si la couverture rendue est INSENSIBLE au relief, c'est que des paquets non
-- radio passent au travers du filtre.

-- Idempotence : on repart d'un état propre pour ces seules données de démo.
DELETE FROM packets WHERE node_id LIKE '!cov%' OR gateway_id LIKE '!cgw%';
DELETE FROM nodes   WHERE node_id LIKE '!cov%' OR node_id  LIKE '!cgw%';

-- ── Passerelles littorales (gateway_override TRUE = affichées « GW »).
INSERT INTO nodes (node_id, long_name, short_name, hw_model, role, is_mobile,
                   last_lat, last_lon, last_battery, last_seen, first_seen,
                   gateway_override) VALUES
 ('!cgw1','Passerelle Saint-Denis','cgwN','HELTEC_V4','ROUTER',FALSE,-20.8823,55.4504,97,NOW()-INTERVAL '2 min',NOW()-INTERVAL '40 days',TRUE),
 ('!cgw2','Passerelle Saint-Benoît','cgwE','HELTEC_V4','ROUTER',FALSE,-21.0340,55.7130,93,NOW()-INTERVAL '3 min',NOW()-INTERVAL '40 days',TRUE),
 ('!cgw3','Passerelle Saint-Pierre','cgwS','HELTEC_V4','ROUTER',FALSE,-21.3410,55.4780,95,NOW()-INTERVAL '1 min',NOW()-INTERVAL '40 days',TRUE),
 ('!cgw4','Passerelle Saint-Paul','cgwO','HELTEC_V4','ROUTER',FALSE,-21.0090,55.2700,90,NOW()-INTERVAL '5 min',NOW()-INTERVAL '40 days',TRUE),
 ('!cgw5','Passerelle Le Tampon','cgwC','HELTEC_V4','ROUTER',FALSE,-21.2780,55.5160,88,NOW()-INTERVAL '4 min',NOW()-INTERVAL '40 days',TRUE);

-- ── Sondes mobiles (is_mobile TRUE : ce sont les meilleures sondes de
--    couverture, elles explorent le territoire).
INSERT INTO nodes (node_id, long_name, short_name, hw_model, role, is_mobile,
                   last_lat, last_lon, last_battery, last_seen, first_seen)
SELECT '!cov' || i, 'Sonde mobile ' || i, 'S' || i, 'TBEAM', 'CLIENT', TRUE,
       -21.11 + (i % 3) * 0.05, 55.45 + (i % 4) * 0.05,
       40 + (i * 9) % 55, NOW() - (i || ' min')::interval, NOW() - INTERVAL '30 days'
FROM generate_series(1, 6) i;

-- ── Parcours -> paquets position captés en direct.
WITH seg(track, lat1, lon1, lat2, lon2) AS (VALUES
  -- Littoral nord/est
  (1,-20.8823,55.4504,-20.8970,55.5490),(1,-20.8970,55.5490,-20.9050,55.6060),
  (1,-20.9050,55.6060,-20.9630,55.6510),(1,-20.9630,55.6510,-21.0000,55.6790),
  (1,-21.0000,55.6790,-21.0340,55.7130),(1,-21.0340,55.7130,-21.1260,55.7920),
  -- Littoral sud/est (le « trou » du volcan est naturel : peu de passerelles)
  (2,-21.1260,55.7920,-21.3590,55.7670),(2,-21.3590,55.7670,-21.3830,55.6200),
  (2,-21.3830,55.6200,-21.3410,55.4780),
  -- Littoral sud/ouest et ouest
  (3,-21.3410,55.4780,-21.2630,55.3630),(3,-21.2630,55.3630,-21.1700,55.2880),
  (3,-21.1700,55.2880,-21.0090,55.2700),(3,-21.0090,55.2700,-20.9390,55.2910),
  (3,-20.9390,55.2910,-20.8823,55.4504),
  -- RN3, route des Plaines (altitude, bonne vue -> couverture correcte)
  (4,-21.3410,55.4780,-21.2780,55.5160),(4,-21.2780,55.5160,-21.2040,55.5730),
  (4,-21.2040,55.5730,-21.1320,55.6330),(4,-21.1320,55.6330,-21.0340,55.7130),
  -- Montée de Cilaos (cirque : ligne de vue coupée par les remparts)
  (5,-21.2860,55.4120,-21.2000,55.4800),(5,-21.2000,55.4800,-21.1350,55.4720),
  -- Montée de Salazie (idem)
  (6,-20.9630,55.6510,-21.0000,55.5900),(6,-21.0000,55.5900,-21.0300,55.5400)
),
pts AS (
  SELECT
    s.track,
    (t * 100)::int                              AS step,
    s.lat1 + (s.lat2 - s.lat1) * t              AS lat,
    s.lon1 + (s.lon2 - s.lon1) * t              AS lon
  FROM seg s, generate_series(0, 0.96, 0.04) AS t
),
gw(gid, glat, glon) AS (VALUES
  ('!cgw1',-20.8823,55.4504),('!cgw2',-21.0340,55.7130),('!cgw3',-21.3410,55.4780),
  ('!cgw4',-21.0090,55.2700),('!cgw5',-21.2780,55.5160)
),
links AS (
  SELECT
    p.track, p.step, p.lat, p.lon, g.gid,
    -- Haversine en SQL (même approche que node-map-links.ts).
    2 * 6371 * asin(sqrt(
      sin(radians(g.glat - p.lat) / 2) ^ 2 +
      cos(radians(p.lat)) * cos(radians(g.glat)) *
      sin(radians(g.glon - p.lon) / 2) ^ 2
    )) AS dist_km,
    -- Pénalité de relief : depuis le fond d'un cirque, pas de ligne de vue vers
    -- une passerelle littorale. C'est ce qui fait « décrocher » la couverture en
    -- franchissant un rempart.
    CASE
      WHEN p.lat BETWEEN -21.18 AND -21.09 AND p.lon BETWEEN 55.42 AND 55.53
        THEN 13.0                                    -- Cilaos
      WHEN p.lat BETWEEN -21.08 AND -20.99 AND p.lon BETWEEN 55.48 AND 55.60
        THEN 11.0                                    -- Salazie
      ELSE 0.0
    END AS relief_db
  FROM pts p CROSS JOIN gw g
)
INSERT INTO packets (received_at, gateway_id, node_id, packet_type, channel,
                     lat, lon, altitude, snr, rssi, hop_count, raw)
SELECT
  NOW() - ((l.track * 97 + l.step * 13) % 720 || ' hours')::interval,
  l.gid,
  '!cov' || (1 + ((l.step / 4 + l.track * 2) % 6)),
  'position',
  'Fr_Balise',
  l.lat,
  l.lon,
  NULL,
  ROUND((6 - 16 * log(l.dist_km + 1) - l.relief_db
         + ((l.step * 7 + l.track * 11) % 5) * 0.4)::numeric, 2),
  ROUND((-92 - 1.6 * l.dist_km - l.relief_db)::numeric, 0),
  0,                                                 -- réception DIRECTE
  -- precision_bits absent = pleine précision (défaut Meshtastic).
  '{"payload":{}}'::jsonb
FROM links l
WHERE (6 - 16 * log(l.dist_km + 1) - l.relief_db) > -19   -- hors de portée sinon
  AND l.dist_km < 40;

-- ── Contre-exemples : ces lignes DOIVENT rester invisibles sur la couche.
--    Elles servent à vérifier le filtre sur données de dev.
INSERT INTO packets (received_at, gateway_id, node_id, packet_type, channel,
                     lat, lon, snr, hop_count, raw)
VALUES
  -- 1. Le node pousse SA PROPRE position en MQTT : n'a jamais voyagé sur les ondes.
  (NOW(),'!cov1','!cov1','position','Fr_Balise',-21.2000,55.3000, 9, 0,'{"payload":{}}'),
  -- 2. Paquet relayé : le SNR est celui du dernier relais, pas de ce point.
  (NOW(),'!cgw1','!cov2','position','Fr_Balise',-21.2100,55.3050, 8, 2,'{"payload":{}}'),
  -- 3. Position volontairement grossière (13 bits ≈ 4,6 km) : trop floue pour z15.
  (NOW(),'!cgw1','!cov3','position','Fr_Balise',-21.2200,55.3100, 7, 0,
   '{"payload":{"precision_bits":13}}');

-- ---- Doublon /json/ + /e/ : UNE réception, DEUX lignes ----
-- Une passerelle ayant activé la sortie JSON en plus du chiffrement republie
-- chaque paquet capté sur les deux topics. Les deux lignes portent le MÊME
-- MeshPacket.id : la couche ne doit en compter qu'UNE (sinon cette passerelle
-- pèse double dans le percentile qui colore la tuile).
INSERT INTO packets (received_at, gateway_id, node_id, packet_type, channel,
                     lat, lon, snr, hop_count, raw)
VALUES
  (NOW(), '!cgw1', '!cov4', 'position', 'Fr_Balise', -21.0500, 55.7000, -16, 0,
   '{"id":123456789,"payload":{}}'),
  (NOW(), '!cgw1', '!cov4', 'position', 'Fr_Balise', -21.0500, 55.7000, -16, 0,
   '{"id":123456789,"payload":{}}'),
  -- Même paquet entendu par une AUTRE passerelle : deux lignes légitimes,
  -- à conserver toutes les deux (c'est la redondance qu'on veut mesurer).
  (NOW(), '!cgw2', '!cov4', 'position', 'Fr_Balise', -21.0500, 55.7000, -5, 0,
   '{"id":123456789,"payload":{}}');

-- Contrôle rapide (à comparer avec la carte) :
--   SELECT count(*) FROM packets WHERE node_id LIKE '!cov%' AND hop_count = 0
--     AND gateway_id <> node_id AND lat IS NOT NULL;
