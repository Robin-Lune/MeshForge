import { describe, it, expect } from "vitest";
import { contrast } from "./test-color";
import {
  FRESHNESS_STEPS,
  GATEWAY_COLOR,
  GATEWAY_INK,
  freshnessColor,
} from "./nodeColor";

const H = 3_600_000;
const NOW = Date.parse("2026-07-31T12:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * H).toISOString();

describe("contraste de la rampe", () => {
  it.each(FRESHNESS_STEPS.map((s) => [s.label, s] as const))(
    "%s atteint AAA (>= 7:1)",
    (_label, step) => {
      expect(contrast(step.bg, step.fg)).toBeGreaterThanOrEqual(7);
    },
  );

  it("le palier le plus ancien reste distinct d'une tuile claire", () => {
    // Plus pâle, « très vieux » se lirait « absent ».
    const oldest = FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1];
    expect(contrast(oldest.bg, "#f2efe9")).toBeGreaterThan(1.5);
  });

  it("la capsule gateway reste lisible", () => {
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
    const seen = ago(0.5);
    expect(freshnessColor(seen, NOW).bg).toBe(FRESHNESS_STEPS[0].bg);
    expect(freshnessColor(seen, NOW + 2 * H).bg).toBe(FRESHNESS_STEPS[1].bg);
  });
});

describe("FRESHNESS_STEPS", () => {
  it("borne le dernier palier à Infinity", () => {
    // freshnessColor ne parcourt que length - 1 : un palier ajouté après celui
    // qui borne à Infinity serait inatteignable.
    expect(FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1].maxHours).toBe(Infinity);
    for (const step of FRESHNESS_STEPS.slice(0, -1)) {
      expect(Number.isFinite(step.maxHours)).toBe(true);
    }
  });

  it("est trié par borne croissante", () => {
    const bornes = FRESHNESS_STEPS.map((s) => s.maxHours);
    expect([...bornes].sort((a, b) => a - b)).toEqual(bornes);
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
    // Horloge de node en avance : un âge négatif doit rester dans la rampe.
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
