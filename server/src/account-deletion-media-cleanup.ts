import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { deleteEncryptedMediaObject } from "./media-storage.js";

type CleanupCandidate = {
  object_key: string;
  attempt_count: number;
};

export type AccountDeletionMediaCleanupResult = {
  scanned: number;
  completed: number;
  failed: number;
};

const CLEANUP_LEASE_SECONDS = 5 * 60;
const MAX_RETRY_DELAY_SECONDS = 24 * 60 * 60;

function retryDelaySeconds(attemptCount: number) {
  return Math.min(
    MAX_RETRY_DELAY_SECONDS,
    60 * (2 ** Math.min(Math.max(attemptCount - 1, 0), 10))
  );
}

export async function cleanupAccountDeletionMedia(
  db: DbClient,
  config: AppConfig,
  limit = 100
): Promise<AccountDeletionMediaCleanupResult> {
  const claimed = await db.query<CleanupCandidate>(
    `with candidates as (
       select object_key
       from account_deletion_media_cleanup
       where completed_at is null
         and next_attempt_at <= now()
         and (lease_until is null or lease_until < now())
       order by created_at asc
       for update skip locked
       limit $1
     )
     update account_deletion_media_cleanup cleanup
     set attempt_count = cleanup.attempt_count + 1,
         lease_until = now() + ($2::integer * interval '1 second')
     from candidates
     where cleanup.object_key = candidates.object_key
     returning cleanup.object_key, cleanup.attempt_count`,
    [limit, CLEANUP_LEASE_SECONDS]
  );

  const result: AccountDeletionMediaCleanupResult = {
    scanned: claimed.rows.length,
    completed: 0,
    failed: 0
  };

  for (const candidate of claimed.rows) {
    try {
      await deleteEncryptedMediaObject(config, candidate.object_key);
      await db.query(
        `update account_deletion_media_cleanup
         set completed_at = now(),
             lease_until = null,
             last_error = null
         where object_key = $1
           and attempt_count = $2`,
        [candidate.object_key, candidate.attempt_count]
      );
      result.completed += 1;
    } catch (error) {
      await db.query(
        `update account_deletion_media_cleanup
         set next_attempt_at = now() + ($2::integer * interval '1 second'),
             lease_until = null,
             last_error = $3
         where object_key = $1
           and attempt_count = $4`,
        [
          candidate.object_key,
          retryDelaySeconds(candidate.attempt_count),
          error instanceof Error ? error.message : String(error),
          candidate.attempt_count
        ]
      );
      result.failed += 1;
    }
  }

  return result;
}

export function startAccountDeletionMediaCleanupScheduler(
  app: Pick<FastifyLikeApp, "db" | "config" | "log">,
  intervalMs = 5 * 60 * 1000
) {
  const run = () => {
    void cleanupAccountDeletionMedia(app.db, app.config).then((result) => {
      if (result.scanned > 0) {
        app.log.info(result, "account deletion media cleanup complete");
      }
    }).catch((error) => {
      app.log.error({ err: error }, "scheduled account deletion media cleanup failed");
    });
  };

  const timer = setInterval(run, intervalMs);
  timer.unref();
  run();
  return () => clearInterval(timer);
}

type FastifyLikeApp = {
  db: DbClient;
  config: AppConfig;
  log: {
    info(value: unknown, message: string): void;
    error(value: unknown, message: string): void;
  };
};
