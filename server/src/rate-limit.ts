import type { DbClient } from "./db.js";
import { ApiError } from "./errors.js";

export type RateLimitOptions = {
  key: string;
  max: number;
  windowMs: number;
  message: string;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitBucketRow = {
  attempt_count: number | string;
  reset_at: string | Date;
};

export type RateLimiter = {
  assert(options: RateLimitOptions): Promise<void>;
  reset?(): void;
};

const SWEEP_INTERVAL = 100;

function getRetryAfterSeconds(resetAt: number) {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

function toResetTimestamp(value: string | Date) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function createMemoryRateLimiter(): RateLimiter {
  const buckets = new Map<string, RateLimitBucket>();
  let callsSinceSweep = 0;

  function sweepExpiredBuckets(now: number) {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  function consumeToken(options: RateLimitOptions) {
    const now = Date.now();
    callsSinceSweep += 1;

    if (callsSinceSweep >= SWEEP_INTERVAL) {
      sweepExpiredBuckets(now);
      callsSinceSweep = 0;
    }

    const existing = buckets.get(options.key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(options.key, {
        count: 1,
        resetAt: now + options.windowMs
      });

      return;
    }

    if (existing.count >= options.max) {
      throw new ApiError(429, "RATE_LIMITED", options.message, {
        retryAfterSeconds: getRetryAfterSeconds(existing.resetAt)
      });
    }

    existing.count += 1;
  }

  return {
    async assert(options) {
      consumeToken(options);
    },
    reset() {
      buckets.clear();
      callsSinceSweep = 0;
    }
  };
}

export function createPostgresRateLimiter(db: DbClient): RateLimiter {
  let callsSinceSweep = 0;

  async function sweepExpiredBuckets() {
    await db.query("delete from rate_limit_buckets where reset_at <= now()");
  }

  return {
    async assert(options) {
      callsSinceSweep += 1;

      if (callsSinceSweep >= SWEEP_INTERVAL) {
        await sweepExpiredBuckets();
        callsSinceSweep = 0;
      }

      const result = await db.query<RateLimitBucketRow>(
        `insert into rate_limit_buckets (bucket_key, attempt_count, reset_at)
         values ($1, 1, now() + ($3::double precision * interval '1 millisecond'))
         on conflict (bucket_key) do update
         set attempt_count = case
               when rate_limit_buckets.reset_at <= now() then 1
               else least(rate_limit_buckets.attempt_count + 1, $2::integer + 1)
             end,
             reset_at = case
               when rate_limit_buckets.reset_at <= now()
                 then now() + ($3::double precision * interval '1 millisecond')
               else rate_limit_buckets.reset_at
             end,
             updated_at = now()
         returning attempt_count, reset_at`,
        [options.key, options.max, options.windowMs]
      );

      const bucket = result.rows[0];
      const attemptCount = Number(bucket?.attempt_count ?? 0);
      const resetAt = bucket?.reset_at ? toResetTimestamp(bucket.reset_at) : Date.now() + options.windowMs;

      if (attemptCount > options.max) {
        throw new ApiError(429, "RATE_LIMITED", options.message, {
          retryAfterSeconds: getRetryAfterSeconds(resetAt)
        });
      }
    }
  };
}
