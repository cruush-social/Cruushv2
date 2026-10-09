import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerNotificationRoutes } from "./routes/notifications.js";

const access = vi.hoisted(() => ({ getViewerOutsideServiceArea: vi.fn(), loadOosHiddenProfileIds: vi.fn() }));
vi.mock("./profile-oos-visibility.js", () => access);

const viewer = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const conversation = "33333333-3333-4333-8333-333333333333";
const rows = ["pulse", "direct_message", "group_message"].map((type, index) => ({
  id: `44444444-4444-4444-8444-44444444444${index}`,
  user_id: viewer, type, title: "Existing activity", body: "", link_url: "/messages",
  actor_user_id: actor, conversation_id: conversation, metadata: {}, read_at: null,
  created_at: `2026-10-09T12:00:0${3 - index}.000Z`, created_at_cursor: `2026-10-09T12:00:0${3 - index}.000Z`
}));

beforeEach(() => {
  vi.resetAllMocks();
  access.loadOosHiddenProfileIds.mockResolvedValue(new Set([actor]));
});

describe("group Pulse notification list and count enforcement", () => {
  it.each([false, true])("keeps ordinary chats with effective OOS %s", async (outside) => {
    access.getViewerOutsideServiceArea.mockResolvedValue(outside);
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("count(*)")) return { rows: [{ unread_count: rows.length }] };
      if (sql.includes("notification.type = any")) return { rows: [rows[0]] };
      const [, limit, cursorTime] = params as [string, number, string | null];
      return { rows: rows.filter((row) => !cursorTime || row.created_at_cursor < cursorTime).slice(0, limit) };
    });
    const app = Fastify({ logger: false });
    app.decorate("config", { NODE_ENV: "test" } as never);
    app.decorate("db", { query, end: vi.fn() } as never);
    registerNotificationRoutes(app);
    try {
      const list = await app.inject({ method: "GET", url: "/api/notifications?limit=1", headers: { "x-user-id": viewer } });
      expect(list.statusCode).toBe(200);
      expect(list.json().data.notifications.map((row: { type: string }) => row.type))
        .toEqual([outside ? "direct_message" : "pulse"]);
      const next = await app.inject({
        method: "GET", url: `/api/notifications?limit=10&cursor=${encodeURIComponent(list.json().data.nextCursor)}`,
        headers: { "x-user-id": viewer }
      });
      expect(next.statusCode).toBe(200);
      expect(next.json().data.notifications.map((row: { type: string }) => row.type))
        .toEqual(outside ? ["group_message"] : ["direct_message", "group_message"]);
      const summary = await app.inject({ method: "GET", url: "/api/notifications/summary", headers: { "x-user-id": viewer } });
      expect(summary.statusCode).toBe(200);
      expect(summary.json().data).toEqual({ unreadCount: outside ? 2 : 3 });
      // Existing chat notifications are not made dependent on their sender's profile VC.
      expect(access.loadOosHiddenProfileIds).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
