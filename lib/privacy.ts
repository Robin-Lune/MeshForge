// Règle privacy de la carte publique, centralisée (cf. CLAUDE.md).
// Appliquée à deux endroits qui DOIVENT rester cohérents :
//   - getPublicNodes (filtre SQL de l'API REST)
//   - upsertNode (décide si un pg_notify temps réel part)
// Politique : PUBLIC PAR DÉFAUT (norme Meshtastic). Un node fixe localisé est
// visible sans opt-in ; les mobiles restent masqués TANT QUE le snap ~1,5 km
// n'est pas implémenté (cf. .claude/docs/privacy-rgpd.md).
export interface VisibilityInput {
  isMobile: boolean;
  lat: number | null;
  lon: number | null;
}

export function isPubliclyVisible(node: VisibilityInput): boolean {
  if (node.isMobile) return false; // snap ~1,5 km pas encore implémenté → masqué
  if (node.lat === null || node.lon === null) return false; // pas de position
  return true;
}
