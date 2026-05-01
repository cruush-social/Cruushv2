import { ApiError } from "./errors.js";

type RateLimitOptions = {
  key: string;
  max: number;
  windowMs: number;
  message: string;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();
const SWEEP_INTERVAL = 100;
let callsSinceSweep = 0;

function sweepExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function consumeToken(key: string, max: number, windowMs: number) {
  const now = Date.now();
  callsSinceSweep += 1;

  if (callsSinceSweep >= SWEEP_INTERVAL) {
    sweepExpiredBuckets(now);
    callsSinceSweep = 0;
  }

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });

    return;
  }

  if (existing.count >= max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new ApiError(429, "RATE_LIMITED", "", {
      retryAfterSeconds
    });
  }

  existing.count += 1;
}

export function assertRateLimit(options: RateLimitOptions) {
  try {
    consumeToken(options.key, options.max, options.windowMs);
  } catch (error) {
    if (error instanceof ApiError && error.code === "RATE_LIMITED") {
      throw new ApiError(429, "RATE_LIMITED", options.message, error.details);
    }

    throw error;
  }
}

export function resetRateLimitBuckets() {
  buckets.clear();
  callsSinceSweep = 0;
}
