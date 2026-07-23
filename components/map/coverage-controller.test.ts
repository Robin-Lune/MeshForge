import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoverageResponse, CoverageSelection } from "@/types";

vi.mock("maplibre-gl", () => ({
  default: {
    Popup: class {
      private open = false;

      setLngLat() {
        return this;
      }

      setDOMContent() {
        return this;
      }

      addTo() {
        this.open = true;
        return this;
      }

      remove() {
        this.open = false;
        return this;
      }

      isOpen() {
        return this.open;
      }
    },
  },
}));

import { createCoverageController } from "./coverage-controller";

const COVERAGE: CoverageResponse = {
  z: 15,
  tileCount: 32768,
  tiles: [
    {
      x: 21431,
      y: 18327,
      snrP90: -8,
      snrMax: -5,
      gateways: 2,
      nodes: 1,
      transmissions: 3,
      samples: 4,
      days: 2,
    },
  ],
};

const mapFixture = () => {
  const source = { setData: vi.fn() };
  const layers = new Set<string>();
  const map = {
    addSource: vi.fn(),
    getSource: vi.fn(() => source),
    getStyle: vi.fn(() => ({
      layers: [{ id: "labels", type: "symbol" }],
    })),
    addLayer: vi.fn((...args: [{ id: string }, string?]) => {
      layers.add(args[0].id);
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    setLayoutProperty: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getCanvas: vi.fn(() => ({ style: { cursor: "" } })),
  };
  return { map, source };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createCoverageController", () => {
  it("installe une couche masquée sans charger les données", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { map } = mapFixture();
    const controller = createCoverageController({
      map: map as never,
      getSelection: () => "off",
      getCachedCoverage: () => null,
      setCachedCoverage: () => {},
      isNodePopupOpen: () => false,
      onErrorChange: () => {},
    });

    controller.install();

    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.addLayer).toHaveBeenCalledTimes(2);
    expect(map.addLayer.mock.calls[0][1]).toBe("labels");
    expect(fetchMock).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("charge une seule fois puis repeint localement au changement de métrique", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(COVERAGE),
      }),
    );
    const { map, source } = mapFixture();
    let selection: CoverageSelection = "off";
    let cache: CoverageResponse | null = null;
    const onErrorChange = vi.fn();
    const controller = createCoverageController({
      map: map as never,
      getSelection: () => selection,
      getCachedCoverage: () => cache,
      setCachedCoverage: (coverage) => {
        cache = coverage;
      },
      isNodePopupOpen: () => false,
      onErrorChange,
    });
    controller.install();

    selection = "snr";
    controller.sync();
    await vi.waitFor(() => expect(source.setData).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onErrorChange).toHaveBeenCalledWith(false);

    selection = "gateways";
    controller.sync();
    expect(source.setData).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it("remonte un échec au lieu de peindre une couche vide", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, source } = mapFixture();
    const onErrorChange = vi.fn();
    const controller = createCoverageController({
      map: map as never,
      getSelection: () => "snr",
      getCachedCoverage: () => null,
      setCachedCoverage: () => {},
      isNodePopupOpen: () => false,
      onErrorChange,
    });

    controller.install();
    await vi.waitFor(() => expect(onErrorChange).toHaveBeenCalledWith(true));
    expect(source.setData).not.toHaveBeenCalled();
    controller.destroy();
  });
});
