// Règle privacy de la carte publique, centralisée (cf. .claude/docs/privacy-rgpd.md).
// Politique : PUBLIC PAR DÉFAUT. Un node localisé est visible. Les mobiles le sont
// aussi, mais leur position est FLOUTÉE par snapToGrid (cellule ~1,5 km constante).
// Appliquée à deux endroits qui DOIVENT rester cohérents :
//   - getPublicNodes (filtre SQL de l'API REST)
//   - upsertNode (décide si un pg_notify temps réel part)
export interface VisibilityInput {
  lat: number | null;
  lon: number | null;
}

export function isPubliclyVisible(node: VisibilityInput): boolean {
  return node.lat !== null && node.lon !== null;
}

// Flou CONSTANT pour les mobiles : snap sur le centre d'une cellule ~500 m.
// Déterministe → deux positions dans la même cellule donnent le même point, donc
// impossible de retrouver la position exacte en moyennant N trames (≠ flou aléatoire).
const CELL_DEG = 0.0045; // ≈ 500 m à la latitude de La Réunion

export function snapToGrid(
  lat: number,
  lon: number,
): { lat: number; lon: number } {
  const snap = (v: number): number =>
    (Math.floor(v / CELL_DEG) + 0.5) * CELL_DEG;
  return { lat: snap(lat), lon: snap(lon) };
}
