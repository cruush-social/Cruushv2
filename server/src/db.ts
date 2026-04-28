import pg from "pg";
import type { AppConfig } from "./config.js";

const { Pool } = pg;

export type DbQueryResult<T = Record<string, unknown>> = {
  rowCount?: number | null;
  rows: T[];
};

export interface DbClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<DbQueryResult<T>>;
  end(): Promise<void>;
}

export function createPool(config: Pick<AppConfig, "DATABASE_URL">) {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: 10
  });
}
