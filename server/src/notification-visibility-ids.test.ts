import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { filterOosHiddenNotifications } from "./oos-notification-visibility.js";
vi.mock("./oos-notification-visibility.js", () => ({ filterOosHiddenNotifications: vi.fn() }));
const viewer = "00000000-0000-4000-8000-000000000001";
const visible = "00000000-0000-4000-8000-000000000002";
const hidden = "00000000-0000-4000-8000-000000000003";

describe("live popup visibility validator", () => {
  it("returns only visible requested IDs, with ownership/ban checks and no title or identity payload", async () => {
    const app = Fastify();
    const query = vi.fn().mockResolvedValue({ rows: [{ id: visible, title: "private" }, { id: hidden }] });
    app.decorate("config", { NODE_ENV: "test" } as never);
    app.decorate("db", { query, end: vi.fn() });
    vi.mocked(filterOosHiddenNotifications).mockImplementation(async (_app, _viewer, rows) => rows.filter(row => (row as { id?: string }).id !== hidden));
    registerNotificationRoutes(app);
    try {
      const response = await app.inject({ url: `/api/notifications/visible-ids?ids=${visible},${hidden},${visible}`, headers: { "x-user-id": viewer } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: { ids: [visible] } });
      expect(response.headers["cache-control"]).toBe("private, no-store");
      const [sql, values] = query.mock.calls[0];
      expect(sql).toContain("notification.user_id = $1 and notification.id = any($2::uuid[])");
      expect(sql).toContain("account_status = 'banned'");
      expect(sql).not.toMatch(/limit|offset/i);
      expect(values).toEqual([viewer, [visible, hidden]]);
      for (const ids of ["not-an-id", Array(51).fill(visible).join(",")]) {
        expect((await app.inject({ url: `/api/notifications/visible-ids?ids=${ids}`, headers: { "x-user-id": viewer } })).statusCode).toBe(400);
      }
      expect(query).toHaveBeenCalledTimes(1);
    } finally { await app.close(); }
  });
});
