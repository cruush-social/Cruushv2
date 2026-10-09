import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyNearbyUsersForLocationUpdate } from "./nearby-notifications.js";
import type { AppConfig } from "./config.js";
import { loadLocationEnvelopes, type LocationPayload } from "./location-privacy.js";
import { loadOosHiddenProfileIds } from "./profile-oos-visibility.js";
import { loadTravelPins, type TravelPin } from "./travel-pins.js";

vi.mock("./profile-oos-visibility.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./profile-oos-visibility.js")>(),
  loadOosHiddenProfileIds: vi.fn()
}));

vi.mock("./travel-pins.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./travel-pins.js")>(),
  loadTravelPins: vi.fn()
}));

const query = vi.fn();

vi.mock("./notification-service.js", async () => ({
  createAppNotificationAndPush: vi.fn(async (app: { db: { query: typeof query } }, input: {
    userId: string;
    type: string;
    title: string;
    body?: string;
    linkUrl?: string;
    dedupeKey?: string | null;
    metadata?: Record<string, unknown>;
  }) => {
    const result = await app.db.query(
      `insert into app_notifications (
         user_id,
         type,
         title,
         body,
         link_url,
         actor_user_id,
         conversation_id,
         dedupe_key,
         metadata
       )
       values ($1, $2, $3, $4, $5, null, null, $6, $7::jsonb)
       returning id::text as id,
         user_id::text as user_id,
         type,
         title,
         body,
         link_url,
         actor_user_id::text as actor_user_id,
         conversation_id::text as conversation_id,
         metadata,
         read_at,
         created_at`,
      [
        input.userId,
        input.type,
        input.title,
        input.body ?? "",
        input.linkUrl ?? "",
        input.dedupeKey ?? null,
        input.metadata ?? {}
      ]
    );

    return result.rows[0] ?? null;
  })
}));

vi.mock("./profile-sensitive.js", async () => {
  const actual = await vi.importActual<typeof import("./profile-sensitive.js")>("./profile-sensitive.js");

  return {
    ...actual,
    decryptSensitiveProfile: vi.fn((_config, row: Record<string, unknown>) => row._sensitiveProfile ?? null),
    decryptProfileVisibility: vi.fn((_config, row: Record<string, unknown>) => row._visibilityRules ?? null)
  };
});

const { resolveViewerGhostCoordinateMock } = vi.hoisted(() => ({
  resolveViewerGhostCoordinateMock: vi.fn()
}));

vi.mock("./location-privacy.js", async () => {
  const actual = await vi.importActual<typeof import("./location-privacy.js")>("./location-privacy.js");

  return {
    ...actual,
    loadLocationEnvelopes: vi.fn().mockResolvedValue(new Map()),
    resolveViewerGhostCoordinate: resolveViewerGhostCoordinateMock
  };
});

const baseConfig: AppConfig = {
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: true,
  DEVELOPMENT_ADMIN_ENABLED: false,
  DEVELOPMENT_ADMIN_PASSWORD: "",
  TURNSTILE_SECRET_KEY: "",
  PROFILE_ENCRYPTION_KEY: "",
  PROFILE_TOKEN_KEY: "",
  PROFILE_TOKEN_KEY_VERSION: "v1",
  RELATIONSHIP_ENCRYPTION_KEY: "",
  RELATIONSHIP_INDEX_KEY: "",
  RELATIONSHIP_ENCRYPTION_KEY_VERSION: "v1",
  RELATIONSHIP_INDEX_KEY_VERSION: "v1",
  MATCH_TOKEN_ENCRYPTION_KEY: "",
  MATCH_TOKEN_SIGNING_KEY: "",
  MATCH_TOKEN_KEY_VERSION: "v1",
  WEB_PUSH_ENABLED: false,
  WEB_PUSH_VAPID_PUBLIC_KEY: "",
  WEB_PUSH_VAPID_PRIVATE_KEY: "",
  WEB_PUSH_SUBJECT: "mailto:hello@cruush.app"
};

const sourceUserId = "00000000-0000-4000-8000-000000000001";
const recipientAllowedId = "00000000-0000-4000-8000-000000000002";
const recipientFilteredId = "00000000-0000-4000-8000-000000000003";

function locationPayload(latE7: number, lonE7: number, collectedAtMs: number) {
  return {
    version: 1,
    subjectUserId: sourceUserId,
    locationVersion: collectedAtMs,
    latE7,
    lonE7,
    accuracyM: 50,
    source: "GPS",
    deviceReportedAtMs: collectedAtMs,
    collectedAtMs,
    expiresAtMs: collectedAtMs + 180_000,
    keyVersion: "legacy"
  } as const;
}

function nearbySourceRow() {
  return {
    year_of_birth: 1992,
    identities: [],
    presentation: [],
    looking_for: [],
    availability: [],
    hosting_travel: [],
    vibes: [],
    scenes: [],
    archetypes: [],
    hobbies: [],
    position: [],
    role: [],
    kinks: [],
    body_type: [],
    sexuality: [],
    substance_boundaries: [],
    lat: 0,
    lng: 0,
    fuzzy_lat: 0,
    fuzzy_lng: 0,
    profile_sensitive_ciphertext: null,
    profile_sensitive_nonce: null,
    profile_sensitive_auth_tag: null,
    profile_sensitive_key_version: null
  };
}

function nearbyRecipientRow(input: {
  id: string;
  latitude: number;
  visibilityRules?: Record<string, unknown> | null;
}) {
  return {
    id: input.id,
    year_of_birth: 1990,
    identities: [],
    presentation: [],
    looking_for: [],
    availability: [],
    hosting_travel: [],
    vibes: [],
    scenes: [],
    archetypes: [],
    hobbies: [],
    position: [],
    role: [],
    kinks: [],
    body_type: [],
    sexuality: [],
    substance_boundaries: [],
    lat: input.latitude,
    lng: 0,
    fuzzy_lat: input.latitude,
    fuzzy_lng: 0,
    profile_visibility_ciphertext: null,
    profile_visibility_nonce: null,
    profile_visibility_auth_tag: null,
    profile_visibility_key_version: null,
    updated_at: "2026-08-08T12:00:00.000Z",
    _visibilityRules: input.visibilityRules ?? null
  };
}

function publicVisibilityPolicy() {
  return {
    version: 1 as const,
    subjectUserId: sourceUserId,
    policyVersion: 1,
    baseMode: "PUBLIC_PRECISE" as const,
    ghostRadiusMeters: 250,
    preciseToMutualCruushes: false,
    preciseToMutualCrowds: [],
    auditRequired: false,
    updatedAtMs: Date.parse("2026-08-08T12:00:00.000Z"),
    expiresAtMs: null,
    keyVersion: "v1"
  };
}

function distanceVisibilityRules(distance: number) {
  return {
    active_crowd_modes: [],
    age_range: null,
    distance,
    identities: [],
    presentations: [],
    looking_for: [],
    timing: [],
    hosting: [],
    vibes: [],
    crowds: [],
    hobbies: [],
    positions: [],
    roles: [],
    kinks: [],
    body_types: [],
    sexuality: [],
    substance_boundaries: []
  };
}

beforeEach(() => {
  query.mockReset();
  resolveViewerGhostCoordinateMock.mockReset();
  vi.mocked(loadLocationEnvelopes).mockReset().mockResolvedValue(new Map());
  vi.mocked(loadTravelPins).mockReset().mockResolvedValue(new Map());
  vi.mocked(loadOosHiddenProfileIds).mockReset().mockResolvedValue(new Set());
});

describe("nearby notifications", () => {
  it("notifies only the recipient who does not filter the source out", async () => {
    const nearbyLocation = locationPayload(407100000, -740000000, Date.parse("2026-08-08T12:00:00.000Z"));

    query
      .mockResolvedValueOnce({
        rows: [{
          year_of_birth: 1992,
          identities: ["man"],
          presentation: ["masc"],
          looking_for: ["friends"],
          availability: [],
          hosting_travel: [],
          vibes: [],
          scenes: [],
          archetypes: [],
          hobbies: [],
          position: [],
          role: [],
          kinks: [],
          body_type: [],
          sexuality: [],
          substance_boundaries: [],
          lat: 40.71,
          lng: -74.0,
          fuzzy_lat: 40.71,
          fuzzy_lng: -74.0,
          profile_sensitive_ciphertext: null,
          profile_sensitive_nonce: null,
          profile_sensitive_auth_tag: null,
          profile_sensitive_key_version: null,
          _sensitiveProfile: {
            crowds: [],
            kinks: [],
            kink_interests: [],
            hiv_status: [],
            custom_hiv_status: "",
            is_trans: null
          }
        }]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: recipientAllowedId,
            year_of_birth: 1990,
            identities: ["woman"],
            presentation: [],
            looking_for: [],
            availability: [],
            hosting_travel: [],
            vibes: [],
            scenes: [],
            archetypes: [],
            hobbies: [],
            position: [],
            role: [],
            kinks: [],
            body_type: [],
            sexuality: [],
            substance_boundaries: [],
            lat: 40.72,
            lng: -74.01,
            fuzzy_lat: 40.72,
            fuzzy_lng: -74.01,
            profile_visibility_ciphertext: null,
            profile_visibility_nonce: null,
            profile_visibility_auth_tag: null,
            profile_visibility_key_version: null,
            updated_at: "2026-08-08T12:00:00.000Z",
            _visibilityRules: null
          },
          {
            id: recipientFilteredId,
            year_of_birth: 1991,
            identities: ["woman"],
            presentation: [],
            looking_for: [],
            availability: [],
            hosting_travel: [],
            vibes: [],
            scenes: [],
            archetypes: [],
            hobbies: [],
            position: [],
            role: [],
            kinks: [],
            body_type: [],
            sexuality: [],
            substance_boundaries: [],
            lat: 40.72,
            lng: -74.01,
            fuzzy_lat: 40.72,
            fuzzy_lng: -74.01,
            profile_visibility_ciphertext: "ciphertext",
            profile_visibility_nonce: "nonce",
            profile_visibility_auth_tag: "tag",
            profile_visibility_key_version: "v1",
            updated_at: "2026-08-08T12:00:00.000Z",
            _visibilityRules: {
              active_crowd_modes: [],
              age_range: null,
              distance: null,
              identities: ["man"],
              presentations: [],
              looking_for: [],
              timing: [],
              hosting: [],
              vibes: [],
              crowds: [],
              hobbies: [],
              positions: [],
              roles: [],
              kinks: [],
              body_types: [],
              sexuality: [],
              substance_boundaries: []
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "00000000-0000-4000-8000-000000000010",
          user_id: recipientAllowedId,
          type: "nearby_activity",
          title: "Someone nearby",
          body: "Someone within your radar may be in your area.",
          link_url: "/map?layer=nearby",
          actor_user_id: null,
          conversation_id: null,
          metadata: { sourceUserId, distanceMiles: 0.87 },
          read_at: null,
          created_at: "2026-08-08T12:01:00.000Z"
        }]
      });

    const result = await notifyNearbyUsersForLocationUpdate({
      config: baseConfig,
      db: { query, end: vi.fn() },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      sourceUserId,
      location: nearbyLocation,
      visibilityPolicy: {
        version: 1,
        subjectUserId: sourceUserId,
        policyVersion: 1,
        baseMode: "PUBLIC_PRECISE",
        ghostRadiusMeters: 250,
        preciseToMutualCruushes: false,
        preciseToMutualCrowds: [],
        auditRequired: false,
        updatedAtMs: Date.parse("2026-08-08T12:00:00.000Z"),
        expiresAtMs: null,
        keyVersion: "v1"
      }
    });

    expect(result).toEqual({
      attempted: true,
      sent: 1
    });
    const recipientQuery = query.mock.calls.find(([sql]) => String(sql).includes("from profiles p"));
    expect(recipientQuery?.[0]).toContain("coalesce(preferences.nearby_enabled, true) = true");
    expect(recipientQuery?.[0]).not.toContain("preferences.push_enabled = true");
    expect(recipientQuery?.[0]).not.toContain("from push_subscriptions subscription");
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("insert into app_notifications"))).toHaveLength(1);
    expect(query.mock.calls.some(([sql, params]) => String(sql).includes("insert into app_notifications") && params?.[0] === recipientAllowedId)).toBe(true);
    expect(query.mock.calls.some(([sql, params]) => String(sql).includes("insert into app_notifications") && params?.[0] === recipientFilteredId)).toBe(false);
    const allowedNotification = query.mock.calls.find(([sql, params]) => String(sql).includes("insert into app_notifications") && params?.[0] === recipientAllowedId);
    expect(allowedNotification?.[1]?.[4]).toBe("/map?layer=nearby");
    expect(allowedNotification?.[1]?.[5]).toBe(`nearby:${recipientAllowedId}:${Math.floor(nearbyLocation.collectedAtMs / (4 * 24 * 60 * 60 * 1000))}`);
    expect(String(allowedNotification?.[1]?.[5])).not.toContain(sourceUserId);

    // The distance is derived from the subject's precise coordinates and must
    // never be published. Ghost Mode subjects reach this path — only STEALTH
    // short-circuits above — and the app shows them as "Nearby" rather than a
    // distance, so a published value would defeat the feature.
    const notificationInserts = query.mock.calls.filter(([sql]) => String(sql).includes("insert into app_notifications"));
    expect(notificationInserts.length).toBeGreaterThan(0);

    for (const [, params] of notificationInserts) {
      const serialized = JSON.stringify((params as unknown[])?.[6] ?? {});
      expect(serialized).not.toMatch(/distance/i);
      expect(serialized).toContain(sourceUserId);
    }
  });

  it("does not count or re-push when the recipient already received a nearby alert in the four-day window", async () => {
    const recipientId = "00000000-0000-4000-8000-000000000004";
    const collectedAtMs = Date.parse("2026-08-08T12:00:00.000Z");

    query
      .mockResolvedValueOnce({ rows: [nearbySourceRow()] })
      .mockResolvedValueOnce({
        rows: [nearbyRecipientRow({
          id: recipientId,
          latitude: 0
        })]
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await notifyNearbyUsersForLocationUpdate({
      config: baseConfig,
      db: { query, end: vi.fn() },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      sourceUserId,
      location: locationPayload(0, 0, collectedAtMs),
      visibilityPolicy: publicVisibilityPolicy()
    });

    expect(result).toEqual({
      attempted: true,
      sent: 0
    });
    const notificationInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into app_notifications"));
    expect(notificationInsert?.[1]?.[5]).toBe(`nearby:${recipientId}:${Math.floor(collectedAtMs / (4 * 24 * 60 * 60 * 1000))}`);
  });

  it.each([
    ["notifies at 4.99 miles", 0.07222035459489765, 1],
    ["does not notify at 5.01 miles", 0.07250981493395534, 0]
  ])("%s", async (_caseName, recipientLatitude, expectedSent) => {
    const recipientId = "00000000-0000-4000-8000-000000000004";
    const collectedAtMs = Date.parse("2026-08-08T12:00:00.000Z");

    query
      .mockResolvedValueOnce({ rows: [nearbySourceRow()] })
      .mockResolvedValueOnce({
        rows: [nearbyRecipientRow({
          id: recipientId,
          latitude: recipientLatitude
        })]
      })
      .mockResolvedValueOnce({ rows: expectedSent ? [{ id: "notification-1" }] : [] });

    const result = await notifyNearbyUsersForLocationUpdate({
      config: baseConfig,
      db: { query, end: vi.fn() },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      sourceUserId,
      location: locationPayload(0, 0, collectedAtMs),
      visibilityPolicy: publicVisibilityPolicy()
    });

    expect(result).toEqual({
      attempted: true,
      sent: expectedSent
    });
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("insert into app_notifications"))).toHaveLength(expectedSent);
  });

  it("applies the recipient distance rule using the recipient map location", async () => {
    const recipientId = "00000000-0000-4000-8000-000000000005";
    const collectedAtMs = Date.parse("2026-08-08T12:00:00.000Z");

    query
      .mockResolvedValueOnce({ rows: [nearbySourceRow()] })
      .mockResolvedValueOnce({
        rows: [nearbyRecipientRow({
          id: recipientId,
          latitude: 0.07222035459489765,
          visibilityRules: distanceVisibilityRules(4.5)
        })]
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await notifyNearbyUsersForLocationUpdate({
      config: baseConfig,
      db: { query, end: vi.fn() },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      sourceUserId,
      location: locationPayload(0, 0, collectedAtMs),
      visibilityPolicy: publicVisibilityPolicy()
    });

    expect(result).toEqual({
      attempted: true,
      sent: 0
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into app_notifications"))).toBe(false);
  });

  // Removing the distance from the payload was not enough on its own: the
  // decision to deliver is itself a one-bit oracle on the subject's true
  // position, and several positioned accounts intersect those bits to localise
  // a Ghost subject well below the ghost cell. Delivery must therefore be
  // decided on the decoy, which the subject already publishes.
  it("decides Ghost delivery on the decoy rather than the true position", async () => {
    const recipientId = "00000000-0000-4000-8000-000000000005";
    const collectedAtMs = Date.parse("2026-08-08T12:00:00.000Z");

    // A recipient sitting essentially on top of the subject's TRUE point. If the
    // gate still used the true coordinate this is a guaranteed delivery; decided
    // on the decoy it depends on where the decoy landed, which is at least half
    // the ghost radius away by construction.
    query
      .mockResolvedValueOnce({ rows: [nearbySourceRow()] })
      .mockResolvedValueOnce({
        rows: [nearbyRecipientRow({ id: recipientId, latitude: 0 })]
      })
      .mockResolvedValueOnce({ rows: [] });

    const ghostPolicy = {
      ...publicVisibilityPolicy(),
      baseMode: "GHOST" as const,
      ghostRadiusMeters: 1609
    };

    // Decoy placed far away, so a gate that still used the true coordinate
    // (recipient sitting on it) would deliver, and one using the decoy will not.
    resolveViewerGhostCoordinateMock.mockResolvedValueOnce({
      coordinate: { lat: 1, lng: 1 },
      rotationEpoch: 1,
      radiusMeters: 1609
    });

    const result = await notifyNearbyUsersForLocationUpdate({
      config: baseConfig,
      db: { query, end: vi.fn() },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      sourceUserId,
      location: locationPayload(0, 0, collectedAtMs),
      visibilityPolicy: ghostPolicy
    });

    expect(resolveViewerGhostCoordinateMock).toHaveBeenCalledTimes(1);
    expect(resolveViewerGhostCoordinateMock.mock.calls[0]?.[1]).toMatchObject({
      subjectUserId: sourceUserId
    });
    expect(result.sent).toBe(0);
  });

  it("still decides non-Ghost delivery on the real coordinate", async () => {
    const recipientId = "00000000-0000-4000-8000-000000000006";
    const collectedAtMs = Date.parse("2026-08-08T12:00:00.000Z");

    query
      .mockResolvedValueOnce({ rows: [nearbySourceRow()] })
      .mockResolvedValueOnce({
        rows: [nearbyRecipientRow({ id: recipientId, latitude: 0 })]
      })
      .mockResolvedValueOnce({ rows: [{ id: "notification-1" }] });

    const result = await notifyNearbyUsersForLocationUpdate({
      config: baseConfig,
      db: { query, end: vi.fn() },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    } as never, {
      sourceUserId,
      location: locationPayload(0, 0, collectedAtMs),
      visibilityPolicy: publicVisibilityPolicy()
    });

    expect(resolveViewerGhostCoordinateMock).not.toHaveBeenCalled();
    expect(result.sent).toBe(1);
  });

  it.each([
    { scenario: "outside viewer", location: "outside", pin: false, hide: true, sent: 0 },
    { scenario: "missing encrypted location with nearby legacy coordinates", location: "missing", pin: false, hide: true, sent: 0 },
    { scenario: "in-area viewer", location: "inside", pin: false, hide: true, sent: 1 },
    { scenario: "in-area MHC viewer", location: "outside", pin: true, hide: true, sent: 1 },
    { scenario: "opt-out with unknown viewer location", location: "missing", pin: false, hide: false, sent: 1 }
  ])("suppresses hidden nearby activity for $scenario", async (testCase) => {
    const actual = await vi.importActual<typeof import("./profile-oos-visibility.js")>("./profile-oos-visibility.js");
    vi.mocked(loadOosHiddenProfileIds).mockImplementation(actual.loadOosHiddenProfileIds);
    const collectedAtMs = Date.now();
    const sourceLocation = locationPayload(407128000, -740060000, collectedAtMs);
    const source = {
      ...nearbySourceRow(),
      id: sourceUserId,
      profile_visibility_ciphertext: "encrypted-test-policy",
      _visibilityRules: { outside_service_area_members: testCase.hide }
    };
    const recipient = {
      ...nearbyRecipientRow({ id: recipientAllowedId, latitude: 40.713 }),
      lng: -74.006,
      fuzzy_lng: -74.006
    };
    // The alert's displayed distance stays nearby while OOS uses encrypted state.
    // Ghost display and old profile coordinates must never become OOS authority.
    const locations = new Map<string, LocationPayload>([[sourceUserId, sourceLocation]]);
    if (testCase.location !== "missing") {
      const outside = testCase.location === "outside";
      locations.set(recipientAllowedId, {
        ...locationPayload(outside ? 423601000 : 407130000, outside ? -710589000 : -740060000, collectedAtMs),
        subjectUserId: recipientAllowedId
      });
    }
    if (testCase.pin) {
      locations.set(recipientAllowedId, {
        ...locationPayload(423601000, -710589000, collectedAtMs),
        subjectUserId: recipientAllowedId
      });
      vi.mocked(loadTravelPins).mockResolvedValue(new Map([[recipientAllowedId, {
        latitude: 40.713, longitude: -74.006, setAtMs: collectedAtMs, expiresAtMs: collectedAtMs + 1000
      } as TravelPin]]));
    }
    // First load drives the existing proximity check; subsequent loads are the
    // helper's encrypted OOS lookup, independent from public display coordinates.
    vi.mocked(loadLocationEnvelopes).mockResolvedValue(locations).mockResolvedValueOnce(new Map());
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("insert into app_notifications")) return { rows: [{ id: "notification-1" }] };
      if (sql.includes("from profiles p")) return { rows: [recipient] };
      return { rows: [source] };
    });
    const app = { config: baseConfig, db: { query, end: vi.fn() } } as never;

    expect(await notifyNearbyUsersForLocationUpdate(app, {
      sourceUserId, location: sourceLocation, visibilityPolicy: publicVisibilityPolicy()
    })).toEqual({ attempted: true, sent: testCase.sent });
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("insert into app_notifications")))
      .toHaveLength(testCase.sent);
    expect(loadOosHiddenProfileIds).toHaveBeenCalledWith(app, recipientAllowedId, [sourceUserId]);
  });

  it.each([
    { scenario: "in-area source", outside: false, pin: false, sent: 1 },
    { scenario: "OOS source", outside: true, pin: false, sent: 0 },
    { scenario: "effective in-area MHC source", outside: true, pin: true, sent: 1 }
  ])("passes the correct OOS subject to the existing recipient matcher for $scenario", async (testCase) => {
    const collectedAtMs = Date.now();
    const sourceLocation = locationPayload(407128000, -740060000, collectedAtMs);
    const encryptedLocation = locationPayload(
      testCase.outside ? 423601000 : 407128000,
      testCase.outside ? -710589000 : -740060000,
      collectedAtMs
    );
    vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map([[sourceUserId, encryptedLocation]]));
    if (testCase.pin) {
      vi.mocked(loadTravelPins).mockResolvedValue(new Map([[sourceUserId, {
        latitude: 40.7128, longitude: -74.006, setAtMs: collectedAtMs, expiresAtMs: collectedAtMs + 1000
      } as TravelPin]]));
    }
    query
      .mockResolvedValueOnce({ rows: [nearbySourceRow()] })
      .mockResolvedValueOnce({ rows: [{
        ...nearbyRecipientRow({ id: recipientAllowedId, latitude: 40.713, visibilityRules: { outside_service_area_members: true } }),
        lng: -74.006, fuzzy_lng: -74.006
      }] })
      .mockResolvedValueOnce({ rows: [{ id: "notification-1" }] });

    const result = await notifyNearbyUsersForLocationUpdate({
      config: baseConfig, db: { query, end: vi.fn() }
    } as never, { sourceUserId, location: sourceLocation, visibilityPolicy: publicVisibilityPolicy() });

    expect(result.sent).toBe(testCase.sent);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("insert into app_notifications")))
      .toHaveLength(testCase.sent);
  });
});
