import { describe, it, expect } from "vitest";
import { hardwareModelName, deviceRoleName } from "./meshtastic-enums";

describe("hardwareModelName — enum HardwareModel", () => {
  it("mappe les valeurs connues vers leur nom", () => {
    expect(hardwareModelName(110)).toBe("HELTEC_V4");
    expect(hardwareModelName(69)).toBe("HELTEC_MESH_NODE_T114");
    expect(hardwareModelName(43)).toBe("HELTEC_V3");
    expect(hardwareModelName(0)).toBe("UNSET");
    expect(hardwareModelName(255)).toBe("PRIVATE_HW");
  });

  it("renvoie le numéro brut pour une carte inconnue (réf pas au catalogue)", () => {
    expect(hardwareModelName(9999)).toBe("9999");
  });

  it("renvoie null pour une valeur non numérique", () => {
    expect(hardwareModelName(undefined)).toBeNull();
    expect(hardwareModelName(null)).toBeNull();
    expect(hardwareModelName("110")).toBeNull();
  });
});

describe("deviceRoleName — enum DeviceRole", () => {
  it("mappe les rôles connus", () => {
    expect(deviceRoleName(0)).toBe("CLIENT");
    expect(deviceRoleName(2)).toBe("ROUTER");
    expect(deviceRoleName(11)).toBe("ROUTER_LATE");
    expect(deviceRoleName(12)).toBe("CLIENT_BASE");
  });

  it("renvoie le numéro brut pour un rôle inconnu", () => {
    expect(deviceRoleName(99)).toBe("99");
  });

  it("renvoie null pour une valeur non numérique", () => {
    expect(deviceRoleName(undefined)).toBeNull();
    expect(deviceRoleName("0")).toBeNull();
  });
});
