import type { FastifyInstance } from "fastify";
import { runTransaction, type DbClient } from "./db.js";

export const MAP_PING_RETENTION_DAYS = 7;
export const MAP_PING_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAP_PING_CLEANUP_BATCH_SIZE = 500;

export type MapPingCleanupResult = {
  pings: number;
};

export async function cleanupExpiredMapPings(
  db: DbClient,
  batchSize = MAP_PING_CLEANUP_BATCH_SIZE
): Promise<MapPingCleanupResult> {
  return runTransaction(db, async (transaction) => {
    const expired = await transaction.query<{ id: string }>(
      `select id::text as id
       from map_pings
       where expires_at <= now() - ($1::integer * interval '1 day')
       order by expires_at asc
       limit $2
       for update skip locked`,
      [MAP_PING_RETENTION_DAYS, batchSize]
    );
    const pingIds = expired.rows.map((row) => row.id);

    if (pingIds.length === 0) {
      return { pings: 0 };
    }
    const deletedPings = await transaction.query<{ id: string }>(
      `delete from map_pings
       where id = any($1::uuid[])
       returning id::text as id`,
      [pingIds]
    );

    return {
      pings: deletedPings.rows.length
    };
  });
}

export function startMapPingCleanupScheduler(
  app: Pick<FastifyInstance, "db" | "log">,
  intervalMs = MAP_PING_CLEANUP_INTERVAL_MS
) {
  const run = () => {
    void cleanupExpiredMapPings(app.db).then((result) => {
      if (result.pings > 0) {
        app.log.info(result, "map Ping retention cleanup complete");
      }
    }).catch((error) => {
      app.log.error({ err: error }, "scheduled map Ping retention cleanup failed");
    });
  };

  const timer = setInterval(run, intervalMs);
  timer.unref();
  run();
  return () => clearInterval(timer);
}
