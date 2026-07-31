// @vitest-environment jsdom
//
// Couvre le câblage propre au hook : garde de séquence sur /api/observations,
// tick de vieillissement et son nettoyage. MapLibre et les deux contrôleurs
// sont simulés — ils ont leurs propres tests.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { NodeMarkerController } from "./node-marker-controller";

const nodeController = {
  refreshNodes: vi.fn(),
  updateMarkers: vi.fn(),
  applyBridgeHighlight: vi.fn(),
  applyFreshness: vi.fn(),
  clearSelection: vi.fn(),
  popupIsOpen: vi.fn(() => false),
  destroy: vi.fn(),
} satisfies NodeMarkerController;

let controllerOptions: { getDirectCountByGateway: () => Map<string, number> };

vi.mock("./node-marker-controller", () => ({
  createNodeMarkerController: (options: typeof controllerOptions) => {
    controllerOptions = options;
    return nodeController;
  },
  matchesHopFilter: () => true,
}));

vi.mock("./coverage-controller", () => ({
  createCoverageController: () => ({
    load: vi.fn(),
    sync: vi.fn(),
    install: vi.fn(),
    destroy: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

class FakeMap {
  private handlers: Record<string, (e?: unknown) => void> = {};
  on(event: string, cb: (e?: unknown) => void) {
    this.handlers[event] = cb;
  }
  fire(event: string, payload?: unknown) {
    this.handlers[event]?.(payload);
  }
  addControl() {}
  addSource() {}
  addLayer() {}
  getSource() {
    return { setData: () => {} };
  }
  isSourceLoaded() {
    return true;
  }
  querySourceFeatures() {
    return [];
  }
  remove() {}
}

let lastMap: FakeMap;
vi.mock("maplibre-gl", () => ({
  default: {
    Map: class {
      constructor() {
        lastMap = new FakeMap();
        return lastMap as unknown as object;
      }
    },
    NavigationControl: class {},
    Marker: class {},
    Popup: class {},
  },
}));

const { useMapController } = await import("./useMapController");

const payload = (gatewayId: string, directNodes1h: number) => ({
  edges: [],
  gatewayActivity: [{ gatewayId, directNodes1h }],
});

let resolvers: Array<(v: unknown) => void>;
let fluxHandlers: Record<string, (e: MessageEvent) => void>;

function monter() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return renderHook(() =>
    useMapController({
      containerRef: { current: container },
      bounds: null,
      minZoom: 8,
      filters: {
        search: "",
        role: "",
        sinceH: 0,
        hopFilter: "all",
        coverage: "off",
      },
    }),
  );
}

// Simuler MessageChannel/queueMicrotask bloque l'ordonnanceur de React : on ne
// remplace que les minuteries.
const FAUX_TIMERS = {
  toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"],
} satisfies Parameters<typeof vi.useFakeTimers>[0];

beforeEach(() => {
  vi.clearAllMocks();
  resolvers = [];
  // Seul /api/observations est mis en attente : /api/nodes est servi tout de
  // suite pour ne pas polluer le compte des requêtes observées.
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (String(url).includes("/api/observations")) {
        return new Promise((resolve) => {
          resolvers.push(resolve);
        });
      }
      return Promise.resolve({ json: () => Promise.resolve([]) });
    }),
  );
  fluxHandlers = {};
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener(type: string, cb: (e: MessageEvent) => void) {
        fluxHandlers[type] = cb;
      }
      close() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** Laisse les chaînes de promesses en attente se dérouler. Hors `act` :
 *  le hook ne déclenche aucun rendu React sur ces chemins, et `act` y attend
 *  indéfiniment un travail qui ne vient jamais. */
async function purger() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

/** Résout la n-ième requête /api/observations en attente. */
async function repondre(index: number, body: unknown) {
  resolvers[index]({ json: () => Promise.resolve(body) });
  await purger();
}

describe("chargement des observations", () => {
  it("expose l'activité des passerelles au contrôleur", async () => {
    monter();
    act(() => lastMap.fire("load"));
    await repondre(0, payload("!gw", 6));

    expect(controllerOptions.getDirectCountByGateway().get("!gw")).toBe(6);
    expect(nodeController.applyFreshness).toHaveBeenCalled();
  });

  it("ignore une réponse dépassée par une plus récente", async () => {
    // Deux chargements se croisent : le tick et le rafraîchissement débouncé du
    // flux temps réel. Sans garde de séquence, la réponse la plus lente
    // écraserait la plus récente déjà appliquée.
    vi.useFakeTimers(FAUX_TIMERS);
    monter();
    act(() => lastMap.fire("load"));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    await purger();
    expect(resolvers).toHaveLength(2);

    await repondre(1, payload("!gw", 9)); // la plus récente arrive en premier
    await repondre(0, payload("!gw", 1)); // la retardataire ne doit rien écraser

    expect(controllerOptions.getDirectCountByGateway().get("!gw")).toBe(9);
  });
});

describe("tick de vieillissement", () => {
  it("repeint et recharge à chaque minute", async () => {
    vi.useFakeTimers(FAUX_TIMERS);
    monter();
    act(() => lastMap.fire("load"));
    expect(resolvers).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    await purger();

    expect(nodeController.applyFreshness).toHaveBeenCalled();
    expect(resolvers).toHaveLength(2);
  });

  it("repeint sans requêter quand l'onglet est masqué", async () => {
    // Le repeint est local et gratuit ; la requête, elle, n'a aucun intérêt sur
    // un onglet que personne ne regarde.
    vi.useFakeTimers(FAUX_TIMERS);
    monter();
    act(() => lastMap.fire("load"));
    const avant = resolvers.length;
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    nodeController.applyFreshness.mockClear();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    await purger();

    expect(nodeController.applyFreshness).toHaveBeenCalled();
    expect(resolvers).toHaveLength(avant);
  });

  it("s'arrête au démontage", async () => {
    vi.useFakeTimers(FAUX_TIMERS);
    const { unmount } = monter();
    act(() => lastMap.fire("load"));
    unmount();
    nodeController.applyFreshness.mockClear();

    act(() => {
      vi.advanceTimersByTime(180_000);
    });
    await purger();

    expect(nodeController.applyFreshness).not.toHaveBeenCalled();
  });
});

describe("flux temps réel", () => {
  it("repeint à la réception d'un node_update", async () => {
    // La couleur d'une pastille dépend de lastSeen, que l'événement met à jour :
    // sans repeint immédiat, elle resterait fausse jusqu'au tick suivant.
    monter();
    act(() => lastMap.fire("load"));
    nodeController.applyFreshness.mockClear();

    act(() => {
      fluxHandlers.node_update({
        data: JSON.stringify({
          nodeId: "!n1",
          longName: "N1",
          shortName: "N1",
          role: "ROUTER",
          lat: -21.1,
          lon: 55.5,
          batteryPct: 90,
          lastSeen: new Date().toISOString(),
          isGateway: false,
        }),
      } as MessageEvent);
    });

    expect(nodeController.applyFreshness).toHaveBeenCalled();
  });

  it("survit à une charge utile illisible", () => {
    monter();
    act(() => lastMap.fire("load"));
    expect(() =>
      act(() => fluxHandlers.node_update({ data: "{" } as MessageEvent)),
    ).not.toThrow();
  });
});
