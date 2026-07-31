import { describe, it, expect } from "vitest";
import {
  FRESHNESS_STEPS,
  GATEWAY_COLOR,
  GATEWAY_INK,
  freshnessColor,
} from "./nodeColor";

const H = 3_600_000;
// Instant de référence fixe : sans lui, un test « il y a 23 h » basculerait de
// palier selon l'heure d'exécution.
const NOW = Date.parse("2026-07-31T12:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * H).toISOString();

// --- contraste WCAG 2.1, recalculé ici -------------------------------------
// La rampe n'est PAS un choix esthétique libre : c'est la lisibilité d'un
// libellé de 11 px sur un fond de carte. Recalculer les ratios plutôt que de
// figer les couleurs attendues fait échouer le test si quelqu'un retouche une
// teinte à l'œil, ce qu'une simple comparaison de chaîne laisserait passer.
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("contraste de la rampe", () => {
  it.each(FRESHNESS_STEPS.map((s) => [s.label, s] as const))(
    "%s atteint AAA (>= 7:1)",
    (_label, step) => {
      expect(contrast(step.bg, step.fg)).toBeGreaterThanOrEqual(7);
    },
  );

  it("le palier le plus ancien reste distinct d'une tuile claire", () => {
    // Plus pâle, la pastille se confondrait avec la carte et « très vieux » se
    // lirait « absent ». Garde-fou explicite contre un fade poussé trop loin.
    const oldest = FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1];
    expect(contrast(oldest.bg, "#f2efe9")).toBeGreaterThan(1.5);
  });

  it("le badge gateway reste lisible", () => {
    expect(contrast(GATEWAY_COLOR, GATEWAY_INK)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("freshnessColor — paliers", () => {
  it("classe chaque durée dans le bon palier", () => {
    const bg = (hours: number) => freshnessColor(ago(hours), NOW).bg;
    expect(bg(0)).toBe(FRESHNESS_STEPS[0].bg);
    expect(bg(0.5)).toBe(FRESHNESS_STEPS[0].bg);
    expect(bg(5)).toBe(FRESHNESS_STEPS[1].bg);
    expect(bg(3 * 24)).toBe(FRESHNESS_STEPS[2].bg);
    expect(bg(10 * 24)).toBe(FRESHNESS_STEPS[3].bg);
    expect(bg(60 * 24)).toBe(FRESHNESS_STEPS[4].bg);
  });

  it("les bornes sont exclusives en haut (pile 1 h → palier suivant)", () => {
    expect(freshnessColor(ago(1), NOW).bg).toBe(FRESHNESS_STEPS[1].bg);
    expect(freshnessColor(ago(0.999), NOW).bg).toBe(FRESHNESS_STEPS[0].bg);
    expect(freshnessColor(ago(24), NOW).bg).toBe(FRESHNESS_STEPS[2].bg);
    expect(freshnessColor(ago(24 * 7), NOW).bg).toBe(FRESHNESS_STEPS[3].bg);
    expect(freshnessColor(ago(24 * 14), NOW).bg).toBe(FRESHNESS_STEPS[4].bg);
  });

  it("renvoie la couleur de texte associée au palier", () => {
    expect(freshnessColor(ago(0), NOW).fg).toBe(FRESHNESS_STEPS[0].fg);
    expect(freshnessColor(ago(60 * 24), NOW).fg).toBe(FRESHNESS_STEPS[4].fg);
  });

  it("vieillit avec le temps à date de réception constante", () => {
    // Le cœur de la fonctionnalité : la couleur change SANS nouveau paquet.
    const seen = ago(0.5);
    expect(freshnessColor(seen, NOW).bg).toBe(FRESHNESS_STEPS[0].bg);
    expect(freshnessColor(seen, NOW + 2 * H).bg).toBe(FRESHNESS_STEPS[1].bg);
  });
});

describe("freshnessColor — entrées dégradées", () => {
  it("retombe sur le palier le plus ancien sans date", () => {
    const oldest = FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1];
    expect(freshnessColor(null, NOW).bg).toBe(oldest.bg);
    expect(freshnessColor(undefined, NOW).bg).toBe(oldest.bg);
    expect(freshnessColor("", NOW).bg).toBe(oldest.bg);
  });

  it("retombe sur le palier le plus ancien sur date illisible", () => {
    const oldest = FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1];
    expect(freshnessColor("pas-une-date", NOW).bg).toBe(oldest.bg);
  });

  it("traite une date future comme la plus fraîche", () => {
    // Horloge d'un node en avance : un âge négatif ne doit pas sortir de la
    // rampe ni produire une couleur indéfinie.
    expect(freshnessColor(new Date(NOW + 10 * H).toISOString(), NOW).bg).toBe(
      FRESHNESS_STEPS[0].bg,
    );
  });

  it("utilise l'heure courante par défaut", () => {
    expect(freshnessColor(new Date().toISOString()).bg).toBe(
      FRESHNESS_STEPS[0].bg,
    );
  });
});
