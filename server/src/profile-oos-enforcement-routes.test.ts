import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { formatError, toApiError } from "./errors.js";
import { emptyProfile } from "./profile-schema.js";
import { encryptProfileVisibility } from "./profile-sensitive.js";
import type { LocationPayload } from "./location-privacy.js";
import { encryptOosState, type EncryptedOosState } from "./oos-state-crypto.js";
import { TRAVEL_PIN_LIFETIME_MS, type TravelPin } from "./travel-pins.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerUserRoutes } from "./routes/users.js";

const mocks = vi.hoisted(() => ({
  locations: vi.fn(), location: vi.fn(), pins: vi.fn(), pin: vi.fn(),
  relationship: vi.fn(), policy: vi.fn(), token: vi.fn(),
  canViewPhoto: vi.fn(), readMedia: vi.fn()
}));
vi.mock("./location-privacy.js", async (original) => ({
  ...await original<typeof import("./location-privacy.js")>(),
  loadLocationEnvelopes: mocks.locations, loadLocationEnvelope: mocks.location,
  loadVisibilityPolicy: vi.fn().mockResolvedValue(null),
  makeDisplayLocationToken: mocks.token
}));
vi.mock("./travel-pins.js", async (original) => ({
  ...await original<typeof import("./travel-pins.js")>(),
  loadTravelPins: mocks.pins, getTravelPin: mocks.pin
}));
vi.mock("./match-relationships.js", async (original) => ({
  ...await original<typeof import("./match-relationships.js")>(),
  getRelationshipPermissions: mocks.relationship,
  getEffectiveVisibilityPolicy: mocks.policy,
  recordProfileView: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("./nsfw-photo-audience.js", async (original) => ({
  ...await original<typeof import("./nsfw-photo-audience.js")>(),
  canViewNsfwPhoto: mocks.canViewPhoto,
  loadPhotoViewerRelationships: vi.fn().mockResolvedValue(new Map())
}));
vi.mock("./user-blocks.js", async (original) => ({
  ...await original<typeof import("./user-blocks.js")>(),
  assertUsersNotBlocked: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("./cruush-match-settings.js", async (original) => ({
  ...await original<typeof import("./cruush-match-settings.js")>(),
  canStartDirectMessage: vi.fn().mockResolvedValue(true)
}));
vi.mock("./media-storage.js", async (original) => ({
  ...await original<typeof import("./media-storage.js")>(),
  readEncryptedMediaObject: mocks.readMedia
}));
vi.mock("./media-encryption.js", async (original) => ({
  ...await original<typeof import("./media-encryption.js")>(),
  decryptMediaBytes: vi.fn(() => Buffer.from("existing authorized photo"))
}));

const viewerId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const notificationId = "44444444-4444-4444-8444-444444444444";
const nyc = { lat: 40.7128, lng: -74.006 };
const oos = { lat: 34.0522, lng: -118.2437 };
const config = {
  NODE_ENV: "test", SESSION_SECRET: "profile-oos-route-test-secret-only",
  LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 0x50).toString("base64"), LOCATION_ENCRYPTION_KEY_VERSION: "v1",
  PROFILE_ENCRYPTION_KEY: "profile-oos-route-encryption-test-only",
  PROFILE_TOKEN_KEY: "profile-oos-route-token-test-only", PROFILE_TOKEN_KEY_VERSION: "v1"
} as AppConfig;

function savedState(userId: string, isOutside: boolean) {
  return { user_id: userId, ...encryptOosState(config, userId, {
    is_outside: isOutside, current_event_id: isOutside ? notificationId : null
  }) };
}

function location(userId: string, point: typeof nyc): LocationPayload {
  return {
    version: 1, subjectUserId: userId, locationVersion: 1,
    latE7: Math.round(point.lat * 1e7), lonE7: Math.round(point.lng * 1e7),
    accuracyM: 20, source: "GPS", deviceReportedAtMs: Date.now(),
    collectedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000, keyVersion: "v1"
  };
}

describe("Out of Sight profile, discovery and media enforcement", () => {
  let app: FastifyInstance;
  let hidden: boolean;
  let physical: typeof nyc | null;
  let activePin: TravelPin | null;
  let surface: "profile_photo" | "feed_photo" | "message_photo";
  let audience: "public" | "crowd" | "mutuals";
  let messageAuthorized: boolean;
  let targetExcludesViewer: boolean;
  let viewerProfileExists: boolean;
  let unreadablePolicy: boolean;
  let savedStates: Map<string, EncryptedOosState & { user_id: string }>;
  const query = vi.fn();

  function profile(id: string) {
    return {
      ...emptyProfile, id, display_name: id === targetId ? "Target" : "Viewer",
      year_of_birth: 1994, ethnicity: [], photos: [], updated_at: new Date().toISOString(),
      lat: nyc.lat, lng: nyc.lng, fuzzy_lat: nyc.lat, fuzzy_lng: nyc.lng,
      ...encryptProfileVisibility(config, {
        ...emptyProfile.visibility_rules,
        outside_service_area_members: id === targetId && hidden,
        age_range: id === targetId && targetExcludesViewer ? [18, 21] : null
      }),
      ...(id === targetId && unreadablePolicy ? { profile_visibility_auth_tag: Buffer.alloc(16).toString("base64") } : {})
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    hidden = true; physical = oos; activePin = null;
    surface = "profile_photo"; audience = "public";
    messageAuthorized = true; targetExcludesViewer = false; viewerProfileExists = true; unreadablePolicy = false;
    savedStates = new Map([[viewerId, savedState(viewerId, true)], [targetId, savedState(targetId, false)]]);
    mocks.locations.mockImplementation(async (_app, ids: string[]) => new Map(ids.flatMap((id) => (
      id === viewerId && !physical ? [] : [[id, location(id, id === viewerId ? physical! : nyc)] as const]
    ))));
    mocks.location.mockImplementation(async (_app, id: string) => id === viewerId && !physical ? null : location(id, id === viewerId ? physical! : nyc));
    mocks.pins.mockImplementation(async () => new Map(activePin ? [[viewerId, activePin]] : []));
    mocks.pin.mockImplementation(async (_app, id: string) => id === viewerId ? activePin : null);
    mocks.relationship.mockResolvedValue({
      isBlocked: false, isMutualCruush: true, canRevealPreciseLocation: true,
      canMessage: true, targetBaseMode: "PUBLIC_PRECISE"
    });
    mocks.policy.mockResolvedValue({ baseMode: "PUBLIC_PRECISE", preciseToMutualCrowds: [], policyVersion: 1 });
    mocks.token.mockResolvedValue({ tokenId: "test-location-token", expiresAtMs: Date.now() + 60_000 });
    mocks.canViewPhoto.mockResolvedValue(true);
    mocks.readMedia.mockResolvedValue(Buffer.from("encrypted-test-bytes"));
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("from oos_service_area_state")) {
        expect(sql).toContain("state_ciphertext");
        expect(sql).toContain("where user_id = any($1::uuid[])");
        const ids = params[0] as string[];
        return { rows: ids.flatMap(id => savedStates.has(id) ? [savedStates.get(id)!] : []) };
      }
      if (sql.includes("from app_notifications")) return { rows: [{ source_user_id: targetId }] };
      // Discovery also contains a media_objects subquery for the primary photo.
      if (sql.includes("from profiles")) {
        if (sql.includes("profiles.id <> $1") || sql.includes("where id = any")) return { rows: [profile(targetId)] };
        if (params[0] === viewerId && !viewerProfileExists) return { rows: [] };
        return { rows: [profile(params[0] === targetId ? targetId : viewerId)] };
      }
      if (sql.includes("from media_objects")) return { rows: [{
        owner_user_id: targetId, surface, explicit_classification: "explicit",
        object_key: "test/photo.enc", mime_type: "image/webp", key_version: "v1"
      }] };
      if (sql.includes("from message_media_attachments")) return { rows: messageAuthorized ? [{ allowed: true }] : [] };
      if (sql.includes("from feed_post_attachments")) return { rows: [{
        owner_user_id: targetId, audience, has_shared_crowd: true
      }] };
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
    await registerProfileRoutes(app);
    await registerUserRoutes(app);
    await registerMediaRoutes(app);
  }, 30_000);
  afterEach(async () => { await app.close(); });

  function request(url: string, revalidate = false) {
    return app.inject({ method: "GET", url, headers: {
      "x-user-id": viewerId, ...(revalidate ? { "if-none-match": "*" } : {})
    } });
  }
  function enableMhc() {
    const setAtMs = Date.now();
    activePin = { userId: viewerId, latitude: nyc.lat, longitude: nyc.lng, label: "NYC",
      setAtMs, movableAtMs: setAtMs, expiresAtMs: setAtMs + TRAVEL_PIN_LIFETIME_MS };
  }

  it("hides an opted-in direct profile from an OOS mutual", async () => {
    expect((await request(`/api/profiles/${targetId}`)).statusCode).toBe(404);
  });
  it("fails closed for an opted-in profile when the viewer location is missing", async () => {
    physical = null;
    expect((await request(`/api/profiles/${targetId}`)).statusCode).toBe(404);
  });
  it.each(["physical", "mhc"])("retains an opted-in profile for effective in-area access: %s", async (kind) => {
    if (kind === "mhc") enableMhc(); else physical = nyc;
    const response = await request(`/api/profiles/${targetId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.viewer_relationship.can_reveal_precise_location).toBe(true);
  });
  it("keeps a non-opted-in profile readable but grants no OOS pin or location fields", async () => {
    hidden = false;
    const response = await request(`/api/profiles/${targetId}`);
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.viewer_relationship.can_reveal_precise_location).toBe(false);
    for (const key of ["location", "lat", "lng", "fuzzy_lat", "fuzzy_lng", "coordinates", "display_location_token", "ghost_display_location_token"]) {
      expect(data).not.toHaveProperty(key);
    }
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it.each([
    { kind: "missing", point: null, expired: false, savedOutside: null, mode: "precise", expected: "Nearby" },
    { kind: "expired", point: { lat: 40.75, lng: -73.98 }, expired: true, savedOutside: null, mode: "precise", expected: "Nearby" },
    { kind: "fresh in-area", point: { lat: 40.75, lng: -73.98 }, expired: false, savedOutside: false, mode: "precise", expected: "2.9 mi" },
    { kind: "fresh OOS", point: oos, expired: false, savedOutside: true, mode: "precise", expected: "New York, NY" },
    { kind: "fresh OOS", point: oos, expired: false, savedOutside: true, mode: "approximate", expected: "Among sinners" },
    { kind: "missing GPS with saved OOS", point: null, expired: false, savedOutside: true, mode: "approximate", expected: "Among sinners" },
    { kind: "expired GPS with saved OOS", point: oos, expired: true, savedOutside: true, mode: "precise", expected: "New York, NY" },
    { kind: "expired GPS with saved OOS", point: oos, expired: true, savedOutside: true, mode: "approximate", expected: "Among sinners" },
    { kind: "expired GPS with saved inside", point: { lat: 40.75, lng: -73.98 }, expired: true, savedOutside: false, mode: "precise", expected: "Nearby" }
  ])("uses the safe profile distance label for a $kind viewer in $mode mode", async ({ point, expired, savedOutside, mode, expected }) => {
    hidden = false;
    physical = point;
    if (savedOutside === null) savedStates.delete(viewerId);
    else savedStates.set(viewerId, savedState(viewerId, savedOutside));
    const viewerLocation = point ? location(viewerId, point) : null;
    if (viewerLocation && expired) viewerLocation.expiresAtMs = Date.now() - 1_000;
    // Keep the legacy profile coordinates populated, including when the
    // encrypted viewer location is missing or retained after its expiry.
    mocks.locations.mockImplementation(async (_app, ids: string[]) => new Map(ids.flatMap((id) => {
      const envelope = id === viewerId ? viewerLocation : location(id, nyc);
      return envelope ? [[id, envelope] as const] : [];
    })));
    mocks.location.mockImplementation(async (_app, id: string) => (
      id === viewerId ? (expired ? null : viewerLocation) : location(id, nyc)
    ));
    mocks.relationship.mockResolvedValue({
      isBlocked: false, isMutualCruush: true, canRevealPreciseLocation: true,
      canMessage: true, targetBaseMode: "PUBLIC_PRECISE", distanceLabelMode: mode
    });

    const response = await request(`/api/profiles/${targetId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.distance_label).toBe(expected);
  });
  it("preserves the owner's own location-token response", async () => {
    const response = await request("/api/profiles/me");
    expect(response.statusCode).toBe(200);
    expect(response.json().data.location.display_location_token.tokenId).toBe("test-location-token");
    expect(response.json().data.outOfSight).toBe(true);
  });
  it.each([
    { kind: "outside", expected: true },
    { kind: "inside", expected: false },
    { kind: "missing", expected: undefined },
    { kind: "corrupt", expected: undefined },
    { kind: "wrong-member ciphertext", expected: undefined }
  ])("uses $kind saved state for the profile glyph, independent of GPS and MHC", async ({ kind, expected }) => {
    hidden = false; physical = null;
    const row = savedState(targetId, kind === "outside");
    if (kind === "missing") savedStates.delete(targetId);
    else if (kind === "corrupt") savedStates.set(targetId, { ...row, state_auth_tag: "invalid" });
    else if (kind === "wrong-member ciphertext") savedStates.set(targetId, { ...savedState(viewerId, true), user_id: targetId });
    else savedStates.set(targetId, row);
    // Deliberately disagree with saved classification. Neither a fresh GPS
    // envelope nor an MHC destination may supply or replace badge metadata.
    const targetPoint = expected ? nyc : oos;
    mocks.locations.mockImplementation(async (_app, ids: string[]) => new Map(ids.flatMap(id =>
      id === targetId ? [[id, location(id, targetPoint)] as const] : [])));
    mocks.location.mockImplementation(async (_app, id: string) => id === targetId ? location(id, targetPoint) : null);
    const setAtMs = Date.now();
    mocks.pin.mockImplementation(async (_app, id: string) => id === targetId ? {
      userId: targetId, latitude: targetPoint.lat, longitude: targetPoint.lng, label: "Trip",
      setAtMs, movableAtMs: setAtMs, expiresAtMs: setAtMs + TRAVEL_PIN_LIFETIME_MS
    } : null);
    const response = await request(`/api/profiles/${targetId}`);
    expect(response.statusCode, response.body).toBe(200);
    const data = response.json().data;
    expect(data.travelling).toBe(true);
    if (expected === undefined) expect(data).not.toHaveProperty("outOfSight");
    else expect(data.outOfSight).toBe(expected);
    expect(data.viewer_relationship.can_reveal_precise_location).toBe(false);
    for (const key of ["location", "lat", "lng", "fuzzy_lat", "fuzzy_lng", "coordinates", "display_location_token", "ghost_display_location_token"]) {
      expect(data).not.toHaveProperty(key);
    }
    expect(mocks.token).not.toHaveBeenCalled();
    expect(query.mock.calls.filter(([sql]) => sql.includes("from oos_service_area_state"))
      .map(([, params]) => params)).toContainEqual([[targetId]]);
    expect(response.body).not.toContain("state_ciphertext");
  });
  it("does not let saved in-area metadata bypass a current outside viewer's access guard", async () => {
    savedStates.set(viewerId, savedState(viewerId, false));
    expect((await request(`/api/profiles/${targetId}`)).statusCode).toBe(404);
    expect((await request("/api/users")).json().data.profiles).toEqual([]);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it.each(["missing", "expired"] as const)("keeps an OOS subject's safe label for a %s viewer location", async (kind) => {
    hidden = false;
    physical = null;
    savedStates.delete(viewerId);
    savedStates.set(targetId, savedState(targetId, true));
    const viewerLocation = kind === "expired" ? location(viewerId, nyc) : null;
    if (viewerLocation) viewerLocation.expiresAtMs = Date.now() - 1_000;
    mocks.locations.mockImplementation(async (_app, ids: string[]) => new Map(ids.flatMap((id) => {
      const envelope = id === viewerId ? viewerLocation : location(id, oos);
      return envelope ? [[id, envelope] as const] : [];
    })));
    mocks.location.mockImplementation(async (_app, id: string) => id === viewerId ? null : location(id, oos));
    mocks.relationship.mockResolvedValue({
      isBlocked: false, isMutualCruush: true, canRevealPreciseLocation: true,
      canMessage: true, targetBaseMode: "PUBLIC_PRECISE", distanceLabelMode: "approximate"
    });
    const response = await request(`/api/profiles/${targetId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.distance_label).toBe("Far far away");
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("suppresses saved-state coarse labels under the target's STEALTH policy", async () => {
    hidden = false;
    savedStates.set(targetId, savedState(targetId, true));
    mocks.policy.mockResolvedValue({ baseMode: "STEALTH", preciseToMutualCrowds: [], policyVersion: 1 });
    const response = await request(`/api/profiles/${targetId}`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.distance_label).toBeNull();
    expect(response.json().data.viewer_relationship.can_reveal_precise_location).toBe(false);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("fails closed for unreadable present privacy policies on profile, discovery and photos", async () => {
    physical = nyc; unreadablePolicy = true;
    expect((await request(`/api/profiles/${targetId}`)).statusCode).toBe(404);
    expect((await request("/api/users")).json().data.profiles).toEqual([]);
    expect((await request(`/api/media/assets/${assetId}/display`)).statusCode).toBe(404);
  });

  it.each(["profile_photo", "feed_photo"] as const)("denies direct %s bytes despite photo permissions and cache validators", async (kind) => {
    surface = kind;
    expect((await request(`/api/media/assets/${assetId}/display`, true)).statusCode).toBe(404);
    expect(mocks.readMedia).not.toHaveBeenCalled();
  });
  it.each(["crowd", "mutuals"] as const)("does not let a %s Feed audience bypass VC", async (kind) => {
    surface = "feed_photo"; audience = kind;
    expect((await request(`/api/media/assets/${assetId}/display`)).statusCode).toBe(404);
  });
  it("denies the legacy profile-photo URL too", async () => {
    expect((await request(`/api/media/profile-photos/${assetId}.webp`)).statusCode).toBe(404);
  });
  it.each(["profile_photo", "feed_photo"] as const)("keeps existing %s access when the owner has not opted in", async (kind) => {
    hidden = false; surface = kind;
    expect((await request(`/api/media/assets/${assetId}/display`)).statusCode).toBe(200);
  });
  it("preserves in-area MHC photo access subject to the existing photo permission", async () => {
    enableMhc();
    expect((await request(`/api/media/assets/${assetId}/display`)).statusCode).toBe(200);
    mocks.canViewPhoto.mockResolvedValue(false);
    expect((await request(`/api/media/assets/${assetId}/display`)).statusCode).toBe(404);
  });
  it("preserves existing authorized message media but not unauthorized attachments", async () => {
    surface = "message_photo";
    expect((await request(`/api/media/assets/${assetId}/display`)).statusCode).toBe(200);
    messageAuthorized = false;
    expect((await request(`/api/media/assets/${assetId}/display`)).statusCode).toBe(404);
  });
  it("preserves legacy authorized message photos", async () => {
    surface = "message_photo";
    expect((await request(`/api/media/message-photos/${assetId}.webp`)).statusCode).toBe(200);
  });
  it("rechecks VC and media access after an in-area MHC pin expires", async () => {
    enableMhc();
    expect((await request(`/api/profiles/${targetId}`)).statusCode).toBe(200);
    activePin = null;
    expect((await request(`/api/profiles/${targetId}`)).statusCode).toBe(404);
    expect((await request(`/api/media/assets/${assetId}/display`, true)).statusCode).toBe(404);
    expect((await request(`/api/notifications/${notificationId}/area`)).json()).toEqual({ data: { area: null } });
  });

  it.each(["outside", "missing"])("returns no discovery tokens or old-notification area for %s location", async (kind) => {
    hidden = false;
    if (kind === "missing") physical = null;
    const discovery = await request("/api/users");
    expect(discovery.statusCode).toBe(200);
    expect(discovery.json().data.profiles).toEqual([]);
    const notification = await request(`/api/notifications/${notificationId}/area`);
    expect(notification.statusCode).toBe(200);
    expect(notification.json()).toEqual({ data: { area: null } });
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("populates the discovery OOS subject from effective MHC and preserves target privacy", async () => {
    enableMhc();
    const allowed = await request("/api/users");
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().data.profiles.map((profile: { profileToken: string }) => profile.profileToken)).toEqual([targetId]);
    targetExcludesViewer = true;
    expect((await request("/api/users")).json().data.profiles).toEqual([]);
    expect((await request(`/api/notifications/${notificationId}/area`)).json()).toEqual({ data: { area: null } });
  });
});
