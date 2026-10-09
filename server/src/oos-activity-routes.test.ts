import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPostRoutes } from "./routes/posts.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { createAppNotification, getNotificationSummary } from "./notification-service.js";

const mocks = vi.hoisted(() => ({ outside: vi.fn(), hidden: vi.fn() }));
vi.mock("./profile-oos-visibility.js", () => ({
  getViewerOutsideServiceArea: mocks.outside,
  loadOosHiddenProfileIds: mocks.hidden
}));
vi.mock("./out-of-sight-location.js", async (original) => ({
  ...await original<typeof import("./out-of-sight-location.js")>(),
  loadOutOfSightStatuses: vi.fn().mockResolvedValue(new Map())
}));
vi.mock("./nsfw-photo-audience.js", async (original) => ({
  ...await original<typeof import("./nsfw-photo-audience.js")>(),
  loadPhotoViewerRelationships: vi.fn().mockResolvedValue(new Map())
}));
vi.mock("./match-relationships.js", async (original) => ({
  ...await original<typeof import("./match-relationships.js")>(),
  getSharedDistanceLabelMode: vi.fn().mockResolvedValue("approximate"),
  getRelationshipPermissions: vi.fn().mockResolvedValue({ isMutualCruush: true })
}));
vi.mock("./cruush-match-settings.js", async (original) => ({
  ...await original<typeof import("./cruush-match-settings.js")>(),
  canStartDirectMessage: vi.fn().mockResolvedValue(true)
}));

const viewer = "11111111-1111-4111-8111-111111111111";
const hidden = "22222222-2222-4222-8222-222222222222";
const visible = "33333333-3333-4333-8333-333333333333";
const query = vi.fn();
let app: FastifyInstance;
function notification(type = "incoming_cruush", actor = hidden, time = "2026-10-09T10:00:00Z") {
  return { id: actor, user_id: viewer, type, title: "Activity", body: "", link_url: "/cruushes",
    actor_user_id: actor, conversation_id: null, metadata: {}, read_at: null, created_at: time };
}
function post(author = hidden, time = "2026-10-09T10:00:00Z") {
  return { id: author, user_id: author, content: "Feed content", audience: "mutuals", expires_in: "never",
    created_at: time, display_name: "Member", pronouns: [], photos: [], has_live_location: false };
}
beforeEach(async () => {
  vi.clearAllMocks();
  query.mockReset();
  mocks.outside.mockResolvedValue(true);
  mocks.hidden.mockResolvedValue(new Set([hidden]));
  app = Fastify({ logger: false });
  app.decorate("config", { NODE_ENV: "test" } as never);
  app.decorate("db", { query, end: vi.fn() });
  await registerPostRoutes(app);
  registerNotificationRoutes(app);
});
afterEach(async () => { await app.close(); });

describe("Out of Sight profile/activity boundaries", () => {
  it("filters mutual Feed posts before filling the visible page", async () => {
    query.mockResolvedValueOnce({ rows: [post()] }).mockResolvedValueOnce({ rows: [post(visible, "2026-10-09T09:00:00Z")] });
    const response = await app.inject({ method: "GET", url: "/api/posts?limit=1", headers: { "x-user-id": viewer } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((item: { user: { id: string } }) => item.user.id)).toEqual([visible]);
    expect(JSON.stringify(response.json())).not.toContain(hidden);
    expect(mocks.hidden.mock.calls.map((call) => call.slice(1))).toContainEqual([viewer, [hidden], true]);
    expect(query.mock.calls[1][1][5]).toBe("2026-10-09T10:00:00.000Z");
  });

  it("fills notification pages without returning hidden actors or their timestamps", async () => {
    query.mockResolvedValueOnce({ rows: [notification()] })
      .mockResolvedValueOnce({ rows: [notification("incoming_cruush", visible, "2026-10-09T09:00:00Z")] });
    const response = await app.inject({ method: "GET", url: "/api/notifications?limit=1", headers: { "x-user-id": viewer } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.notifications.map((item: { actorUserId: string }) => item.actorUserId)).toEqual([visible]);
    expect(response.json().data.nextCursor).toBe(`2026-10-09T09:00:00.000Z|${visible}`);
    expect(JSON.stringify(response.json())).not.toContain(hidden);
  });

  it("removes hidden profile activity from unread counts without removing chat counts", async () => {
    query.mockResolvedValueOnce({ rows: [{ unread_count: 4 }] })
      .mockResolvedValueOnce({ rows: [notification(), notification("incoming_cruush", visible)] });
    expect(await getNotificationSummary(app, viewer)).toEqual({ unreadCount: 3 });
  });

  it("does not persist or deliver newly hidden profile activity", async () => {
    expect(await createAppNotification(app, { userId: viewer, actorUserId: hidden, type: "incoming_cruush", title: "Activity" })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps existing chat notifications without checking the profile hiding rule", async () => {
    query.mockResolvedValueOnce({ rows: [notification("direct_message")] });
    const result = await createAppNotification(app, { userId: viewer, actorUserId: hidden, type: "direct_message", title: "Message" });
    expect(result?.type).toBe("direct_message");
    expect(mocks.hidden).not.toHaveBeenCalled();
    expect(mocks.outside).not.toHaveBeenCalled();
  });
});
