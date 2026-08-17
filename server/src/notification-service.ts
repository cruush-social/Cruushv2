import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { getVapidPublicKey, sendPushForNotification } from "./push-service.js";

export type AppNotificationType =
  | "incoming_cruush"
  | "mutual_cruush"
  | "direct_message"
  | "group_message"
  | "group_membership"
  | "nearby_activity"
  | "reward"
  | "announcement";

export type AppNotificationRecord = {
  id: string;
  userId: string;
  type: AppNotificationType;
  title: string;
  body: string;
  linkUrl: string;
  actorUserId: string | null;
  conversationId: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type NotificationSummary = {
  unreadCount: number;
};

export type AppNotificationInput = {
  userId: string;
  type: AppNotificationType;
  title: string;
  body?: string;
  linkUrl?: string;
  actorUserId?: string | null;
  conversationId?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  suppressPush?: boolean;
};

type NotificationApp = Pick<FastifyInstance, "config" | "db" | "log"> | {
  config: AppConfig;
  db: DbClient;
  log: Pick<FastifyInstance["log"], "warn" | "error" | "info">;
};

export type AppNotificationRow = {
  id: string;
  user_id: string;
  type: AppNotificationType;
  title: string;
  body: string;
  link_url: string;
  actor_user_id: string | null;
  conversation_id: string | null;
  metadata: Record<string, unknown> | string | null;
  read_at: string | Date | null;
  created_at: string | Date;
};

function normalizeMetadata(value: AppNotificationRow["metadata"]) {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  return value;
}

export function mapNotificationRow(row: AppNotificationRow): AppNotificationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    actorUserId: row.actor_user_id,
    conversationId: row.conversation_id,
    metadata: normalizeMetadata(row.metadata),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function createAppNotification(
  app: NotificationApp,
  input: AppNotificationInput
) {
  if (input.actorUserId && input.actorUserId === input.userId) {
    return null;
  }

  const result = await app.db.query<AppNotificationRow>(
    `insert into app_notifications (
       user_id,
       type,
       title,
       body,
       link_url,
       actor_user_id,
       conversation_id,
       dedupe_key,
       metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
     returning
       id::text as id,
       user_id::text as user_id,
       type,
       title,
       body,
       link_url,
       actor_user_id::text as actor_user_id,
       conversation_id::text as conversation_id,
       metadata,
       read_at,
       created_at`,
    [
      input.userId,
      input.type,
      input.title,
      input.body ?? "",
      input.linkUrl ?? "",
      input.actorUserId ?? null,
      input.conversationId ?? null,
      input.dedupeKey ?? null,
      input.metadata ?? {}
    ]
  );

  const row = result.rows[0];
  return row ? mapNotificationRow(row) : null;
}

export async function createAppNotificationAndPush(
  app: NotificationApp,
  input: AppNotificationInput
) {
  const notification = await createAppNotification(app, input);

  if (!notification || input.suppressPush) {
    return notification;
  }

  try {
    await sendPushForNotification(app, notification);
  } catch (error) {
    app.log.warn({ err: error, notificationId: notification.id }, "notification push dispatch failed");
  }

  return notification;
}

export async function sendPushForPersistedNotification(
  app: NotificationApp,
  input: { userId: string; dedupeKey: string }
) {
  if (!getVapidPublicKey(app.config).enabled) {
    return false;
  }

  try {
    const result = await app.db.query<AppNotificationRow>(
      `select
         id::text as id,
         user_id::text as user_id,
         type,
         title,
         body,
         link_url,
         actor_user_id::text as actor_user_id,
         conversation_id::text as conversation_id,
         metadata,
         read_at,
         created_at
       from app_notifications
       where user_id = $1
         and dedupe_key = $2
       limit 1`,
      [input.userId, input.dedupeKey]
    );
    const row = result.rows[0];

    if (!row) {
      return false;
    }

    await sendPushForNotification(app, mapNotificationRow(row));
    return true;
  } catch (error) {
    app.log.warn({ err: error, userId: input.userId }, "persisted notification push dispatch failed");
    return false;
  }
}

export async function getNotificationSummary(app: NotificationApp, userId: string): Promise<NotificationSummary> {
  const result = await app.db.query<{ unread_count: number }>(
    `select count(*)::int as unread_count
     from app_notifications notification
     where notification.user_id = $1
       and notification.read_at is null`,
    [userId]
  );

  return {
    unreadCount: result.rows[0]?.unread_count ?? 0
  };
}
