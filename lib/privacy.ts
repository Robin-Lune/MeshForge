// Règle privacy de la carte publique, centralisée (cf. CLAUDE.md).
// Appliquée à deux endroits qui DOIVENT rester cohérents :
//   - getPublicNodes (filtre SQL de l'API REST)
//   - upsertNode (décide si un pg_notify temps réel part)
// Un node n'est visible publiquement que s'il est opt-in, fixe, et localisé.
export interface VisibilityInput {
  shareOnMap: boolean;
  isMobile: boolean;
  lat: number | null;
  lon: number | null;
}

export function isPubliclyVisible(node: VisibilityInput): boolean {
  if (!node.shareOnMap) return false; // opt-in explicite requis (défaut: false)
  if (node.isMobile) return false; // mobile = jamais sur la carte publique
  if (node.lat === null || node.lon === null) return false; // pas de position
  return true;
}
