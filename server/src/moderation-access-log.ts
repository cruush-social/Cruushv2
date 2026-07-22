import type { DbClient } from "./db.js";

export const MODERATOR_ACCESS_LOG_RETENTION_DAYS = 180;

export type ModeratorAccessType = "queue_detail" | "media_preview" | "review_preview";

export async function recordModeratorAccess(db: DbClient, input: {
  actorUserId: string;
  accessType: ModeratorAccessType;
  reportId?: string | null;
  contentReviewId?: string | null;
  mediaObjectId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.query(
    `insert into moderation_access_events (
       actor_user_id, report_id, content_review_id, media_object_id,
       access_type, metadata
     )
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.actorUserId,
      input.reportId ?? null,
      input.contentReviewId ?? null,
      input.mediaObjectId ?? null,
      input.accessType,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export async function cleanupModeratorAccessEvents(db: DbClient, limit = 500) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 5_000));
  const result = await db.query<{ id: string }>(
    `with expired as (
       select id
       from moderation_access_events
       where created_at < now() - interval '${MODERATOR_ACCESS_LOG_RETENTION_DAYS} days'
       order by created_at asc, id asc
       limit $1
     ), deleted as (
       delete from moderation_access_events access_event
       using expired
       where access_event.id = expired.id
       returning access_event.id::text as id
     )
     select id from deleted`,
    [safeLimit]
  );
  return result.rowCount ?? result.rows.length;
}
