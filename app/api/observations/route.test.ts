import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock est hissé : la fabrique ne peut pas capturer de variable de module.
vi.mock("@/lib/queries/observations", () => ({ getObservations: vi.fn() }));

import { GET } from "./route";
import { getObservations } from "@/lib/queries/observations";

const mocked = vi.mocked(getObservations);

beforeEach(() => mocked.mockReset());

describe("GET /api/observations", () => {
  it("sert les arêtes et l'activité des passerelles", async () => {
    const payload = {
      edges: [
        {
          gatewayId: "!gw",
          nodeId: "!n1",
          bestHop: 0,
          snr: 2,
          packets: 5,
          source: "gateway" as const,
        },
      ],
      gatewayActivity: [{ gatewayId: "!gw", directNodes1h: 3 }],
    };
    mocked.mockResolvedValue(payload);

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(payload);
  });
});
