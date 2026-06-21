import { describe, it, expect } from "vitest";
import { nodeColor, GATEWAY_COLOR } from "./nodeColor";

describe("nodeColor", () => {
  it("renvoie le vert Meshtastic pour un gateway", () => {
    expect(nodeColor("!f669cf14", true)).toBe(GATEWAY_COLOR);
    expect(GATEWAY_COLOR).toBe("#67EA94");
  });

  it("est déterministe : même node → même couleur", () => {
    expect(nodeColor("!a1b2c3d4", false)).toBe(nodeColor("!a1b2c3d4", false));
  });

  it("renvoie une teinte HSL lisible pour un node normal", () => {
    expect(nodeColor("!a1b2c3d4", false)).toMatch(/^hsl\(\d{1,3}, 65%, 55%\)$/);
  });

  it("varie selon le node (deux IDs distincts → teintes distinctes ici)", () => {
    expect(nodeColor("!aaaaaaaa", false)).not.toBe(nodeColor("!bbbbbbbb", false));
  });
});
