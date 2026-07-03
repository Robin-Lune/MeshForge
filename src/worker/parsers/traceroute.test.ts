import { describe, it, expect } from "vitest";
import { tracerouteInfo } from "./traceroute";

const A = 0x0a0a0a0a;
const B = 0x0b0b0b0b;
const C = 0x0c0c0c0c;
const D = 0x0d0d0d0d;

// Clé lisible d'un segment pour les assertions.
const seg = (s: { direction: string; fromNode: string; toNode: string; snr: number | null }) =>
  `${s.direction}:${s.fromNode}->${s.toNode}@${s.snr}`;

describe("tracerouteInfo", () => {
  it("réponse A→B→C→D (retour D→C→A) : segments aller + retour, source/target", () => {
    const info = tracerouteInfo({
      from: D, // destination (émetteur de la réponse)
      to: A, // origine
      packetId: 42,
      route: [B, C], // aller A→D
      snrTowards: [9, 6, 3], // A-B, B-C, C-D
      routeBack: [C], // retour D→C→A
      snrBack: [8, 4],
      isRequest: false,
    })!;
    expect(info.sourceNode).toBe("!0a0a0a0a");
    expect(info.targetNode).toBe("!0d0d0d0d");
    expect(info.packetId).toBe(42);
    // Aller = [A, B, C, D] ; retour COMPLET = [D, C, A] (fermé sur l'origine).
    expect(info.segments.map(seg)).toEqual([
      "forward:!0a0a0a0a->!0b0b0b0b@9",
      "forward:!0b0b0b0b->!0c0c0c0c@6",
      "forward:!0c0c0c0c->!0d0d0d0d@3",
      "back:!0d0d0d0d->!0c0c0c0c@8",
      "back:!0c0c0c0c->!0a0a0a0a@4",
    ]);
  });

  it("requête en vol : origine = from, aller seul, pas de retour", () => {
    const info = tracerouteInfo({
      from: A,
      to: D,
      packetId: 1,
      route: [B],
      snrTowards: [5],
      routeBack: [],
      snrBack: [],
      isRequest: true,
    })!;
    expect(info.sourceNode).toBe("!0a0a0a0a");
    expect(info.targetNode).toBe("!0d0d0d0d");
    expect(info.segments.map(seg)).toEqual(["forward:!0a0a0a0a->!0b0b0b0b@5"]);
  });

  it("sens indéterminé (undefined) -> null", () => {
    expect(
      tracerouteInfo({
        from: A, to: D, packetId: 1, route: [B],
        snrTowards: [], routeBack: [], snrBack: [], isRequest: undefined,
      }),
    ).toBeNull();
  });

  it("destination invalide (broadcast) -> null", () => {
    expect(
      tracerouteInfo({
        from: D, to: 0xffffffff, packetId: 1, route: [B],
        snrTowards: [6], routeBack: [], snrBack: [], isRequest: false,
      }),
    ).toBeNull();
  });

  it("origine === destination -> null", () => {
    expect(
      tracerouteInfo({
        from: A, to: A, packetId: 1, route: [],
        snrTowards: [], routeBack: [], snrBack: [], isRequest: false,
      }),
    ).toBeNull();
  });

  it("saut vers broadcast dans l'aller -> aller ignoré, retour direct conservé", () => {
    const info = tracerouteInfo({
      from: D, to: A, packetId: 1, route: [0xffffffff],
      snrTowards: [6, 3], routeBack: [], snrBack: [5], isRequest: false,
    })!;
    // Aller = [A, broadcast, D] -> sauts touchant broadcast ignorés.
    // Retour = [D, A] -> saut direct conservé (le fix ne le perd plus).
    expect(info.segments.map(seg)).toEqual(["back:!0d0d0d0d->!0a0a0a0a@5"]);
  });

  it("broadcast des deux côtés -> aucun segment exploitable -> null", () => {
    expect(
      tracerouteInfo({
        from: D, to: A, packetId: 1, route: [0xffffffff],
        snrTowards: [6, 3], routeBack: [0xffffffff], snrBack: [5, 2], isRequest: false,
      }),
    ).toBeNull();
  });

  it("réponse directe (route vide) : aller A→D + retour direct D→A", () => {
    const info = tracerouteInfo({
      from: D, to: A, packetId: 1, route: [],
      snrTowards: [7], routeBack: [], snrBack: [], isRequest: false,
    })!;
    // Retour complet [D, A] : le saut direct de retour est émis lui aussi.
    expect(info.segments.map(seg)).toEqual([
      "forward:!0a0a0a0a->!0d0d0d0d@7",
      "back:!0d0d0d0d->!0a0a0a0a@null",
    ]);
  });
});
