import pg from "pg";
import type { AppConfig } from "./config.js";

const { Pool } = pg;

export function createPool(config: Pick<AppConfig, "DATABASE_URL">) {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: 10
  });
}
