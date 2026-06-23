import { describe, expect, it } from "vitest";
import { getDbConfig } from "./db-config";

describe("getDbConfig", () => {
  it("garde DATABASE_URL quand elle est fournie", () => {
    expect(getDbConfig({ DATABASE_URL: "postgresql://u:p@h:5432/db" })).toEqual({
      connectionString: "postgresql://u:p@h:5432/db",
    });
  });

  it("priorise PGHOST sur DATABASE_URL dans les conteneurs Docker", () => {
    expect(
      getDbConfig({
        DATABASE_URL: "postgresql://meshforge:p@localhost:5432/meshforge",
        PGHOST: "timescaledb",
        PGDATABASE: "meshforge",
        PGUSER: "meshforge",
        PGPASSWORD: "secret",
      }),
    ).toMatchObject({
      host: "timescaledb",
      database: "meshforge",
      user: "meshforge",
      password: "secret",
    });
  });

  it("construit une config pg sans encoder le mot de passe brut", () => {
    expect(
      getDbConfig({
        PGHOST: "timescaledb",
        PGDATABASE: "meshforge",
        PGUSER: "meshforge",
        DB_PASSWORD: "a#b@c/d%",
      }),
    ).toMatchObject({
      host: "timescaledb",
      database: "meshforge",
      user: "meshforge",
      password: "a#b@c/d%",
    });
  });
});
