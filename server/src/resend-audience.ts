type AudienceConfig = {
  APP_DEPLOYMENT_STAGE?: string;
  RESEND_API_KEY?: string;
  RESEND_CRUUSH_APP_AUDIENCE_ID?: string;
};

type VerifiedMemberDb = {
  query: <T>(sql: string) => Promise<{ rows: T[] }>;
};

type AudienceLogger = {
  warn: (context: unknown, message: string) => void;
  info?: (context: unknown, message: string) => void;
};

/**
 * Resend rate limits this API, and the reconciliation walks every verified
 * account on boot. Sent as fast as the loop can issue them, the whole run is
 * refused: production logged 113 members, 113 failures, every one of them
 * `lookup_429`, on every restart since the sync was added. The audience was
 * never populated.
 *
 * These two constants are what keeps the run under the limit. The pause is
 * per member rather than per request because a member costs two requests, a
 * lookup and possibly a create.
 */
const AUDIENCE_REQUEST_PAUSE_MS = 600;
const AUDIENCE_RETRY_LIMIT = 4;

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export type AudienceRuntime = {
  /** Injectable so tests do not spend real seconds waiting. */
  wait?: (ms: number) => Promise<void>;
};

function retryAfterMs(response: Response, attempt: number) {
  // Honour the server's own figure when it sends one. Otherwise back off
  // exponentially from the base pause.
  const header = response.headers?.get?.("retry-after");
  const seconds = header ? Number(header) : Number.NaN;

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 30_000);
  }

  return Math.min(AUDIENCE_REQUEST_PAUSE_MS * 2 ** attempt, 30_000);
}

/**
 * A 429 is a request to wait, not a failure. Treating it as one is what made
 * every member fail permanently: the error was logged and that member was
 * never revisited, because the next boot started the same losing race again.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  wait: (ms: number) => Promise<void>
): Promise<Response> {
  let response = await fetch(url, init);

  for (let attempt = 0; response.status === 429 && attempt < AUDIENCE_RETRY_LIMIT; attempt += 1) {
    await wait(retryAfterMs(response, attempt));
    response = await fetch(url, init);
  }

  return response;
}

export async function syncVerifiedMemberToResendAudience(input: {
  config: AudienceConfig;
  email: string;
  logger: Pick<AudienceLogger, "warn">;
} & AudienceRuntime): Promise<boolean> {
  const { config, email, logger, wait = sleep } = input;

  if (config.APP_DEPLOYMENT_STAGE !== "production" || !config.RESEND_API_KEY || !config.RESEND_CRUUSH_APP_AUDIENCE_ID) {
    return false;
  }

  const base = `https://api.resend.com/audiences/${encodeURIComponent(config.RESEND_CRUUSH_APP_AUDIENCE_ID)}/contacts`;
  const headers = { Authorization: `Bearer ${config.RESEND_API_KEY}` };

  try {
    // The lookup is deliberate. Creating a contact that already exists risks
    // resetting whatever state it carries, including an unsubscribe, so an
    // existing contact is left untouched.
    const existing = await fetchWithRetry(`${base}/${encodeURIComponent(email)}`, { headers }, wait);
    if (existing.ok) return true;
    if (existing.status !== 404) throw new Error(`lookup_${existing.status}`);

    const created = await fetchWithRetry(
      base,
      { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ email }) },
      wait
    );
    if (!created.ok && created.status !== 409) throw new Error(`create_${created.status}`);

    return true;
  } catch (error) {
    logger.warn({ email, error: error instanceof Error ? error.message : "unknown" }, "verified member audience sync failed");
    return false;
  }
}

export async function syncAllVerifiedMembersToResendAudience(input: {
  config: AudienceConfig;
  db: VerifiedMemberDb;
  logger: AudienceLogger;
} & AudienceRuntime) {
  const { config, db, logger, wait = sleep } = input;

  if (config.APP_DEPLOYMENT_STAGE !== "production" || !config.RESEND_API_KEY || !config.RESEND_CRUUSH_APP_AUDIENCE_ID) {
    return;
  }

  const result = await db.query<{ email: string }>(
    `select email
     from app_users
     where email_verified_at is not null
       and coalesce(account_status, 'active') <> 'deleted'
     order by created_at asc`
  );

  let synced = 0;
  let failed = 0;

  for (const [index, row] of result.rows.entries()) {
    if (index > 0) await wait(AUDIENCE_REQUEST_PAUSE_MS);

    if (await syncVerifiedMemberToResendAudience({ config, email: row.email, logger, wait })) {
      synced += 1;
    } else {
      failed += 1;
    }
  }

  // A count of what actually landed. The previous version reported only how
  // many rows it walked, which read as success while every one of them failed.
  logger.info?.(
    { count: result.rows.length, synced, failed },
    "verified member audience reconciliation complete"
  );
}
