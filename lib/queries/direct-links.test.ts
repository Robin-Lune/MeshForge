import { describe, it, expect } from "vitest";
import { toDirectLinks } from "./direct-links";

// pg : médiane (percentile_cont) en number|string, COUNT (bigint) en string.
describe("toDirectLinks — liens directs agrégés", () => {
  it("arrondit le SNR (0,1 dB) et le RSSI (entier), coerce packets en number", () => {
    expect(
      toDirectLinks([
        { aId: "!a", bId: "!b", snr: "3.14159", rssi: "-97.6", packets: "42" },
      ]),
    ).toEqual([{ aId: "!a", bId: "!b", snr: 3.1, rssi: -98, packets: 42 }]);
  });

  it("préserve snr/rssi null (lien sans mesure, ex: traceroute JSON)", () => {
    const [link] = toDirectLinks([
      { aId: "!a", bId: "!b", snr: null, rssi: null, packets: 0 },
    ]);
    expect(link.snr).toBeNull();
    expect(link.rssi).toBeNull();
    expect(link.packets).toBe(0);
  });
});
