import { describe, it, expect } from "vitest";
import { isPubliclyVisible } from "./privacy";

// Node fixe, opt-in carte, avec position : cas visible de référence.
const base = { shareOnMap: true, isMobile: false, lat: -21.1, lon: 55.5 };

describe("isPubliclyVisible — règle privacy carte publique", () => {
  it("affiche un node fixe opt-in avec position", () => {
    expect(isPubliclyVisible(base)).toBe(true);
  });

  it("cache un node mobile, même opt-in (jamais sur la carte publique)", () => {
    expect(isPubliclyVisible({ ...base, isMobile: true })).toBe(false);
  });

  it("cache un node sans consentement (share_on_map=false par défaut)", () => {
    expect(isPubliclyVisible({ ...base, shareOnMap: false })).toBe(false);
  });

  it("cache un node sans position", () => {
    expect(isPubliclyVisible({ ...base, lat: null })).toBe(false);
    expect(isPubliclyVisible({ ...base, lon: null })).toBe(false);
  });
});
