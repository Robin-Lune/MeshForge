<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2026 Robin Lebon — La Forge Numérique
-->

# Agrégats et vie privée

Ce document fixe la frontière entre **agrégat** et **individu** dans MeshForge. Il
est référencé par `lib/queries/stats.ts` et `lib/queries/coverage-tiles.ts`.

## La règle

> Une donnée qui désigne **un node** est soumise aux barrières privacy.
> Une donnée qui décrit **le réseau** ne l'est pas.

Concrètement, deux régimes coexistent **volontairement** — les réuniformiser serait
une régression, dans un sens comme dans l'autre.

### Régime « individu » — barrières actives

Vues concernées : carte publique (`/api/nodes`), temps réel (`/api/stream`), toile
de liaisons (`/api/observations`), fiche node (`/node/[id]`).

| Barrière | Où | Effet |
|---|---|---|
| `excluded` | `lib/privacy.ts` → `isPubliclyVisible` | Opt-out RGPD : le node disparaît de l'affichage |
| position requise | idem | Un node sans position n'est pas exposé |
| `is_mobile` | `snapToGrid` (~500 m) | Position **floutée** à l'affichage — la base garde l'exact |
| `anonymized` | `UPSERT_NODE` | Les noms restent `NULL` même si un nodeinfo les renvoie |
| canal `Fr_EMCOM` | requêtes de **paquets** | Les trames ne sortent d'aucune vue |

Le floutage `snapToGrid` est **déterministe** (snap sur le centre d'une cellule) et
non aléatoire : moyenner N trames ne permet pas de retrouver la position exacte.

> **Limite connue — `Fr_EMCOM` ne masque pas le node.** La barrière porte sur les
> *trames*, pas sur le node. `upsertNode` s'exécute pour tout paquet ingéré sans
> distinction de canal (`src/worker/mqtt-subscriber.ts`), et `nodes` ne conserve
> aucune provenance de canal : un node entendu **uniquement** sur `Fr_EMCOM`
> apparaît donc sur la carte publique avec la position apprise là. Le seul recours
> actuel est l'opt-out explicite (`excluded`). Corriger cela demanderait de tracer
> la provenance de canal jusqu'à `nodes` — décision produit, pas simple correctif.

### Régime « agrégat » — pas de barrière individuelle

Vues concernées : `/stats` (`getNetworkStats`), tuiles de couverture
(`/api/coverage`).

Un agrégat qui ne permet pas de remonter à un node n'a pas à être filtré : le
filtrer dégraderait la mesure sans rien protéger. Les répartitions de `/stats`
(par type de paquet, par hop, par modèle, par rôle) portent sur tout le réseau
capté.

## Cas particulier : les tuiles de couverture

La couche de couverture (`lib/queries/coverage-tiles.ts`) est le **premier
consommateur des coordonnées exactes** de `packets` — tout le reste de la carte
publique passe par `snapToGrid`. Elle mérite donc un raisonnement explicite.

Ce qui la rend acceptable :

1. **Le payload ne contient aucun identifiant ni horodatage.** Une tuile porte
   `(x, y)` et des statistiques : SNR p90/max, nombre de relais, nombre
   d'émetteurs, nombre de transmissions, nombre de réceptions et nombre de jours.
   Ni `node_id`, ni `gateway_id`, ni date précise.
2. **L'incertitude Meshtastic est respectée.** `precision_bits` ne correspond
   pas au zoom cartographique : il masque les coordonnées entières en
   degrés×10⁷. La requête reconstitue la zone d'incertitude complète et ne
   conserve une mesure que si cette zone tient entièrement dans une seule
   tuile. Une précision absente ou invalide est refusée.
3. **Les sources sont limitées et nettoyées.** Seuls les canaux de
   `public_channels` sont admis ; `Fr_EMCOM`, l'opt-out RGPD, les paquets sans
   identifiant exploitable et les données de démonstration sont exclus.

Une seule sonde doit pouvoir explorer un quartier : ses mesures sont donc
publiées sans attendre d'autres émetteurs. Le compromis est explicite : même
sans identifiant ni horaire précis, une succession de tuiles peut laisser
deviner un parcours. La maille bornée et l'incertitude de position limitent la
précision de cette lecture sans rendre l'outil inutilisable.

### La maille est un paramètre de vie privée

`coverage_tile_zoom` est borné à **[12, 16]** (`lib/queries/settings.ts`). Le
plafond protège la cohérence avec la granularité de la carte publique :

- **z16 ≈ 570 m** : dernier palier encore **plus grossier** que le flou de 500 m
  appliqué aux marqueurs — mais de très peu. La marge est mince : c'est la
  dernière valeur où l'agrégat reste moins précis que ce que la carte publie
  déjà, d'où le plafond ici et pas plus haut.
- **au-delà de z16** (z17 ≈ 285 m) : refusé. La maille passerait **sous** le flou
  public, et la couche exposerait une granularité géographique plus fine que le
  reste de la carte — elle cesserait d'être un agrégat.

La comparaison va donc dans ce sens : *maille de tuile ≥ flou des marqueurs*.
Cette borne ne remplace pas la vérification de `precision_bits` : les deux
grilles n'ont ni la même origine ni la même projection.

Le zoom est re-validé par `assertTileZoom` avant d'entrer dans le SQL (défense en
profondeur : une valeur écrite hors de l'API, par `psql` ou par restauration d'un
dump antérieur, ne doit pas passer).

## Ce que la couverture ne dit PAS

Précision de lecture, autant méthodologique que déontologique : **une tuile
absente signifie « aucune donnée publiable », jamais « pas de réseau ».**

La carte est volontairement clairsemée — elle montre le territoire *exploré*. Rien
n'est peint là où personne n'est passé, mais une mesure peut aussi être rejetée
si son incertitude chevauche plusieurs tuiles. Aucune interpolation n'est faite
entre tuiles : une heatmap lissée inventerait de la couverture là où il n'y a
pas de donnée. Comme l'usage visé est de décider où poser un relais, confondre
les deux rendrait l'outil trompeur. D'où l'entrée « Non exploré » dans la
légende.

## En cas de doute

Se poser la question : *cette sortie permet-elle d'isoler un node ?*

- Oui → régime « individu », appliquer les barrières.
- Non → régime « agrégat », ne pas filtrer.

Si la réponse dépend de la finesse d'un paramètre (comme la maille des tuiles),
alors **ce paramètre est lui-même un paramètre de vie privée** et doit être borné
dans le code, pas laissé à la configuration.
