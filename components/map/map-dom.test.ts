// @vitest-environment jsdom
//
// Constructeurs DOM de la carte : fonctions pures rendant un HTMLElement.
// Aucun mock — ni MapLibre, ni réseau, ni base. Seul un document est requis.
import { describe, it, expect } from "vitest";
import {
  clusterElement,
  countBadge,
  coverageCard,
  hoverCard,
  paintCount,
  paintFreshness,
  pillElement,
  roleBadgeElement,
} from "@/components/map/map-dom";
import { FRESHNESS_STEPS, GATEWAY_COLOR } from "@/lib/nodeColor";

const now = () => new Date().toISOString();
const daysAgo = (d: number) =>
  new Date(Date.now() - d * 86_400_000).toISOString();

// jsdom normalise les couleurs en rgb() : on compare donc via un élément témoin
// plutôt qu'à la chaîne hexadécimale brute.
function asRgb(hex: string): string {
  const probe = document.createElement("div");
  probe.style.background = hex;
  return probe.style.background;
}

describe("pillElement", () => {
  it("rend le libellé et marque un node ordinaire", () => {
    const el = pillElement({ label: "StD", lastSeen: now() });
    expect(el.textContent).toBe("StD");
    expect(el.dataset.gateway).toBe("false");
  });

  it("colore la pastille selon la fraîcheur, pas selon le node", () => {
    const frais = pillElement({ label: "AA", lastSeen: now() });
    const vieux = pillElement({ label: "AA", lastSeen: daysAgo(30) });
    expect(frais.style.background).toBe(asRgb(FRESHNESS_STEPS[0].bg));
    expect(vieux.style.background).toBe(
      asRgb(FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1].bg),
    );
    // Deux nodes vus au même moment sont de la même couleur : la teinte ne
    // dépend plus de l'identifiant.
    const autre = pillElement({ label: "ZZ", lastSeen: frais.dataset.x ?? now() });
    expect(autre.style.background).toBe(frais.style.background);
  });

  it("distingue visuellement une passerelle", () => {
    const node = pillElement({ label: "AB", lastSeen: now() });
    const gw = pillElement({ label: "AB", isGateway: true, lastSeen: now() });
    expect(gw.dataset.gateway).toBe("true");
    // La passerelle passe au-dessus dans la pile.
    expect(Number(gw.style.zIndex)).toBeGreaterThan(Number(node.style.zIndex));
    // Et elle est plus large à libellé égal (police plus grande).
    expect(Number(gw.dataset.w)).toBeGreaterThan(Number(node.dataset.w));
  });

  it("réserve la place des badges dans les dimensions estimées", () => {
    // Sans cette marge, resolvePillSpread sous-estime la pastille et les
    // badges se chevauchent à nouveau.
    const el = pillElement({ label: "AB", lastSeen: now() });
    expect(Number(el.dataset.h)).toBeGreaterThan(20);
    expect(Number(el.dataset.w)).toBeGreaterThan("AB".length * 7 + 16);
  });

  it("porte un badge compteur à 0 dès qu'il s'agit d'une passerelle", () => {
    // Le badge identifie la passerelle : il ne doit pas dépendre de l'activité.
    const gw = pillElement({ label: "GW", isGateway: true, lastSeen: now() });
    expect(gw.querySelector(".mf-badge-count")?.textContent).toBe("0");
    const node = pillElement({ label: "N", lastSeen: now() });
    expect(node.querySelector(".mf-badge-count")).toBeNull();
  });

  it("porte un badge de rôle seulement hors famille CLIENT", () => {
    const routeur = pillElement({ label: "R1", role: "ROUTER", lastSeen: now() });
    expect(routeur.querySelector(".mf-badge-role")?.textContent).toBe("R");
    const client = pillElement({ label: "C1", role: "CLIENT", lastSeen: now() });
    expect(client.querySelector(".mf-badge-role")).toBeNull();
  });

  it("tolère des propriétés absentes", () => {
    const el = pillElement({});
    expect(el.textContent).toBe("");
    expect(el.dataset.gateway).toBe("false");
    // Sans date, on retombe sur le palier le plus ancien plutôt que sur du vide.
    expect(el.style.background).toBe(
      asRgb(FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1].bg),
    );
  });

  it("ignore un rôle non textuel", () => {
    expect(pillElement({ label: "A", role: 7 }).querySelector(".mf-badge-role"))
      .toBeNull();
  });

  it("fait croître la largeur estimée avec le libellé", () => {
    const court = pillElement({ label: "A" });
    const long = pillElement({ label: "ABCDEFGH" });
    expect(Number(long.dataset.w)).toBeGreaterThan(Number(court.dataset.w));
  });
});

describe("countBadge / roleBadgeElement", () => {
  it("affiche le compte tel quel, zéro compris", () => {
    expect(countBadge(0).textContent).toBe("0");
    expect(countBadge(12).textContent).toBe("12");
  });

  it("décrit le rôle en infobulle du badge", () => {
    expect(roleBadgeElement("SENSOR")?.title).toContain("Capteur");
    expect(roleBadgeElement("CLIENT")).toBeNull();
    expect(roleBadgeElement(null)).toBeNull();
  });
});

describe("paintFreshness / paintCount", () => {
  it("repeint une pastille déjà montée", () => {
    const el = pillElement({ label: "AA", lastSeen: now() });
    expect(el.style.background).toBe(asRgb(FRESHNESS_STEPS[0].bg));
    // Même node, même date : seul le « maintenant » a avancé de 3 jours.
    paintFreshness(el, el.dataset.seen ?? daysAgo(3));
    expect(el.style.background).toBe(asRgb(FRESHNESS_STEPS[2].bg));
    expect(el.style.color).toBe(asRgb(FRESHNESS_STEPS[2].fg));
  });

  it("accepte un instant de référence explicite", () => {
    const el = pillElement({ label: "AA" });
    const seen = new Date("2026-07-31T12:00:00Z").toISOString();
    paintFreshness(el, seen, Date.parse("2026-07-31T12:30:00Z"));
    expect(el.style.background).toBe(asRgb(FRESHNESS_STEPS[0].bg));
  });

  it("retombe sur le palier ancien si la date n'est pas une chaîne", () => {
    const el = pillElement({ label: "AA", lastSeen: now() });
    paintFreshness(el, 12345);
    expect(el.style.background).toBe(
      asRgb(FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1].bg),
    );
  });

  it("met à jour le compteur d'une passerelle", () => {
    const gw = pillElement({ label: "GW", isGateway: true, lastSeen: now() });
    paintCount(gw, 7);
    expect(gw.querySelector(".mf-badge-count")?.textContent).toBe("7");
    paintCount(gw, 0);
    expect(gw.querySelector(".mf-badge-count")?.textContent).toBe("0");
  });

  it("ne casse rien sur une pastille sans compteur", () => {
    const node = pillElement({ label: "N", lastSeen: now() });
    expect(() => paintCount(node, 3)).not.toThrow();
  });
});

describe("clusterElement", () => {
  it("affiche le compte abrégé quand il existe", () => {
    const el = clusterElement({ point_count: 1200, point_count_abbreviated: "1.2k" });
    expect(el.textContent).toBe("1.2k");
  });

  it("retombe sur le compte brut sans abréviation", () => {
    expect(clusterElement({ point_count: 7 }).textContent).toBe("7");
  });

  it("grossit par paliers", () => {
    const px = (n: number) => clusterElement({ point_count: n }).style.width;
    expect(px(9)).toBe("32px");
    expect(px(10)).toBe("38px");
    expect(px(49)).toBe("38px");
    expect(px(50)).toBe("44px");
  });

  it("colore le cluster contenant une passerelle", () => {
    const avec = clusterElement({ point_count: 3, hasGateway: 1 });
    const sans = clusterElement({ point_count: 3, hasGateway: 0 });
    expect(avec.dataset.gateway).toBe("true");
    expect(sans.dataset.gateway).toBe("false");
    expect(avec.style.background).not.toBe(sans.style.background);
    expect(GATEWAY_COLOR).toBeTruthy();
  });

  it("tolère un cluster sans propriété", () => {
    expect(clusterElement({}).textContent).toBe("0");
  });
});

describe("hoverCard", () => {
  it("titre avec le nom long quand il existe", () => {
    const el = hoverCard({ longName: "Saint-Denis", shortName: "StD", nodeId: "!r01" });
    expect(el.textContent).toContain("Saint-Denis");
  });

  it("retombe sur le nom court puis sur le NodeID", () => {
    expect(hoverCard({ shortName: "StD", nodeId: "!r01" }).textContent).toContain("StD");
    expect(hoverCard({ nodeId: "!r01" }).textContent).toContain("!r01");
  });

  it("affiche « Jamais vu » sans date", () => {
    expect(hoverCard({ nodeId: "!r01" }).textContent).toContain("Jamais vu");
  });

  it("affiche le SNR seulement s'il est numérique", () => {
    expect(hoverCard({ nodeId: "!a", lastSnr: -7.5 }).textContent).toContain("-7.5");
    expect(hoverCard({ nodeId: "!a", lastSnr: null }).textContent).not.toContain("Signal");
  });

  it("qualifie la précision de position", () => {
    // is_mobile vaut TRUE par défaut (prudence vie privée) : seul un FALSE
    // explicite atteste d'une position exacte.
    expect(hoverCard({ nodeId: "!a", isMobile: false }).textContent).toContain(
      "Position exacte",
    );
    expect(hoverCard({ nodeId: "!a", isMobile: true }).textContent).toContain(
      "approximative",
    );
    expect(hoverCard({ nodeId: "!a" }).textContent).toContain("approximative");
  });
});

describe("coverageCard", () => {
  const tuile = {
    snrP90: -10.14,
    snrMax: -9.8,
    gateways: 3,
    nodes: 4,
    transmissions: 17,
    samples: 42,
    days: 6,
  };

  it("rappelle la maille en titre", () => {
    expect(coverageCard(tuile, 15).textContent).toContain("z15");
  });

  it("affiche le p90, le max et les compteurs", () => {
    const t = coverageCard(tuile, 15).textContent ?? "";
    expect(t).toContain("-10.1");
    expect(t).toContain("-9.8");
    expect(t).toContain("3");
    expect(t).toContain("17");
    expect(t).toContain("42");
    expect(t).toContain("6 jour");
  });

  it("qualifie la redondance de « depuis un même point »", () => {
    // Invariant sémantique : ce n'est PAS l'union des relais de la tuile.
    expect(coverageCard(tuile, 15).textContent).toContain("depuis un même point");
  });

  it("dit « non mesurable » plutôt que d'inventer un 0 dB", () => {
    // 0 dB est un EXCELLENT signal : afficher 0 pour une absence de mesure
    // serait un contresens.
    const t = coverageCard({ ...tuile, snrP90: null }, 15).textContent ?? "";
    expect(t).toContain("non mesurable");
    expect(t).not.toMatch(/p90\)\s*:\s*0\.0/);
  });

  it("omet la meilleure réception quand elle est absente", () => {
    const t = coverageCard({ ...tuile, snrMax: null }, 15).textContent ?? "";
    expect(t).not.toContain("Meilleure réception");
  });

  it("tolère des compteurs absents", () => {
    const t = coverageCard({}, 14).textContent ?? "";
    expect(t).toContain("z14");
    expect(t).toContain("0");
  });
});
