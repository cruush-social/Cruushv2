import type { FastifyInstance } from "fastify";
import { runTransaction, type DbClient } from "./db.js";

export const BUG_REPORT_EMAIL_RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const BUG_REPORT_CONTACT_REDACTED = "bug-contact@invalid";

export type BugReportContact = {
  contact_email: string | null;
  contact_email_opted_in: boolean;
  contact_email_expires_at: string | Date | null;
};

export function activeBugReportContactEmail(contact: BugReportContact): string | null {
  const email = contact.contact_email?.trim();
  const expiresAt = contact.contact_email_expires_at
    ? new Date(contact.contact_email_expires_at).getTime()
    : NaN;
  return contact.contact_email_opted_in === true && expiresAt > Date.now()
    && email && email !== BUG_REPORT_CONTACT_REDACTED && email !== "deleted-account@invalid"
    ? email : null;
}

export async function withLockedBugReportReplyContact(
  db: DbClient,
  requestId: string,
  replyId: string,
  send: (recipientEmail: string) => Promise<void>
): Promise<string | null> {
  return runTransaction(db, async (client) => {
    // Match account deletion and retention: child first, then parent. Holding
    // these locks through provider handoff serializes send against deletion.
    const reply = await client.query<{ id: string }>(
      `select id from support_request_replies
       where id = $1 and support_request_id = $2
       for update`, [replyId, requestId]
    );
    if (!reply.rows[0]) return null;
    const result = await client.query<BugReportContact & { requester_account_deleted_at: string | Date | null }>(
      `select sr.contact_email, sr.contact_email_opted_in, sr.contact_email_expires_at,
              sr.requester_account_deleted_at
       from support_requests sr
       where sr.id = $1 and sr.category = 'bug'
       for share`, [requestId]
    );
    const current = result.rows[0];
    const recipientEmail = current && !current.requester_account_deleted_at
      ? activeBugReportContactEmail(current) : null;
    if (!recipientEmail) return null;
    await send(recipientEmail);
    return recipientEmail;
  });
}

export async function purgeExpiredBugReportEmails(db: DbClient) {
  return runTransaction(db, async (client) => {
    // Match account deletion's child-before-parent lock order. Bug replies do
    // not need a second address copy; the live parent is the only reply source.
    await client.query(
      `update support_request_replies reply
       set recipient_email = case when request.requester_account_deleted_at is not null
         then 'deleted-account@invalid' else 'bug-contact@invalid' end
       from support_requests request
       where request.id = reply.support_request_id and request.category = 'bug'
         and reply.recipient_email not in ('bug-contact@invalid', 'deleted-account@invalid')`
    );
    const result = await client.query<{ id: string }>(
      `update support_requests
       set contact_email = case when requester_user_id is null
           and requester_account_deleted_at is null and source <> 'survey'
         then 'bug-contact@invalid' else null end,
           contact_email_opted_in = false,
           contact_email_expires_at = null,
           updated_at = now()
       where category = 'bug'
         and (not contact_email_opted_in or contact_email_expires_at is null
           or contact_email_expires_at <= now())
         and (contact_email_opted_in or contact_email_expires_at is not null
           or (contact_email is not null and contact_email <> 'bug-contact@invalid'))
       returning id::text as id`
    );
    return result.rows.length;
  });
}

export function startBugReportEmailRetentionScheduler(
  app: FastifyInstance,
  intervalMs = BUG_REPORT_EMAIL_RETENTION_INTERVAL_MS
) {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const deleted = await purgeExpiredBugReportEmails(app.db);
      if (deleted > 0) {
        app.log.info({ deleted }, "expired bug-report contact emails deleted");
      }
    } catch (error) {
      app.log.error({ err: error }, "bug-report email retention cleanup failed");
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
