import { describe, it, expect } from "vitest";
import { parseIntervalDays, retentionPolicyNeedsUpdate } from "./retention";

// TimescaleDB expose `config->>'drop_after'` en texte d'intervalle Postgres.
// On ne sait comparer que la forme « N day(s) » ; tout autre texte est ambigu.
describe("parseIntervalDays", () => {
  it("lit « N days » et « 1 day »", () => {
    expect(parseIntervalDays("60 days")).toBe(60);
    expect(parseIntervalDays("1 day")).toBe(1);
    expect(parseIntervalDays("  7 days ")).toBe(7);
  });

  it("renvoie null pour les formes ambiguës ou absentes", () => {
    expect(parseIntervalDays("2 mons")).toBeNull();
    expect(parseIntervalDays("1 mon 5 days")).toBeNull();
    expect(parseIntervalDays("00:00:00")).toBeNull();
    expect(parseIntervalDays("")).toBeNull();
    expect(parseIntervalDays(null)).toBeNull();
    expect(parseIntervalDays(undefined)).toBeNull();
  });
});

// On ne recrée la politique que si elle diffère : la recréer à chaque tick
// repousserait indéfiniment sa prochaine exécution.
describe("retentionPolicyNeedsUpdate", () => {
  it("false quand la politique porte déjà le bon nombre de jours", () => {
    expect(retentionPolicyNeedsUpdate("60 days", 60)).toBe(false);
  });

  it("true quand le nombre de jours diffère", () => {
    expect(retentionPolicyNeedsUpdate("60 days", 30)).toBe(true);
  });

  it("true quand il n'y a pas de politique ou une forme illisible", () => {
    expect(retentionPolicyNeedsUpdate(null, 60)).toBe(true);
    expect(retentionPolicyNeedsUpdate("2 mons", 60)).toBe(true);
  });
});
