// @vitest-environment jsdom
//
// Constructeurs DOM de la carte : fonctions pures rendant un HTMLElement.
// Aucun mock — ni MapLibre, ni réseau, ni base. Seul un document est requis.
import { describe, it, expect } from "vitest";
import {
  BRIDGE_RING,
  BRIDGE_RING_EDGE,
  BRIDGE_SHADOW,
  clusterElement,
  countBadge,
  coverageCard,
  hoverCard,
  paintCount,
  paintFreshness,
  paintMarker,
  paintRole,
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
    const seen = now();
    const frais = pillElement({ label: "AA", lastSeen: seen });
    const vieux = pillElement({ label: "AA", lastSeen: daysAgo(30) });
    expect(frais.style.background).toBe(asRgb(FRESHNESS_STEPS[0].bg));
    expect(vieux.style.background).toBe(
      asRgb(FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1].bg),
    );
    // Même date, identifiants différents : la teinte ne dépend plus du node.
    const autre = pillElement({ label: "ZZ", lastSeen: seen });
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

  it("ne réserve de marge que pour les badges réellement posés", () => {
    const nu = pillElement({ label: "AB", role: "CLIENT", lastSeen: now() });
    const avecRole = pillElement({ label: "AB", role: "ROUTER", lastSeen: now() });
    // Une pastille sans badge garde les dimensions historiques : la marge
    // s'appliquerait sinon à la quasi-totalité du parc, qui n'en porte aucun.
    expect(Number(nu.dataset.w)).toBe("AB".length * 7 + 16);
    expect(Number(nu.dataset.h)).toBe(20);
    expect(Number(avecRole.dataset.w)).toBeGreaterThan(Number(nu.dataset.w));
    expect(Number(avecRole.dataset.h)).toBeGreaterThan(Number(nu.dataset.h));
  });

  it("masque les badges aux lecteurs d'écran et garde le libellé lisible", () => {
    const gw = pillElement({
      label: "GW",
      isGateway: true,
      role: "ROUTER",
      lastSeen: now(),
    });
    for (const badge of gw.querySelectorAll("[class^=mf-badge]")) {
      expect(badge.getAttribute("aria-hidden")).toBe("true");
    }
    // textContent agrège les badges (« GW0R ») : le libellé se lit dans
    // dataset.label, seule source fiable une fois les badges posés.
    expect(gw.dataset.label).toBe("GW");
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

  it("ne pose de badge que hors famille CLIENT", () => {
    expect(roleBadgeElement("SENSOR")?.textContent).toBe("C");
    expect(roleBadgeElement("CLIENT")).toBeNull();
    expect(roleBadgeElement(null)).toBeNull();
  });

  it("ne porte pas d'infobulle : pointer-events la rendrait inatteignable", () => {
    const badge = roleBadgeElement("SENSOR");
    expect(badge?.style.pointerEvents).toBe("none");
    expect(badge?.title).toBe("");
  });
});

describe("paintFreshness / paintCount", () => {
  it("vieillit une pastille montée à date de réception constante", () => {
    const seen = "2026-07-31T12:00:00Z";
    const el = pillElement({ label: "AA", lastSeen: seen });
    paintFreshness(el, seen, Date.parse("2026-07-31T12:10:00Z"));
    expect(el.style.background).toBe(asRgb(FRESHNESS_STEPS[0].bg));
    paintFreshness(el, seen, Date.parse("2026-08-03T12:00:00Z"));
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

  it("tolère une fiche entièrement vide", () => {
    expect(() => hoverCard({})).not.toThrow();
  });

  it("affiche la date quand elle existe", () => {
    const t = hoverCard({ nodeId: "!a", lastSeen: "2026-07-31T12:00:00Z" })
      .textContent ?? "";
    expect(t).toContain("Vu ");
  });

  it("explique la lettre du badge, seul canal disponible", () => {
    // Les badges sont aria-hidden et sans infobulle propre.
    expect(hoverCard({ nodeId: "!a", role: "SENSOR" }).textContent).toContain(
      "Capteur",
    );
    expect(hoverCard({ nodeId: "!a", role: "CLIENT" }).textContent).not.toContain(
      "Capteur",
    );
    expect(hoverCard({ nodeId: "!a", role: 7 }).textContent).not.toContain(
      "Capteur",
    );
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

describe("paintRole", () => {
  it("pose le badge quand le rôle arrive après la création du marker", () => {
    // nodeinfo tardif : le marker existe déjà et n'est pas recréé, seul l'état
    // passerelle le ferait.
    const el = pillElement({ label: "N1", lastSeen: now() });
    expect(el.querySelector(".mf-badge-role")).toBeNull();
    paintRole(el, "ROUTER");
    expect(el.querySelector(".mf-badge-role")?.textContent).toBe("R");
  });

  it("retire le badge quand le node est rétrogradé en CLIENT", () => {
    const el = pillElement({ label: "R1", role: "ROUTER", lastSeen: now() });
    paintRole(el, "CLIENT");
    expect(el.querySelector(".mf-badge-role")).toBeNull();
  });

  it("ne duplique pas le badge quand le rôle est inchangé", () => {
    const el = pillElement({ label: "R1", role: "ROUTER", lastSeen: now() });
    paintRole(el, "ROUTER");
    paintRole(el, "ROUTER_LATE");
    expect(el.querySelectorAll(".mf-badge-role")).toHaveLength(1);
  });

  it("remesure la pastille", () => {
    const el = pillElement({ label: "N1", lastSeen: now() });
    const avant = Number(el.dataset.w);
    paintRole(el, "ROUTER");
    expect(Number(el.dataset.w)).toBeGreaterThan(avant);
  });
});

describe("mesure du compteur", () => {
  it("élargit la pastille quand le compteur gagne des chiffres", () => {
    // Sinon le badge déborde sur la pastille voisine, la collision même que la
    // marge doit empêcher.
    const el = pillElement({ label: "GW", isGateway: true, lastSeen: now() });
    const unChiffre = Number(el.dataset.w);
    paintCount(el, 127);
    expect(Number(el.dataset.w)).toBeGreaterThan(unChiffre);
  });

  it("ne remesure pas quand le compte est inchangé", () => {
    const el = pillElement({ label: "GW", isGateway: true, lastSeen: now() });
    paintCount(el, 5);
    const apres = el.dataset.w;
    paintCount(el, 5);
    expect(el.dataset.w).toBe(apres);
  });
});

describe("contraste de l'anneau « pont »", () => {
  // L'anneau doit trancher sur les DEUX fonds de carte. Aucune couleur unique
  // n'y parvient : l'ambre tient sur fond sombre, le filet ardoise fournit
  // l'arête sur fond clair. Seuil 3:1 (WCAG 2.1 SC 1.4.11, éléments non
  // textuels). Le filet est en rgba : composité sur le fond avant mesure.
  const TUILE_CLAIRE = "#f2efe9";
  const TUILE_SOMBRE = "#1b2230";

  const rgb = (hex: string): [number, number, number] =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: [number, number, number]): number =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (
    a: [number, number, number],
    b: [number, number, number],
  ): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (
    rgba: [number, number, number, number],
    bg: string,
  ): [number, number, number] => {
    const back = rgb(bg);
    return [0, 1, 2].map(
      (i) => rgba[3] * rgba[i] + (1 - rgba[3]) * back[i],
    ) as [number, number, number];
  };

  const EDGE: [number, number, number, number] = [15, 23, 42, 0.55];

  it("l'ambre porte l'anneau sur fond sombre", () => {
    expect(contrast(rgb(BRIDGE_RING), rgb(TUILE_SOMBRE))).toBeGreaterThan(3);
  });

  it("le filet porte l'anneau sur fond clair, là où l'ambre s'efface", () => {
    expect(contrast(rgb(BRIDGE_RING), rgb(TUILE_CLAIRE))).toBeLessThan(3);
    expect(
      contrast(over(EDGE, TUILE_CLAIRE), rgb(TUILE_CLAIRE)),
    ).toBeGreaterThan(3);
  });

  it("l'anneau se détache de la pastille la plus vive", () => {
    expect(
      contrast(rgb(BRIDGE_RING), rgb(FRESHNESS_STEPS[0].bg)),
    ).toBeGreaterThan(2.5);
  });

  it("est bien composé de l'ambre puis du filet", () => {
    expect(BRIDGE_SHADOW).toContain(BRIDGE_RING);
    expect(BRIDGE_SHADOW).toContain(BRIDGE_RING_EDGE);
  });
});

describe("paintMarker", () => {
  const counts = new Map([["!gw", 4]]);

  it("repeint fraîcheur, rôle et compteur d'une passerelle", () => {
    const el = pillElement({
      label: "GW",
      nodeId: "!gw",
      isGateway: true,
      lastSeen: now(),
    });
    paintMarker(
      el,
      { nodeId: "!gw", isGateway: true, lastSeen: daysAgo(30), role: "ROUTER" },
      counts,
    );
    expect(el.style.background).toBe(
      asRgb(FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1].bg),
    );
    expect(el.querySelector(".mf-badge-role")?.textContent).toBe("R");
    expect(el.querySelector(".mf-badge-count")?.textContent).toBe("4");
  });

  it("retombe à 0 pour une passerelle absente de l'index", () => {
    const el = pillElement({
      label: "GW",
      nodeId: "!autre",
      isGateway: true,
      lastSeen: now(),
    });
    paintMarker(el, { nodeId: "!autre", isGateway: true }, counts);
    expect(el.querySelector(".mf-badge-count")?.textContent).toBe("0");
  });

  it("ne touche pas au compteur d'un node ordinaire", () => {
    const el = pillElement({ label: "N1", nodeId: "!n1", lastSeen: now() });
    paintMarker(el, { nodeId: "!n1", lastSeen: now() }, counts);
    expect(el.querySelector(".mf-badge-count")).toBeNull();
  });

  it("accepte un instant de référence", () => {
    const el = pillElement({ label: "N1", nodeId: "!n1", lastSeen: now() });
    paintMarker(
      el,
      { nodeId: "!n1", lastSeen: "2026-07-31T12:00:00Z" },
      counts,
      Date.parse("2026-07-31T12:10:00Z"),
    );
    expect(el.style.background).toBe(asRgb(FRESHNESS_STEPS[0].bg));
  });

  it("tolère un élément sans dataset de libellé", () => {
    // paintRole/paintCount sont exportés : rien ne garantit qu'on les appelle
    // sur une pastille issue de pillElement.
    const nu = document.createElement("div");
    expect(() => paintRole(nu, "ROUTER")).not.toThrow();
    expect(nu.dataset.w).toBeDefined();

    const gw = pillElement({ label: "GW", isGateway: true, lastSeen: now() });
    delete gw.dataset.label;
    expect(() => paintCount(gw, 9)).not.toThrow();
    expect(gw.querySelector(".mf-badge-count")?.textContent).toBe("9");
  });
});
