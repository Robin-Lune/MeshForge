import { describe, it, expect, afterEach } from "vitest";
import { appBaseUrl, isSameOrigin } from "./security";

const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
});

describe("appBaseUrl", () => {
  it("utilise NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://mesh.example/path";
    expect(appBaseUrl()).toBe("https://mesh.example");
  });

  it("replie sur localhost si NEXT_PUBLIC_APP_URL est absent", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("isSameOrigin", () => {
  it("accepte uniquement l'origine canonique", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://mesh.example";
    expect(isSameOrigin(new Headers({ origin: "https://mesh.example" }))).toBe(
      true,
    );
    expect(isSameOrigin(new Headers({ origin: "https://evil.example" }))).toBe(
      false,
    );
  });

  it("refuse une origine absente", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://mesh.example";
    expect(isSameOrigin(new Headers())).toBe(false);
  });
});
