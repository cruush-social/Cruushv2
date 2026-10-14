import type { DbClient } from "./db.js";

/**
 * Deleted accounts can retain audit rows just like banned accounts. Keep both
 * out of member-facing reads. Pass only source-controlled SQL expressions.
 */
export function nonBannedAccountSql(userIdExpression: string): string {
  return `not exists (select 1 from app_users banned_content_account
    where banned_content_account.id = ${userIdExpression}
      and (banned_content_account.account_status = 'banned'
        or banned_content_account.account_status = 'deleted'))`;
}

export async function loadBannedUserIds(db: Pick<DbClient, "query">, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return new Set();
  const result = await db.query<{ id: string }>(
    `select id::text as id from app_users
     where id = any($1::uuid[]) and (account_status = 'banned' or account_status = 'deleted')`,
    [ids]
  );
  return new Set(result.rows.map((row) => row.id));
}

/** Nearby notices keep their source only in server-side metadata. */
export function nonBannedNotificationSql(alias: string): string {
  return `${nonBannedAccountSql(`${alias}.actor_user_id`)} and not exists (
    select 1 from app_users banned_notification_source
    where banned_notification_source.id::text = ${alias}.metadata->>'sourceUserId'
      and (banned_notification_source.account_status = 'banned'
        or banned_notification_source.account_status = 'deleted')
  ) and (${alias}.type not in ('nearby_feed_post', 'mutual_feed_post') or exists (
    select 1 from posts notification_source_post
    where notification_source_post.id::text = ${alias}.metadata->>'postId'
      and ${nonBannedAccountSql('notification_source_post.user_id')}
  ))`;
}
