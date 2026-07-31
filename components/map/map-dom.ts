import { popupNodeId } from "@/lib/format";
import { freshnessColor, GATEWAY_COLOR, GATEWAY_INK } from "@/lib/nodeColor";
import { roleBadge } from "@/lib/nodeRole";
import { SNAP_CELL_M } from "@/lib/privacy";

// Anneau « pont ». Le bleu tient sur les DEUX fonds de carte et sur la rampe
// verte : aucun filet de renfort n'est nécessaire, contrairement à l'ambre ou à
// la prune. Contrastes vérifiés dans map-dom.test.ts.
export const BRIDGE_RING = "#2563eb";
export const PILL_SHADOW = "0 1px 3px rgba(0,0,0,0.35)";
export const BRIDGE_SHADOW = `0 0 0 3px ${BRIDGE_RING}, 0 1px 3px rgba(0,0,0,0.4)`;

// Biseaux d'angle : le glyphe vit DANS la pastille, séparé du libellé par un
// liseré blanc en diagonale. Aucun débordement, donc rien à réserver pour
// l'anti-collision — c'est ce qui permet d'empiler serré.
const BEVEL_W = 17; // largeur du biseau, glyphe compris
const BEVEL_EDGE = 1.5; // épaisseur du liseré blanc
// Épaisseur de l'anneau « pont ». Posé en box-shadow, il ne participe pas à la
// boîte de mise en page : sans réserve explicite, deux pastilles empilées voient
// leurs anneaux se recouvrir.
const BRIDGE_EXTENT = 3;

// Largeur utile d'un compteur : ~5,5 px par chiffre au-delà du premier.
const countWidth = (count: number): number =>
  BEVEL_W + Math.max(0, String(count).length - 1) * 5.5;

// Le liseré est tracé par un dégradé à 45° plutôt que par une bordure : une
// bordure ne peut pas suivre une diagonale. Les paliers sont en pixels pour que
// l'épaisseur du trait ne dépende pas de la taille du biseau.
function bevelBackground(color: string, corner: "right" | "left"): string {
  // 45deg part du bas-gauche, 225deg du haut-droit : dans les deux cas la
  // portion transparente laisse voir la pastille et le biseau occupe le coin.
  const angle = corner === "right" ? "45deg" : "225deg";
  const cut = BEVEL_W - 6;
  return (
    `linear-gradient(${angle}, transparent 0 ${cut}px, ` +
    `#fff ${cut}px ${cut + BEVEL_EDGE}px, ${color} ${cut + BEVEL_EDGE}px)`
  );
}

function bevelBase(el: HTMLElement): void {
  el.style.position = "absolute";
  el.style.top = "0";
  el.style.bottom = "0";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.font = "700 9px/1 ui-sans-serif, system-ui, sans-serif";
  // Le survol doit atteindre la pastille, pas le biseau.
  el.style.pointerEvents = "none";
  // Le glyphe n'est pas du texte de la pastille : sans cela, textContent et le
  // nom accessible deviennent « GW5R ».
  el.setAttribute("aria-hidden", "true");
}

// Reste affiché à 0 : c'est ce biseau qui identifie une passerelle.
export function countBadge(count: number): HTMLElement {
  const el = document.createElement("div");
  bevelBase(el);
  el.className = "mf-badge-count";
  el.textContent = String(count);
  el.style.right = "0";
  el.style.width = `${countWidth(count)}px`;
  el.style.justifyContent = "flex-end";
  el.style.paddingRight = "4px";
  el.style.borderRadius = "0 5.5px 5.5px 0";
  el.style.background = bevelBackground(GATEWAY_COLOR, "right");
  el.style.color = GATEWAY_INK;
  el.style.fontVariantNumeric = "tabular-nums";
  return el;
}

// Coin opposé au compteur : les deux biseaux ne se disputent jamais la place.
export function roleBadgeElement(role: unknown): HTMLElement | null {
  const badge = roleBadge(typeof role === "string" ? role : null);
  if (!badge) return null;
  const el = document.createElement("div");
  bevelBase(el);
  el.className = "mf-badge-role";
  el.textContent = badge.letter;
  el.style.left = "0";
  el.style.width = `${BEVEL_W}px`;
  el.style.justifyContent = "flex-start";
  el.style.paddingLeft = "4px";
  el.style.borderRadius = "5.5px 0 0 5.5px";
  el.style.background = bevelBackground("#1f2937", "left");
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

  // Les biseaux sont INTÉRIEURS : ils élargissent la pastille au lieu d'en
  // déborder. Seul l'anneau, posé en box-shadow, reste hors de la boîte.
  const bevels =
    (hasRole ? BEVEL_W : 0) + (countEl ? countWidth(count) : 0);

  // Le libellé doit s'écarter des biseaux, qui le recouvriraient sinon.
  const padY = isGateway ? 4 : 3;
  const padX = isGateway ? 8 : 6;
  el.style.padding = [
    `${padY}px`,
    `${countEl ? countWidth(count) + 2 : padX}px`,
    `${padY}px`,
    `${hasRole ? BEVEL_W + 2 : padX}px`,
  ].join(" ");

  el.dataset.w = String(
    label.length * (isGateway ? 8.5 : 7) +
      (isGateway ? 20 : 16) +
      bevels +
      ring * 2,
  );
  el.dataset.h = String((isGateway ? 24 : 20) + ring * 2);
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
