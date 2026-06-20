# Analytics, heatmap & link graph (Phase 4)

Enrichissement des pages au-delà de la carte temps réel : couverture signal, statistiques
réseau, historique par node, graphe des liaisons. S'appuie sur les données **déjà captées**
en Phase 2/3 (`packets` + `nodes`) — aucun changement worker obligatoire.

## Périmètre Phase 4

| Bloc | Contenu |
| ---- | ------- |
| **Heatmap couverture SNR** | Le différenciateur vs Gaulix : qualité de signal spatialisée, pas juste des points. |
| **Page Statistiques** | KPI réseau + répartitions (hw, firmware, rôle, type de paquet, hops) + filtres temporels. |
| **Page détail node** | Courbes 30j (SNR, batterie, paquets/jour) pour un node. |
| **Link graph** | Graphe « qui relaie qui » (liens sur la carte + graphe topologique abstrait). |
| **Filtres** | Temporels (fenêtre) + carte (modulation, rôle, recherche node). |

**Déplacé en Phase 5** (chevauchement alertes / besoin d'auth) :
- Vues listes nodes spécialisées (actifs / batterie faible / mal configurés).
- Page debug « Trames » (flux brut) — derrière l'auth admin.

**Hors périmètre (jamais en Phase 4)** : messagerie (branche dédiée), envoyer une trame
(uplink only, downlink OFF), décodeurs QR/ProtoBuf, générateur de nom.

## API

Routes Handlers Next (`app/api/<x>/route.ts`, `export const dynamic = "force-dynamic"`).
SQL centralisé dans `lib/queries/` (jamais inline), testé en TDD (Red-Green-Refactor).

| Route | Réponse |
| ----- | ------- |
| `GET /api/coverage?since=...` | GeoJSON : agrégat SNR par bucket géo (alimente la heatmap) |
| `GET /api/stats?since=...` | KPI + répartitions catégorielles (sur **tout le réseau capté**) |
| `GET /api/nodes/[id]/history?since=...` | Séries 30j d'un node (SNR, batterie, paquets/jour) |
| `GET /api/links?since=...` | Arêtes du graphe (node → voisin + SNR), privacy-aware |

## Stats = tout le réseau capté (≠ carte)

Décision assumée : les **agrégats anonymes** (compteurs, répartitions) portent sur **tous**
les nodes/paquets captés (comme l'affichage 381 nodes de Gaulix), pas seulement les opt-in.
Un agrégat n'expose aucun individu.

→ `getStats` (et les requêtes stats) **n'appliquent PAS** le filtre
`share_on_map = TRUE AND is_mobile = FALSE` qui borne `getPublicNodes`. Divergence
**volontaire** : la barrière privacy reste stricte sur la **carte** et le **temps réel**,
mais pas sur les comptages agrégés. Ne pas « corriger » en réuniformisant.

KPI cible : nodes total, nodes actifs (24h), paquets 24h, **paquets/min**, **utilisation
canal moyenne**, **air util TX moyen** — tous dérivables de `packets` (`channel_util`,
`air_util_tx`) sans nouvelle colonne.

## Visualisations — barres, pas camemberts

Les répartitions catégorielles (type de carte, firmware, rôle, type de paquet, hops) sont
rendues en **barres horizontales triées** (Recharts), pas en camemberts (illisibles dès
qu'il y a une longue traîne, cf. Gaulix). Recharts aussi pour les courbes historiques.

## Heatmap couverture SNR

- Source : `GET /api/coverage` → GeoJSON. Agrégation SQL par bucket lat/lon (l'index
  `idx_packets_geo` existe déjà), valeur = SNR moyen/médian du bucket.
- Rendu : couche `heatmap` MapLibre (pondérée par le SNR), **pas** des markers HTML.
- ⚠️ Rappel réseau : `rssi`/`snr` = qualité du **dernier hop** (relais → nous), pas de
  l'émetteur d'origine. La heatmap reflète la couverture des **gateways**, à libeller comme tel.

## Link graph — données & privacy

- **Source** : paquets `neighborinfo` (un node déclare ses voisins directs + SNR), **déjà
  captés** dans `packets.raw` (le worker ne filtre que par canal). Les arêtes sont dérivées
  au read-time depuis `packets` — matérialiser une table `node_neighbors` reste une optim
  optionnelle à trancher si les requêtes pèsent.
- **Privacy (OBLIGATOIRE)** :
  - **Liens géographiques sur la carte** : uniquement entre nodes **opt-in** (`share_on_map`).
    Un lien vers un node non opt-in révélerait sa position → exclu.
  - **Graphe topologique abstrait** (force-directed, sans carte) : peut inclure tout le
    réseau, mais les nodes non opt-in sont **anonymisés** (ID masqué, aucune position).
  - Jamais « tout visible » comme Gaulix.

## Vérification manuelle

```
docker compose up -d        # TimescaleDB + Mosquitto
yarn worker:dev             # ingestion MQTT
yarn dev                    # http://localhost:3000
```

Heatmap cohérente avec les zones de gateways ; page stats avec compteurs sur tout le réseau ;
détail node affichant 30j ; link graph sans aucune position de node non opt-in.
