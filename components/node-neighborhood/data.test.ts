import { describe, it, expect } from "vitest";
import {
  SUBJECT_COLOR,
  TRACE_NODE_COLOR,
  fmtSnr,
  locatedNeighbors,
  nodeLabel,
  shortId,
  traceDirectionLabel,
  splitHops,
  type SubjectNode,
} from "./format";
import {
  TRACE_SEGMENT_MS,
  buildTraceAnimationFrame,
  traceAnimationDuration,
  traceAnimationSteps,
} from "./animation";
import { buildLinkFeatures, buildNodeFeatures } from "./features";
import type { NodeNeighbor, NodeTraceroute, TracerouteHop } from "../../types";

const node: SubjectNode = { nodeId: "!f669cf14", name: "Piton", lat: -21.1, lon: 55.5 };
const nb = (o: Partial<NodeNeighbor> & { nodeId: string }): NodeNeighbor => ({
  nodeId: o.nodeId,
  name: o.name ?? null,
  snr: o.snr ?? null,
  lat: o.lat ?? null,
  lon: o.lon ?? null,
  lastSeen: o.lastSeen ?? null,
});

describe("formatage", () => {
  it("shortId = 4 derniers hex", () => {
    expect(shortId("!f669cf14")).toBe("cf14");
  });

  it("nodeLabel : nom si présent, sinon short id (nom vide/espaces -> short id)", () => {
    expect(nodeLabel("!f669cf14", "Piton")).toBe("Piton");
    expect(nodeLabel("!f669cf14", "  ")).toBe("cf14");
    expect(nodeLabel("!f669cf14", null)).toBe("cf14");
  });

  it("fmtSnr : null -> tiret, sinon valeur + dB", () => {
    expect(fmtSnr(null)).toBe("— dB");
    expect(fmtSnr(0)).toBe("0 dB");
    expect(fmtSnr(-7)).toBe("-7 dB");
  });

  it("traceDirectionLabel : Aller / Retour avec flèche", () => {
    expect(traceDirectionLabel("forward")).toBe("↗ Aller");
    expect(traceDirectionLabel("back")).toBe("↙ Retour");
  });
});

describe("locatedNeighbors", () => {
  it("ne garde que les voisins avec lat ET lon", () => {
    const out = locatedNeighbors([
      nb({ nodeId: "!a", lat: -21, lon: 55 }),
      nb({ nodeId: "!b", lat: -21 }), // pas de lon
      nb({ nodeId: "!c" }), // aucune position
    ]);
    expect(out.map((n) => n.nodeId)).toEqual(["!a"]);
  });
});

describe("buildLinkFeatures", () => {
  const located = [
    nb({ nodeId: "!a", snr: 5, lat: -21.2, lon: 55.6 }),
    nb({ nodeId: "!b", snr: -20, lat: -21.3, lon: 55.7 }),
  ];

  it("un lien par voisin, couleur SNR, aucun dim sans survol", () => {
    const fc = buildLinkFeatures(node, located, null);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties).toMatchObject({ color: "#00ff00", dim: false });
    expect(fc.features[1].properties).toMatchObject({ color: "#f7931a", dim: false });
    expect((fc.features[0].geometry as GeoJSON.LineString).coordinates).toEqual([
      [55.5, -21.1],
      [55.6, -21.2],
    ]);
  });

  it("survol -> dim sur les AUTRES voisins seulement", () => {
    const fc = buildLinkFeatures(node, located, "!a");
    expect(fc.features[0].properties?.dim).toBe(false);
    expect(fc.features[1].properties?.dim).toBe(true);
  });

  it("utilise les ancres visuelles des pills quand elles sont décalées", () => {
    const fc = buildLinkFeatures(node, located, null, null, {
      [node.nodeId]: [55.51, -21.11],
      "!a": [55.61, -21.21],
    });
    expect((fc.features[0].geometry as GeoJSON.LineString).coordinates).toEqual([
      [55.51, -21.11],
      [55.61, -21.21],
    ]);
  });

  it("survol avec traceroute -> remplace la ligne directe par les segments réels", () => {
    const trace: NodeTraceroute = {
      sourceNode: node.nodeId,
      targetNode: "!a",
      otherNode: "!a",
      receivedAt: "2026-07-01T10:00:00.000Z",
      hops: [
        hop("forward", 0, { fromNode: node.nodeId, toNode: "!relay", toLat: -21.15, toLon: 55.55, snr: 4 }),
        hop("forward", 1, { fromNode: "!relay", fromLat: -21.15, fromLon: 55.55, toNode: "!a", toLat: -21.2, toLon: 55.6, snr: -10 }),
      ],
    };
    const fc = buildLinkFeatures(node, located, "!a", trace);
    const coords = fc.features.map((f) => (f.geometry as GeoJSON.LineString).coordinates);
    expect(coords).not.toContainEqual([[55.5, -21.1], [55.6, -21.2]]);
    expect(coords).toContainEqual([[55.5, -21.1], [55.55, -21.15]]);
    expect(coords).toContainEqual([[55.55, -21.15], [55.6, -21.2]]);
  });
});

describe("buildNodeFeatures", () => {
  it("point sujet (kind subject) + un point par voisin", () => {
    const fc = buildNodeFeatures(node, [nb({ nodeId: "!a", name: "Voisin", snr: 5, lat: -21.2, lon: 55.6 })]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties).toMatchObject({ kind: "subject", label: "Piton", color: SUBJECT_COLOR });
    expect(fc.features[1].properties).toMatchObject({ kind: "neighbor", nodeId: "!a", label: "Voisin", color: "#00ff00" });
  });

  it("ajoute les relais traceroute localisés comme points dédiés", () => {
    const trace: NodeTraceroute = {
      sourceNode: node.nodeId,
      targetNode: "!a",
      otherNode: "!a",
      receivedAt: "2026-07-01T10:00:00.000Z",
      hops: [
        hop("forward", 0, { fromNode: node.nodeId, toNode: "!relay", toName: "Relais", toLat: -21.15, toLon: 55.55 }),
        hop("forward", 1, { fromNode: "!relay", fromName: "Relais", fromLat: -21.15, fromLon: 55.55, toNode: "!a", toLat: -21.2, toLon: 55.6 }),
      ],
    };
    const fc = buildNodeFeatures(node, [nb({ nodeId: "!a", lat: -21.2, lon: 55.6 })], trace);
    expect(fc.features).toHaveLength(3);
    expect(fc.features[2].properties).toMatchObject({ kind: "trace", label: "Relais", color: TRACE_NODE_COLOR });
  });
});

describe("splitHops", () => {
  it("sépare aller / retour", () => {
    const { forward, back } = splitHops([hop("forward", 0), hop("back", 0), hop("forward", 1)]);
    expect(forward).toHaveLength(2);
    expect(back).toHaveLength(1);
  });
});

describe("traceAnimation", () => {
  const trace: NodeTraceroute = {
    sourceNode: node.nodeId,
    targetNode: "!a",
    otherNode: "!a",
    receivedAt: "2026-07-01T10:00:00.000Z",
    hops: [
      hop("back", 0, { fromNode: "!a", fromLat: -21.2, fromLon: 55.6, toNode: node.nodeId, toLat: -21.1, toLon: 55.5, snr: 7 }),
      hop("forward", 1, { fromNode: "!relay", fromLat: -21.15, fromLon: 55.55, toNode: "!a", toLat: -21.2, toLon: 55.6, snr: -10 }),
      hop("forward", 0, { fromNode: node.nodeId, toNode: "!relay", toLat: -21.15, toLon: 55.55, snr: 4 }),
    ],
  };

  it("ordonne l'animation en aller puis retour", () => {
    expect(traceAnimationSteps(trace).map((h) => `${h.direction}:${h.step}`)).toEqual([
      "forward:0",
      "forward:1",
      "back:0",
    ]);
    expect(traceAnimationDuration(trace)).toBeGreaterThan(TRACE_SEGMENT_MS * 3);
  });

  it("dessine le segment courant et pose le label SNR quand il est terminé", () => {
    const firstDone = buildTraceAnimationFrame(trace, TRACE_SEGMENT_MS + TRACE_SEGMENT_MS / 2);
    expect(firstDone.lines.features).toHaveLength(2);
    expect(firstDone.halo.features).toHaveLength(2);
    expect(firstDone.arrows.features.length).toBeGreaterThan(0);
    expect(firstDone.arrows.features[0].properties).toEqual(
      expect.objectContaining({
        color: "#00ff00",
        rotate: expect.any(Number),
      }),
    );
    expect(firstDone.labels.features[0].properties).toMatchObject({
      label: "↗ Aller 1 · 4 dB",
      prefix: "↗ Aller 1",
      value: "4 dB",
    });
    expect(firstDone.pulses.features.length).toBeGreaterThan(0);
    expect(firstDone.packet.features.length).toBeGreaterThan(1);
  });

  it("affiche bien un badge de signal pour un SNR à 0 dB", () => {
    const zeroTrace: NodeTraceroute = {
      sourceNode: node.nodeId,
      targetNode: "!a",
      otherNode: "!a",
      receivedAt: "2026-07-01T10:00:00.000Z",
      hops: [
        hop("forward", 0, { fromNode: node.nodeId, toNode: "!a", toLat: -21.2, toLon: 55.6, snr: 0 }),
      ],
    };
    const frame = buildTraceAnimationFrame(zeroTrace, TRACE_SEGMENT_MS);
    expect(frame.labels.features).toHaveLength(1);
    expect(frame.labels.features[0].properties).toMatchObject({
      label: "↗ Aller 1 · 0 dB",
      value: "0 dB",
    });
  });

  it("affiche le label près du segment après le début du hop, pas immédiatement", () => {
    expect(buildTraceAnimationFrame(trace, TRACE_SEGMENT_MS * 0.35).labels.features).toHaveLength(0);
    expect(buildTraceAnimationFrame(trace, TRACE_SEGMENT_MS * 0.5).labels.features).toHaveLength(1);
  });

  it("garde le traceroute complet à la fin, sans paquet en boucle", () => {
    const done = buildTraceAnimationFrame(trace, traceAnimationDuration(trace));
    expect(done.lines.features).toHaveLength(3);
    expect(done.halo.features).toHaveLength(3);
    expect(done.labels.features).toHaveLength(3);
    expect(done.labels.features.map((f) => f.properties?.label)).toEqual([
      "↗ Aller 1 · 4 dB",
      "↗ Aller 2 · -10 dB",
      "↙ Retour 1 · 7 dB",
    ]);
    expect(done.pulses.features).toHaveLength(1);
    expect(done.packet.features).toHaveLength(0);
  });

  it("sépare visuellement un aller et un retour sur le même lien physique", () => {
    const directTrace: NodeTraceroute = {
      sourceNode: node.nodeId,
      targetNode: "!a",
      otherNode: "!a",
      receivedAt: "2026-07-01T10:00:00.000Z",
      hops: [
        hop("forward", 0, { fromNode: node.nodeId, toNode: "!a", toLat: -21.2, toLon: 55.6 }),
        hop("back", 0, { fromNode: "!a", fromLat: -21.2, fromLon: 55.6, toNode: node.nodeId, toLat: node.lat, toLon: node.lon }),
      ],
    };
    const done = buildTraceAnimationFrame(directTrace, traceAnimationDuration(directTrace));
    const [tx, rx] = done.lines.features.map((f) => (f.geometry as GeoJSON.LineString).coordinates);
    expect(tx).not.toEqual([...rx].reverse());
  });
});

function hop(
  direction: "forward" | "back",
  step: number,
  override: Partial<TracerouteHop> = {},
): TracerouteHop {
  return {
    direction,
    step,
    fromNode: "!x",
    fromName: null,
    fromLat: node.lat,
    fromLon: node.lon,
    toNode: "!y",
    toName: null,
    toLat: null,
    toLon: null,
    snr: null,
    ...override,
  };
}
