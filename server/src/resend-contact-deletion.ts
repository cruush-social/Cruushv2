import { randomUUID } from "node:crypto";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { decryptMediaBytes, encryptMediaBytes } from "./media-encryption.js";
import { requestAudience, withResendContactLock } from "./resend-audience.js";

type DeletionApp = {
  db: DbClient;
  config: AppConfig;
  log: { warn(context: unknown, message: string): void; error(context: unknown, message: string): void };
};
type Candidate = {
  id: string; claim_token: string; attempt_count: number;
  payload_ciphertext: string; payload_nonce: string; payload_auth_tag: string;
  encrypted_data_key: string; data_key_nonce: string; data_key_auth_tag: string; key_version: string;
};
type Target = { email: string; userId: string; audienceId: string };
type TerminalStatus = "completed" | "superseded";
class CleanupFailure extends Error {
  constructor(readonly code: string) { super(code); }
}
class NewContactOwner extends Error {}

export function resendContactDeletionConfigured(config: AppConfig) {
  return config.APP_DEPLOYMENT_STAGE === "production"
    && Boolean(config.RESEND_API_KEY);
}

/** Queue in the account deletion transaction while its account row is locked. */
export async function queueResendContactDeletion(input: {
  db: DbClient; config: AppConfig; userId: string; email: string;
}): Promise<string | null> {
  // A missing credential must not discard the target of an already configured
  // member audience; the provider attempt resumes once the credential returns.
  if (input.config.APP_DEPLOYMENT_STAGE !== "production" || !input.config.RESEND_CRUUSH_APP_AUDIENCE_ID) return null;
  const encrypted = encryptMediaBytes(input.config, Buffer.from(JSON.stringify({
    email: input.email, userId: input.userId, audienceId: input.config.RESEND_CRUUSH_APP_AUDIENCE_ID!,
  } satisfies Target)));
  const id = randomUUID();
  const result = await input.db.query<{ id: string }>(
    `insert into resend_contact_deletion_outbox (
       id, payload_ciphertext, payload_nonce, payload_auth_tag, encrypted_data_key,
       data_key_nonce, data_key_auth_tag, key_version
     ) select $1::uuid, $2, $3, $4, $5, $6, $7, $8
       where exists (select 1 from app_users where id = $9::uuid and email = $10
         and email_verified_at is not null)
     returning id::text`,
    [id, encrypted.ciphertext.toString("base64"), encrypted.nonce, encrypted.authTag,
      encrypted.encryptedDataKey, encrypted.dataKeyNonce, encrypted.dataKeyAuthTag,
      encrypted.keyVersion, input.userId, input.email]
  );
  return result.rows[0]?.id ?? null;
}

function targetFrom(app: DeletionApp, row: Candidate): Target {
  const target = JSON.parse(decryptMediaBytes(app.config, {
    ciphertext: Buffer.from(row.payload_ciphertext, "base64"), nonce: row.payload_nonce,
    authTag: row.payload_auth_tag, encryptedDataKey: row.encrypted_data_key,
    dataKeyNonce: row.data_key_nonce, dataKeyAuthTag: row.data_key_auth_tag, keyVersion: row.key_version,
  }).toString("utf8")) as Target;
  if (!target.email || !target.userId || !target.audienceId) throw new CleanupFailure("payload_unavailable");
  return target;
}

async function removeContact(app: DeletionApp, target: Target, deadlineAt: number): Promise<TerminalStatus> {
  try {
    // Current official API: DELETE /contacts/:id-or-email, no body. Success is
    // {object:'contact', contact:'<id>', deleted:true}; 404 is already erased.
    // https://resend.com/docs/api-reference/contacts/delete-contact
    const response = await requestAudience(`https://api.resend.com/contacts/${encodeURIComponent(target.email)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${app.config.RESEND_API_KEY}` },
    }, {
      deadlineAt, timeoutMs: Math.max(1, deadlineAt - Date.now()), preserveBody: true,
      execute: (send) => withResendContactLock(app.db, target.email, async (client) => {
        const current = await client.query<{ id: string; verified: boolean }>(
          `select id::text, email_verified_at is not null as verified from app_users
           where email = $1 and coalesce(account_status, 'active') <> 'deleted' for key share`,
          [target.email]
        );
        if (current.rows[0]?.id === target.userId) throw new CleanupFailure("account_not_deleted");
        // A different verified account now owns the current address. Preserve
        // its contact; this finishes the old job without claiming erasure.
        if (current.rows[0]?.verified) throw new NewContactOwner();
        return send();
      }),
    });
    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return "completed";
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CleanupFailure(`provider_${response.status}`);
    }
    const result = await response.json().catch(() => null) as { deleted?: boolean } | null;
    if (result?.deleted !== true) throw new CleanupFailure("provider_result_unconfirmed");
    return "completed";
  } catch (error) {
    if (error instanceof NewContactOwner) return "superseded";
    if (error instanceof CleanupFailure) throw error;
    // Never retain a raw provider/fetch error, URL, email, token or payload.
    throw new CleanupFailure("provider_request_failed");
  }
}

async function finish(app: DeletionApp, row: Candidate, status: TerminalStatus) {
  const updated = await app.db.query(
    `update resend_contact_deletion_outbox set status = $3, finished_at = now(),
       payload_ciphertext = null, payload_nonce = null, payload_auth_tag = null,
       encrypted_data_key = null, data_key_nonce = null, data_key_auth_tag = null, key_version = null,
       claim_token = null, lease_until = null, last_error_code = null
     where id = $1 and claim_token = $2 and status = 'pending' returning id`,
    [row.id, row.claim_token, status]
  );
  return updated.rows.length > 0;
}

export async function cleanupResendContactDeletions(app: DeletionApp, options: {
  ids?: string[]; limit?: number; timeoutMs?: number;
} = {}) {
  const result = { completed: 0, superseded: 0, pending: 0 };
  if (app.config.APP_DEPLOYMENT_STAGE !== "production") return result;
  if (!resendContactDeletionConfigured(app.config)) {
    if (options.ids) result.pending = options.ids.length;
    else {
      const queued = await app.db.query<{ total: number }>("select count(*)::int as total from resend_contact_deletion_outbox where status='pending'");
      result.pending = queued.rows[0]?.total ?? 0;
    }
    return result;
  }
  const timeoutMs = Math.max(1, options.timeoutMs ?? 10_000);
  const deadlineAt = Date.now() + timeoutMs;
  const claimToken = randomUUID();
  let claimedCount = 0;
  const work = (async () => {
    const claimed = await app.db.query<Candidate>(
      `with candidates as (
         select id from resend_contact_deletion_outbox where status = 'pending'
           and ($1::uuid[] is null or id = any($1::uuid[]))
           and next_attempt_at <= now() and (lease_until is null or lease_until < now())
         order by created_at, id for update skip locked limit $2
       ) update resend_contact_deletion_outbox job
         set claim_token = $3, lease_until = now() + interval '1 minute', attempt_count = attempt_count + 1
         from candidates where job.id = candidates.id returning job.*`,
      [options.ids ?? null, Math.max(1, Math.min(options.limit ?? 10, 100)), claimToken]
    );
    claimedCount = claimed.rows.length;
    for (const row of claimed.rows) {
      try {
        const status = await removeContact(app, targetFrom(app, row), deadlineAt);
        if (await finish(app, row, status)) result[status] += 1;
        else result.pending += 1;
      } catch (error) {
        const code = error instanceof CleanupFailure ? error.code : "cleanup_unavailable";
        const delaySeconds = Math.min(6 * 60 * 60, 60 * 2 ** Math.min(row.attempt_count - 1, 8));
        await app.db.query(
          `update resend_contact_deletion_outbox set claim_token = null, lease_until = null,
             next_attempt_at = now() + ($3::integer * interval '1 second'), last_error_code = $4
           where id = $1 and claim_token = $2 and status = 'pending'`,
          [row.id, row.claim_token, delaySeconds, code]
        );
        result.pending += 1;
      }
    }
    // Keep only one day of non-identifying completion status. Pending targets
    // remain encrypted solely to finish erasure, never discarded unconfirmed.
    await app.db.query("delete from resend_contact_deletion_outbox where status <> 'pending' and finished_at < now() - interval '1 day'");
    return result;
  })();
  // A provider queue or outage must not hold up the completed local deletion.
  // The durable claim remains retryable even if this attempt is still winding down.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pendingResult = () => ({ ...result, pending: Math.max(result.pending,
    (options.ids?.length ?? claimedCount) - result.completed - result.superseded) });
  try {
    return await Promise.race([work.catch(() => {
      app.log.warn({ error: "cleanup_unavailable" }, "Resend contact erasure remains queued");
      return pendingResult();
    }), new Promise<typeof result>((resolve) => {
      timer = setTimeout(() => resolve(pendingResult()),
        Math.max(1, deadlineAt - Date.now()));
    })]);
  } finally {
    if (timer) clearTimeout(timer);
    void work.catch(() => app.log.warn({ error: "cleanup_unavailable" }, "Resend contact erasure remains queued"));
  }
}

export function startResendContactDeletionScheduler(app: DeletionApp, intervalMs = 60_000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await cleanupResendContactDeletions(app);
      if (result.pending) app.log.warn(result, "Resend contact erasure remains queued");
    } catch {
      app.log.warn({ error: "cleanup_unavailable" }, "Resend contact erasure retry failed");
    } finally { running = false; }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
