import type { ClientConfig } from "pg";

type DbEnv = Partial<Record<string, string | undefined>> & {
  DATABASE_URL?: string;
  PGHOST?: string;
  PGPORT?: string;
  PGDATABASE?: string;
  PGUSER?: string;
  PGPASSWORD?: string;
  DB_PASSWORD?: string;
};

export function getDbConfig(env: DbEnv = process.env): ClientConfig {
  if (!env.PGHOST && env.DATABASE_URL) {
    return { connectionString: env.DATABASE_URL };
  }

  return {
    host: env.PGHOST ?? "localhost",
    port: Number(env.PGPORT ?? 5432),
    database: env.PGDATABASE ?? "meshforge",
    user: env.PGUSER ?? "meshforge",
    password: env.PGPASSWORD ?? env.DB_PASSWORD,
  };
}
