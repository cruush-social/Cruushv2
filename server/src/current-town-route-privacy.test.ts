import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { formatError, toApiError } from "./errors.js";
import { emptyProfile } from "./profile-schema.js";
import { encryptProfileVisibility } from "./profile-sensitive.js";
import { encryptOosState, type EncryptedOosState } from "./oos-state-crypto.js";
import type { LocationPayload } from "./location-privacy.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerMessageRoutes } from "./routes/messages.js";

const m = vi.hoisted(() => ({
  towns: vi.fn(), locations: vi.fn(), location: vi.fn(), pins: vi.fn(), pin: vi.fn(), token: vi.fn(),
  outside: vi.fn(), hidden: vi.fn(), relationship: vi.fn(), policy: vi.fn(), distanceMode: vi.fn(),
  loadPolicy: vi.fn(), assertNotBlocked: vi.fn(), assertCanSend: vi.fn(), moderate: vi.fn(), notify: vi.fn()
}));
vi.mock("./current-town-labels.js", () => ({ loadCurrentTownLabels: m.towns }));
vi.mock("./location-privacy.js", async original => ({
  ...await original<typeof import("./location-privacy.js")>(),
  loadLocationEnvelopes: m.locations, loadLocationEnvelope: m.location,
  loadVisibilityPolicy: m.loadPolicy, makeDisplayLocationToken: m.token
}));
vi.mock("./travel-pins.js", async original => ({
  ...await original<typeof import("./travel-pins.js")>(), loadTravelPins: m.pins, getTravelPin: m.pin
}));
vi.mock("./profile-oos-visibility.js", async original => ({
  ...await original<typeof import("./profile-oos-visibility.js")>(),
  getViewerOutsideServiceArea: m.outside, loadOosHiddenProfileIds: m.hidden
}));
vi.mock("./match-relationships.js", async original => ({
  ...await original<typeof import("./match-relationships.js")>(),
  getRelationshipPermissions: m.relationship, getEffectiveVisibilityPolicy: m.policy,
  getSharedDistanceLabelMode: m.distanceMode, recordProfileView: vi.fn()
}));
vi.mock("./nsfw-photo-audience.js", async original => ({
  ...await original<typeof import("./nsfw-photo-audience.js")>(),
  loadPhotoViewerRelationships: vi.fn().mockResolvedValue(new Map()),
  loadSharedCrowdUserIds: vi.fn().mockResolvedValue(new Set()),
  getNsfwPhotoAudience: vi.fn().mockResolvedValue("public")
}));
vi.mock("./user-blocks.js", async original => ({
  ...await original<typeof import("./user-blocks.js")>(), assertUsersNotBlocked: m.assertNotBlocked
}));
vi.mock("./cruush-match-settings.js", async original => ({
  ...await original<typeof import("./cruush-match-settings.js")>(),
  canStartDirectMessage: vi.fn().mockResolvedValue(true), assertCanStartDirectMessage: m.assertCanSend
}));
vi.mock("./moderation-service.js", async original => ({
  ...await original<typeof import("./moderation-service.js")>(), moderateMessageTextOrAllowByKeyword: m.moderate
}));
vi.mock("./rewards-service.js", () => ({ recordMeaningfulActivitySafely: vi.fn() }));
vi.mock("./notification-service.js", () => ({ createAppNotificationAndPush: m.notify }));
vi.mock("./owner-access.js", async original => ({
  ...await original<typeof import("./owner-access.js")>(), userHasOwnerFullAccess: vi.fn().mockResolvedValue(false)
}));

const viewer = "11111111-1111-4111-8111-111111111111";
const subject = "22222222-2222-4222-8222-222222222222";
const denied = "33333333-3333-4333-8333-333333333333";
const extra = "44444444-4444-4444-8444-444444444444";
const conversationId = "55555555-5555-4555-8555-555555555555";
const messageId = "66666666-6666-4666-8666-666666666666";
const time = "2026-10-09T12:00:00.000Z";
const town = "Holmdel, NJ";
const config = {
  NODE_ENV: "test", SESSION_SECRET: "synthetic-current-town-route-session",
  PROFILE_ENCRYPTION_KEY: "synthetic-current-town-profile-key",
  LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 0x54).toString("base64"), LOCATION_ENCRYPTION_KEY_VERSION: "v1",
  VISIBILITY_POLICY_ENCRYPTION_KEY: Buffer.alloc(32, 0x56).toString("base64"), VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION: "v1"
} as AppConfig;
type StateRow = EncryptedOosState & { user_id: string };
type Surface = "profile" | "feed" | "dm-list" | "dm-history";
const urls: Record<Surface, string> = {
  profile: `/api/profiles/${subject}`, feed: "/api/posts",
  "dm-list": "/api/conversations", "dm-history": `/api/messages/${conversationId}`
};
function state(id: string, outside = true): StateRow {
  return { user_id: id, ...encryptOosState(config, id, {
    is_outside: outside, current_event_id: outside ? messageId : null
  }) };
}
function location(id: string): LocationPayload {
  return { version: 1, subjectUserId: id, locationVersion: 1,
    latE7: 400000000, lonE7: -740000000, accuracyM: 20, source: "GPS",
    deviceReportedAtMs: Date.now(), collectedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000, keyVersion: "v1" };
}
function post(id = subject, at = time) {
  return { id, user_id: id, content: "Existing Feed content", audience: "public", expires_in: "never",
    created_at: at, display_name: "Member", pronouns: [], photos: [], has_live_location: false, show_distance: true,
    distance_miles: 3.25 };
}
function conversation(id = conversationId, other = subject) {
  return { id, kind: "dm", title: null, updated_at: time, other_user_id: other,
    other_user_name: "Member", other_user_pronouns: ["they"], other_user_photo: null,
    last_message: "Existing history", unread_count: 1, member_count: 2, disappearing_timer: "off", closed_at: null };
}

describe("current town labels use only authorized precise saved-OOS subjects", () => {
  let app: FastifyInstance;
  let saved: Map<string, StateRow>;
  let hiddenIds: Set<string>;
  let unreadableDmIds: Set<string>;
  let stealthIds: Set<string>;
  let modes: Map<string, "precise" | "approximate">;
  let posts: ReturnType<typeof post>[];
  let conversations: ReturnType<typeof conversation>[];
  let routeErrors: unknown[];
  let policyRows: Map<string, Record<string, unknown>>;
  let corruptProfileIds: Set<string>;
  let profilePrivacyReadFailure: boolean;
  const query = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    saved = new Map([viewer, subject, denied, extra].map(id => [id, state(id)]));
    hiddenIds = new Set(); unreadableDmIds = new Set(); stealthIds = new Set(); modes = new Map();
    posts = [post()]; conversations = [conversation()];
    routeErrors = [];
    policyRows = new Map();
    corruptProfileIds = new Set(); profilePrivacyReadFailure = false;
    m.loadPolicy.mockResolvedValue(null);
    m.towns.mockImplementation(async (_app, ids: string[]) => new Map(ids.map(id => [id, town])));
    m.outside.mockResolvedValue(true);
    m.hidden.mockImplementation(async (_app, _viewer, ids: string[]) => new Set(ids.filter(id => hiddenIds.has(id))));
    m.distanceMode.mockImplementation(async (_app, _viewer, id: string, options?: { forTown?: boolean }) =>
      options?.forTown && stealthIds.has(id) ? "approximate" : modes.get(id) ?? "precise");
    m.policy.mockImplementation(async (_app, id: string) => ({
      baseMode: stealthIds.has(id) ? "STEALTH" : "PUBLIC_PRECISE", preciseToMutualCrowds: [], policyVersion: 1
    }));
    m.relationship.mockImplementation(async (_app, _viewer, id: string) => ({
      isBlocked: false, isMutualCruush: true, canRevealPreciseLocation: !stealthIds.has(id),
      canMessage: !unreadableDmIds.has(id), targetBaseMode: stealthIds.has(id) ? "STEALTH" : "PUBLIC_PRECISE",
      distanceLabelMode: modes.get(id) ?? "precise"
    }));
    m.locations.mockImplementation(async (_app, ids: string[]) => new Map(ids.map(id => [id, location(id)])));
    m.location.mockImplementation(async (_app, id: string) => location(id));
    m.pins.mockResolvedValue(new Map()); m.pin.mockResolvedValue(null);
    m.token.mockResolvedValue({ tokenId: "synthetic-token", expiresAtMs: Date.now() + 60_000 });
    m.moderate.mockResolvedValue({ providerResult: { provider: "test", labels: [] }, decision: { action: "allow" } });
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("from encrypted_visibility_tokens")) {
        const row = policyRows.get(String(params[0]));
        return { rows: row ? [row] : [] };
      }
      if (sql.includes("insert into encrypted_visibility_tokens")) {
        policyRows.set(String(params[0]), {
          subject_user_id: params[0], policy_version: params[1], policy_ciphertext: params[2],
          policy_nonce: params[3], policy_auth_tag: params[4], wrapped_policy_dek: params[5],
          policy_dek_nonce: params[6], policy_dek_auth_tag: params[7], key_version: params[8], updated_at_ms: params[9]
        });
        return { rows: [{ subject_user_id: params[0] }] };
      }
      if (sql.includes("update ghost_rotation_tokens")) return { rows: [] };
      if (sql.includes("with paid_state as")) return { rows: [{ has_lifetime: true }] };
      if (sql.includes("from oos_service_area_state")) {
        expect(sql).toContain("state_ciphertext");
        return { rows: (params[0] as string[]).flatMap(id => saved.has(id) ? [saved.get(id)!] : []) };
      }
      if (sql.includes("from posts p")) return { rows: posts };
      if (sql.includes("from profile_kink_interests")) return { rows: [] };
      if (sql.includes("from profiles")) {
        if (profilePrivacyReadFailure && sql.includes("where id = any($1::uuid[])")) {
          throw new Error("Synthetic profile privacy read failure");
        }
        const ids = Array.isArray(params[0]) ? params[0] as string[] : [String(params[0])];
        return { rows: ids.map(id => ({
          ...emptyProfile, id, display_name: "Member", year_of_birth: 1994, photos: [], updated_at: time,
          ...encryptProfileVisibility(config, { ...emptyProfile.visibility_rules,
            outside_service_area_members: hiddenIds.has(id) }),
          ...(corruptProfileIds.has(id) ? { profile_visibility_auth_tag: "invalid" } : {})
        })) };
      }
      if (sql.includes("from app_users") && sql.includes("where id::text")) return { rows: [{ id: params[0] }] };
      if (sql.includes("from conversation_members cm") && sql.includes("last_message")) {
        return { rows: params.length > 2 ? conversations.filter(row => row.id === params[2]) : conversations };
      }
      if (sql.includes("from messages m")) return { rows: [{
        id: messageId, user_id: subject, content: "Existing history", created_at: time, attachments: []
      }] };
      if (sql.includes("with membership as")) return { rows: [{
        id: messageId, user_id: viewer, content: "[encrypted]", created_at: time, attachments: [],
        content_ciphertext: params[2], content_nonce: params[3], content_auth_tag: params[4], content_key_version: params[5]
      }] };
      if (sql.startsWith("update conversation_members") || sql.includes("from conversation_members cm")) return { rows: [] };
      throw new Error("Unexpected current-town route fixture SQL");
    });
    app = Fastify({ logger: false });
    app.decorate("config", config); app.decorate("db", { query, end: vi.fn() });
    app.decorate("rateLimiter", { assert: vi.fn() });
    app.setErrorHandler((error, _request, reply) => {
      routeErrors.push(error);
      const apiError = toApiError(error); return reply.code(apiError.statusCode).send(formatError(apiError));
    });
    await registerProfileRoutes(app); await registerPostRoutes(app); await registerMessageRoutes(app);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External requests forbidden"); }));
  });
  afterEach(async () => { await app.close(); vi.unstubAllGlobals(); });

  const lookupIds = () => m.towns.mock.calls.flatMap(([, ids]) => ids as string[]);
  const get = async (surface: Surface, authenticated = true) => {
    const response = await app.inject({
      method: "GET", url: urls[surface], headers: authenticated ? { "x-user-id": viewer } : {}
    });
    if (response.statusCode === 500) throw routeErrors.at(-1);
    return response;
  };
  function label(surface: Surface, data: any) {
    return surface === "profile" ? data.distance_label : surface === "dm-history" ? data.conversation.distance : data[0].distance;
  }

  async function useRealEncryptedPrivacy() {
    const crypto = await vi.importActual<typeof import("./location-privacy.js")>("./location-privacy.js");
    const relationships = await vi.importActual<typeof import("./match-relationships.js")>("./match-relationships.js");
    for (const id of [viewer, subject]) {
      await crypto.saveVisibilityPolicy(app, id, {
        baseMode: stealthIds.has(id) ? "STEALTH" : "PUBLIC_PRECISE",
        distanceLabelMode: modes.get(id) ?? "precise", auditRequired: false
      });
    }
    m.loadPolicy.mockImplementation(crypto.loadVisibilityPolicy);
    m.distanceMode.mockImplementation(relationships.getSharedDistanceLabelMode);
    return { crypto, relationships };
  }

  async function useRealOosProfileVisibility() {
    const visibility = await vi.importActual<typeof import("./profile-oos-visibility.js")>("./profile-oos-visibility.js");
    m.hidden.mockImplementation(visibility.loadOosHiddenProfileIds);
    // The real opt-in helper uses effective current viewer GPS, independently
    // of saved display membership. This synthetic viewer is outside NYC.
    m.locations.mockImplementation(async (_app, ids: string[]) => new Map(ids.map(id => [id, {
      ...location(id), ...(id === viewer ? { latE7: 377700000, lonE7: -1224100000 } : {})
    }])));
  }

  it.each(Object.keys(urls) as Surface[])("requires authentication before %s town lookup", async surface => {
    const response = await get(surface, false);
    expect(response.statusCode).toBe(401); expect(lookupIds()).toEqual([]); expect(query).not.toHaveBeenCalled();
  });
  it.each(Object.keys(urls) as Surface[])("resolves only the authorized precise saved-OOS subject for %s", async surface => {
    const response = await get(surface);
    expect(response.statusCode, response.body).toBe(200); expect(label(surface, response.json().data)).toBe(town);
    expect(lookupIds()).toEqual([subject]); expect(m.token).not.toHaveBeenCalled();
    expect(response.body).not.toContain("state_ciphertext");
  });
  it.each((Object.keys(urls) as Surface[]).flatMap(surface =>
    ["approximate", "unknown", "corrupt", "inside"].map(reason => ({ surface, reason }))
  ))("does not resolve a town for $surface with $reason eligibility", async ({ surface, reason }) => {
    if (reason === "approximate") modes.set(subject, "approximate");
    if (reason === "unknown") saved.delete(subject);
    if (reason === "corrupt") saved.set(subject, { ...state(subject), state_auth_tag: "invalid" });
    if (reason === "inside") saved.set(subject, state(subject, false));
    const response = await get(surface);
    expect(response.statusCode, response.body).toBe(200);
    expect(lookupIds()).toEqual([]); expect(response.body).not.toContain(town);
    if (reason === "approximate") expect(label(surface, response.json().data)).toBe("Far far away");
    if (reason === "unknown" || reason === "corrupt") {
      // Missing saved status suppresses town/coarse metadata, not the profile's
      // existing numeric-distance path with fresh in-area GPS and mutual precision.
      expect(label(surface, response.json().data)).toBe(surface === "profile" ? "0.0 mi" : "Nearby");
    }
  });
  it("does not resolve an opted-in profile denied to an outside viewer", async () => {
    hiddenIds.add(subject);
    expect((await get("profile")).statusCode).toBe(404); expect(lookupIds()).toEqual([]);
  });
  it("never resolves a hidden-distance Feed row, even with precise saved-OOS metadata", async () => {
    posts[0].show_distance = false;
    const response = await get("feed");
    expect(response.statusCode).toBe(200); expect(response.json().data).toHaveLength(1);
    expect(lookupIds()).toEqual([]); expect(response.body).not.toContain(town);
    expect(response.json().data[0]).not.toHaveProperty("locationPin");
  });
  it("limits Feed town batches to the authorized returned page, excluding hidden and overflow rows", async () => {
    hiddenIds.add(denied);
    posts = [post(denied), post(subject, "2026-10-09T11:00:00Z"), post(extra, "2026-10-09T10:00:00Z")];
    const response = await app.inject({ method: "GET", url: "/api/posts?limit=1", headers: { "x-user-id": viewer } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.map((row: { user: { id: string } }) => row.user.id)).toEqual([subject]);
    expect(lookupIds()).toEqual([subject]); expect(m.towns).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain(denied); expect(response.body).not.toContain(extra);
  });
  it("batches only readable precise saved-OOS direct conversations", async () => {
    unreadableDmIds.add(denied); modes.set(extra, "approximate");
    conversations = [conversation(), conversation(denied, denied), conversation(extra, extra)];
    const response = await get("dm-list");
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.map((row: { user: { id: string } }) => row.user.id)).toEqual([subject, extra]);
    expect(lookupIds()).toEqual([subject]); expect(m.towns).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain(denied);
  });
  it("rejects nonmember message history without resolving the other member's town", async () => {
    conversations = [];
    expect((await get("dm-history")).statusCode).toBe(404); expect(lookupIds()).toEqual([]);
  });
  it("rejects unreadable existing-DM history before any town lookup", async () => {
    unreadableDmIds.add(subject);
    expect((await get("dm-history")).statusCode).toBe(404); expect(lookupIds()).toEqual([]);
  });
  it.each(["approximate", "encrypted STEALTH"])("preserves existing opted-in DM history, receipts and sending with %s privacy", async privacy => {
    hiddenIds.add(subject);
    if (privacy === "approximate") modes.set(subject, "approximate");
    else { stealthIds.add(subject); await useRealEncryptedPrivacy(); }
    const response = await get("dm-history");
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.messages[0].content).toBe("Existing history");
    expect(query.mock.calls.some(([sql]) => sql.includes("update conversation_members set last_read_at"))).toBe(true);
    const sent = await app.inject({ method: "POST", url: "/api/messages", headers: { "x-user-id": viewer },
      payload: { conversationId, content: "Still here" } });
    expect(sent.statusCode, sent.body).toBe(201); expect(sent.json().data.content).toBe("Still here");
    expect(m.assertCanSend.mock.calls.map(call => call.slice(1))).toContainEqual([viewer, subject]);
    expect(lookupIds()).toEqual([]); expect(m.hidden).not.toHaveBeenCalled();
  });
  it.each(Object.keys(urls) as Surface[])("does not disclose a STEALTH subject's current town through %s", async surface => {
    stealthIds.add(subject);
    await useRealEncryptedPrivacy();
    const response = await get(surface);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).not.toContain(town); expect(lookupIds()).toEqual([]);
    if (surface === "profile") expect(response.json().data.distance_label).toBeNull();
    else {
      expect(label(surface, response.json().data)).toBe("Far far away");
      expect(m.distanceMode.mock.calls.map(call => call.slice(1))).toContainEqual([viewer, subject, { forTown: true }]);
    }
  });

  it.each((["feed", "dm-list", "dm-history"] as Surface[]).flatMap(surface =>
    [true, false].map(viewerOutside => ({ surface, viewerOutside }))
  ))("keeps the STEALTH $surface label coarse when the subject is in-area (viewer outside: $viewerOutside)", async ({ surface, viewerOutside }) => {
    stealthIds.add(subject);
    saved.set(subject, state(subject, false)); saved.set(viewer, state(viewer, viewerOutside));
    m.outside.mockResolvedValue(viewerOutside);
    await useRealEncryptedPrivacy();
    const response = await get(surface);
    expect(response.statusCode).toBe(200); expect(lookupIds()).toEqual([]);
    expect(label(surface, response.json().data)).toBe(viewerOutside ? "Among sinners" : "Nearby");
    expect(response.body).not.toContain(town); expect(response.body).not.toContain("New York, NY");
    expect(response.body).not.toContain("3.3 mi");
  });

  it("uses real encrypted STEALTH privacy only for town-aware mode without extra policy or entitlement reads", async () => {
    stealthIds.add(subject);
    const { crypto, relationships } = await useRealEncryptedPrivacy();
    const stored = policyRows.get(subject)!;
    expect(stored).not.toHaveProperty("baseMode");
    expect(String(stored.policy_ciphertext)).not.toContain("STEALTH");
    expect(Buffer.from(String(stored.policy_nonce), "base64")).toHaveLength(12);
    expect(Buffer.from(String(stored.policy_auth_tag), "base64")).toHaveLength(16);
    expect(await crypto.loadVisibilityPolicyStrict(app, subject)).toMatchObject({
      subjectUserId: subject, baseMode: "STEALTH", distanceLabelMode: "precise", auditRequired: false
    });

    query.mockClear(); m.loadPolicy.mockClear();
    expect(await relationships.getSharedDistanceLabelMode(app, viewer, subject)).toBe("precise");
    const baselineCalls = query.mock.calls.map(([sql, params]) => [sql, params]);
    expect(baselineCalls).toHaveLength(3); // Two existing policy reads and the existing STEALTH entitlement check.
    expect(m.loadPolicy.mock.calls.map(([, id]) => id)).toEqual([viewer, subject]);

    query.mockClear(); m.loadPolicy.mockClear();
    expect(await relationships.getSharedDistanceLabelMode(app, viewer, subject, { forTown: true })).toBe("approximate");
    expect(query.mock.calls).toEqual(baselineCalls);
    expect(m.loadPolicy.mock.calls.map(([, id]) => id)).toEqual([viewer, subject]);
    expect(await relationships.getSharedDistanceLabelMode(app, viewer, subject, { forTown: false })).toBe("precise");
    expect(await crypto.loadVisibilityPolicyStrict(app, subject)).toMatchObject({ baseMode: "STEALTH", distanceLabelMode: "precise" });
  });

  it("keeps a non-STEALTH subject precise even when the viewer has real encrypted STEALTH privacy", async () => {
    stealthIds.add(viewer);
    const { relationships } = await useRealEncryptedPrivacy();
    expect(await relationships.getSharedDistanceLabelMode(app, viewer, subject, { forTown: true })).toBe("precise");
  });

  it.each([viewer, subject])("respects an encrypted approximate preference on either participant (%s)", async id => {
    modes.set(id, "approximate");
    const { relationships } = await useRealEncryptedPrivacy();
    expect(await relationships.getSharedDistanceLabelMode(app, viewer, subject)).toBe("approximate");
    expect(await relationships.getSharedDistanceLabelMode(app, viewer, subject, { forTown: true })).toBe("approximate");
  });

  it("fails closed when the actual encrypted subject policy is unreadable", async () => {
    const { relationships } = await useRealEncryptedPrivacy();
    policyRows.get(subject)!.policy_auth_tag = "invalid";
    expect(await relationships.getSharedDistanceLabelMode(app, viewer, subject, { forTown: true })).toBe("approximate");
    const response = await get("dm-history");
    expect(response.statusCode).toBe(200); expect(lookupIds()).toEqual([]);
    expect(label("dm-history", response.json().data)).toBe("Far far away");
  });

  it.each((["dm-list", "dm-history"] as Surface[]).flatMap(surface =>
    ["opted-in hidden", "unreadable encrypted profile", "privacy read failure"].map(reason => ({ surface, reason }))
  ))("hides only the precise non-STEALTH town on $surface for $reason, preserving existing chats", async ({ surface, reason }) => {
    const { crypto, relationships } = await useRealEncryptedPrivacy();
    await useRealOosProfileVisibility();
    expect(await crypto.loadVisibilityPolicyStrict(app, subject)).toMatchObject({
      baseMode: "PUBLIC_PRECISE", distanceLabelMode: "precise", auditRequired: false
    });
    expect(await relationships.getSharedDistanceLabelMode(app, viewer, subject, { forTown: true })).toBe("precise");
    if (reason === "opted-in hidden") hiddenIds.add(subject);
    if (reason === "unreadable encrypted profile") corruptProfileIds.add(subject);
    if (reason === "privacy read failure") profilePrivacyReadFailure = true;

    const response = await get(surface);
    expect(response.statusCode, response.body).toBe(200);
    expect(label(surface, response.json().data)).toBe("Far far away");
    expect(response.body).not.toContain(town); expect(lookupIds()).toEqual([]);
    expect(m.hidden.mock.calls.map(call => call.slice(1))).toEqual([[viewer, [subject]]]);
    if (surface === "dm-list") {
      expect(response.json().data).toHaveLength(1);
      expect(response.json().data[0]).toMatchObject({ id: conversationId, user: { id: subject } });
    }

    const history = surface === "dm-history" ? response : await get("dm-history");
    expect(history.statusCode).toBe(200);
    expect(history.json().data.messages[0].content).toBe("Existing history");
    expect(history.json().data.conversation.distance).toBe("Far far away");
    expect(history.body).not.toContain(town);
    expect(query.mock.calls.some(([sql]) => sql.includes("update conversation_members set last_read_at"))).toBe(true);
    const sent = await app.inject({ method: "POST", url: "/api/messages", headers: { "x-user-id": viewer },
      payload: { conversationId, content: "Still here" } });
    expect(sent.statusCode, sent.body).toBe(201); expect(sent.json().data.content).toBe("Still here");
    expect(m.assertCanSend.mock.calls.map(call => call.slice(1))).toContainEqual([viewer, subject]);
    expect(lookupIds()).toEqual([]); expect(sent.body).not.toContain(town);
  });

  it("batches precise DM town privacy once, omitting hidden and unreadable-chat subjects without removing readable chats", async () => {
    hiddenIds.add(subject); unreadableDmIds.add(denied);
    const { crypto } = await useRealEncryptedPrivacy();
    await crypto.saveVisibilityPolicy(app, extra, { baseMode: "PUBLIC_PRECISE", distanceLabelMode: "precise" });
    await useRealOosProfileVisibility();
    conversations = [conversation(), conversation(denied, denied), conversation(extra, extra)];

    const response = await get("dm-list");
    expect(response.statusCode, response.body).toBe(200);
    const rows = response.json().data;
    expect(rows.map((row: { user: { id: string } }) => row.user.id)).toEqual([subject, extra]);
    expect(rows[0].distance).toBe("Far far away"); expect(rows[1].distance).toBe(town);
    expect(m.hidden.mock.calls.map(call => call.slice(1))).toEqual([[viewer, [subject, extra]]]);
    expect(lookupIds()).toEqual([extra]); expect(m.towns).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain(denied);
  });
});
