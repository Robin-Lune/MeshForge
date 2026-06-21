import { describe, it, expect } from "vitest";
import {
  canLogin,
  isValidUsername,
  isValidEmail,
  generateUsername,
  generatePassword,
} from "./contributors";
import type { ContributorAuth } from "./contributors";

const admin: ContributorAuth = {
  username: "robin",
  password: "$2b$12$hash",
  role: "ADMIN",
  isActive: true,
};

describe("canLogin — autorisation (actif + bon rôle)", () => {
  it("autorise un admin actif pour le rôle ADMIN", () => {
    expect(canLogin(admin, "ADMIN")).toBe(true);
  });

  it("refuse un admin désactivé", () => {
    expect(canLogin({ ...admin, isActive: false }, "ADMIN")).toBe(false);
  });

  it("refuse un USER qui tente un accès ADMIN", () => {
    expect(canLogin({ ...admin, role: "USER" }, "ADMIN")).toBe(false);
  });

  it("respecte le rôle demandé", () => {
    expect(canLogin({ ...admin, role: "USER" }, "USER")).toBe(true);
  });
});

describe("isValidUsername — format username", () => {
  it("accepte alphanumérique + _ - (3 à 32)", () => {
    expect(isValidUsername("robin")).toBe(true);
    expect(isValidUsername("relay_a1b2c3")).toBe(true);
    expect(isValidUsername("ab-_-CD")).toBe(true);
  });

  it("refuse trop court, trop long, ou caractères interdits", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(33))).toBe(false);
    expect(isValidUsername("robin lebon")).toBe(false);
    expect(isValidUsername("robin'; DROP")).toBe(false);
    expect(isValidUsername("")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepte un email plausible", () => {
    expect(isValidEmail("robin@example.com")).toBe(true);
    expect(isValidEmail("a.b+c@sub.domain.fr")).toBe(true);
  });

  it("refuse les formats absurdes", () => {
    expect(isValidEmail("robin")).toBe(false);
    expect(isValidEmail("robin@")).toBe(false);
    expect(isValidEmail("robin@host")).toBe(false);
    expect(isValidEmail("a b@host.fr")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("generateUsername / generatePassword — creds d'inscription", () => {
  it("username = slug du nom + _ + 6 alphanum", () => {
    expect(generateUsername("La Forge")).toMatch(/^laforge_[a-z0-9]{6}$/);
  });

  it("strip les accents via le slug", () => {
    expect(generateUsername("Réunion 974")).toMatch(/^reunion974_[a-z0-9]{6}$/);
  });

  it("repli 'relay' si le nom ne donne aucun caractère utilisable", () => {
    expect(generateUsername("★★★")).toMatch(/^relay_[a-z0-9]{6}$/);
  });

  it("le username généré passe isValidUsername", () => {
    expect(isValidUsername(generateUsername("Mon Relais"))).toBe(true);
  });

  it("mot de passe = 3 syllabes + 2 chiffres, ≥ 8 caractères", () => {
    const p = generatePassword();
    expect(p).toMatch(/^[a-z]{3}-[a-z]{3}-[a-z]{3}-\d{2}$/);
    expect(p.length).toBeGreaterThanOrEqual(8);
  });

  it("génère des valeurs différentes (aléatoire)", () => {
    expect(generatePassword()).not.toBe(generatePassword());
    expect(generateUsername("x")).not.toBe(generateUsername("x"));
  });
});
