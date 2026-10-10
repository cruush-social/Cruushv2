import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { formatError, toApiError } from "./errors.js";
import { registerPostRoutes } from "./routes/posts.js";
import { loadFeedHiddenAuthorIds } from "./feed-visibility.js";
import { hasPremiumDiscoveryFilters } from "./billing.js";

const mocks = vi.hoisted(() => ({ outside: vi.fn(), hidden: vi.fn(), statuses: vi.fn(), relationship: vi.fn() }));
vi.mock("./profile-oos-visibility.js", () => ({
  getViewerOutsideServiceArea: mocks.outside, loadOosHiddenProfileIds: mocks.hidden
}));
vi.mock("./out-of-sight-location.js", async (original) => ({
  ...await original<typeof import("./out-of-sight-location.js")>(), loadOutOfSightStatuses: mocks.statuses
}));
vi.mock("./match-relationships.js", async (original) => ({
  ...await original<typeof import("./match-relationships.js")>(),
  getSharedDistanceLabelMode: vi.fn().mockResolvedValue("approximate"),
  getRelationshipPermissions: mocks.relationship
}));
vi.mock("./nsfw-photo-audience.js", async (original) => ({
  ...await original<typeof import("./nsfw-photo-audience.js")>(),
  loadPhotoViewerRelationships: vi.fn().mockResolvedValue(new Map())
}));
vi.mock("./cruush-match-settings.js", () => ({ canStartDirectMessage: vi.fn().mockResolvedValue(false) }));

const viewer = "11111111-1111-4111-8111-111111111111";
const outside = "22222222-2222-4222-8222-222222222222";
const inside = "33333333-3333-4333-8333-333333333333";
const unknown = "44444444-4444-4444-8444-444444444444";
const headers = { "x-user-id": viewer };
const post = (author: string, order: number, audience = "public") => ({
  id: author, user_id: author, content: "Synthetic Feed post", expires_in: "never", expires_at: "infinity",
  created_at: new Date(Date.UTC(2026, 9, 9, 12, 0, 30 - order)).toISOString(),
  scan_created_at: undefined as string | undefined,
  display_name: "Synthetic member", pronouns: [], photos: [], audience, travelling: author === outside
});

describe("Feed Purgatory author filters and viewer restriction", () => {
  let app: FastifyInstance;
  const query = vi.fn();
  let posts: ReturnType<typeof post>[];
  let restricted: Set<string>;
  let hideFromPurgatory: boolean;

  beforeEach(async () => {
    vi.clearAllMocks();
    posts = [post(outside, 0), post(inside, 1), post(unknown, 2)];
    restricted = new Set();
    hideFromPurgatory = false;
    mocks.outside.mockResolvedValue(true);
    mocks.hidden.mockResolvedValue(new Set());
    mocks.relationship.mockResolvedValue({ isMutualCruush: false });
    mocks.statuses.mockResolvedValue(new Map([[outside, "out_of_sight"], [inside, "in_area"], [unknown, "unknown"]]));
    query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("from posts p")) {
        const before = values[5] as string | null;
        const beforeId = values.length > 7 ? values[6] as string | null : null;
        const limit = values[values.length - 1] as number;
        const normalized = (value: string) => value.replace(" ", "T").replace(/\+00$/, "Z");
        const timestamp = (row: ReturnType<typeof post>) => normalized(row.scan_created_at ?? row.created_at);
        const cursor = before && normalized(before);
        return { rows: [...posts].sort((a, b) => timestamp(b).localeCompare(timestamp(a)) || b.id.localeCompare(a.id))
          .filter(row => !cursor || timestamp(row) < cursor || (timestamp(row) === cursor && beforeId !== null && row.id < beforeId)).slice(0, limit) };
      }
      if (sql.includes("feed_hide_from_purgatory = true")) {
        return { rows: (values[0] as string[]).filter(id => restricted.has(id)).map(user_id => ({ user_id })) };
      }
      if (sql.includes("insert into user_privacy_settings")) {
        if (values[5] !== null) hideFromPurgatory = values[5] === true;
      }
      if (sql.includes("user_privacy_settings")) return { rows: [{
        feed_location_pin_visibility: "mutuals", feed_show_distance_labels: true,
        feed_post_expiry_default: "never", feed_window_default: "7d", feed_hide_from_purgatory: hideFromPurgatory
      }] };
      return { rows: [] };
    });
    app = Fastify({ logger: false });
    app.decorate("config", { NODE_ENV: "test" } as AppConfig);
    app.decorate("db", { query, end: vi.fn() });
    app.setErrorHandler((error, _request, reply) => {
      const apiError = toApiError(error);
      return reply.code(apiError.statusCode).send(formatError(apiError));
    });
    await registerPostRoutes(app);
  });
  afterEach(async () => { await app.close(); });
  const get = (url: string) => app.inject({ method: "GET", url, headers });

  it("keeps all author classes with filters off", async () => {
    const result = await get("/api/posts");
    expect(result.statusCode).toBe(200);
    expect(result.json().data.map((row: { id: string }) => row.id)).toEqual([outside, inside, unknown]);
  });
  it("counts include-only as one existing seeking category without charging for privacy exclusions", () => {
    expect(hasPremiumDiscoveryFilters({ identities: ["one"], vibes: ["two"], purgatoryMembers: true })).toBe(false);
    expect(hasPremiumDiscoveryFilters({ identities: ["one"], vibes: ["two"], mileHighClub: true, purgatoryMembers: true })).toBe(true);
    expect(hasPremiumDiscoveryFilters({ identities: ["one"], vibes: ["two"], mileHighClub: true, excludePurgatoryMembers: true })).toBe(false);
  });
  it.each([
    ["purgatoryMembers", outside], ["excludePurgatoryMembers", inside]
  ])("applies %s from authoritative membership, excluding unknown classification", async (flag, expected) => {
    const result = await get("/api/posts?" + flag + "=1");
    expect(result.statusCode).toBe(200);
    expect(result.json().data.map((row: { id: string }) => row.id)).toEqual([expected]);
  });
  it("does not turn physical Purgatory membership off for an author using MHC", async () => {
    const result = await get("/api/posts?purgatoryMembers=1");
    expect(result.json().data[0].user).toMatchObject({ outOfSight: true, travelling: true });
  });
  it("rejects conflicting author filters", async () => {
    expect((await get("/api/posts?purgatoryMembers=1&excludePurgatoryMembers=1")).statusCode).toBe(400);
  });
  it("scans past filtered pages to fill the requested visible page", async () => {
    const result = await get("/api/posts?excludePurgatoryMembers=1&limit=1");
    expect(result.json().data.map((row: { id: string }) => row.id)).toEqual([inside]);
    expect(query.mock.calls.filter(call => call[0].includes("from posts p"))).toHaveLength(2);
  });
  it("does not drop a matching post sharing a timestamp with a filtered row", async () => {
    posts = [post(unknown, 0), post(inside, 0)];
    const result = await get("/api/posts?excludePurgatoryMembers=1&limit=1");
    expect(result.json().data.map((row: { id: string }) => row.id)).toEqual([inside]);
  });
  it("preserves PostgreSQL timestamp microseconds across filtered scan batches", async () => {
    posts = [post(unknown, 0), post(inside, 0)].map(row => ({
      ...row, created_at: "2026-10-09T12:00:30.123Z", scan_created_at: "2026-10-09 12:00:30.123456+00"
    }));
    const result = await get("/api/posts?excludePurgatoryMembers=1&limit=1");
    expect(result.json().data.map((row: { id: string }) => row.id)).toEqual([inside]);
    const scans = query.mock.calls.filter(call => call[0].includes("from posts p"));
    expect(scans[0][0]).toContain("p.created_at::text as scan_created_at");
    expect(scans[1][1][5]).toBe("2026-10-09 12:00:30.123456+00");
    expect(scans[1][1][6]).toBe(unknown);
  });
  it("intersects author filters with existing profile visibility and mutual audiences", async () => {
    mocks.hidden.mockResolvedValue(new Set([outside]));
    expect((await get("/api/posts?purgatoryMembers=1")).json().data).toEqual([]);
    mocks.hidden.mockResolvedValue(new Set());
    posts[0].audience = "mutuals";
    expect((await get("/api/posts?purgatoryMembers=1")).json().data).toEqual([]);
    mocks.relationship.mockResolvedValue({ isMutualCruush: true });
    expect((await get("/api/posts?purgatoryMembers=1")).json().data).toHaveLength(1);
    const sql = query.mock.calls.find(call => call[0].includes("from posts p"))![0];
    expect(sql).toContain("user_blocks");
    expect(sql).toContain("feed_post_crowd_targets");
  });
  it("hides only opted-in authors from Purgatory viewers, including mutual posts", async () => {
    restricted.add(outside);
    posts[0].audience = "mutuals";
    mocks.relationship.mockResolvedValue({ isMutualCruush: true });
    expect((await get("/api/posts")).json().data.map((row: { id: string }) => row.id)).toEqual([inside, unknown]);
  });
  it("retains effective in-area access including the existing MHC exception", async () => {
    restricted.add(outside);
    mocks.outside.mockResolvedValue(false);
    expect((await get("/api/posts")).json().data).toHaveLength(3);
  });
  it("does not hide an author's own posts or resolve location without opted-in targets", async () => {
    restricted.add(viewer);
    expect(await loadFeedHiddenAuthorIds(app, viewer, [viewer])).toEqual(new Set());
    expect(await loadFeedHiddenAuthorIds(app, viewer, [inside])).toEqual(new Set());
    expect(mocks.outside).not.toHaveBeenCalled();
  });
  it("persists the Feed-only preference, and an older client's omitted field preserves it", async () => {
    expect((await get("/api/feed/settings")).json().data.hideFromPurgatory).toBe(false);
    const change = (payload: Record<string, unknown>) => app.inject({ method: "PUT", url: "/api/feed/settings", headers, payload });
    expect((await change({ locationPinVisibility: "mutuals", hideFromPurgatory: true })).json().data.hideFromPurgatory).toBe(true);
    expect((await get("/api/feed/settings")).json().data.hideFromPurgatory).toBe(true);
    expect((await change({ locationPinVisibility: "mutuals" })).json().data.hideFromPurgatory).toBe(true);
    expect((await change({ locationPinVisibility: "mutuals", hideFromPurgatory: false })).json().data.hideFromPurgatory).toBe(false);
  });
});
