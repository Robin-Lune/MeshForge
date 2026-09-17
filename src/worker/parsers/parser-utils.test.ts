import { describe, it, expect } from "vitest";
import {
  decodePosition,
  decodeTraceSnr,
  isOkToMqtt,
  isRealNode,
  toNodeId,
} from "./parser-utils";

describe("decodePosition", () => {
  it("convertit une paire entière Meshtastic valide en degrés", () => {
    expect(decodePosition(-213588710, 556632009)).toEqual({
      lat: -21.358871,
      lon: 55.6632009,
    });
  });

  it.each([
    [undefined, undefined],
    [null, null],
    [0, 0],
    [-213588710, undefined],
    [undefined, 556632009],
    [910000000, 556632009],
    [-213588710, 1810000000],
  ])("retourne une paire null pour une position absente ou invalide", (lat, lon) => {
    expect(decodePosition(lat, lon)).toEqual({ lat: null, lon: null });
  });

  it("accepte une coordonnée individuelle à zéro", () => {
    expect(decodePosition(0, 556632009)).toEqual({ lat: 0, lon: 55.6632009 });
  });
});

describe("decodeTraceSnr", () => {
  it("int8 ×4 -> dB ; INT8_MIN et non-nombres -> null", () => {
    expect(decodeTraceSnr([24, -128, "x" as unknown as number, 0])).toEqual([6, null, null, 0]);
  });

  it("non-tableau -> []", () => {
    expect(decodeTraceSnr(undefined)).toEqual([]);
  });
});

describe("toNodeId / isRealNode", () => {
  it("toNodeId pad en hex non signé", () => {
    expect(toNodeId(0xf669cf14)).toBe("!f669cf14");
    expect(toNodeId(-1)).toBe("!ffffffff");
  });

  it("isRealNode exclut 0, broadcast et non-finis", () => {
    expect(isRealNode(0x1234)).toBe(true);
    expect(isRealNode(0)).toBe(false);
    expect(isRealNode(0xffffffff)).toBe(false);
    expect(isRealNode(NaN)).toBe(false);
  });
});

// Data.bitfield, bit 0 = OK_TO_MQTT (consentement du node à l'uplink MQTT).
// STRICT : absent = pas de consentement. Les autres bits (ex. WANT_RESPONSE = 2)
// ne valent pas consentement.
describe("isOkToMqtt", () => {
  it("vrai seulement si le bit 0 est posé", () => {
    expect(isOkToMqtt({ bitfield: 1 })).toBe(true);
    expect(isOkToMqtt({ bitfield: 3 })).toBe(true);
  });

  it("faux si absent, à 0, ou si seuls d'autres bits sont posés", () => {
    expect(isOkToMqtt({})).toBe(false);
    expect(isOkToMqtt({ bitfield: undefined })).toBe(false);
    expect(isOkToMqtt({ bitfield: 0 })).toBe(false);
    expect(isOkToMqtt({ bitfield: 2 })).toBe(false);
  });
});
