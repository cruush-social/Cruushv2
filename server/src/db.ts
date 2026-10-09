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
  transaction?<T>(fn: (client: DbClient) => Promise<T>): Promise<T>;
}

export function createPool(config: Pick<AppConfig, "DATABASE_URL">) {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10
  });

  return {
    query<T = Record<string, unknown>>(text: string, params?: unknown[]) {
      return pool.query(text, params) as unknown as Promise<DbQueryResult<T>>;
    },
    end() {
      return pool.end();
    },
    async transaction<T>(fn: (client: DbClient) => Promise<T>) {
      const client = await pool.connect();
      const transactionClient: DbClient = {
        query<QueryRow = Record<string, unknown>>(text: string, params?: unknown[]) {
          return client.query(text, params) as unknown as Promise<DbQueryResult<QueryRow>>;
        },
        async end() {
          return undefined;
        }
      };

      try {
        await client.query("begin");
        const result = await fn(transactionClient);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

export async function runTransaction<T>(db: DbClient, fn: (client: DbClient) => Promise<T>) {
  if (db.transaction) {
    return db.transaction(fn);
  }

  await db.query("begin");

  try {
    const result = await fn(db);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
