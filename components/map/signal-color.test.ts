import { describe, it, expect } from "vitest";
import {
  signalColor,
  SNR_GOOD,
  SNR_FAIR,
  SNR_BAD,
  SNR_UNKNOWN_COLOR,
} from "./signal-color";

// Réplique de getSignalColor (meshtastic/web) : SNR classe, RSSI rétrograde.
describe("signalColor", () => {
  it("SNR inconnu -> gris", () => {
    expect(signalColor(null)).toBe(SNR_UNKNOWN_COLOR);
  });

  it("bon SNR sans RSSI -> vert", () => {
    expect(signalColor(-3)).toBe(SNR_GOOD);
  });

  it("bon SNR mais RSSI faible -> rétrogradé en jaune", () => {
    // snr -3 (> -7) mais rssi -120 (<= -115) : pas GOOD ; rssi -120 (> -126) : FAIR.
    expect(signalColor(-3, -120)).toBe(SNR_FAIR);
  });

  it("bon SNR mais RSSI très faible -> orange", () => {
    expect(signalColor(-3, -130)).toBe(SNR_BAD);
  });

  it("SNR moyen -> jaune", () => {
    expect(signalColor(-10)).toBe(SNR_FAIR);
  });

  it("SNR faible -> orange", () => {
    expect(signalColor(-20)).toBe(SNR_BAD);
  });

  it("bon SNR + bon RSSI -> vert", () => {
    expect(signalColor(2, -90)).toBe(SNR_GOOD);
  });
});
