import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { ApiError, formatError, toApiError } from "./errors.js";
import { emptyProfile } from "./profile-schema.js";
import { encryptProfileVisibility, type ProfileVisibilityRules } from "./profile-sensitive.js";
import { buildEncryptedRelationshipPayload, type EncryptedRelationshipRecord } from "./encrypted-relationships.js";
import { createClubEnrollmentUserIndex } from "./encrypted-club-enrollments.js";
import { encryptTextContent } from "./content-encryption.js";
import type { LocationPayload } from "./location-privacy.js";
import { encryptOosState, type EncryptedOosState } from "./oos-state-crypto.js";
import type { TravelPin } from "./travel-pins.js";
import { registerCruushRoutes } from "./routes/cruush.js";
import { registerMessageRoutes } from "./routes/messages.js";

const m = vi.hoisted(() => ({
  byActor: vi.fn(), byTarget: vi.fn(), byParticipant: vi.fn(), find: vi.fn(), upsert: vi.fn(),
  entitlement: vi.fn(), privacy: vi.fn(), relationship: vi.fn(), policy: vi.fn(), distanceMode: vi.fn(),
  blockedIds: vi.fn(), assertNotBlocked: vi.fn(), hasBlock: vi.fn(),
  locations: vi.fn(), location: vi.fn(), travelPins: vi.fn(), displayToken: vi.fn(), ghost: vi.fn(), towns: vi.fn(),
  canSend: vi.fn(), assertCanSend: vi.fn(), photoRelationships: vi.fn(), sharedCrowds: vi.fn(), audience: vi.fn(),
  moderate: vi.fn(), reward: vi.fn(), notify: vi.fn(), owner: vi.fn()
}));
vi.mock("./encrypted-relationships.js", async (original) => ({
  ...await original<typeof import("./encrypted-relationships.js")>(),
  listEncryptedRelationshipRecordsByActor: m.byActor,
  listEncryptedRelationshipRecordsByTarget: m.byTarget,
  listEncryptedRelationshipRecordsByParticipant: m.byParticipant,
  findEncryptedRelationshipRecord: m.find,
  upsertEncryptedRelationshipRecord: m.upsert
}));
vi.mock("./match-relationships.js", async (original) => ({
  ...await original<typeof import("./match-relationships.js")>(),
  getCruushEntitlement: m.entitlement, getPrivacySettings: m.privacy,
  getRelationshipPermissions: m.relationship, getEffectiveVisibilityPolicy: m.policy,
  getSharedDistanceLabelMode: m.distanceMode
}));
vi.mock("./user-blocks.js", async (original) => ({
  ...await original<typeof import("./user-blocks.js")>(),
  loadBlockedRelationshipUserIds: m.blockedIds, assertUsersNotBlocked: m.assertNotBlocked,
  hasUserBlockBetween: m.hasBlock
}));
vi.mock("./location-privacy.js", async (original) => ({
  ...await original<typeof import("./location-privacy.js")>(),
  loadLocationEnvelopes: m.locations, loadLocationEnvelope: m.location,
  makeDisplayLocationToken: m.displayToken,
  resolveViewerGhostCoordinate: m.ghost
}));
vi.mock("./travel-pins.js", async (original) => ({
  ...await original<typeof import("./travel-pins.js")>(), loadTravelPins: m.travelPins
}));
vi.mock("./current-town-labels.js", () => ({ loadCurrentTownLabels: m.towns }));
vi.mock("./cruush-match-settings.js", async (original) => ({
  ...await original<typeof import("./cruush-match-settings.js")>(),
  canStartDirectMessage: m.canSend, assertCanStartDirectMessage: m.assertCanSend
}));
vi.mock("./nsfw-photo-audience.js", async (original) => ({
  ...await original<typeof import("./nsfw-photo-audience.js")>(),
  loadPhotoViewerRelationships: m.photoRelationships, loadSharedCrowdUserIds: m.sharedCrowds,
  getNsfwPhotoAudience: m.audience
}));
vi.mock("./moderation-service.js", async (original) => ({
  ...await original<typeof import("./moderation-service.js")>(), moderateMessageTextOrAllowByKeyword: m.moderate
}));
vi.mock("./rewards-service.js", () => ({ recordMeaningfulActivitySafely: m.reward }));
vi.mock("./notification-service.js", () => ({ createAppNotificationAndPush: m.notify }));
vi.mock("./owner-access.js", async (original) => ({
  ...await original<typeof import("./owner-access.js")>(), userHasOwnerFullAccess: m.owner
}));

const viewerId = "11111111-1111-4111-8111-111111111111";
const hiddenId = "22222222-2222-4222-8222-222222222222";
const publicId = "33333333-3333-4333-8333-333333333333";
const conversationId = "44444444-4444-4444-8444-444444444444";
const messageId = "55555555-5555-4555-8555-555555555555";
const nyc = { lat: 40.7128, lng: -74.006 };
const outside = { lat: 34.0522, lng: -118.2437 };
const time = "2026-10-09T12:00:00.000Z";
const config = {
  NODE_ENV: "test", SESSION_SECRET: "oos-route-test-only-key-00000000000000000000",
  LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 0x43).toString("base64"), LOCATION_ENCRYPTION_KEY_VERSION: "v1"
} as AppConfig;

function savedState(userId: string, isOutside: boolean) {
  return { user_id: userId, ...encryptOosState(config, userId, {
    is_outside: isOutside, current_event_id: isOutside ? messageId : null
  }) };
}

function location(point = outside, subjectUserId = viewerId): LocationPayload {
  return {
    version: 1, subjectUserId, locationVersion: 1,
    latE7: Math.round(point.lat * 10_000_000), lonE7: Math.round(point.lng * 10_000_000),
    accuracyM: 20, source: "GPS", deviceReportedAtMs: Date.now(), collectedAtMs: Date.now(),
    expiresAtMs: Date.now() + 60_000, keyVersion: "v1"
  };
}

function profile(id: string, rules: Partial<ProfileVisibilityRules> = {}) {
  return {
    ...emptyProfile, id, display_name: id === hiddenId ? "Hidden member" : "Public member",
    photos: ["/test-photo"], updated_at: time, ghost_mode_enabled: false,
    year_of_birth: null as number | null,
    ...encryptProfileVisibility(config, { ...emptyProfile.visibility_rules, ...rules })
  };
}

function record(id: string, type: "cruush" | "profile_view" | "mutual_cruush", actor: string, target: string, createdAt = time) {
  return {
    id, payload: buildEncryptedRelationshipPayload({
      type, actorUserId: actor, targetUserId: target, createdAt: new Date(createdAt),
      targetSnapshot: { name: "Stored identity", pronouns: "they", photo: null }
    })
  } as EncryptedRelationshipRecord;
}

function travelPin(point = nyc): TravelPin {
  return {
    userId: viewerId, latitude: point.lat, longitude: point.lng, label: "Trip",
    setAtMs: Date.now(), movableAtMs: Date.now(), expiresAtMs: Date.now() + 60_000
  };
}

describe("OOS cruush activity and new contacts", () => {
  let app: FastifyInstance;
  let profiles: ReturnType<typeof profile>[];
  let existingDm: boolean;
  let conversationLastSeenAt: string | null;
  let accountStatuses: Map<string, string>;
  let existingGroupMember: "plain" | "encrypted" | false;
  let savedStates: Map<string, EncryptedOosState & { user_id: string }>;
  const query = vi.fn();
  const headers = { "x-user-id": viewerId };
  const conversation = {
    id: conversationId, kind: "dm", title: null, updated_at: time,
    other_user_id: hiddenId, other_user_name: "Hidden member", other_user_pronouns: ["they"],
    other_user_photo: "/test-photo", last_message: "Existing history", unread_count: 1,
    member_count: 2, disappearing_timer: "off", closed_at: null
  };
  const historicalMessage = {
    id: messageId, user_id: hiddenId, content: "Existing history", created_at: time, attachments: []
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    profiles = [profile(hiddenId, { outside_service_area_members: true }), profile(publicId), profile(viewerId)];
    existingDm = false;
    conversationLastSeenAt = null;
    accountStatuses = new Map();
    existingGroupMember = false;
    savedStates = new Map([
      [viewerId, savedState(viewerId, true)],
      [hiddenId, savedState(hiddenId, false)],
      [publicId, savedState(publicId, false)]
    ]);
    m.byActor.mockResolvedValue([]);
    m.byTarget.mockResolvedValue([]);
    m.byParticipant.mockResolvedValue([]);
    m.find.mockResolvedValue(null);
    m.upsert.mockImplementation(async (_app, payload) => ({ id: messageId, payload }));
    m.entitlement.mockResolvedValue({ cruushPlus: true });
    m.privacy.mockResolvedValue({ ghostModeEnabled: false });
    m.relationship.mockResolvedValue({ isMutualCruush: true, canMessage: true, canRevealPreciseLocation: true, targetBaseMode: "VISIBLE" });
    m.policy.mockResolvedValue({ baseMode: "VISIBLE" });
    m.distanceMode.mockResolvedValue("approximate");
    m.blockedIds.mockResolvedValue(new Set());
    m.hasBlock.mockResolvedValue(false);
    m.locations.mockResolvedValue(new Map([[viewerId, location()]]));
    m.location.mockImplementation(async (_app, id) => location(id === viewerId ? outside : nyc, id));
    m.travelPins.mockResolvedValue(new Map());
    m.towns.mockResolvedValue(new Map());
    m.displayToken.mockResolvedValue({ token: "synthetic-display-token", expiresAtMs: Date.now() + 60_000 });
    m.ghost.mockResolvedValue({ coordinate: { lat: 40.715, lng: -74.001 }, resolvedAtMs: Date.now(), radiusMeters: 1609 });
    m.canSend.mockResolvedValue(true);
    m.photoRelationships.mockResolvedValue(new Map());
    m.sharedCrowds.mockResolvedValue(new Set());
    m.audience.mockResolvedValue("public");
    m.owner.mockResolvedValue(false);
    m.moderate.mockResolvedValue({ providerResult: { provider: "test", labels: [] }, decision: { action: "allow" } });
    query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("from oos_service_area_state")) {
        expect(sql).toContain("state_ciphertext");
        expect(sql).toContain("where user_id = any($1::uuid[])");
        const ids = values[0] as string[];
        return { rows: ids.flatMap(id => savedStates.has(id) ? [savedStates.get(id)!] : []) };
      }
      if (sql.includes("from app_users") && sql.includes("account_status = 'banned'") && sql.includes("where id = any")) {
        return { rows: (values[0] as string[]).filter(id => accountStatuses.get(id) === "banned").map(id => ({ id })) };
      }
      if (sql.includes("from profiles")) {
        const ids = Array.isArray(values[0]) ? values[0] : [values[0]];
        return { rows: profiles.filter((row) => ids.includes(row.id) && (!sql.includes("banned_content_account") || accountStatuses.get(row.id) !== "banned")) };
      }
      if (sql.includes("from app_users") && sql.includes("where id::text")) return { rows: [{ id: values[0] }] };
      if (sql.includes("where kind = 'dm' and dm_key")) return { rows: existingDm ? [{ id: conversationId }] : [] };
      if (sql.includes("insert into conversations (kind, dm_key")) return { rows: [{ id: conversationId }] };
      if (sql.includes("select cm.role")) return { rows: [{ role: "owner", closed_at: null, club_id: null }] };
      if (sql.includes("select user_id::text as user_id, member_index")) {
        return { rows: existingGroupMember ? [{
          user_id: existingGroupMember === "plain" ? hiddenId : null,
          member_index: existingGroupMember === "encrypted" ? createClubEnrollmentUserIndex(config, hiddenId) : null
        }] : [] };
      }
      if (sql.includes("with target_membership as")) return { rows: [{ id: hiddenId, member_limit_reached: false }] };
      if (sql.includes("with membership as")) {
        return { rows: [{ ...historicalMessage, user_id: viewerId, content: "[encrypted]",
          content_ciphertext: values[2], content_nonce: values[3], content_auth_tag: values[4], content_key_version: values[5]
        }] };
      }
      if (sql.includes("from conversation_members cm") && sql.includes("last_message")) return { rows: [{ ...conversation, other_user_last_active: conversationLastSeenAt }] };
      if (sql.includes("from messages m")) return { rows: [historicalMessage] };
      if (sql.startsWith("update conversation_members") || sql.trimStart().startsWith("insert into conversation_members") || sql.includes("from conversation_members cm")) return { rows: [] };
      throw new Error("Unexpected test query: " + sql.slice(0, 70));
    });
    app = Fastify({ logger: false });
    app.decorate("config", config);
    app.decorate("db", { query, end: vi.fn() });
    app.setErrorHandler((error, _request, reply) => {
      const apiError = toApiError(error);
      return reply.code(apiError.statusCode).send(formatError(apiError));
    });
    await registerCruushRoutes(app);
    await registerMessageRoutes(app);
  }, 30_000);

  afterEach(async () => { await app.close(); });

  function seedActivity() {
    m.byTarget.mockImplementation(async (_app, { type, status }) => status ? [] : [
      record("hidden-" + type, type, hiddenId, viewerId),
      record("public-" + type, type, publicId, viewerId, "2026-10-08T12:00:00.000Z")
    ]);
    m.byActor.mockImplementation(async (_app, { status }) => [
      record("hidden-sent-" + (status ?? "active"), "cruush", viewerId, hiddenId),
      record("public-sent-" + (status ?? "active"), "cruush", viewerId, publicId)
    ]);
    m.byParticipant.mockResolvedValue([
      record("hidden-mutual", "mutual_cruush", hiddenId, viewerId),
      record("public-mutual", "mutual_cruush", viewerId, publicId)
    ]);
  }

  it.each([
    { baseMode: "GHOST", expected: "Online" },
    { baseMode: "STEALTH", expected: "5m ago" },
    { baseMode: undefined, expected: "5m ago" }
  ])("shows $baseMode activity on mutual cards without granting precision", async ({ baseMode, expected }) => {
    seedActivity();
    profiles = profiles.map(row => ({ ...row, last_seen_at: new Date().toISOString() }));
    m.relationship.mockResolvedValue({
      isMutualCruush: true, canMessage: true, canRevealPreciseLocation: false, targetBaseMode: baseMode
    });
    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.mutual).toHaveLength(1);
    expect(response.json().data.mutual[0]).toMatchObject({ lastActive: expected, canRevealPreciseLocation: false });
    expect(m.displayToken).not.toHaveBeenCalled();
  });

  it.each([
    { baseMode: "GHOST", expected: "Online" },
    { baseMode: "STEALTH", expected: "5m ago" },
    { baseMode: undefined, expected: "5m ago" }
  ])("shows $baseMode activity on existing DMs without changing access", async ({ baseMode, expected }) => {
    conversationLastSeenAt = new Date().toISOString();
    m.relationship.mockResolvedValue({
      isMutualCruush: true, canMessage: true, canRevealPreciseLocation: false, targetBaseMode: baseMode
    });
    const response = await app.inject({ method: "GET", url: "/api/conversations", headers });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({ user: { id: hiddenId, lastActive: expected }, canMessage: true });
    expect(m.displayToken).not.toHaveBeenCalled();
  });

  it("shows an online Ghost mutual on the map while retaining the Ghost token and distance", async () => {
    seedActivity();
    profiles = profiles.map(row => ({ ...row, last_seen_at: new Date().toISOString() }));
    m.byParticipant.mockResolvedValue([record("public-mutual", "mutual_cruush", viewerId, publicId)]);
    m.locations.mockResolvedValue(new Map([[viewerId, location(nyc)]]));
    m.location.mockImplementation(async (_app, id) => location(nyc, id));
    m.relationship.mockResolvedValue({
      isMutualCruush: true, canMessage: true, canRevealPreciseLocation: false, targetBaseMode: "GHOST"
    });
    m.policy.mockResolvedValue({ baseMode: "GHOST", preciseToMutualCrowds: [], policyVersion: 1 });

    const response = await app.inject({ method: "GET", url: "/api/cruush/mutual-map", headers });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.profiles).toHaveLength(1);
    expect(response.json().data.profiles[0]).toMatchObject({
      lastActive: "Online", distanceLabel: "Nearby", canRevealPreciseLocation: false,
      relationship: { precision: "fuzzy" }
    });
    expect(m.displayToken.mock.calls[0][2]).toMatchObject({ displayMode: "GHOST" });
    expect(m.ghost).toHaveBeenCalledTimes(1);
  });

  it.each(["active", "suspended", "banned"])("excludes only banned activity, including stored Sent snapshots (%s)", async accountStatus => {
    seedActivity();
    accountStatuses.set(publicId, accountStatus);
    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.counts).toEqual(accountStatus === "banned"
      ? { incoming: 0, sent: 0, mutual: 0, views: 0 }
      : { incoming: 1, sent: 2, mutual: 1, views: 1 });
    if (accountStatus === "banned") {
      for (const key of ["incoming", "sent", "mutual", "views"]) expect(data[key]).toEqual([]);
    }
  });

  it("hides incoming, sent (including dismissed snapshots), mutuals, views and their counts", async () => {
    seedActivity();
    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.counts).toEqual({ incoming: 1, sent: 2, mutual: 1, views: 1 });
    for (const key of ["incoming", "sent", "mutual", "views"]) {
      expect(response.json().data[key].every((row: { user: { id: string } }) => row.user.id === publicId)).toBe(true);
    }
    expect(response.body).not.toContain(hiddenId);
    expect(response.body).not.toContain("Hidden member");
    expect(response.body).not.toContain("Stored identity");
  });

  it("also hides the opted-in member from the legacy activity endpoint", async () => {
    seedActivity();
    const response = await app.inject({ method: "GET", url: `/api/cruush/${viewerId}`, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.received).toHaveLength(1);
    expect(response.json().data.sent).toHaveLength(2);
    expect(response.body).not.toContain(hiddenId);
  });

  it("does not unlock older Basic view history when the newest view is OOS-hidden", async () => {
    seedActivity();
    m.entitlement.mockResolvedValue({ cruushPlus: false });
    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.counts.views).toBe(1);
    expect(response.json().data.views).toEqual([expect.objectContaining({ id: "public-profile_view", locked: true, user: null })]);
  });

  it.each([
    { mode: "approximate", resolvedTown: "Holmdel, NJ", expected: "Far far away" },
    { mode: "precise", resolvedTown: "Holmdel, NJ", expected: "Holmdel, NJ" },
    { mode: "precise", resolvedTown: null, expected: "Far far away" }
  ])("uses the shared $mode saved-OOS label on every unlocked activity list (town: $resolvedTown)", async ({ mode, resolvedTown, expected }) => {
    seedActivity();
    savedStates.set(publicId, savedState(publicId, true));
    savedStates.set(hiddenId, savedState(hiddenId, true));
    m.distanceMode.mockResolvedValue(mode);
    m.towns.mockImplementation(async (_app, ids: string[]) => new Map(
      ids.flatMap(id => resolvedTown ? [[id, resolvedTown]] : [])
    ));

    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    const data = response.json().data;
    expect(data.counts).toEqual({ incoming: 1, sent: 2, mutual: 1, views: 1 });
    for (const key of ["incoming", "sent", "mutual", "views"]) {
      for (const item of data[key]) {
        expect(item).toMatchObject({ locked: false, distanceLabel: expected, user: { id: publicId, outOfSight: true } });
      }
    }
    expect(m.distanceMode.mock.calls.map(call => call.slice(1))).toContainEqual([viewerId, publicId, { forTown: true }]);
    const townIds = m.towns.mock.calls.flatMap(([, ids]) => ids as string[]);
    expect(townIds).toEqual(mode === "precise" ? [publicId] : []);
    expect(townIds).not.toContain(hiddenId);
    expect(response.body).not.toContain(hiddenId);
    expect(response.body).not.toContain("state_ciphertext");
    expect(m.displayToken).not.toHaveBeenCalled();
  });

  it("keeps activity towns coarse when the town-aware shared mode restricts an otherwise precise subject", async () => {
    seedActivity();
    savedStates.set(publicId, savedState(publicId, true));
    m.distanceMode.mockImplementation(async (_app, _viewer, _subject, options?: { forTown?: boolean }) =>
      options?.forTown ? "approximate" : "precise");
    m.towns.mockResolvedValue(new Map([[publicId, "Holmdel, NJ"]]));

    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    for (const key of ["incoming", "sent", "mutual", "views"]) {
      for (const item of response.json().data[key]) expect(item.distanceLabel).toBe("Far far away");
    }
    expect(m.distanceMode.mock.calls.map(call => call.slice(1))).toContainEqual([viewerId, publicId, { forTown: true }]);
    expect(m.towns.mock.calls.flatMap(([, ids]) => ids as string[])).toEqual([]);
    expect(response.body).not.toContain("Holmdel, NJ");
  });

  it("preserves Dark Room for a saved-OOS STEALTH mutual instead of replacing it with a coarse location", async () => {
    seedActivity();
    savedStates.set(publicId, savedState(publicId, true));
    m.relationship.mockResolvedValue({
      isMutualCruush: true, canMessage: true, canRevealPreciseLocation: true,
      targetBaseMode: "STEALTH", targetDarkRoomDistanceLabel: true
    });
    m.distanceMode.mockImplementation(async (_app, _viewer, _subject, options?: { forTown?: boolean }) =>
      options?.forTown ? "approximate" : "precise");

    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.mutual[0]).toMatchObject({
      distance: "Dark Room", distanceLabel: "Dark Room", canRevealPreciseLocation: false,
      user: { id: publicId, outOfSight: true }
    });
    expect(m.towns.mock.calls.flatMap(([, ids]) => ids as string[])).toEqual([]);
    expect(m.displayToken).not.toHaveBeenCalled();
  });

  it.each([false, true])("enriches retained activity with a precise town only when current profile visibility allows the viewer (%s)", async allowed => {
    seedActivity();
    profiles = profiles.map(row => row.id === publicId
      ? profile(publicId, { age_range: [25, 35] })
      : row.id === viewerId ? { ...row, year_of_birth: new Date().getFullYear() - (allowed ? 30 : 60) } : row);
    savedStates.set(publicId, savedState(publicId, true));
    m.distanceMode.mockResolvedValue("precise");
    m.towns.mockImplementation(async (_app, ids: string[]) => new Map(ids.map(id => [id, "Holmdel, NJ"])));

    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    const data = response.json().data;
    expect(data.counts).toEqual({ incoming: 1, sent: 2, mutual: 1, views: 1 });
    for (const key of ["incoming", "sent", "mutual", "views"]) {
      for (const item of data[key]) {
        expect(item).toMatchObject({
          locked: false, distanceLabel: allowed ? "Holmdel, NJ" : "Far far away", user: { id: publicId }
        });
      }
    }
    expect(m.towns.mock.calls.flatMap(([, ids]) => ids as string[])).toEqual(allowed ? [publicId] : []);
    if (!allowed) expect(response.body).not.toContain("Holmdel, NJ");
    expect(m.assertCanSend).not.toHaveBeenCalled();
  });

  it("retains activity without a fresh town when a current distance visibility rule cannot be measured", async () => {
    seedActivity();
    profiles = profiles.map(row => row.id === publicId ? profile(publicId, { distance: 10 }) : row);
    savedStates.set(publicId, savedState(publicId, true));
    m.distanceMode.mockResolvedValue("precise");
    m.towns.mockImplementation(async (_app, ids: string[]) => new Map(ids.map(id => [id, "Holmdel, NJ"])));
    // The viewer has an envelope, but this target has no coordinate evidence.
    m.locations.mockResolvedValue(new Map([[viewerId, location()]]));

    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.counts).toEqual({ incoming: 1, sent: 2, mutual: 1, views: 1 });
    for (const key of ["incoming", "sent", "mutual", "views"]) {
      for (const item of response.json().data[key]) {
        expect(item).toMatchObject({ distanceLabel: "Far far away", user: { id: publicId } });
      }
    }
    expect(m.towns.mock.calls.flatMap(([, ids]) => ids as string[])).toEqual([]);
    expect(response.body).not.toContain("Holmdel, NJ");
  });

  it.each(["missing", "corrupt"])("does not invent activity labels or resolve towns from %s saved subject state", async kind => {
    seedActivity();
    if (kind === "missing") savedStates.delete(publicId);
    else savedStates.set(publicId, { ...savedState(publicId, true), state_auth_tag: "invalid" });
    m.distanceMode.mockResolvedValue("precise");
    m.towns.mockResolvedValue(new Map([[publicId, "Holmdel, NJ"]]));

    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    for (const key of ["incoming", "sent", "mutual", "views"]) {
      for (const item of response.json().data[key]) {
        expect(item).not.toHaveProperty("distanceLabel");
        expect(item.user).not.toHaveProperty("outOfSight");
      }
    }
    expect(m.towns.mock.calls.flatMap(([, ids]) => ids as string[])).toEqual([]);
    expect(response.body).not.toContain("Holmdel, NJ");
    expect(response.body).not.toContain("New York, NY");
  });

  it.each([
    { mode: "approximate", expected: "Among sinners" },
    { mode: "precise", expected: "New York, NY" }
  ])("labels an in-area activity subject for a saved-OOS viewer using shared $mode mode", async ({ mode, expected }) => {
    seedActivity();
    m.distanceMode.mockResolvedValue(mode);
    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    for (const key of ["incoming", "sent", "mutual", "views"]) {
      for (const item of response.json().data[key]) expect(item.distanceLabel).toBe(expected);
    }
    expect(m.distanceMode.mock.calls.map(call => call.slice(1))).toContainEqual([viewerId, publicId, { forTown: true }]);
    expect(m.towns.mock.calls.flatMap(([, ids]) => ids as string[])).toEqual([]);
  });

  it("preserves ordinary in-area activity distance without adding a coarse override", async () => {
    seedActivity();
    savedStates.set(viewerId, savedState(viewerId, false));
    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    for (const key of ["incoming", "sent", "mutual", "views"]) {
      for (const item of response.json().data[key]) expect(item).not.toHaveProperty("distanceLabel");
    }
    expect(response.json().data.mutual[0].distance).toBe("Nearby");
    expect(m.towns.mock.calls.flatMap(([, ids]) => ids as string[])).toEqual([]);
  });

  it.each([false, true])("uses effective message eligibility %s on every unlocked activity item despite relationship permission", async allowed => {
    seedActivity();
    m.canSend.mockResolvedValue(allowed);
    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    const data = response.json().data;
    expect(data.counts).toEqual({ incoming: 1, sent: 2, mutual: 1, views: 1 });
    for (const key of ["incoming", "sent", "mutual", "views"]) {
      for (const item of data[key]) {
        expect(item.user.id).toBe(publicId);
        if (key === "mutual") expect(item.canMessage).toBe(allowed);
        else {
          expect(item.permissions).toMatchObject({ canMessage: allowed, canRevealPreciseLocation: true });
          expect(item).not.toHaveProperty("canMessage");
        }
      }
    }
    expect(m.canSend.mock.calls.map(call => call.slice(1, 3))).toEqual([[viewerId, publicId]]);
    expect(m.assertCanSend).not.toHaveBeenCalled();
  });

  it("does not resolve town, distance mode or message eligibility for a locked-only activity identity", async () => {
    m.entitlement.mockResolvedValue({ cruushPlus: false });
    savedStates.set(publicId, savedState(publicId, true));
    m.distanceMode.mockResolvedValue("precise");
    m.canSend.mockResolvedValue(false);
    m.towns.mockResolvedValue(new Map([[publicId, "Holmdel, NJ"]]));
    m.byTarget.mockImplementation(async (_app, { type, status }) => type === "profile_view" && !status ? [
      record("hidden-profile_view", type, hiddenId, viewerId),
      record("public-profile_view", type, publicId, viewerId, "2026-10-08T12:00:00.000Z")
    ] : []);

    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode, response.body).toBe(200);
    const data = response.json().data;
    expect(data.counts).toEqual({ incoming: 0, sent: 0, mutual: 0, views: 1 });
    expect(data.views).toHaveLength(1);
    expect(data.views[0]).toMatchObject({ id: "public-profile_view", locked: true, user: null });
    for (const key of ["distanceLabel", "canMessage", "permissions", "coordinates", "locationPin"]) expect(data.views[0]).not.toHaveProperty(key);
    expect(m.distanceMode).not.toHaveBeenCalled();
    expect(m.canSend).not.toHaveBeenCalled();
    expect(m.towns.mock.calls.flatMap(([, ids]) => ids as string[])).toEqual([]);
    expect(response.body).not.toContain(publicId);
    expect(response.body).not.toContain("Holmdel, NJ");
    expect(m.displayToken).not.toHaveBeenCalled();
  });

  it.each(["physical", "mhc"])("shows opted-in activity for an in-area %s viewer", async (mode) => {
    seedActivity();
    if (mode === "physical") m.locations.mockResolvedValue(new Map([[viewerId, location(nyc)]]));
    else m.travelPins.mockResolvedValue(new Map([[viewerId, travelPin()]]));
    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.counts).toEqual({ incoming: 2, sent: 4, mutual: 2, views: 2 });
  });

  it("keeps block exclusions when effective location is in-area", async () => {
    seedActivity();
    m.locations.mockResolvedValue(new Map([[viewerId, location(nyc)]]));
    m.blockedIds.mockResolvedValue(new Set([hiddenId]));
    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(hiddenId);
  });

  it.each([false, true])("denies a known-ID cruush before writes, including an existing mutual (%s)", async (mutual) => {
    if (mutual) m.find.mockResolvedValue(record("mutual", "mutual_cruush", viewerId, hiddenId));
    const response = await app.inject({ method: "POST", url: "/api/cruush", headers, payload: { toUserId: hiddenId } });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes("insert into conversations"))).toBe(false);
  });

  it("still permits an OOS viewer to cruush a member who has not opted in", async () => {
    const response = await app.inject({ method: "POST", url: "/api/cruush", headers, payload: { toUserId: publicId } });
    expect(response.statusCode).toBe(201);
    expect(m.upsert).toHaveBeenCalledOnce();
  });

  it("does not expose an opted-in mutual-map member when viewer location is unavailable", async () => {
    m.byParticipant.mockResolvedValue([record("mutual", "mutual_cruush", viewerId, hiddenId)]);
    m.locations.mockResolvedValue(new Map());
    m.location.mockResolvedValue(null);
    const response = await app.inject({ method: "GET", url: "/api/cruush/mutual-map", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.profiles).toEqual([]);
    expect(m.displayToken).not.toHaveBeenCalled();
  });

  it("allows in-area MHC mutual-map access while preserving independent target privacy", async () => {
    m.byParticipant.mockResolvedValue([record("mutual", "mutual_cruush", viewerId, hiddenId)]);
    m.travelPins.mockResolvedValue(new Map([[viewerId, travelPin()]]));
    const response = await app.inject({ method: "GET", url: "/api/cruush/mutual-map", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.profiles).toHaveLength(1);
    profiles[0] = profile(hiddenId, { outside_service_area_members: true, mile_high_club_members: true });
    const denied = await app.inject({ method: "GET", url: "/api/cruush/mutual-map", headers });
    expect(denied.statusCode).toBe(200);
    expect(denied.json().data.profiles).toEqual([]);
  });

  it.each(["oos", "unknown", "effective-oos", "expired-mhc", "corrupt-policy"])("denies a new known-ID DM for %s", async (state) => {
    if (state === "unknown") m.locations.mockResolvedValue(new Map());
    if (state === "effective-oos") {
      m.locations.mockResolvedValue(new Map([[viewerId, location(nyc)]]));
      m.travelPins.mockResolvedValue(new Map([[viewerId, travelPin(outside)]]));
    }
    // The travel-pin loader omits expired pins.
    if (state === "expired-mhc") m.travelPins.mockResolvedValue(new Map());
    if (state === "corrupt-policy") profiles[0].profile_visibility_auth_tag = "invalid";
    const response = await app.inject({ method: "POST", url: "/api/conversations/dm", headers, payload: { otherUserId: hiddenId } });
    expect(response.statusCode).toBe(404);
    expect(query.mock.calls.some(([sql]) => sql.includes("insert into conversations"))).toBe(false);
  });

  it.each(["physical", "mhc", "opt-out"])("permits new DMs for %s eligibility", async (state) => {
    if (state === "physical") m.locations.mockResolvedValue(new Map([[viewerId, location(nyc)]]));
    if (state === "mhc") m.travelPins.mockResolvedValue(new Map([[viewerId, travelPin()]]));
    if (state === "opt-out") profiles[0] = profile(hiddenId);
    const response = await app.inject({ method: "POST", url: "/api/conversations/dm", headers, payload: { otherUserId: hiddenId } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.id).toBe(conversationId);
  });

  it("reopens an existing DM without consulting OOS policy or location", async () => {
    existingDm = true;
    m.locations.mockRejectedValue(new Error("location unavailable"));
    profiles[0].profile_visibility_auth_tag = "invalid";
    const response = await app.inject({ method: "POST", url: "/api/conversations/dm", headers, payload: { otherUserId: hiddenId } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.id).toBe(conversationId);
    expect(m.locations).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes("from profiles"))).toBe(false);
    const lookup = query.mock.calls.find(([sql]) => sql.includes("where kind = 'dm'"));
    expect(lookup?.[1]).toEqual([[viewerId, hiddenId].sort().join(":")]);
  });

  it("preserves block restrictions when reopening an existing DM", async () => {
    existingDm = true;
    m.hasBlock.mockResolvedValue(true);
    const response = await app.inject({ method: "POST", url: "/api/conversations/dm", headers, payload: { otherUserId: hiddenId } });
    expect(response.statusCode).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { mode: "approximate", expected: "Among sinners" },
    { mode: "precise", expected: "New York, NY" }
  ])("preserves existing DM list, history, read receipt and send with the target opted in ($mode labels)", async ({ mode, expected }) => {
    m.locations.mockResolvedValue(new Map([
      [viewerId, location(outside, viewerId)],
      [hiddenId, location(nyc, hiddenId)]
    ]));
    m.distanceMode.mockResolvedValue(mode);
    const encrypted = encryptTextContent(config, "message", "Existing history");
    const previousQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, values: unknown[] = []) => sql.includes("from messages m\n       join conversations") ? { rows: [{
      ...historicalMessage, content: "[encrypted]", content_ciphertext: encrypted.ciphertext,
      content_nonce: encrypted.nonce, content_auth_tag: encrypted.authTag, content_key_version: encrypted.keyVersion
    }] } : previousQuery(sql, values));
    const list = await app.inject({ method: "GET", url: "/api/conversations", headers });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data[0]).toMatchObject({ id: conversationId, user: { id: hiddenId }, canMessage: true });
    expect(list.json().data[0].distance).toBe(expected);
    expect(query.mock.calls.filter(([sql]) => sql.includes("from oos_service_area_state")))
      .toHaveLength(1);
    const history = await app.inject({ method: "GET", url: `/api/messages/${conversationId}`, headers });
    expect(history.statusCode).toBe(200);
    expect(history.json().data.conversation.distance).toBe(expected);
    expect(query.mock.calls.filter(([sql]) => sql.includes("from oos_service_area_state")))
      .toHaveLength(2);
    expect(history.json().data.messages[0].content).toBe("Existing history");
    expect(query.mock.calls.some(([sql]) => sql.includes("update conversation_members set last_read_at"))).toBe(true);
    const sent = await app.inject({ method: "POST", url: "/api/messages", headers, payload: { conversationId, content: "Still here" } });
    expect(sent.statusCode).toBe(201);
    expect(sent.json().data.content).toBe("Still here");
    expect(m.assertCanSend.mock.calls.map((call) => call.slice(1))).toContainEqual([viewerId, hiddenId]);
    // Last-known labels read encrypted participant state, not GPS. Sending
    // adds no state/location read and does not re-check profile visibility.
    expect(query.mock.calls.filter(([sql]) => sql.includes("from oos_service_area_state"))
      .map(([, values]) => values)).toEqual([[[viewerId, hiddenId]], [[viewerId, hiddenId]]]);
    expect(m.locations).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes("from profiles"))).toBe(false);
  });

  it.each([
    { kind: "outside", expected: true },
    { kind: "inside", expected: false },
    { kind: "missing", expected: undefined },
    { kind: "corrupt", expected: undefined },
    { kind: "wrong-member ciphertext", expected: undefined }
  ])("uses $kind saved state for DM and sender glyphs, never GPS or MHC", async ({ kind, expected }) => {
    const row = savedState(hiddenId, kind === "outside");
    if (kind === "missing") savedStates.delete(hiddenId);
    else if (kind === "corrupt") savedStates.set(hiddenId, { ...row, state_auth_tag: "invalid" });
    else if (kind === "wrong-member ciphertext") savedStates.set(hiddenId, { ...savedState(publicId, true), user_id: hiddenId });
    else savedStates.set(hiddenId, row);
    m.locations.mockRejectedValue(new Error("Metadata must not load GPS"));
    m.location.mockRejectedValue(new Error("Metadata must not load GPS"));
    m.travelPins.mockResolvedValue(new Map([[hiddenId, { ...travelPin(expected ? nyc : outside), userId: hiddenId }]]));
    const previousQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, values: unknown[] = []) => sql.includes("from messages m\n       join conversations")
      ? { rows: [{ ...historicalMessage, sender_name: "Hidden member", sender_pronouns: ["they"], sender_photo: "/test-photo" }] }
      : previousQuery(sql, values));

    const list = await app.inject({ method: "GET", url: "/api/conversations", headers });
    const history = await app.inject({ method: "GET", url: `/api/messages/${conversationId}`, headers });
    expect(list.statusCode, list.body).toBe(200);
    expect(history.statusCode, history.body).toBe(200);
    expect(list.json().data[0].canMessage).toBe(true);
    expect(history.json().data.messages[0].content).toBe("Existing history");
    for (const user of [list.json().data[0].user, history.json().data.conversation.user, history.json().data.messages[0].user]) {
      expect(user.id).toBe(hiddenId);
      if (expected === undefined) expect(user).not.toHaveProperty("outOfSight");
      else expect(user.outOfSight).toBe(expected);
    }
    expect(query.mock.calls.filter(([sql]) => sql.includes("from oos_service_area_state"))
      .map(([, values]) => values)).toContainEqual([[hiddenId]]);
    expect(m.locations).not.toHaveBeenCalled();
    expect(m.location).not.toHaveBeenCalled();
    expect(m.travelPins).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes("from profiles"))).toBe(false);
    expect(list.body + history.body).not.toContain("state_ciphertext");
  });

  it("uses saved activity glyphs without changing physical or MHC access", async () => {
    seedActivity();
    savedStates.set(hiddenId, savedState(hiddenId, true));
    m.travelPins.mockResolvedValue(new Map([[viewerId, travelPin()]]));
    const response = await app.inject({ method: "GET", url: "/api/cruush/me", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.counts).toEqual({ incoming: 2, sent: 4, mutual: 2, views: 2 });
    for (const key of ["incoming", "sent", "mutual", "views"]) {
      for (const item of response.json().data[key]) expect(item.user.outOfSight).toBe(item.user.id === hiddenId);
    }
  });

  it("preserves the recipient's existing message audience on send", async () => {
    m.assertCanSend.mockRejectedValue(new ApiError(403, "FORBIDDEN", "cruushes only"));
    const response = await app.inject({ method: "POST", url: "/api/messages", headers, payload: { conversationId, content: "Still here" } });
    expect(response.statusCode).toBe(403);
    expect(m.moderate).not.toHaveBeenCalled();
    expect(m.locations).not.toHaveBeenCalled();
  });

  it.each(["new-group", "new-member"])("denies OOS-hidden mutuals as %s invitees", async (kind) => {
    const response = await app.inject({ method: "POST", headers,
      url: kind === "new-group" ? "/api/conversations/groups" : `/api/conversations/groups/${conversationId}/members`,
      payload: kind === "new-group" ? { title: "Friends", memberIds: [hiddenId] } : { userId: hiddenId }
    });
    expect(response.statusCode).toBe(404);
    expect(m.relationship.mock.calls.map((call) => call.slice(1))).toContainEqual([viewerId, hiddenId]);
    expect(query.mock.calls.some(([sql]) => sql.includes("insert into"))).toBe(false);
  });

  it.each(["plain", "encrypted"] as const)("does not reclassify an existing %s group member as new contact", async (kind) => {
    existingGroupMember = kind;
    const response = await app.inject({ method: "POST", headers,
      url: `/api/conversations/groups/${conversationId}/members`, payload: { userId: hiddenId }
    });
    expect(response.statusCode).toBe(204);
  });

  it("requires authentication before OOS or activity lookups", async () => {
    const response = await app.inject({ method: "GET", url: "/api/cruush/me" });
    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
    expect(m.byParticipant).not.toHaveBeenCalled();
  });
});
