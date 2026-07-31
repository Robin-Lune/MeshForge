import { popupNodeId } from "@/lib/format";
import { freshnessColor, GATEWAY_COLOR, GATEWAY_INK } from "@/lib/nodeColor";
import { roleBadge } from "@/lib/nodeRole";

// Anneau « pont ». AUCUNE couleur unique ne peut contraster à la fois avec une
// tuile très claire et une tuile très sombre : l'ambre est autoportant sur fond
// sombre (7,42) mais s'efface sur fond clair (1,87), d'où le filet ardoise
// translucide posé juste à l'extérieur, qui lui donne son arête (15,56 contre
// une tuile claire). Une seule règle, aucun basculement selon le thème.
// L'ancien anneau bleu est abandonné : sur la pastille bleue du palier « < 1 h »
// il tombait à 1,09 de contraste, donc disparaissait.
export const BRIDGE_RING = "#f59e0b";
export const BRIDGE_RING_EDGE = "rgba(15,23,42,0.55)";
export const PILL_SHADOW = "0 1px 3px rgba(0,0,0,0.35)";
export const BRIDGE_SHADOW = `0 0 0 3px ${BRIDGE_RING}, 0 0 0 4.5px ${BRIDGE_RING_EDGE}, 0 1px 3px rgba(0,0,0,0.4)`;

// Les badges débordent des coins : l'anti-collision (resolvePillSpread) lit
// dataset.w/h, donc sans cette marge les pastilles se chevaucheraient à nouveau.
const BADGE_OVERFLOW = 7;

function badgeBase(el: HTMLElement): void {
  el.style.position = "absolute";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.border = "1.5px solid #fff";
  el.style.boxShadow = "0 1px 2px rgba(0,0,0,0.3)";
  el.style.font = "700 8.5px/1 ui-sans-serif, system-ui, sans-serif";
  el.style.pointerEvents = "none";
}

// Badge compteur d'une passerelle (coin haut-droit). Il porte DEUX informations
// à la fois : « ce node est une passerelle MQTT » et « voici combien de nodes
// il a captés en direct dans l'heure ». Il reste donc affiché à 0 — s'il
// disparaissait, une passerelle silencieuse cesserait d'être identifiable comme
// passerelle, alors qu'un « 0 » est précisément le cas intéressant.
export function countBadge(count: number): HTMLElement {
  const el = document.createElement("div");
  badgeBase(el);
  el.className = "mf-badge-count";
  el.textContent = String(count);
  el.style.top = "0";
  el.style.right = "0";
  el.style.transform = "translate(42%, -46%)";
  el.style.minWidth = "15px";
  el.style.height = "15px";
  el.style.padding = "0 3px";
  el.style.borderRadius = "999px";
  el.style.background = GATEWAY_COLOR;
  el.style.color = GATEWAY_INK;
  el.style.fontVariantNumeric = "tabular-nums";
  return el;
}

// Badge de rôle (coin bas-gauche — diagonale opposée au compteur, pour qu'ils
// ne se disputent jamais la place). Encre plutôt que couleur : la rampe de
// fraîcheur occupe désormais le bleu, où les teintes de badge prévues
// (indigo/teal/bleu) se confondaient avec le fond.
export function roleBadgeElement(role: unknown): HTMLElement | null {
  const badge = roleBadge(typeof role === "string" ? role : null);
  if (!badge) return null;
  const el = document.createElement("div");
  badgeBase(el);
  el.className = "mf-badge-role";
  el.textContent = badge.letter;
  el.title = badge.title;
  el.style.bottom = "0";
  el.style.left = "0";
  el.style.transform = "translate(-38%, 40%)";
  el.style.width = "14px";
  el.style.height = "14px";
  el.style.borderRadius = "999px";
  el.style.background = "#1f2937";
  el.style.color = "#fff";
  return el;
}

export function pillElement(p: Record<string, unknown>): HTMLElement {
  const isGateway = p.isGateway === true;
  const el = document.createElement("div");
  el.style.position = "relative";

  const text = document.createElement("span");
  text.textContent = String(p.label ?? "");
  el.appendChild(text);

  // Couleur initiale ; applyFreshness() la reprend ensuite au fil du temps.
  const { bg, fg } = freshnessColor(
    typeof p.lastSeen === "string" ? p.lastSeen : null,
  );
  el.style.background = bg;
  el.style.color = fg;
  el.style.font = isGateway
    ? "700 13px/1 ui-sans-serif, system-ui, sans-serif"
    : "600 11px/1 ui-sans-serif, system-ui, sans-serif";
  el.style.padding = isGateway ? "4px 8px" : "3px 6px";
  el.style.borderRadius = "7px";
  el.style.border = isGateway
    ? "2px solid rgba(255,255,255,0.95)"
    : "1.5px solid rgba(255,255,255,0.9)";
  el.style.boxShadow = PILL_SHADOW;
  el.style.cursor = "pointer";
  el.style.whiteSpace = "nowrap";
  el.style.userSelect = "none";
  el.style.zIndex = isGateway ? "2" : "1";

  if (isGateway) el.appendChild(countBadge(0));
  const role = roleBadgeElement(p.role);
  if (role) el.appendChild(role);

  el.dataset.gateway = String(isGateway);
  el.dataset.w = String(
    String(p.label ?? "").length * (isGateway ? 8.5 : 7) +
      (isGateway ? 20 : 16) +
      BADGE_OVERFLOW * 2,
  );
  el.dataset.h = String((isGateway ? 24 : 20) + BADGE_OVERFLOW * 2);
  return el;
}

// Repeint une pastille déjà montée. Séparé de pillElement parce que l'élément
// DOM survit aux mises à jour : seul l'état gateway le fait recréer.
export function paintFreshness(
  el: HTMLElement,
  lastSeen: unknown,
  now?: number,
): void {
  const { bg, fg } = freshnessColor(
    typeof lastSeen === "string" ? lastSeen : null,
    now,
  );
  el.style.background = bg;
  el.style.color = fg;
}

export function paintCount(el: HTMLElement, count: number): void {
  const badge = el.querySelector<HTMLElement>(".mf-badge-count");
  if (badge) badge.textContent = String(count);
}

export function clusterElement(p: Record<string, unknown>): HTMLElement {
  const hasGateway = Number(p.hasGateway ?? 0) > 0;
  const count = Number(p.point_count ?? 0);
  const size = count >= 50 ? 44 : count >= 10 ? 38 : 32;
  const el = document.createElement("div");
  el.textContent = String(p.point_count_abbreviated ?? count);
  el.style.background = hasGateway ? GATEWAY_COLOR : "#3b82f6";
  el.style.color = hasGateway ? "#064e3b" : "#fff";
  el.style.font = "700 13px/1 ui-sans-serif, system-ui, sans-serif";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = "50%";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.border = "2px solid #fff";
  el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
  el.style.cursor = "pointer";
  el.dataset.gateway = String(hasGateway);
  return el;
}

export function hoverCard(p: Record<string, unknown>): HTMLElement {
  const longName = (p.longName as string) || "";
  const shortName = (p.shortName as string) || "";
  const nodeId = (p.nodeId as string) || "";
  const lastSeen = (p.lastSeen as string) || "";
  const lastSnr = p.lastSnr;

  const el = document.createElement("div");
  el.style.color = "#111";
  el.style.fontSize = "12px";
  el.style.lineHeight = "1.4";

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = longName || shortName || nodeId;
  el.appendChild(title);

  // ID sous le titre, sauf si le node sans nom l'affiche déjà en titre.
  const idLine = popupNodeId(title.textContent ?? "", nodeId);
  if (idLine) {
    const id = document.createElement("div");
    id.style.color = "#666";
    id.style.fontFamily = "ui-monospace, monospace";
    id.textContent = idLine;
    el.appendChild(id);
  }

  const seen = document.createElement("div");
  seen.style.color = "#666";
  seen.textContent = lastSeen
    ? `Vu ${new Date(lastSeen).toLocaleString("fr-FR")}`
    : "Jamais vu";
  el.appendChild(seen);

  if (typeof lastSnr === "number") {
    const sig = document.createElement("div");
    sig.textContent = `Signal : ${lastSnr} dB`;
    el.appendChild(sig);
  }

  // Précision de position : dans l'infobulle et PAS en badge sur la pastille.
  // is_mobile vaut TRUE par défaut (prudence vie privée) et signifie donc
  // « personne n'a encore confirmé que ce node est fixe », pas « ce node
  // bouge » : un badge s'y poserait sur presque tout le parc en affirmant le
  // contraire de ce qu'il montre. C'est une réserve utile en lisant UN node,
  // pas en balayant la carte.
  const precision = document.createElement("div");
  precision.style.color = "#666";
  precision.textContent =
    p.isMobile === false
      ? "Position exacte"
      : "Position approximative (~1,5 km)";
  el.appendChild(precision);

  return el;
}

// Infobulle d'une tuile de couverture. Volontairement chiffrée et sans
// interprétation : la couche sert à décider où poser un relais, donc l'usager
// doit voir la CONFIANCE (nb de mesures) autant que la valeur.
export function coverageCard(
  p: Record<string, unknown>,
  z: number,
): HTMLElement {
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const snrP90 = num(p.snrP90);
  const snrMax = num(p.snrMax);

  const el = document.createElement("div");
  el.style.color = "#111";
  el.style.fontSize = "12px";
  el.style.lineHeight = "1.4";

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = `Couverture (maille z${z})`;
  el.appendChild(title);

  const line = (text: string, muted = false): void => {
    const d = document.createElement("div");
    if (muted) d.style.color = "#666";
    d.textContent = text;
    el.appendChild(d);
  };

  line(
    snrP90 === null
      ? "Meilleur lien : non mesurable"
      : `Meilleur lien (p90) : ${snrP90.toFixed(1)} dB`,
  );
  if (snrMax !== null) line(`Meilleure réception : ${snrMax.toFixed(1)} dB`, true);
  // « depuis un même point » : la valeur est le max par transmission, pas
  // l'union des relais de la tuile (cf. CoverageTile.gateways).
  line(`Relais depuis un même point : ${Number(p.gateways ?? 0)}`);
  line(`Émetteurs distincts : ${Number(p.nodes ?? 0)}`);
  line(`Émissions distinctes : ${Number(p.transmissions ?? 0)}`);
  line(
    `${Number(p.samples ?? 0)} réception(s) directe(s) sur ${Number(p.days ?? 0)} jour(s)`,
    true,
  );
  return el;
}
