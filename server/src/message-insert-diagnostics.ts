import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Explains why a message insert produced no row.
 *
 * The insert is one statement made of chained CTEs, so a single unmatched
 * condition anywhere silently yields zero rows and the route reports
 * "Messaging is unavailable for this account" - which blames the account even
 * when the account is fine. This re-checks each link separately and logs the
 * first one that failed, so the next occurrence is diagnosable from the logs
 * instead of by inspection.
 */
export async function diagnoseMessageInsertFailure(
  app: FastifyInstance,
  request: FastifyRequest,
  input: { conversationId: string; userId: string; mediaObjectId?: string | null }
) {
  const checks: Record<string, unknown> = {};

  const run = async (name: string, sql: string, params: unknown[]) => {
    try {
      const result = await app.db.query(sql, params);
      checks[name] = result.rows[0] ?? null;
    } catch (error) {
      checks[name] = `query failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  await run(
    "conversation",
    `select c.id::text as id, c.kind, c.closed_at is null as open
     from conversations c where c.id::text = $1`,
    [input.conversationId]
  );

  await run(
    "membership",
    `select cm.user_id::text as member
     from conversation_members cm
     where cm.conversation_id::text = $1 and cm.user_id = $2`,
    [input.conversationId, input.userId]
  );

  await run(
    "sender",
    `select u.account_status, coalesce(t.is_suspended, false) as suspended, coalesce(t.trust_score, 50) as trust_score
     from app_users u left join user_trust_profiles t on t.user_id = u.id
     where u.id = $1`,
    [input.userId]
  );

  if (input.mediaObjectId) {
    await run(
      "media",
      `select surface, moderation_status, owner_user_id::text as owner, deleted_at is null as alive
       from media_objects where id = $1`,
      [input.mediaObjectId]
    );

    await run(
      "display_variant",
      `select variant_type, deleted_at is null as alive
       from media_variants
       where media_object_id = $1 and variant_type = 'display'`,
      [input.mediaObjectId]
    );
  }

  request.log.error(
    { stage: "message_insert_diagnostic", conversationId: input.conversationId, userId: input.userId, mediaObjectId: input.mediaObjectId ?? null, checks },
    "message insert produced no row"
  );

  return checks;
}
