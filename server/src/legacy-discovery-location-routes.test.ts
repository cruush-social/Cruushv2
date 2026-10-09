import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { formatError, toApiError } from "./errors.js";
import { storeLocationEnvelope } from "./location-privacy.js";
import { registerUserRoutes } from "./routes/users.js";

const mocks = vi.hoisted(() => ({ policy: vi.fn(), token: vi.fn(), ghost: vi.fn() }));
vi.mock("./location-privacy.js", async (original) => ({
  ...await original<typeof import("./location-privacy.js")>(),
  makeDisplayLocationToken: mocks.token,
  resolveViewerGhostCoordinate: mocks.ghost
}));
vi.mock("./match-relationships.js", async (original) => ({
  ...await original<typeof import("./match-relationships.js")>(),
  getEffectiveVisibilityPolicy: mocks.policy
}));
vi.mock("./nsfw-photo-audience.js", async (original) => ({
  ...await original<typeof import("./nsfw-photo-audience.js")>(),
  loadPhotoViewerRelationships: vi.fn().mockResolvedValue(new Map())
}));

const viewerId = "11111111-1111-4111-8111-111111111111";
// Legacy profile IDs need not be UUIDs and must not enter the envelope batch.
const legacyId = "27";
const nyc = { lat: 40.7128, lng: -74.006 };
const oos = { lat: 34.0522, lng: -118.2437 };
const config = { NODE_ENV: "test", SESSION_SECRET: "legacy-discovery-location-test-only" } as AppConfig;

async function encryptedViewerLocation(point: typeof nyc) {
  const capture = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] }));
  await storeLocationEnvelope({ config, db: { query: capture } as unknown as Pick<DbClient, "query"> }, {
    subjectUserId: viewerId, ...point, accuracyM: 10, source: "GPS"
  });
  const values = capture.mock.calls[0][1]!;
  return {
    subject_user_id: values[0], location_version: values[1], location_ciphertext: values[2],
    location_nonce: values[3], location_auth_tag: values[4], wrapped_location_dek: values[5],
    location_dek_nonce: values[6], location_dek_auth_tag: values[7], key_version: values[8],
    coarse_index_tokens: values[9], collected_at_ms: values[10], expires_at_ms: values[11]
  };
}

describe("legacy discovery viewer eligibility", () => {
  let app: FastifyInstance;
  let envelope: Awaited<ReturnType<typeof encryptedViewerLocation>> | null;
  let locationError: unknown;
  let pin: typeof nyc | null;
  let targetHasLocation: boolean;
  const query = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    envelope = await encryptedViewerLocation(nyc);
    locationError = null;
    pin = null;
    targetHasLocation = true;
    mocks.policy.mockResolvedValue({ baseMode: "PUBLIC_PRECISE", policyVersion: 1 });
    mocks.token.mockResolvedValue({ tokenId: "legacy-display", expiresAtMs: Date.now() + 60_000 });
    mocks.ghost.mockResolvedValue({ coordinate: { lat: 40.715, lng: -74.001 } });
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("from encrypted_location_envelopes")) {
        if (locationError) throw locationError;
        return { rows: envelope ? [envelope] : [] };
      }
      if (sql.includes("from profiles") && sql.includes("join app_users")) {
        throw { code: "42703", message: 'column "year_of_birth" does not exist' };
      }
      if (sql.includes("tribes as legacy_vibe_tags")) return { rows: [{
        id: legacyId, display_name: "Legacy member", age: 29, pronouns: "they/them",
        looking_for: ["Fun"], legacy_vibe_tags: ["Goth"], primary_photo_url: null,
        last_active: new Date().toISOString(),
        lat: targetHasLocation ? nyc.lat : null, lng: targetHasLocation ? nyc.lng : null,
        fuzzy_lat: null, fuzzy_lng: null
      }] };
      if (sql.includes("from user_travel_pins")) return { rows: pin ? [{
        user_id: viewerId, latitude: pin.lat, longitude: pin.lng,
        label: "Trip", set_at: new Date().toISOString()
      }] : [] };
      return { rows: [] };
    });
    app = Fastify({ logger: false });
    app.decorate("config", config);
    app.decorate("db", { query, end: vi.fn() });
    app.decorate("rateLimiter", { assert: vi.fn().mockResolvedValue(undefined) });
    app.setErrorHandler((error, _request, reply) => {
      const apiError = toApiError(error);
      return reply.code(apiError.statusCode).send(formatError(apiError));
    });
    await registerUserRoutes(app);
  });

  afterEach(async () => { await app.close(); });

  function discover() {
    // An in-area query center never substitutes for an unknown or OOS viewer.
    return app.inject({ method: "GET", url: "/api/users?lat=40.7128&lng=-74.006", headers: { "x-user-id": viewerId } });
  }

  it.each([
    { name: "physical in-area", physical: nyc, travel: null, allowed: true },
    { name: "physical OOS", physical: oos, travel: null, allowed: false },
    { name: "unknown location", physical: null, travel: null, allowed: false },
    { name: "OOS with active in-area MHC", physical: oos, travel: nyc, allowed: true },
    { name: "unknown location with active in-area MHC", physical: null, travel: nyc, allowed: false },
    { name: "physical in-area with effective OOS MHC", physical: nyc, travel: oos, allowed: false }
  ])("uses the encrypted viewer location for $name", async ({ physical, travel, allowed }) => {
    envelope = physical ? await encryptedViewerLocation(physical) : null;
    pin = travel;
    const response = await discover();
    expect(response.statusCode).toBe(200);
    expect(response.json().data.profiles).toHaveLength(allowed ? 1 : 0);
    const lookup = query.mock.calls.find(([sql]) => sql.includes("from encrypted_location_envelopes"));
    expect(lookup?.[1]?.[0]).toEqual([viewerId]);
    if (allowed) {
      expect(response.json().data.profiles[0]).toMatchObject({ profileToken: legacyId, name: "Legacy member" });
      expect(response.json().data.profiles[0]).not.toHaveProperty("lat");
      expect(response.json().data.profiles[0]).not.toHaveProperty("lng");
      expect(mocks.token).toHaveBeenCalledTimes(1);
    } else {
      expect(response.json().data.outsideServiceArea).toBe(true);
      expect(mocks.token).not.toHaveBeenCalled();
    }
  });

  it("fails closed when the encrypted location schema is unavailable", async () => {
    locationError = { code: "42P01", message: 'relation "encrypted_location_envelopes" does not exist' };
    const response = await discover();
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ profiles: [], outsideServiceArea: true });
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it("fails closed on an unreadable encrypted viewer location", async () => {
    envelope!.location_auth_tag = Buffer.alloc(16).toString("base64");
    const response = await discover();
    expect(response.statusCode).toBe(500);
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it("does not issue pins when location storage fails", async () => {
    locationError = new Error("storage unavailable");
    expect((await discover()).statusCode).toBe(500);
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it("rechecks access after an OOS viewer's in-area travel pin expires", async () => {
    envelope = await encryptedViewerLocation(oos);
    pin = nyc;
    expect((await discover()).json().data.profiles).toHaveLength(1);
    // The existing loader excludes expired travel-pin rows via its 24-hour cutoff.
    pin = null;
    expect((await discover()).json().data.profiles).toEqual([]);
    expect(query.mock.calls.find(([sql]) => sql.includes("from user_travel_pins"))?.[0])
      .toContain("set_at > now() - interval '24 hours'");
    expect(mocks.token).toHaveBeenCalledTimes(1);
  });

  it("preserves the target's Stealth policy for eligible legacy viewers", async () => {
    mocks.policy.mockResolvedValue({ baseMode: "STEALTH", policyVersion: 1 });
    expect((await discover()).json().data.profiles).toEqual([]);
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it("preserves Ghost display-token rendering for eligible legacy viewers", async () => {
    mocks.policy.mockResolvedValue({ baseMode: "GHOST", policyVersion: 1 });
    const response = await discover();
    expect(response.statusCode).toBe(200);
    expect(response.json().data.profiles[0]).toMatchObject({ profileToken: legacyId, distanceLabel: "Nearby" });
    expect(mocks.token.mock.calls[0][2]).toMatchObject({ displayMode: "GHOST" });
    expect(mocks.ghost).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy targets with unknown locations hidden", async () => {
    targetHasLocation = false;
    expect((await discover()).json().data.profiles).toEqual([]);
    expect(mocks.token).not.toHaveBeenCalled();
  });
});
