import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import {
  createAppNotification,
  createAppNotificationAndPush
} from "./notification-service.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn()
}));

vi.mock("web-push", () => ({
  default: {
    sendNotification,
    setVapidDetails
  },
  sendNotification,
  setVapidDetails
}));

const query = vi.fn();
const deliveryVisibilityQuery = vi.fn();
// Keep the existing delivery/preferences sequence independent of the new dispatch-time gate.
const notificationDbQuery = (sql: string, values?: unknown[]) => sql.includes("select notification.id::text as id from app_notifications notification")
  ? deliveryVisibilityQuery(sql, values) : query(sql, values);
const end = vi.fn().mockResolvedValue(undefined);
const rateLimiter = createMemoryRateLimiter();

const baseConfig: AppConfig = {
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: true,
  DEVELOPMENT_ADMIN_ENABLED: false,
  DEVELOPMENT_ADMIN_PASSWORD: "",
  TURNSTILE_SECRET_KEY: "",
  PROFILE_ENCRYPTION_KEY: "",
  PROFILE_TOKEN_KEY: "",
  PROFILE_TOKEN_KEY_VERSION: "v1",
  RELATIONSHIP_ENCRYPTION_KEY: "",
  RELATIONSHIP_INDEX_KEY: "",
  RELATIONSHIP_ENCRYPTION_KEY_VERSION: "v1",
  RELATIONSHIP_INDEX_KEY_VERSION: "v1",
  MATCH_TOKEN_ENCRYPTION_KEY: "",
  MATCH_TOKEN_SIGNING_KEY: "",
  MATCH_TOKEN_KEY_VERSION: "v1",
  WEB_PUSH_ENABLED: false,
  WEB_PUSH_VAPID_PUBLIC_KEY: "",
  WEB_PUSH_VAPID_PRIVATE_KEY: "",
  WEB_PUSH_SUBJECT: "mailto:hello@cruush.app"
};

const recipientUserId = "00000000-0000-4000-8000-000000000001";
const actorUserId = "00000000-0000-4000-8000-000000000002";
const notificationId = "00000000-0000-4000-8000-000000000010";
const conversationId = "00000000-0000-4000-8000-000000000020";

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: notificationId,
    user_id: recipientUserId,
    type: "direct_message",
    title: "Alex sent you a message",
    body: "Open cruush to reply.",
    link_url: "/messages",
    actor_user_id: actorUserId,
    conversation_id: conversationId,
    metadata: { conversationKind: "dm" },
    read_at: null,
    created_at: "2026-07-08T12:00:00.000Z",
    ...overrides
  };
}

function queueVisibleActivitySource(includeFeedSettings = false) {
  // Missing viewer location fails closed to Purgatory. This source has not
  // opted into hiding from those viewers, so normal notification checks follow.
  query
    .mockResolvedValueOnce({ rows: [] }) // encrypted_location_envelopes
    .mockResolvedValueOnce({ rows: [] }) // user_travel_pins
    .mockResolvedValueOnce({
      rows: [{
        id: actorUserId,
        profile_visibility_ciphertext: null,
        profile_visibility_nonce: null,
        profile_visibility_auth_tag: null,
        profile_visibility_key_version: null
      }]
    });
  if (includeFeedSettings) {
    query.mockImplementationOnce(async (sql: string) => {
      expect(sql).toContain("feed_hide_from_purgatory = true");
      return { rows: [] };
    });
  }
}

function buildNotificationsApp(overrides: Partial<AppConfig> = {}) {
  return buildServer({
    ...baseConfig,
    ...overrides
  }, {
    db: {
      query,
      end
    },
    rateLimiter
  });
}

beforeEach(() => {
  query.mockReset();
  deliveryVisibilityQuery.mockReset().mockResolvedValue({ rows: [{ id: notificationId }] });
  end.mockClear();
  rateLimiter.reset?.();
  sendNotification.mockReset();
  setVapidDetails.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notification service", () => {
  it("creates a durable notification record", async () => {
    query.mockResolvedValueOnce({ rows: [notificationRow()] });

    const notification = await createAppNotification({
      config: baseConfig,
      db: { query: notificationDbQuery, end },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      userId: recipientUserId,
      actorUserId,
      type: "direct_message",
      title: "Alex sent you a message",
      body: "Open cruush to reply.",
      linkUrl: "/messages",
      conversationId,
      dedupeKey: `message:${notificationId}:${recipientUserId}`,
      metadata: { conversationKind: "dm" }
    });

    expect(notification).toEqual({
      id: notificationId,
      userId: recipientUserId,
      type: "direct_message",
      title: "Alex sent you a message",
      body: "Open cruush to reply.",
      linkUrl: "/messages",
      actorUserId,
      conversationId,
      metadata: { conversationKind: "dm" },
      readAt: null,
      createdAt: "2026-07-08T12:00:00.000Z"
    });
    expect(query.mock.calls[0]?.[0]).toContain("insert into app_notifications");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing");
    expect(query.mock.calls[0]?.[1]).toEqual([
      recipientUserId,
      "direct_message",
      "Alex sent you a message",
      "Open cruush to reply.",
      "/messages",
      actorUserId,
      conversationId,
      `message:${notificationId}:${recipientUserId}`,
      { conversationKind: "dm" }
    ]);
  });

  it("does not push when a dedupe key already exists", async () => {
    queueVisibleActivitySource();
    query.mockResolvedValueOnce({ rows: [] });

    await expect(createAppNotificationAndPush({
      config: {
        ...baseConfig,
        WEB_PUSH_ENABLED: true,
        WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
        WEB_PUSH_VAPID_PRIVATE_KEY: "private-key"
      },
      db: { query: notificationDbQuery, end },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      userId: recipientUserId,
      type: "nearby_activity",
      title: "Someone nearby",
      body: "Someone within your radar may be in your area.",
      linkUrl: "/map?layer=nearby",
      dedupeKey: `nearby:${recipientUserId}:495192`,
      metadata: { sourceUserId: actorUserId }
    })).resolves.toBeNull();

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[2]?.[0]).toContain("from profiles");
    expect(query.mock.calls[2]?.[1]).toEqual([[actorUserId]]);
    expect(query.mock.calls[3]?.[0]).toContain("insert into app_notifications");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not create a notification for the actor", async () => {
    const notification = await createAppNotification({
      config: baseConfig,
      db: { query: notificationDbQuery, end },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      userId: actorUserId,
      actorUserId,
      type: "incoming_cruush",
      title: "You got a cruush",
      body: "Someone sent you a cruush.",
      linkUrl: "/cruush",
      dedupeKey: `cruush:1:${actorUserId}`
    });

    expect(notification).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([false, true])("does not dispatch a newly hidden source while preserving its queued row (deferred=%s)", async deferPush => {
    query.mockResolvedValueOnce({ rows: [notificationRow()] });
    deliveryVisibilityQuery.mockResolvedValueOnce({ rows: [] });
    const result = await createAppNotificationAndPush({
      config: baseConfig, db: { query: notificationDbQuery, end }, log: { warn: vi.fn() }
    } as never, { userId: recipientUserId, actorUserId, type: "direct_message", title: "Activity", deferPush });
    expect(result?.id).toBe(notificationId);
    await vi.waitFor(() => expect(deliveryVisibilityQuery).toHaveBeenCalledTimes(1));
    expect(deliveryVisibilityQuery.mock.calls[0][0]).toContain("account_status = 'banned'");
    expect(deliveryVisibilityQuery.mock.calls[0][1]).toEqual([notificationId, recipientUserId]);
    expect(sendNotification).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("keeps the saved notification when push delivery fails and prunes expired subscriptions", async () => {
    const warn = vi.fn();
    query
      .mockResolvedValueOnce({ rows: [notificationRow({ title: "Alex sent you a private message" })] })
      .mockResolvedValueOnce({ rows: [{ push_enabled: true, messages_enabled: true, cruush_enabled: true, groups_enabled: true }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "push-sub-1",
          endpoint: "https://push.example/sub",
          p256dh: "p256dh-key",
          auth: "auth-key"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));

    await expect(createAppNotificationAndPush({
      config: {
        ...baseConfig,
        WEB_PUSH_ENABLED: true,
        WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
        WEB_PUSH_VAPID_PRIVATE_KEY: "private-key"
      },
      db: { query: notificationDbQuery, end },
      log: { warn, error: vi.fn(), info: vi.fn() }
    } as never, {
      userId: recipientUserId,
      actorUserId,
      type: "direct_message",
      title: "Alex sent you a private message",
      body: "Open cruush to reply.",
      linkUrl: "/messages",
      conversationId,
      dedupeKey: `message:${notificationId}:${recipientUserId}`
    })).resolves.toMatchObject({
      id: notificationId,
      title: "Alex sent you a private message"
    });

    const pushPayload = JSON.parse(sendNotification.mock.calls[0]?.[1] as string);
    expect(pushPayload.title).toBe("New message");
    expect(pushPayload.body).toBe("Open cruush to check it.");
    expect(JSON.stringify(pushPayload)).not.toContain("Alex");
    expect(query.mock.calls[3]?.[0]).toContain("revoked_at = now()");
    expect(warn).toHaveBeenCalled();
  });

  it("returns a deferred notification before push-network delivery settles", async () => {
    let finishPush: (() => void) | undefined;
    const pendingPush = new Promise<void>((resolve) => {
      finishPush = resolve;
    });
    query
      .mockResolvedValueOnce({ rows: [notificationRow()] })
      .mockResolvedValueOnce({
        rows: [{
          push_enabled: true,
          messages_enabled: true,
          cruush_enabled: true,
          groups_enabled: true
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "push-sub-1",
          endpoint: "https://push.example/sub",
          p256dh: "p256dh-key",
          auth: "auth-key"
        }]
      });
    sendNotification.mockReturnValueOnce(pendingPush);

    const notification = await createAppNotificationAndPush({
      config: {
        ...baseConfig,
        WEB_PUSH_ENABLED: true,
        WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
        WEB_PUSH_VAPID_PRIVATE_KEY: "private-key"
      },
      db: { query: notificationDbQuery, end },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      userId: recipientUserId,
      actorUserId,
      type: "direct_message",
      title: "Alex sent you a message",
      body: "Open cruush to reply.",
      linkUrl: "/messages",
      conversationId,
      dedupeKey: `message:${notificationId}:${recipientUserId}`,
      deferPush: true
    });

    expect(notification).toMatchObject({ id: notificationId });
    await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1));
    finishPush?.();
    await pendingPush;
  });

  it("uses generic nearby copy for nearby activity pushes", async () => {
    queueVisibleActivitySource();
    query
      .mockResolvedValueOnce({
        rows: [notificationRow({
          type: "nearby_activity",
          title: "Someone nearby",
          body: "Someone within your radar may be in your area.",
          link_url: "/map?layer=nearby"
        })]
      });
    queueVisibleActivitySource();
    query
      .mockResolvedValueOnce({
        rows: [{
          push_enabled: true,
          cruush_enabled: true,
          messages_enabled: true,
          groups_enabled: true
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "push-sub-1",
          endpoint: "https://push.example/sub",
          p256dh: "p256dh-key",
          auth: "auth-key"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(createAppNotificationAndPush({
      config: {
        ...baseConfig,
        WEB_PUSH_ENABLED: true,
        WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
        WEB_PUSH_VAPID_PRIVATE_KEY: "private-key"
      },
      db: { query: notificationDbQuery, end },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      userId: recipientUserId,
      type: "nearby_activity",
      title: "Someone nearby",
      body: "Someone within your radar may be in your area.",
      linkUrl: "/map?layer=nearby",
      dedupeKey: `nearby:${notificationId}:${recipientUserId}`,
      metadata: {
        sourceUserId: actorUserId
      }
    })).resolves.toMatchObject({
      id: notificationId,
      type: "nearby_activity"
    });

    const pushPayload = JSON.parse(sendNotification.mock.calls[0]?.[1] as string);
    expect(pushPayload.title).toBe("Someone nearby");
    expect(pushPayload.body).toBe("Someone within your radar may be in your area.");
    expect(JSON.stringify(pushPayload)).not.toContain("Alex");
    expect(JSON.stringify(pushPayload)).not.toContain(actorUserId);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("from profiles"))).toHaveLength(2);
  });

  it("uses generic Feed copy for nearby post pushes", async () => {
    queueVisibleActivitySource(true);
    query
      .mockResolvedValueOnce({
        rows: [notificationRow({
          type: "nearby_feed_post",
          title: "New Feed post nearby",
          body: "Open Feed to see what’s happening in your area.",
          link_url: "/feed?view=nearby#latest"
        })]
      });
    queueVisibleActivitySource(true);
    query
      .mockResolvedValueOnce({
        rows: [{
          push_enabled: true,
          cruush_enabled: true,
          messages_enabled: true,
          groups_enabled: true,
          nearby_enabled: true,
          rewards_enabled: true,
          sound_enabled: true
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "push-sub-1",
          endpoint: "https://push.example/sub",
          p256dh: "p256dh-key",
          auth: "auth-key"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });
    sendNotification.mockResolvedValueOnce(undefined);

    await createAppNotificationAndPush({
      config: {
        ...baseConfig,
        WEB_PUSH_ENABLED: true,
        WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
        WEB_PUSH_VAPID_PRIVATE_KEY: "private-key"
      },
      db: { query: notificationDbQuery, end },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      userId: recipientUserId,
      type: "nearby_feed_post",
      title: "Alex posted nearby",
      body: "Sensitive post text",
      linkUrl: "/feed?view=nearby#latest",
      dedupeKey: `nearby-feed-post:${notificationId}:${recipientUserId}`,
      metadata: { sourceUserId: actorUserId }
    });

    const pushPayload = JSON.parse(sendNotification.mock.calls[0]?.[1] as string);
    expect(pushPayload.title).toBe("New Confessional post nearby");
    expect(pushPayload.body).toBe("Open Confessional to see what’s happening in your area.");
    expect(pushPayload.url).toBe("/feed?view=nearby#latest");
    expect(JSON.stringify(pushPayload)).not.toContain("Alex");
    expect(JSON.stringify(pushPayload)).not.toContain("Sensitive post text");
    expect(JSON.stringify(pushPayload)).not.toContain(actorUserId);
  });

  it("uses generic reward copy instead of labeling reward pushes as messages", async () => {
    query
      .mockResolvedValueOnce({
        rows: [notificationRow({
          type: "reward",
          title: "cruush+ reward earned",
          body: "7 promotional days of cruush+ added.",
          link_url: "/rewards"
        })]
      })
      .mockResolvedValueOnce({
        rows: [{
          push_enabled: true,
          cruush_enabled: true,
          messages_enabled: true,
          groups_enabled: true,
          nearby_enabled: true,
          rewards_enabled: true,
          sound_enabled: true
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "push-sub-1",
          endpoint: "https://push.example/sub",
          p256dh: "p256dh-key",
          auth: "auth-key"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });
    sendNotification.mockResolvedValueOnce(undefined);

    await createAppNotificationAndPush({
      config: {
        ...baseConfig,
        WEB_PUSH_ENABLED: true,
        WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
        WEB_PUSH_VAPID_PRIVATE_KEY: "private-key"
      },
      db: { query: notificationDbQuery, end },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      userId: recipientUserId,
      type: "reward",
      title: "cruush+ reward earned",
      body: "7 promotional days of cruush+ added.",
      linkUrl: "/rewards",
      dedupeKey: `reward:${notificationId}:${recipientUserId}`
    });

    const pushPayload = JSON.parse(sendNotification.mock.calls[0]?.[1] as string);
    expect(pushPayload.title).toBe("cruush+ reward earned");
    expect(pushPayload.body).toBe("Open cruush to view it.");
    expect(pushPayload.url).toBe("/rewards");
    expect(JSON.stringify(pushPayload)).not.toContain("7 promotional days");
  });

  it.each([
    ["nearby_activity", "nearby_enabled"],
    ["nearby_feed_post", "nearby_enabled"],
    ["reward", "rewards_enabled"]
  ] as const)("does not query push subscriptions when %s alerts are disabled", async (type, disabledColumn) => {
    if (type !== "reward") queueVisibleActivitySource(type === "nearby_feed_post");
    query
      .mockResolvedValueOnce({
        rows: [notificationRow({
          type,
          title: "Update",
          body: "Open cruush to check it.",
          link_url: type === "reward" ? "/rewards" : "/map?layer=nearby"
        })]
      });
    if (type !== "reward") queueVisibleActivitySource(type === "nearby_feed_post");
    query
      .mockResolvedValueOnce({
        rows: [{
          push_enabled: true,
          cruush_enabled: true,
          messages_enabled: true,
          groups_enabled: true,
          nearby_enabled: disabledColumn === "nearby_enabled" ? false : true,
          rewards_enabled: disabledColumn === "rewards_enabled" ? false : true,
          sound_enabled: true
        }]
      });

    await createAppNotificationAndPush({
      config: {
        ...baseConfig,
        WEB_PUSH_ENABLED: true,
        WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
        WEB_PUSH_VAPID_PRIVATE_KEY: "private-key"
      },
      db: { query: notificationDbQuery, end },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      userId: recipientUserId,
      type,
      title: "Update",
      linkUrl: type === "reward" ? "/rewards" : "/map?layer=nearby",
      ...(type !== "reward" ? { metadata: { sourceUserId: actorUserId } } : {})
    });

    expect(query).toHaveBeenCalledTimes(type === "reward" ? 2 : type === "nearby_feed_post" ? 10 : 8);
    expect(query.mock.calls.at(-1)?.[0]).toContain("from notification_preferences");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("from push_subscriptions"))).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("notification routes", () => {
  it.each([false, true])("background subscription refresh preserves push preference %s", async (pushEnabled) => {
    const app = buildNotificationsApp();
    query.mockResolvedValueOnce({ rows: [{ push_enabled: pushEnabled, sound_enabled: false }] });
    const response = await app.inject({
      method: "POST",
      url: "/api/push/subscriptions/refresh",
      headers: { "x-user-id": recipientUserId, "user-agent": "vitest" },
      payload: { endpoint: "https://push.example/sub", keys: { p256dh: "key", auth: "auth" } }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ pushEnabled, soundEnabled: false });
    expect(query.mock.calls[0]?.[1]).toEqual([recipientUserId, "https://push.example/sub", "key", "auth", "vitest"]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("rejects an unsafe endpoint on background refresh without a database write", async () => {
    const app = buildNotificationsApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/push/subscriptions/refresh",
      headers: { "x-user-id": recipientUserId },
      payload: { endpoint: "http://localhost/private", keys: { p256dh: "key", auth: "auth" } }
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("requires authentication for background subscription refresh", async () => {
    const app = buildNotificationsApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/push/subscriptions/refresh",
      payload: { endpoint: "https://push.example/sub", keys: { p256dh: "key", auth: "auth" } }
    });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("returns notifications and a next cursor", async () => {
    const app = buildNotificationsApp();
    query.mockResolvedValueOnce({ rows: [notificationRow()] });

    const response = await app.inject({
      method: "GET",
      url: "/api/notifications?limit=1",
      headers: {
        "x-user-id": recipientUserId
      }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        notifications: [{
          id: notificationId,
          userId: recipientUserId,
          type: "direct_message",
          title: "Alex sent you a message",
          body: "Open cruush to reply.",
          linkUrl: "/messages",
          actorUserId,
          conversationId,
          metadata: { conversationKind: "dm" },
          readAt: null,
          createdAt: "2026-07-08T12:00:00.000Z"
        }],
        nextCursor: `2026-07-08T12:00:00.000Z|${notificationId}`
      }
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("order by notification.created_at desc, notification.id desc");
  }, 10000);

  it("returns unread summary and marks all notifications read", async () => {
    const app = buildNotificationsApp();
    query
      .mockResolvedValueOnce({ rows: [{ unread_count: 3 }] })
      .mockResolvedValueOnce({ rows: [] }) // encrypted_location_envelopes
      .mockResolvedValueOnce({ rows: [] }) // user_travel_pins
      .mockResolvedValueOnce({ rows: [] }) // no profile-activity notifications to hide
      .mockResolvedValueOnce({ rows: [{ unread_count: 0 }] });

    const summary = await app.inject({
      method: "GET",
      url: "/api/notifications/summary",
      headers: {
        "x-user-id": recipientUserId
      }
    });
    const readAll = await app.inject({
      method: "POST",
      url: "/api/notifications/read-all",
      headers: {
        "x-user-id": recipientUserId
      }
    });
    await app.close();

    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toEqual({ data: { unreadCount: 3 } });
    expect(readAll.statusCode).toBe(200);
    expect(readAll.json()).toEqual({ data: { unreadCount: 0 } });
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[3]?.[0]).toContain("notification.type = any($2::text[])");
    expect(query.mock.calls[4]?.[0]).toContain("update app_notifications");
    expect(query.mock.calls[4]?.[0]).toContain("read_at = now()");
  }, 10000);

  it("clears all notifications for the current user", async () => {
    const app = buildNotificationsApp();
    query.mockResolvedValueOnce({ rowCount: 2 });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/notifications",
      headers: {
        "x-user-id": recipientUserId
      }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { unreadCount: 0 } });
    expect(query.mock.calls[0]?.[0]).toContain("delete from app_notifications");
    expect(query.mock.calls[0]?.[1]).toEqual([recipientUserId]);
  }, 10000);

  it("stores nearby and reward notification preferences", async () => {
    const app = buildNotificationsApp();
    query
      .mockResolvedValueOnce({
        rows: [{
          push_enabled: true,
          cruush_enabled: true,
          messages_enabled: true,
          groups_enabled: true,
          nearby_enabled: true,
          rewards_enabled: true,
          sound_enabled: true
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          push_enabled: true,
          cruush_enabled: true,
          messages_enabled: true,
          groups_enabled: true,
          nearby_enabled: false,
          rewards_enabled: false,
          sound_enabled: true
        }]
      });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/notification-preferences",
      headers: {
        "x-user-id": recipientUserId
      },
      payload: {
        nearbyEnabled: false,
        rewardsEnabled: false
      }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        emailEnabled: true,
        pushEnabled: true,
        cruushEnabled: true,
        messagesEnabled: true,
        groupsEnabled: true,
        nearbyEnabled: false,
        mutualFeedEnabled: true,
        rewardsEnabled: false,
        siteRemindersEnabled: true,
        pulseEnabled: true,
        soundEnabled: true,
        quietHoursEnabled: false,
        quietHoursStartMinute: 0,
        quietHoursEndMinute: 360,
        quietHoursTimezone: "UTC"
      }
    });
    expect(query.mock.calls[1]?.[0]).toContain("nearby_enabled");
    expect(query.mock.calls[1]?.[0]).toContain("rewards_enabled");
    expect(query.mock.calls[1]?.[0]).toContain("mutual_feed_enabled");
    expect(query.mock.calls[1]?.[1]).toEqual([
      recipientUserId, true, true, true, true, true, false, true,
      false, true, true, false, 0, 360, "UTC", true
    ]);
  }, 10000);

  it("upserts push subscriptions and enables push preferences", async () => {
    const app = buildNotificationsApp({
      WEB_PUSH_ENABLED: true,
      WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
      WEB_PUSH_VAPID_PRIVATE_KEY: "private-key"
    });
    query.mockResolvedValueOnce({
      rows: [{
        push_enabled: true,
        cruush_enabled: true,
        messages_enabled: true,
        groups_enabled: true,
        nearby_enabled: true,
        rewards_enabled: true,
        sound_enabled: true
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/push/subscriptions",
      headers: {
        "x-user-id": recipientUserId,
        "user-agent": "vitest"
      },
      payload: {
        endpoint: "https://push.example/sub",
        keys: {
          p256dh: "p256dh-key",
          auth: "auth-key"
        }
      }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("insert into push_subscriptions");
    expect(query.mock.calls[0]?.[0]).toContain("insert into notification_preferences");
    expect(response.json()).toEqual({
      data: {
        emailEnabled: true,
        pushEnabled: true,
        cruushEnabled: true,
        messagesEnabled: true,
        groupsEnabled: true,
        nearbyEnabled: true,
        mutualFeedEnabled: true,
        rewardsEnabled: true,
        siteRemindersEnabled: true,
        pulseEnabled: true,
        soundEnabled: true,
        quietHoursEnabled: false,
        quietHoursStartMinute: 0,
        quietHoursEndMinute: 360,
        quietHoursTimezone: "UTC"
      }
    });
  }, 10000);
});
