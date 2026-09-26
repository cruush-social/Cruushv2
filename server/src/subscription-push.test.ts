import { beforeEach, expect, it, vi } from "vitest";
import webPush from "web-push";
import { normalizePushNotificationLink, sendPushForNotification } from "./push-service.js";
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));
const notification = {
  id: "reminder", userId: "member", type: "subscription_expiring" as const,
  title: "cruush+ expires soon", body: "Your cruush+ subscription expires on Sep 23, 2026, 4:00 PM UTC.",
  linkUrl: "/store", actorUserId: null, conversationId: null, metadata: {}, readAt: null, createdAt: new Date().toISOString()
};
beforeEach(() => vi.clearAllMocks());
it.each([true, false])("uses subscription copy and obeys push opt-in=%s independently of chat categories", async (enabled) => {
  const app = {
    config: { WEB_PUSH_ENABLED: true, WEB_PUSH_SUBJECT: "mailto:test@example.invalid", WEB_PUSH_VAPID_PUBLIC_KEY: "test-public", WEB_PUSH_VAPID_PRIVATE_KEY: "test-private" },
    log: { warn: vi.fn() },
    db: { query: vi.fn(async (sql: string) => {
      if (sql.includes('from notification_preferences')) return { rows: [{ push_enabled: enabled, groups_enabled: false, rewards_enabled: false, messages_enabled: false }] };
      if (sql.includes('from push_subscriptions')) return { rows: [{ id: 'device', endpoint: 'https://example.invalid/push', p256dh: 'test', auth: 'test' }] };
      return { rows: [] };
    }) }
  } as any;
  await sendPushForNotification(app, notification);
  if (!enabled) { expect(webPush.sendNotification).not.toHaveBeenCalled(); return; }
  expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
  const args=vi.mocked(webPush.sendNotification).mock.calls[0];
  expect(JSON.parse(String(args[1]))).toMatchObject({ title: notification.title, body: notification.body, url: '/store', notificationId: 'reminder' });
  expect(args[2]).toMatchObject({ timeout: 15000 });
});

it("normalizes legacy links and rejects unsafe push destinations", () => {
  expect(normalizePushNotificationLink(" /changelog?entry=1.6#details ")).toBe("/settings/changelog?entry=1.6#details");
  expect(normalizePushNotificationLink("//example.com/store")).toBe("/notifications");
  expect(normalizePushNotificationLink("/\\example.com/store")).toBe("/notifications");
  expect(normalizePushNotificationLink("/store%0anext")).toBe("/notifications");
});
