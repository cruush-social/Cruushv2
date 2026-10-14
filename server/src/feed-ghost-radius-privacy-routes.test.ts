import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { formatError, toApiError } from "./errors.js";
import { GhostLandUnavailableError } from "./ghost-land.js";
import type { LocationPayload, VisibilityPolicyPayload } from "./location-privacy.js";
import { registerPostRoutes } from "./routes/posts.js";

const mocks = vi.hoisted(() => ({
  locations: vi.fn(), policy: vi.fn(), ghost: vi.fn(), relationship: vi.fn(),
  outside: vi.fn(), hidden: vi.fn(), statuses: vi.fn()
}));
vi.mock("./location-privacy.js", async original => ({
  ...await original<typeof import("./location-privacy.js")>(),
  loadLocationEnvelopes: mocks.locations,
  resolveViewerGhostCoordinate: mocks.ghost
}));
vi.mock("./match-relationships.js", async original => ({
  ...await original<typeof import("./match-relationships.js")>(),
  getEffectiveVisibilityPolicy: mocks.policy,
  getRelationshipPermissions: mocks.relationship,
  getSharedDistanceLabelMode: vi.fn().mockResolvedValue("approximate")
}));
vi.mock("./profile-oos-visibility.js", () => ({
  getViewerOutsideServiceArea: mocks.outside,
  loadOosHiddenProfileIds: mocks.hidden
}));
vi.mock("./out-of-sight-location.js", async original => ({
  ...await original<typeof import("./out-of-sight-location.js")>(),
  loadOutOfSightStatuses: mocks.statuses
}));
vi.mock("./nsfw-photo-audience.js", async original => ({
  ...await original<typeof import("./nsfw-photo-audience.js")>(),
  loadPhotoViewerRelationships: vi.fn().mockResolvedValue(new Map())
}));
vi.mock("./cruush-match-settings.js", () => ({ canStartDirectMessage: vi.fn().mockResolvedValue(false) }));

const viewerId = "11111111-1111-4111-8111-111111111111";
const authorId = "22222222-2222-4222-8222-222222222222";
const postId = "33333333-3333-4333-8333-333333333333";
const displayedPoint = { lat: 40.7, lng: -74 };
const createdAt = "2026-10-14T12:00:00.000Z";

describe("Feed caller radius does not disclose a private Ghost radius", () => {
  let app: FastifyInstance;
  const query = vi.fn();
  let radiusMiles: number;
  let preciseGranted: boolean;
  let mutual: boolean;
  let audience: "public" | "mutuals";
  let restricted: boolean;
  let precisePoint: { lat: number; lng: number } | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    radiusMiles = 1;
    preciseGranted = false;
    mutual = false;
    audience = "public";
    restricted = false;
    precisePoint = undefined;
    mocks.outside.mockResolvedValue(false);
    mocks.hidden.mockResolvedValue(new Set());
    mocks.statuses.mockResolvedValue(new Map());
    mocks.relationship.mockImplementation(async () => ({
      isBlocked: false, isMutualCruush: mutual, canRevealPreciseLocation: preciseGranted
    }));
    mocks.policy.mockImplementation(async () => ({
      version: 1, subjectUserId: authorId, policyVersion: 1, baseMode: "GHOST",
      ghostRadiusMeters: radiusMiles * 1609.344, preciseToMutualCruushes: preciseGranted,
      preciseToMutualCrowds: [], auditRequired: false, updatedAtMs: 1, expiresAtMs: null, keyVersion: "v1"
    } satisfies VisibilityPolicyPayload));
    mocks.locations.mockImplementation(async () => {
      // Vary the private true point with the chosen radius; the authorized decoy
      // is identical. Every fixture places it between half-radius and radius.
      const point = precisePoint ?? { lat: displayedPoint.lat + radiusMiles * 0.75 / 69.1, lng: displayedPoint.lng };
      const location: LocationPayload = {
        version: 1, subjectUserId: authorId, locationVersion: 1,
        latE7: Math.round(point.lat * 1e7), lonE7: Math.round(point.lng * 1e7),
        accuracyM: 10, source: "GPS", deviceReportedAtMs: 1, collectedAtMs: 1,
        expiresAtMs: Date.now() + 60_000, keyVersion: "v1"
      };
      return new Map([[authorId, location]]);
    });
    mocks.ghost.mockImplementation(async () => ({ coordinate: displayedPoint, radiusMeters: radiusMiles * 1609.344 }));
    query.mockReset().mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("from posts p")) {
        // SQL only scans posts. Do not invent a raw-coordinate distance gate;
        // the route must make this decision using its authorized location.
        if (values[5]) return { rows: [] };
        return { rows: [{
          id: postId, user_id: authorId, content: "Synthetic Ghost post", audience,
          expires_in: "never", expires_at: "infinity", created_at: createdAt,
          scan_created_at: createdAt, display_name: "Synthetic member", pronouns: [], photos: []
        }] };
      }
      if (sql.includes("feed_hide_from_purgatory = true")) {
        return { rows: restricted ? [{ user_id: authorId }] : [] };
      }
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

  const get = (lat: number, lng: number, distanceMiles: number) => app.inject({
    method: "GET", url: `/api/posts?lat=${lat}&lng=${lng}&distanceMiles=${distanceMiles}`,
    headers: { "x-user-id": viewerId }
  });

  it.each([
    { lat: 40.7, lng: -74, distance: 1, visible: true },
    { lat: 40.7, lng: -74, distance: 3, visible: true },
    { lat: 40.76, lng: -74, distance: 5, visible: true },
    { lat: 40.7, lng: -74.08, distance: 5, visible: true },
    { lat: 41.7, lng: -74, distance: 10, visible: false },
    { lat: 40.7, lng: -74, distance: 100, visible: true }
  ])("keeps the same page for private radii at ($lat,$lng) within $distance mi", async ({ lat, lng, distance, visible }) => {
    const pages = [];
    for (const privateRadius of [1, 5, 50]) {
      radiusMiles = privateRadius;
      const response = await get(lat, lng, distance);
      expect(response.statusCode, response.body).toBe(200);
      pages.push(response.json().data);
    }
    // Equality covers IDs, counts, labels, and cursors, not merely response code.
    expect(pages[1]).toEqual(pages[0]);
    expect(pages[2]).toEqual(pages[0]);
    expect(pages[0].map((post: { id: string }) => post.id)).toEqual(visible ? [postId] : []);
  });

  it("keeps the actual mutual audience decision with a matching decoy", async () => {
    audience = "mutuals";
    expect((await get(40.7, -74, 100)).json().data).toEqual([]);
    mutual = true;
    expect((await get(40.7, -74, 100)).json().data.map((post: { id: string }) => post.id)).toEqual([postId]);
  });

  it("retains existing author visibility exclusions even when the decoy matches", async () => {
    mocks.hidden.mockResolvedValue(new Set([authorId]));
    expect((await get(40.7, -74, 100)).json().data).toEqual([]);
    mocks.hidden.mockResolvedValue(new Set());
    restricted = true;
    mocks.outside.mockResolvedValue(true);
    expect((await get(40.7, -74, 100)).json().data).toEqual([]);
  });

  it("keeps blocked, Crowd, and deleted-account SQL guards in the finite-radius scan", async () => {
    const response = await get(40.7, -74, 100);
    expect(response.statusCode).toBe(200);
    const sql = query.mock.calls.find(([text]) => text.includes("from posts p"))![0];
    expect(sql).toContain("from user_blocks block");
    expect(sql).toContain("block.blocker_user_id = $1 and block.blocked_user_id = p.user_id");
    expect(sql).toContain("block.blocker_user_id = p.user_id and block.blocked_user_id = $1");
    expect(sql).toContain("feed_post_crowd_targets");
    expect(sql).toContain("viewer_crowd_token.token_hash = target.token_hash");
    expect(sql).toContain("coalesce(author.account_status, 'active') <> 'deleted'");
  });

  it("uses the explicitly granted true location rather than the decoy", async () => {
    radiusMiles = 50;
    preciseGranted = true;
    precisePoint = { lat: 40.9, lng: -74 };
    expect((await get(40.7, -74, 1)).json().data).toEqual([]);
    expect((await get(40.9, -74, 1)).json().data.map((post: { id: string }) => post.id)).toEqual([postId]);
    expect(mocks.ghost).not.toHaveBeenCalled();
  });

  it("fails closed when Ghost placement cannot resolve safe land", async () => {
    mocks.ghost.mockRejectedValue(new GhostLandUnavailableError());
    const response = await get(40.7, -74, 100);
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
  });
});
