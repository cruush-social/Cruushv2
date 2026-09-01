type AudienceConfig = {
  APP_DEPLOYMENT_STAGE?: string;
  RESEND_API_KEY?: string;
  RESEND_CRUUSH_APP_AUDIENCE_ID?: string;
};

type VerifiedMemberDb = {
  query: <T>(sql: string) => Promise<{ rows: T[] }>;
};

const REQUEST_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_WAIT_MS = 60_000;
const MAX_ATTEMPTS = 3;
let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

class AudienceSyncFailure extends Error {
  constructor(message: string, readonly retryable: boolean, readonly stopSweep: boolean) {
    super(message);
  }
}

function retryDelayMs(response: Response) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  if (response.headers.get("ratelimit-remaining") === "0") {
    const seconds = Number(response.headers.get("ratelimit-reset"));
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  }
  return 0;
}

function requestAudience(url: string, init: RequestInit): Promise<Response> {
  // Startup reconciliation and individual verification events share the same
  // local queue. Provider headers also account for traffic from other processes.
  const request = requestQueue.then(async () => {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs > MAX_PROVIDER_WAIT_MS) {
      throw new AudienceSyncFailure("provider_retry_deferred", false, true);
    }
    if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      // Fetch errors can include the contact URL. Never propagate that URL to logs.
      throw new AudienceSyncFailure("provider_request_failed", true, true);
    }
    nextRequestAt = Math.max(nextRequestAt, Date.now() + retryDelayMs(response));
    // Only status and rate headers are needed; do not retain contact payloads.
    await response.body?.cancel().catch(() => undefined);
    return response;
  });
  requestQueue = request.then(() => undefined, () => undefined);
  return request;
}

function responseFailure(stage: "lookup" | "create", response: Response) {
  const transient = response.status === 408 || response.status === 429 || response.status >= 500;
  return new AudienceSyncFailure(
    `${stage}_${response.status}`,
    transient,
    transient || response.status === 401 || response.status === 403,
  );
}

export async function syncVerifiedMemberToResendAudience(input: { config: AudienceConfig; email: string; logger: { warn: (context: unknown, message: string) => void } }) {
  const { config, email, logger } = input;
  if (config.APP_DEPLOYMENT_STAGE !== "production" || !config.RESEND_API_KEY || !config.RESEND_CRUUSH_APP_AUDIENCE_ID) return "skipped" as const;
  const base = `https://api.resend.com/audiences/${encodeURIComponent(config.RESEND_CRUUSH_APP_AUDIENCE_ID)}/contacts`;
  const headers = { Authorization: `Bearer ${config.RESEND_API_KEY}` };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      // Always restart with lookup, including after an ambiguous create result.
      // Existing contacts and their unsubscribe preferences are never updated.
      const existing = await requestAudience(`${base}/${encodeURIComponent(email)}`, { headers });
      if (existing.ok) return "synced" as const;
      if (existing.status !== 404) throw responseFailure("lookup", existing);
      const created = await requestAudience(base, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (created.ok || created.status === 409) return "synced" as const;
      throw responseFailure("create", created);
    } catch (error) {
      const failure = error instanceof AudienceSyncFailure
        ? error
        : new AudienceSyncFailure("audience_sync_failed", false, true);
      if (failure.retryable && attempt + 1 < MAX_ATTEMPTS) {
        nextRequestAt = Math.max(nextRequestAt, Date.now() + REQUEST_INTERVAL_MS * 2 ** attempt);
        continue;
      }
      logger.warn({ error: failure.message, attempts: attempt + 1 }, "verified member audience sync failed");
      return failure.stopSweep ? "deferred" as const : "failed" as const;
    }
  }
  return "failed" as const;
}

export async function syncAllVerifiedMembersToResendAudience(input: {
  config: AudienceConfig;
  db: VerifiedMemberDb;
  logger: { warn: (context: unknown, message: string) => void; info?: (context: unknown, message: string) => void };
}) {
  if (input.config.APP_DEPLOYMENT_STAGE !== "production" || !input.config.RESEND_API_KEY || !input.config.RESEND_CRUUSH_APP_AUDIENCE_ID) return;
  const result = await input.db.query<{ email: string }>(
    `select email
     from app_users
     where email_verified_at is not null
       and coalesce(account_status, 'active') <> 'deleted'
     order by created_at asc`
  );
  let synced = 0;
  let failed = 0;
  for (let index = 0; index < result.rows.length; index += 1) {
    const outcome = await syncVerifiedMemberToResendAudience({ config: input.config, email: result.rows[index].email, logger: input.logger });
    if (outcome === "deferred") {
      input.logger.warn({ synced, failed, remaining: result.rows.length - index }, "verified member audience reconciliation deferred");
      return;
    }
    if (outcome === "synced") synced += 1;
    else failed += 1;
  }
  if (failed > 0) {
    input.logger.warn({ synced, failed }, "verified member audience reconciliation incomplete");
  } else {
    input.logger.info?.({ count: synced }, "verified member audience reconciliation complete");
  }
}
