// @vitest-environment jsdom
//
// Couvre le repeint périodique du contrôleur. MapLibre est simulé au minimum :
// seules les primitives qu'emprunte le chemin updateMarkers → applyFreshness
// sont implémentées.
import { describe, it, expect, vi, beforeEach } from "vitest";

class FakeMarker {
  private element: HTMLElement;
  private lngLat: [number, number] = [0, 0];
  private offset: [number, number] = [0, 0];
  constructor(options: { element: HTMLElement }) {
    this.element = options.element;
  }
  setLngLat(lngLat: [number, number]) {
    this.lngLat = lngLat;
    return this;
  }
  getLngLat() {
    return { lng: this.lngLat[0], lat: this.lngLat[1] };
  }
  getElement() {
    return this.element;
  }
  setOffset(offset: [number, number]) {
    this.offset = offset;
    return this;
  }
  getOffset() {
    return { x: this.offset[0], y: this.offset[1] };
  }
  addTo() {
    document.body.appendChild(this.element);
    return this;
  }
  remove() {
    this.element.remove();
    return this;
  }
}

class FakePopup {
  setLngLat() {
    return this;
  }
  setDOMContent() {
    return this;
  }
  addTo() {
    return this;
  }
  remove() {
    return this;
  }
  isOpen() {
    return false;
  }
}

vi.mock("maplibre-gl", () => ({
  default: { Marker: FakeMarker, Popup: FakePopup },
}));

const { createNodeMarkerController } = await import("./node-marker-controller");
const { FRESHNESS_STEPS } = await import("@/lib/nodeColor");

const now = () => new Date().toISOString();
const daysAgo = (d: number) =>
  new Date(Date.now() - d * 86_400_000).toISOString();

function asRgb(hex: string): string {
  const probe = document.createElement("div");
  probe.style.background = hex;
  return probe.style.background;
}

type Props = Record<string, unknown>;

function setup(nodesProps: Props[], clusterProps: Props[] = []) {
  const nodes = new Map<string, GeoJSON.Feature>();
  for (const p of nodesProps) {
    nodes.set(String(p.nodeId), {
      type: "Feature",
      geometry: { type: "Point", coordinates: [55.5, -21.1] },
      properties: p,
    });
  }

  const map = {
    getSource: () => ({ setData: () => {} }),
    isSourceLoaded: () => true,
    querySourceFeatures: () => [
      ...[...nodes.values()].map((f) => ({
        geometry: f.geometry,
        properties: f.properties,
      })),
      ...clusterProps.map((p) => ({
        geometry: { type: "Point", coordinates: [55.5, -21.1] },
        properties: p,
      })),
    ],
    project: () => ({ x: 0, y: 0 }),
    unproject: () => ({ lng: 55.5, lat: -21.1 }),
  };

  const directCounts = new Map<string, number>();
  const bridges = new Set<string>();
  const clustersChanges: boolean[] = [];

  const controller = createNodeMarkerController({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map: map as any,
    tapToPreview: false,
    maxLinkDistanceKm: 20,
    nodes,
    getFilters: () => ({
      search: "",
      role: "",
      sinceH: 0,
      hopFilter: "all" as const,
    }),
    getMinHopByNode: () => new Map(),
    getBridgeNodeIds: () => bridges,
    getHoverByNode: () => new Map(),
    getDirectCountByGateway: () => directCounts,
    onOpenNode: () => {},
    onClustersChange: (v: boolean) => clustersChanges.push(v),
  });

  controller.updateMarkers();
  const elementOf = (nodeId: string): HTMLElement =>
    document.querySelectorAll<HTMLElement>("[data-gateway]")[
      [...nodes.keys()].indexOf(nodeId)
    ];

  return { controller, nodes, directCounts, bridges, elementOf, clustersChanges };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("applyFreshness", () => {
  it("vieillit une pastille montée quand lastSeen recule", () => {
    const props: Props = {
      nodeId: "!n1",
      label: "N1",
      lastSeen: now(),
      isGateway: false,
    };
    const { controller, nodes, elementOf } = setup([props]);
    const el = elementOf("!n1");
    expect(el.style.background).toBe(asRgb(FRESHNESS_STEPS[0].bg));

    (nodes.get("!n1")!.properties as Props).lastSeen = daysAgo(30);
    controller.applyFreshness();
    expect(el.style.background).toBe(
      asRgb(FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1].bg),
    );
  });

  it("met à jour le compteur d'une passerelle", () => {
    const { controller, directCounts, elementOf } = setup([
      { nodeId: "!gw", label: "GW", lastSeen: now(), isGateway: true },
    ]);
    const el = elementOf("!gw");
    expect(el.querySelector(".mf-badge-count")?.textContent).toBe("0");

    directCounts.set("!gw", 6);
    controller.applyFreshness();
    expect(el.querySelector(".mf-badge-count")?.textContent).toBe("6");
  });

  it("pose la capsule de rôle arrivée après la création du marker", () => {
    const { controller, nodes, elementOf } = setup([
      { nodeId: "!n1", label: "N1", lastSeen: now(), isGateway: false },
    ]);
    const el = elementOf("!n1");
    expect(el.querySelector(".mf-badge-role")).toBeNull();

    (nodes.get("!n1")!.properties as Props).role = "ROUTER";
    controller.applyFreshness();
    expect(el.querySelector(".mf-badge-role")?.textContent).toBe("R");
  });

  it("laisse intacte une pastille dont le node a quitté l'index", () => {
    // L'index est rafraîchi en bloc : peindre depuis {} ferait clignoter la
    // pastille en « ≥ 14 j » sans rôle avant qu'elle ne revienne.
    const { controller, nodes, elementOf } = setup([
      { nodeId: "!n1", label: "N1", role: "ROUTER", lastSeen: now(), isGateway: false },
    ]);
    const el = elementOf("!n1");
    const avant = el.style.background;
    nodes.delete("!n1");

    expect(() => controller.applyFreshness()).not.toThrow();
    expect(el.style.background).toBe(avant);
    expect(el.querySelector(".mf-badge-role")?.textContent).toBe("R");
  });
});

describe("applyBridgeHighlight", () => {
  it("pose puis retire l'anneau sans toucher aux autres pastilles", async () => {
    const { BRIDGE_SHADOW, PILL_SHADOW } = await import("./map-dom");
    const { controller, bridges, elementOf } = setup([
      { nodeId: "!n1", label: "N1", lastSeen: now(), isGateway: false },
    ]);
    const el = elementOf("!n1");
    expect(el.style.boxShadow).toBe(PILL_SHADOW);

    bridges.add("!n1");
    controller.applyBridgeHighlight();
    expect(el.style.boxShadow).toBe(BRIDGE_SHADOW);

    bridges.delete("!n1");
    controller.applyBridgeHighlight();
    expect(el.style.boxShadow).toBe(PILL_SHADOW);
  });
});

const { CLUSTER_PLAIN } = await import("./map-dom");

describe("clusters", () => {
  it("ne repeint ni n'annote un cluster", () => {
    // Les clusters n'ont ni fraîcheur ni rôle : le repeint doit les sauter.
    const { controller, bridges } = setup(
      [{ nodeId: "!n1", label: "N1", lastSeen: now(), isGateway: false }],
      [{ cluster: true, cluster_id: 7, point_count: 12, hasGateway: 0 }],
    );
    const cluster = document.querySelector<HTMLElement>(
      '[data-gateway="false"]:not([data-label])',
    );
    expect(cluster?.textContent).toBe("12");

    bridges.add("!n1");
    expect(() => {
      controller.applyFreshness();
      controller.applyBridgeHighlight();
    }).not.toThrow();
    // Le cluster garde son fond de cluster, pas une couleur de fraîcheur.
    expect(cluster?.style.background).toBe(asRgb(CLUSTER_PLAIN));
  });
});

describe("signal de présence des clusters", () => {
  it("annonce leur apparition puis leur disparition", () => {
    const { controller, clustersChanges } = setup(
      [{ nodeId: "!n1", label: "N1", lastSeen: now(), isGateway: false }],
      [{ cluster: true, cluster_id: 7, point_count: 12, hasGateway: 0 }],
    );
    expect(clustersChanges).toEqual([true]);

    // La destruction doit rendre la main : sans elle, un contrôleur recréé sur
    // une carte sans cluster laisserait la légende afficher une section vide.
    controller.destroy();
    expect(clustersChanges).toEqual([true, false]);
  });

  it("reste muet quand la carte n'en affiche aucun", () => {
    const { clustersChanges } = setup([
      { nodeId: "!n1", label: "N1", lastSeen: now(), isGateway: false },
    ]);
    expect(clustersChanges).toEqual([]);
  });
});
