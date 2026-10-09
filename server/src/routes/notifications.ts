import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getNotificationSummary,
  mapNotificationRow,
  type AppNotificationRow
} from "../notification-service.js";
import {
  getNotificationPreferences,
  getVapidPublicKey,
  removePushSubscription,
  updateNotificationPreferences,
  upsertPushSubscription
} from "../push-service.js";
import { getAuthenticatedUserId } from "../request-auth.js";
import { publicHttpsUrlSchema } from "../input-schema.js";
import { filterOosHiddenNotifications } from "../oos-notification-visibility.js";
import { ApiError } from "../errors.js";

// Push endpoints are dereferenced by the server when delivering a notification,
// so they must be restricted to public HTTPS hosts. Every real push service
// (FCM, Apple, Mozilla) issues such a URL.
const pushEndpointSchema = () => publicHttpsUrlSchema({
  message: "Push endpoint must be a public HTTPS URL."
});

const notificationTimestampSchema = z.string().datetime();
const notificationCursorSchema = z.union([
  notificationTimestampSchema,
  z.string().refine((value) => {
    const separator = value.lastIndexOf("|");
    return separator > 0
      && notificationTimestampSchema.safeParse(value.slice(0, separator)).success
      && z.uuid().safeParse(value.slice(separator + 1)).success;
  }, "Invalid notification cursor.")
]);

const notificationQuerySchema = z.object({
  filter: z.enum(["all", "unread"]).optional().default("all"),
  cursor: notificationCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20)
}).strict();

const notificationParamsSchema = z.object({
  notificationId: z.uuid()
}).strict();

const notificationPreferencesPayloadSchema = z.object({
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  cruushEnabled: z.boolean().optional(),
  messagesEnabled: z.boolean().optional(),
  groupsEnabled: z.boolean().optional(),
  nearbyEnabled: z.boolean().optional(),
  mutualFeedEnabled: z.boolean().optional(),
  rewardsEnabled: z.boolean().optional(),
  siteRemindersEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStartMinute: z.number().int().min(0).max(1439).optional(),
  quietHoursEndMinute: z.number().int().min(0).max(1439).optional(),
  quietHoursTimezone: z.string().trim().min(1).max(64).optional(),
  pulseEnabled: z.boolean().optional()
}).strict();

export const pushSubscriptionPayloadSchema = z.object({
  endpoint: pushEndpointSchema(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  }).strict()
}).strict();

const pushUnsubscribePayloadSchema = z.object({
  endpoint: pushEndpointSchema().optional()
}).strict();

export function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/api/notifications", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const parsedQuery = notificationQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid notification query.");
    const query = parsedQuery.data;
    const cursorSeparator = query.cursor?.lastIndexOf("|") ?? -1;
    const cursorTime = query.cursor
      ? cursorSeparator < 0 ? query.cursor : query.cursor.slice(0, cursorSeparator)
      : null;
    const cursorId = cursorSeparator < 0 ? null : query.cursor!.slice(cursorSeparator + 1);
    const values: unknown[] = [userId, query.limit, cursorTime, cursorId];
    const whereClauses = [
      "notification.user_id = $1",
      `($3::timestamptz is null
        or notification.created_at < $3::timestamptz
        or ($4::uuid is not null and notification.created_at = $3::timestamptz and notification.id < $4::uuid))`
    ];

    if (query.filter === "unread") {
      whereClauses.push("notification.read_at is null");
    }

    const notificationSql = `select
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
         created_at,
         to_char(notification.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_cursor
       from app_notifications notification
       where ${whereClauses.join(" and ")}
       order by notification.created_at desc, notification.id desc
       limit $2`;
    const visibleRows: Array<AppNotificationRow & { created_at_cursor?: string }> = [];
    while (visibleRows.length < query.limit) {
      const result = await app.db.query<AppNotificationRow & { created_at_cursor?: string }>(notificationSql, values);
      visibleRows.push(...await filterOosHiddenNotifications(app, userId, result.rows));
      if (result.rows.length < query.limit) break;
      const lastRawRow = result.rows[result.rows.length - 1];
      const nextTime = lastRawRow.created_at_cursor ?? new Date(lastRawRow.created_at).toISOString();
      if (nextTime === values[2] && lastRawRow.id === values[3]) break;
      values[2] = nextTime;
      values[3] = lastRawRow.id;
    }
    const pageRows = visibleRows.slice(0, query.limit);
    const notifications = pageRows.map(mapNotificationRow);

    return reply.send({
      data: {
        notifications,
        nextCursor: notifications.length === query.limit
          ? `${pageRows[pageRows.length - 1].created_at_cursor ?? notifications[notifications.length - 1].createdAt}|${pageRows[pageRows.length - 1].id}`
          : null
      }
    });
  });

  app.get("/api/notifications/summary", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    return reply.send({
      data: await getNotificationSummary(app, userId)
    });
  });

  app.post("/api/notifications/:notificationId/read", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { notificationId } = notificationParamsSchema.parse(request.params);

    await app.db.query(
      `update app_notifications notification
       set read_at = coalesce(read_at, now())
       where notification.id::text = $1
         and notification.user_id = $2`,
      [notificationId, userId]
    );

    return reply.send({
      data: await getNotificationSummary(app, userId)
    });
  });

  app.post("/api/notifications/read-all", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const result = await app.db.query<{ unread_count: number }>(
      `with updated as (
         update app_notifications notification
         set read_at = now()
         where notification.user_id = $1
           and notification.read_at is null
         returning id
       )
       select count(*)::int as unread_count
       from app_notifications notification
       where notification.user_id = $1
         and notification.read_at is null`,
      [userId]
    );

    return reply.send({
      data: {
        unreadCount: result.rows[0]?.unread_count ?? 0
      }
    });
  });

  app.delete("/api/notifications", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    await app.db.query(
      `delete from app_notifications
       where user_id = $1`,
      [userId]
    );

    return reply.send({
      data: {
        unreadCount: 0
      }
    });
  });

  app.delete("/api/notifications/:notificationId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { notificationId } = notificationParamsSchema.parse(request.params);

    await app.db.query(
      `delete from app_notifications notification
       where notification.id::text = $1
         and notification.user_id = $2`,
      [notificationId, userId]
    );

    return reply.send({
      data: await getNotificationSummary(app, userId)
    });
  });

  app.get("/api/notification-preferences", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    return reply.send({
      data: await getNotificationPreferences(app, userId)
    });
  });

  app.patch("/api/notification-preferences", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const payload = notificationPreferencesPayloadSchema.parse(request.body);

    return reply.send({
      data: await updateNotificationPreferences(app, userId, payload)
    });
  });

  app.get("/api/push/vapid-public-key", async (request, reply) => {
    await getAuthenticatedUserId(request);

    return reply.send({
      data: getVapidPublicKey(app.config)
    });
  });

  app.post("/api/push/subscriptions", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const payload = pushSubscriptionPayloadSchema.parse(request.body);

    return reply.send({
      data: await upsertPushSubscription(app, userId, payload, request.headers["user-agent"] ?? "")
    });
  });

  app.post("/api/push/subscriptions/unsubscribe", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const payload = pushUnsubscribePayloadSchema.parse(request.body ?? {});

    await removePushSubscription(app, userId, payload.endpoint);

    return reply.send({
      data: await updateNotificationPreferences(app, userId, { pushEnabled: false })
    });
  });
}
