import { popupNodeId } from "@/lib/format";
import { freshnessColor, GATEWAY_COLOR, GATEWAY_INK } from "@/lib/nodeColor";
import { roleBadge } from "@/lib/nodeRole";
import { SNAP_CELL_M } from "@/lib/privacy";

// Aucune couleur unique ne contraste à la fois sur tuile claire et sur tuile
// sombre : la prune tient sur fond clair et sur la rampe verte, le filet blanc
// lui donne son arête sur fond sombre. Contrastes vérifiés dans map-dom.test.ts.
export const BRIDGE_RING = "#6b21a8";
export const BRIDGE_RING_EDGE = "rgba(255,255,255,0.92)";
export const PILL_SHADOW = "0 1px 3px rgba(0,0,0,0.35)";
export const BRIDGE_SHADOW = `0 0 0 3px ${BRIDGE_RING}, 0 0 0 4.5px ${BRIDGE_RING_EDGE}, 0 1px 3px rgba(0,0,0,0.4)`;

const BADGE_SIZE = 14;
const COUNT_BADGE_HEIGHT = 15;
// Épaisseur totale de l'anneau « pont » (3 px + filet 1,5 px). Posé en
// box-shadow, il ne participe pas à la boîte de mise en page : sans réserve
// explicite, deux pastilles empilées voient leurs anneaux se recouvrir.
const BRIDGE_EXTENT = 4.5;

// Part du badge posée HORS de la pastille, par axe. Les translations en sont
// dérivées : les deux ne peuvent pas diverger. resolvePillSpread ne lit que
// dataset.w/h, donc un débordement non compté y ramène les chevauchements.
const ROLE_OUT_X = 0.38;
const ROLE_OUT_Y = 0.4;
const COUNT_OUT_X = 0.42;
const COUNT_OUT_Y = 0.46;
const pct = (v: number): string => `${v * 100}%`;
const roleOverflow = (): number => BADGE_SIZE * ROLE_OUT_X;
const countOverflow = (width: number): number => width * COUNT_OUT_X;
// countBadge : min-width 15px, +3px de padding de chaque côté, ~5px par chiffre.
const countWidth = (count: number): number =>
  Math.max(COUNT_BADGE_HEIGHT, 6 + String(count).length * 5.5);

function badgeBase(el: HTMLElement): void {
  el.style.position = "absolute";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.border = "1.5px solid #fff";
  el.style.boxShadow = "0 1px 2px rgba(0,0,0,0.3)";
  el.style.font = "700 8.5px/1 ui-sans-serif, system-ui, sans-serif";
  // Le survol doit atteindre la pastille, pas le badge. Conséquence : un badge
  // ne peut pas porter d'infobulle propre — son sens vit dans la légende et
  // dans hoverCard.
  el.style.pointerEvents = "none";
  // Les badges ne sont pas du texte : sans cela, textContent et le nom
  // accessible de la pastille deviennent « GW3R ».
  el.setAttribute("aria-hidden", "true");
}

// Reste affiché à 0 : c'est ce badge qui identifie une passerelle.
export function countBadge(count: number): HTMLElement {
  const el = document.createElement("div");
  badgeBase(el);
  el.className = "mf-badge-count";
  el.textContent = String(count);
  el.style.top = "0";
  el.style.right = "0";
  el.style.transform = `translate(${pct(COUNT_OUT_X)}, -${pct(COUNT_OUT_Y)})`;
  el.style.minWidth = `${COUNT_BADGE_HEIGHT}px`;
  el.style.height = `${COUNT_BADGE_HEIGHT}px`;
  el.style.padding = "0 3px";
  el.style.borderRadius = "999px";
  el.style.background = GATEWAY_COLOR;
  el.style.color = GATEWAY_INK;
  el.style.fontVariantNumeric = "tabular-nums";
  return el;
}

// Coin bas-gauche : diagonale opposée au compteur.
export function roleBadgeElement(role: unknown): HTMLElement | null {
  const badge = roleBadge(typeof role === "string" ? role : null);
  if (!badge) return null;
  const el = document.createElement("div");
  badgeBase(el);
  el.className = "mf-badge-role";
  el.textContent = badge.letter;
  el.style.bottom = "0";
  el.style.left = "0";
  el.style.transform = `translate(-${pct(ROLE_OUT_X)}, ${pct(ROLE_OUT_Y)})`;
  el.style.width = `${BADGE_SIZE}px`;
  el.style.height = `${BADGE_SIZE}px`;
  el.style.borderRadius = "999px";
  el.style.background = "#1f2937";
  el.style.color = "#fff";
  return el;
}

// La marge n'est réservée que pour les badges RÉELLEMENT posés : l'appliquer à
// toute pastille écarterait de leur position la majorité des markers, qui n'en
// portent aucun.
function measurePill(el: HTMLElement, label: string, isGateway: boolean): void {
  const hasRole = el.querySelector(".mf-badge-role") !== null;
  const countEl = el.querySelector<HTMLElement>(".mf-badge-count");
  const count = countEl ? Number(countEl.textContent) : 0;
  const ring = el.dataset.bridge === "true" ? BRIDGE_EXTENT : 0;

  const left = Math.max(hasRole ? roleOverflow() : 0, ring);
  const right = Math.max(countEl ? countOverflow(countWidth(count)) : 0, ring);
  // Les deux badges occupent des coins HORIZONTALEMENT opposés (compteur en
  // haut à droite, rôle en bas à gauche) : à une abscisse donnée un seul
  // déborde. Sommer les deux écarterait les pastilles empilées du double du
  // nécessaire — d'où le max, et non la somme.
  const vertical = Math.max(
    hasRole ? BADGE_SIZE * ROLE_OUT_Y : 0,
    countEl ? COUNT_BADGE_HEIGHT * COUNT_OUT_Y : 0,
    ring,
  );

  el.dataset.w = String(
    label.length * (isGateway ? 8.5 : 7) + (isGateway ? 20 : 16) + left + right,
  );
  el.dataset.h = String((isGateway ? 24 : 20) + vertical);
}

export function pillElement(p: Record<string, unknown>): HTMLElement {
  const isGateway = p.isGateway === true;
  const label = String(p.label ?? "");
  const el = document.createElement("div");
  // NE PAS poser `position` ici : MapLibre applique .maplibregl-marker
  // (position: absolute) sur l'élément, et un style inline le supplanterait —
  // la pastille redeviendrait un bloc en flux, étiré sur toute la largeur.
  // Ce `position: absolute` sert déjà de référent aux badges.

  const text = document.createElement("span");
  text.textContent = label;
  el.appendChild(text);

  paintFreshness(el, p.lastSeen);
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
  el.dataset.label = label;
  measurePill(el, label, isGateway);
  return el;
}

// L'élément DOM survit aux mises à jour — seul un changement d'état passerelle
// le fait recréer. Tout ce qui varie ensuite doit donc être repeint ici.
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
  if (!badge) return;
  if (badge.textContent === String(count)) return;
  badge.textContent = String(count);
  // Un compteur à deux ou trois chiffres élargit le badge : sans remesure, il
  // déborde sur la pastille voisine.
  measurePill(el, el.dataset.label ?? "", el.dataset.gateway === "true");
}

// Le rôle peut arriver après la création du marker (nodeinfo tardif) ou changer
// en cours de session.
export function paintRole(el: HTMLElement, role: unknown): void {
  const badge = roleBadge(typeof role === "string" ? role : null);
  const current = el.querySelector<HTMLElement>(".mf-badge-role");
  if (badge && current?.textContent === badge.letter) return;

  current?.remove();
  const next = roleBadgeElement(role);
  if (next) el.appendChild(next);
  measurePill(el, el.dataset.label ?? "", el.dataset.gateway === "true");
}

// L'anneau est un box-shadow : hors flux, donc invisible pour l'anti-collision
// tant qu'on ne le réserve pas ici.
export function paintBridge(el: HTMLElement, isBridge: boolean): void {
  if (el.dataset.bridge === String(isBridge)) return;
  el.dataset.bridge = String(isBridge);
  el.style.boxShadow = isBridge ? BRIDGE_SHADOW : PILL_SHADOW;
  measurePill(el, el.dataset.label ?? "", el.dataset.gateway === "true");
}

// Tout ce qu'une pastille montée doit refléter après sa création. Extrait du
// contrôleur, qui exige une carte MapLibre : ici c'est testable seul.
export function paintMarker(
  el: HTMLElement,
  properties: Record<string, unknown>,
  directCounts: Map<string, number>,
  now?: number,
): void {
  paintFreshness(el, properties.lastSeen, now);
  paintRole(el, properties.role);
  if (properties.isGateway === true) {
    paintCount(el, directCounts.get(String(properties.nodeId)) ?? 0);
  }
}

export function clusterElement(p: Record<string, unknown>): HTMLElement {
  const hasGateway = Number(p.hasGateway ?? 0) > 0;
  const count = Number(p.point_count ?? 0);
  const size = count >= 50 ? 44 : count >= 10 ? 38 : 32;
  const el = document.createElement("div");
  el.textContent = String(p.point_count_abbreviated ?? count);
  el.style.background = hasGateway ? GATEWAY_COLOR : "#3b82f6";
  // Encre partagée avec le badge passerelle : une couleur de texte codée en dur
  // ici deviendrait illisible au prochain changement de GATEWAY_COLOR.
  el.style.color = hasGateway ? GATEWAY_INK : "#fff";
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

  const titleText = longName || shortName || nodeId;
  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = titleText;
  el.appendChild(title);

  // ID sous le titre, sauf si le node sans nom l'affiche déjà en titre.
  const idLine = popupNodeId(titleText, nodeId);
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

  // Seul canal d'explication des lettres de badge : elles sont aria-hidden et
  // ne peuvent pas porter d'infobulle propre.
  const badge = roleBadge(typeof p.role === "string" ? p.role : null);
  if (badge) {
    const role = document.createElement("div");
    role.textContent = badge.title;
    el.appendChild(role);
  }

  // is_mobile = TRUE est le défaut prudent : il signifie « fixité non
  // confirmée », pas « ce node bouge ». Seul un FALSE explicite atteste d'une
  // position non floutée.
  const precision = document.createElement("div");
  precision.style.color = "#666";
  precision.textContent =
    p.isMobile === false
      ? "Position exacte"
      : `Position approximative (~${SNAP_CELL_M} m)`;
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
