import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "./db.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { filterOosHiddenNotifications } from "./oos-notification-visibility.js";

vi.mock("./oos-notification-visibility.js", () => ({ filterOosHiddenNotifications: vi.fn() }));

const viewer = "00000000-0000-4000-8000-000000000001";
const hiddenId = "00000000-0000-4000-8000-000000000013";
const visibleId = "00000000-0000-4000-8000-000000000012";
const chatId = "00000000-0000-4000-8000-000000000011";
const sharedTime = "2026-10-09T12:00:00.123456Z";
const olderTime = "2026-10-09T11:00:00.000000Z";

function row(id: string, time: string, type = "incoming_cruush") {
  return {
    id,
    user_id: viewer,
    type,
    title: type === "direct_message" ? "Message" : "Activity",
    body: "",
    link_url: type === "direct_message" ? "/messages" : "/cruush",
    actor_user_id: id,
    conversation_id: type === "direct_message" ? id : null,
    metadata: {},
    read_at: null,
    created_at: time,
    created_at_cursor: time
  };
}

function buildApp() {
  const rows = [row(hiddenId, sharedTime), row(visibleId, sharedTime), row(chatId, olderTime, "direct_message")];
  const query = vi.fn(async (_sql: string, params: unknown[]) => {
    const [, limit, cursorTime, cursorId] = params as [string, number, string | null, string | null];
    return {
      rows: rows.filter((item) => !cursorTime || item.created_at_cursor < cursorTime
        || (cursorId !== null && item.created_at_cursor === cursorTime && item.id < cursorId))
        .slice(0, limit)
    };
  });
  const app = Fastify({ logger: false });
  app.decorate("config", { NODE_ENV: "test" } as never);
  app.decorate("db", { query: query as unknown as DbClient["query"], end: vi.fn() });
  registerNotificationRoutes(app);
  return { app, query };
}

afterEach(() => vi.mocked(filterOosHiddenNotifications).mockReset());

describe("notification visibility pagination", () => {
  it("does not lose a visible row tied with a hidden row, and carries the composite cursor to chat history", async () => {
    vi.mocked(filterOosHiddenNotifications).mockImplementation(async (_app, _viewer, rows) =>
      rows.filter((item) => !("id" in item) || item.id !== hiddenId));
    const { app, query } = buildApp();
    try {
      const first = await app.inject({ method: "GET", url: "/api/notifications?limit=1", headers: { "x-user-id": viewer } });
      expect(first.statusCode).toBe(200);
      expect(first.json().data.notifications.map((item: { id: string }) => item.id)).toEqual([visibleId]);
      expect(first.json().data.nextCursor).toBe(`${sharedTime}|${visibleId}`);
      expect(query).toHaveBeenCalledTimes(2);

      const second = await app.inject({ method: "GET", url: `/api/notifications?limit=1&cursor=${encodeURIComponent(first.json().data.nextCursor)}`, headers: { "x-user-id": viewer } });
      expect(second.statusCode).toBe(200);
      expect(second.json().data.notifications.map((item: { id: string; type: string }) => [item.id, item.type]))
        .toEqual([[chatId, "direct_message"]]);
    } finally {
      await app.close();
    }
  }, 20_000);

  it("accepts legacy ISO cursors and rejects malformed composites", async () => {
    vi.mocked(filterOosHiddenNotifications).mockImplementation(async (_app, _viewer, rows) => rows);
    const { app } = buildApp();
    try {
      const legacy = await app.inject({ method: "GET", url: `/api/notifications?limit=1&cursor=${encodeURIComponent(sharedTime)}`, headers: { "x-user-id": viewer } });
      expect(legacy.statusCode).toBe(200);
      expect(legacy.json().data.notifications.map((item: { id: string }) => item.id)).toEqual([chatId]);
      const invalid = await app.inject({ method: "GET", url: `/api/notifications?cursor=${encodeURIComponent(`${sharedTime}|not-a-uuid`)}`, headers: { "x-user-id": viewer } });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
