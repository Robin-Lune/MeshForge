// Couleur d'un marker. Gateways (relais MQTT) = vert Meshtastic ; autres nodes =
// teinte déterministe dérivée du node_id → stable entre rechargements (pas un
// random par render). Logique pure (testée).
export const GATEWAY_COLOR = "#67EA94";

export function nodeColor(nodeId: string, isGateway: boolean): string {
  if (isGateway) return GATEWAY_COLOR;
  // hash type djb2 → uint32, replié sur une teinte 0-359. Saturation/luminosité
  // fixes pour garder des couleurs lisibles et homogènes.
  let h = 0;
  for (let i = 0; i < nodeId.length; i++) {
    h = (h * 31 + nodeId.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360}, 65%, 55%)`;
}
