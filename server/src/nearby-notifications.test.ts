import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyNearbyUsersForLocationUpdate } from "./nearby-notifications.js";
import type { AppConfig } from "./config.js";

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

vi.mock("./location-privacy.js", async () => {
  const actual = await vi.importActual<typeof import("./location-privacy.js")>("./location-privacy.js");

  return {
    ...actual,
    loadLocationEnvelopes: vi.fn().mockResolvedValue(new Map())
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

beforeEach(() => {
  query.mockReset();
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
    expect(recipientQuery?.[0]).toContain("preferences.push_enabled = true");
    expect(recipientQuery?.[0]).toContain("from push_subscriptions subscription");
    expect(recipientQuery?.[0]).toContain("subscription.revoked_at is null");
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("insert into app_notifications"))).toHaveLength(1);
    expect(query.mock.calls.some(([sql, params]) => String(sql).includes("insert into app_notifications") && params?.[0] === recipientAllowedId)).toBe(true);
    expect(query.mock.calls.some(([sql, params]) => String(sql).includes("insert into app_notifications") && params?.[0] === recipientFilteredId)).toBe(false);
  });
});
