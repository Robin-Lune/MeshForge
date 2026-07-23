// @vitest-environment jsdom
//
// Constructeurs DOM de la carte : fonctions pures rendant un HTMLElement.
// Aucun mock — ni MapLibre, ni réseau, ni base. Seul un document est requis.
import { describe, it, expect } from "vitest";
import {
  clusterElement,
  coverageCard,
  hoverCard,
  pillElement,
} from "@/components/map/map-dom";
import { GATEWAY_COLOR } from "@/lib/nodeColor";

describe("pillElement", () => {
  it("rend le libellé et marque un node ordinaire", () => {
    const el = pillElement({ label: "StD", color: "#3b82f6" });
    expect(el.textContent).toBe("StD");
    expect(el.dataset.gateway).toBe("false");
    expect(el.dataset.h).toBe("20");
  });

  it("distingue visuellement une passerelle", () => {
    const node = pillElement({ label: "AB" });
    const gw = pillElement({ label: "AB", isGateway: true });
    expect(gw.dataset.gateway).toBe("true");
    expect(gw.dataset.h).toBe("24");
    // La passerelle passe au-dessus dans la pile.
    expect(Number(gw.style.zIndex)).toBeGreaterThan(Number(node.style.zIndex));
    // Et elle est plus large à libellé égal (police plus grande).
    expect(Number(gw.dataset.w)).toBeGreaterThan(Number(node.dataset.w));
  });

  it("tolère des propriétés absentes", () => {
    const el = pillElement({});
    expect(el.textContent).toBe("");
    expect(el.dataset.gateway).toBe("false");
  });

  it("fait croître la largeur estimée avec le libellé", () => {
    const court = pillElement({ label: "A" });
    const long = pillElement({ label: "ABCDEFGH" });
    expect(Number(long.dataset.w)).toBeGreaterThan(Number(court.dataset.w));
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
