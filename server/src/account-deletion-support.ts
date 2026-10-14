import type { DbClient } from "./db.js";

/** Call inside account deletion's transaction after locking the account row. */
export async function deleteAccountSupportData(db: DbClient, userId: string): Promise<string[]> {
  // Keep the reply-before-request lock order used by support writes and the
  // existing deletion trigger. The account lock blocks new owned requests.
  await db.query(
    `select reply.id from support_request_replies reply
     join support_requests request on request.id = reply.support_request_id
     where request.requester_user_id = $1
     order by reply.id for update of reply`,
    [userId]
  );
  await db.query(
    `select id from support_requests
     where requester_user_id = $1
     order by id for update`,
    [userId]
  );
  // Parent locks serialize appeal evidence inserts with this snapshot. Queue
  // ciphertext cleanup before deleting its only object-key references/keys.
  const evidence = await db.query<{ object_key: string }>(
    `select evidence.object_key from suspension_appeal_evidence evidence
     join support_requests request on request.id = evidence.support_request_id
     where request.requester_user_id = $1`,
    [userId]
  );
  const objectKeys = [...new Set(evidence.rows.map((row) => row.object_key))];
  if (objectKeys.length) {
    await db.query(
      `insert into account_deletion_media_cleanup (object_key)
       select object_key from unnest($1::text[]) as objects(object_key)
       on conflict (object_key) do nothing`,
      [objectKeys]
    );
  }
  // Replies and appeal keys cascade; separately stored safety reports and
  // CSAM evidence are not part of ordinary support history.
  await db.query("delete from support_requests where requester_user_id = $1", [userId]);
  return objectKeys;
}
