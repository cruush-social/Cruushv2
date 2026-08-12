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

// Push endpoints are dereferenced by the server when delivering a notification,
// so they must be restricted to public HTTPS hosts. Every real push service
// (FCM, Apple, Mozilla) issues such a URL.
const pushEndpointSchema = () => publicHttpsUrlSchema({
  message: "Push endpoint must be a public HTTPS URL."
});

const notificationQuerySchema = z.object({
  filter: z.enum(["all", "unread"]).optional().default("all"),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20)
}).strict();

const notificationParamsSchema = z.object({
  notificationId: z.uuid()
}).strict();

const notificationPreferencesPayloadSchema = z.object({
  pushEnabled: z.boolean().optional(),
  cruushEnabled: z.boolean().optional(),
  messagesEnabled: z.boolean().optional(),
  groupsEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional()
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
    const query = notificationQuerySchema.parse(request.query);
    const values: unknown[] = [userId, query.limit];
    const whereClauses = ["notification.user_id = $1"];

    if (query.filter === "unread") {
      whereClauses.push("notification.read_at is null");
    }

    if (query.cursor) {
      values.push(query.cursor);
      whereClauses.push(`notification.created_at < $${values.length}::timestamptz`);
    }

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
       from app_notifications notification
       where ${whereClauses.join(" and ")}
       order by notification.created_at desc
       limit $2`,
      values
    );
    const notifications = result.rows.map((row) => mapNotificationRow(row));

    return reply.send({
      data: {
        notifications,
        nextCursor: notifications.length === query.limit
          ? notifications[notifications.length - 1]?.createdAt ?? null
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
