import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import type { DbClient, DbQueryResult } from "./db.js";
import {
  MAP_PING_ACTIVE_MS,
  MAP_PING_RECIPIENT_LOCATION_MAX_AGE_MS,
  MAP_PING_WINDOW_MS,
  createMapPing,
  getMapPingStatus,
  type MapPingDependencies
} from "./map-pings.js";
import { decryptTextContent } from "./content-encryption.js";
import {
  buildDefaultVisibilityPolicy,
  type LocationPayload,
  type VisibilityPolicyPayload
} from "./location-privacy.js";
import {
  encryptProfileVisibility,
  encryptSensitiveProfile,
  type ProfileVisibilityRules
} from "./profile-sensitive.js";

const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: true,
  DEVELOPMENT_ADMIN_ENABLED: false,
  DEVELOPMENT_ADMIN_PASSWORD: "",
  TURNSTILE_SECRET_KEY: "",
  PROFILE_ENCRYPTION_KEY: "profile-encryption-key-for-tests",
  PROFILE_TOKEN_KEY: "",
  PROFILE_TOKEN_KEY_VERSION: "v1",
  RELATIONSHIP_ENCRYPTION_KEY: "",
  RELATIONSHIP_INDEX_KEY: "",
  RELATIONSHIP_ENCRYPTION_KEY_VERSION: "v1",
  RELATIONSHIP_INDEX_KEY_VERSION: "v1",
  MATCH_TOKEN_ENCRYPTION_KEY: "",
  MATCH_TOKEN_SIGNING_KEY: "",
  MATCH_TOKEN_KEY_VERSION: "v1",
  LOCATION_ENCRYPTION_KEY: "location-encryption-key-32-bytes",
  LOCATION_INDEX_KEY: "location-index-key-32-bytes-long",
  VISIBILITY_POLICY_ENCRYPTION_KEY: "visibility-policy-key-32-bytes",
  GHOST_DERIVATION_KEY: "ghost-derivation-key-32-bytes-ok",
  DISPLAY_TOKEN_ENCRYPTION_KEY: "display-token-key-32-bytes-long",
  LOCATION_ENCRYPTION_KEY_VERSION: "v1",
  LOCATION_INDEX_KEY_VERSION: "v1",
  VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION: "v1",
  GHOST_DERIVATION_KEY_VERSION: "v1",
  DISPLAY_TOKEN_ENCRYPTION_KEY_VERSION: "v1"
};

const senderUserId = "00000000-0000-4000-8000-000000000001";
const nearbyUserId = "00000000-0000-4000-8000-000000000002";
const farUserId = "00000000-0000-4000-8000-000000000003";
const hiddenUserId = "00000000-0000-4000-8000-000000000004";
const now = new Date("2026-08-09T16:00:00.000Z");

const publicRules: ProfileVisibilityRules = {
  search_query: "",
  active_crowd_modes: [],
  mile_high_club_members: false,
  age_range: null,
  distance: null,
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

type StoredPing = {
  id: string;
  user_id: string;
  radius_miles: number;
  idempotency_key: string;
  created_at: string;
  expires_at: string;
};

function senderProfile(
  rules: ProfileVisibilityRules = publicRules,
  signal = "Coffee now",
  feedExpiry: "1h" | "6h" | "24h" | "7d" | "never" = "never"
) {
  return {
    signal,
    feed_post_expiry_default: feedExpiry,
    ...encryptProfileVisibility(config, rules)
  };
}

function recipientProfile(id: string, yearOfBirth = 1990) {
  return {
    id,
    year_of_birth: yearOfBirth,
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
    body_type: [],
    sexuality: [],
    substance_boundaries: [],
    ...encryptSensitiveProfile(config, {
      is_trans: null,
      crowds: [],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    })
  };
}

function location(userId: string, lat: number, lng: number, collectedAt = now): LocationPayload {
  return {
    version: 1,
    subjectUserId: userId,
    locationVersion: collectedAt.getTime(),
    latE7: Math.round(lat * 10_000_000),
    lonE7: Math.round(lng * 10_000_000),
    accuracyM: 10,
    source: "GPS",
    deviceReportedAtMs: collectedAt.getTime(),
    collectedAtMs: collectedAt.getTime(),
    expiresAtMs: collectedAt.getTime() + 4 * MAP_PING_WINDOW_MS,
    keyVersion: "v1"
  };
}

class MapPingDb implements DbClient {
  readonly queries: Array<{ sql: string; params: unknown[] }> = [];
  readonly pings: StoredPing[];
  recipients: ReturnType<typeof recipientProfile>[] = [];
  receivedPings: Array<{ id: string; source_user_id: string; radius_miles: number; expires_at: string }> = [];
  profile = senderProfile();
  insertCount = 0;
  postInsertCount = 0;
  reviewInsertCount = 0;
  private transactionQueue: Promise<void> = Promise.resolve();

  constructor(pings: StoredPing[] = []) {
    this.pings = [...pings];
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
    this.queries.push({ sql, params });

    if (sql.includes("from app_users") && sql.includes("for update")) {
      return { rows: [{ id: senderUserId }] as T[] };
    }

    if (sql.includes("from map_pings") && sql.includes("idempotency_key")) {
      const match = this.pings.find((ping) => ping.user_id === params[0] && ping.idempotency_key === params[1]);
      return { rows: (match ? [match] : []) as T[] };
    }

    if (sql.includes("profile.signal")) {
      return { rows: [this.profile] as T[] };
    }

    if (sql.includes("from user_privacy_settings") && sql.includes("feed_post_expiry_default")) {
      return {
        rows: [{
          feed_post_expiry_default: this.profile.feed_post_expiry_default
        }] as T[]
      };
    }

    if (sql.includes("select created_at") && sql.includes("from map_pings")) {
      const cutoff = new Date(String(params[1])).getTime();
      return {
        rows: this.pings
          .filter((ping) => ping.user_id === params[0] && new Date(ping.created_at).getTime() > cutoff)
          .sort((first, second) => first.created_at.localeCompare(second.created_at))
          .map((ping) => ({ created_at: ping.created_at })) as T[]
      };
    }

    if (sql.includes("insert into map_pings")) {
      this.insertCount += 1;
      const ping: StoredPing = {
        id: `10000000-0000-4000-8000-${String(this.insertCount).padStart(12, "0")}`,
        user_id: String(params[0]),
        radius_miles: Number(params[1]),
        idempotency_key: String(params[2]),
        created_at: String(params[3]),
        expires_at: String(params[4])
      };
      this.pings.push(ping);
      return { rows: [ping] as T[] };
    }

    if (sql.includes("insert into content_reviews")) {
      this.reviewInsertCount += 1;
      return { rows: [] as T[] };
    }

    if (sql.includes("insert into posts")) {
      this.postInsertCount += 1;
      return { rows: [] as T[] };
    }

    if (sql.includes("from profiles profile") && sql.includes("profile.id <> $1")) {
      const requestedRecipientId = params[3] == null ? null : String(params[3]);
      return {
        rows: this.recipients.filter((recipient) =>
          requestedRecipientId == null || recipient.id === requestedRecipientId
        ) as T[]
      };
    }

    if (sql.includes("from map_pings ping") && sql.includes("source_user_id")) {
      return { rows: this.receivedPings as T[] };
    }

    if (sql.includes("from map_pings") && sql.includes("expires_at >")) {
      const cutoff = new Date(String(params[1])).getTime();
      const active = this.pings
        .filter((ping) => ping.user_id === params[0] && new Date(ping.expires_at).getTime() > cutoff)
        .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
      return { rows: (active ? [active] : []) as T[] };
    }

    if (sql.includes("from side_quest_claims") && sql.includes("as balance")) {
      return { rows: [{ balance: 0 }] as T[] };
    }

    // Nobody in these tests is travelling; Mile High Club has its own coverage.
    if (sql.includes("from user_travel_pins")) {
      return { rows: [] as T[] };
    }

    // The Pulse notification fan-out runs after the send and is covered on its
    // own. These tests are about the send.
    if (sql.includes("from map_ping_notifications") || sql.includes("into map_ping_notifications")) {
      return { rows: [] as T[] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  }

  async transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    const previous = this.transactionQueue;
    let release: () => void = () => {};
    this.transactionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      return await fn(this);
    } finally {
      release();
    }
  }

  async end() {
    return undefined;
  }
}

function appWithDb(db: MapPingDb) {
  return {
    config,
    db,
    log: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    }
  } as unknown as FastifyInstance;
}

function dependencies(input: {
  locations?: Map<string, LocationPayload>;
  cruushPlus?: boolean;
  policy?: VisibilityPolicyPayload | null;
  loadLocation?: MapPingDependencies["loadLocation"];
  moderateSignal?: MapPingDependencies["moderateSignal"];
  resolveGhostCoordinate?: MapPingDependencies["resolveGhostCoordinate"];
  getRelationship?: MapPingDependencies["getRelationship"];
} = {}) {
  const locations = input.locations ?? new Map([
    [senderUserId, location(senderUserId, 40.6828509, -73.9521325)]
  ]);

  return {
    now: () => now,
    getEntitlement: async () => ({
      cruushPlus: input.cruushPlus ?? false,
      expiresAt: null
    }),
    loadLocation: input.loadLocation ?? (async (_context: unknown, userId: string) => locations.get(userId) ?? null),
    loadStrictVisibilityPolicy: async () => input.policy === undefined
      ? buildDefaultVisibilityPolicy(config, senderUserId)
      : input.policy,
    moderateSignal: input.moderateSignal ?? vi.fn<MapPingDependencies["moderateSignal"]>(async () => ({
      decision: {
        decision: "allow",
        severity: "none",
        confidence: 1,
        create_evidence_event: false,
        evidence_value: 0,
        trust_impact: 0,
        penalty_decays: true,
        moderation_history_required: false,
        reason_code: "content_allowed"
      },
      providerResult: {
        provider: "test_text_moderation",
        provider_request_id: "test-ping-signal-allow",
        labels: [],
        latency_ms: 0,
        raw_result: {}
      }
    })),
    resolveGhostCoordinate: input.resolveGhostCoordinate ?? vi.fn<MapPingDependencies["resolveGhostCoordinate"]>(
      async (_context, request) => ({
        coordinate: {
          lat: request.location.latE7 / 10_000_000,
          lng: request.location.lonE7 / 10_000_000
        },
        rotationEpoch: 1,
        radiusMeters: request.policy.ghostRadiusMeters ?? 1609
      })
    ),
    getRelationship: input.getRelationship ?? vi.fn<MapPingDependencies["getRelationship"]>(async () => ({
      canRevealPreciseLocation: false
    } as Awaited<ReturnType<MapPingDependencies["getRelationship"]>>))
  } satisfies MapPingDependencies;
}

function storedPing(input: {
  id?: string;
  idempotencyKey?: string;
  createdAt: Date;
  radiusMiles?: number;
}) {
  return {
    id: input.id ?? "20000000-0000-4000-8000-000000000001",
    user_id: senderUserId,
    radius_miles: input.radiusMiles ?? 5,
    idempotency_key: input.idempotencyKey ?? "30000000-0000-4000-8000-000000000001",
    created_at: input.createdAt.toISOString(),
    expires_at: new Date(input.createdAt.getTime() + MAP_PING_ACTIVE_MS).toISOString()
  } satisfies StoredPing;
}

describe("map Pings", () => {
  it("gives free accounts one Ping per rolling 24 hours", async () => {
    const db = new MapPingDb([
      storedPing({ createdAt: new Date(now.getTime() - MAP_PING_WINDOW_MS + 60_000) })
    ]);

    const deps = dependencies();

    await expect(createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 5,
      idempotencyKey: "30000000-0000-4000-8000-000000000002"
    }, deps)).rejects.toMatchObject({
      statusCode: 429,
      code: "RATE_LIMITED",
      details: {
        nextEligibleAt: new Date(now.getTime() + 60_000).toISOString()
      }
    });
    expect(db.insertCount).toBe(0);
    expect(deps.moderateSignal).not.toHaveBeenCalled();
  });

  it("gives cruush+ five Pings per rolling 24 hours with no sender cooldown", async () => {
    const availableDb = new MapPingDb([
      storedPing({ createdAt: new Date(now.getTime() - 2 * 60 * 1000) })
    ]);
    const plusDependencies = dependencies({ cruushPlus: true });
    const status = await getMapPingStatus(appWithDb(availableDb), senderUserId, plusDependencies);

    expect(status.allowance).toEqual({
      limit: 5,
      used: 1,
      remaining: 4,
      nextEligibleAt: null
    });
    await expect(createMapPing(appWithDb(availableDb), {
      userId: senderUserId,
      radiusMiles: 15,
      idempotencyKey: "30000000-0000-4000-8000-000000000003"
    }, plusDependencies)).resolves.toMatchObject({
      allowance: {
        limit: 5,
        used: 2,
        remaining: 3,
        nextEligibleAt: null
      }
    });
    expect(availableDb.insertCount).toBe(1);

    const cappedDb = new MapPingDb([
      storedPing({ id: "20000000-0000-4000-8000-000000000011", createdAt: new Date(now.getTime() - 20 * 60 * 60 * 1000) }),
      storedPing({ id: "20000000-0000-4000-8000-000000000012", createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000) }),
      storedPing({ id: "20000000-0000-4000-8000-000000000013", createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000) }),
      storedPing({ id: "20000000-0000-4000-8000-000000000014", createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000) }),
      storedPing({ id: "20000000-0000-4000-8000-000000000015", createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000) })
    ]);
    const cappedStatus = await getMapPingStatus(appWithDb(cappedDb), senderUserId, plusDependencies);

    expect(cappedStatus.allowance).toEqual({
      limit: 5,
      used: 5,
      remaining: 0,
      nextEligibleAt: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString()
    });
    await expect(createMapPing(appWithDb(cappedDb), {
      userId: senderUserId,
      radiusMiles: 15,
      idempotencyKey: "30000000-0000-4000-8000-000000000013"
    }, plusDependencies)).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
  });

  it("serializes concurrent free-account Pings so only one is created", async () => {
    const db = new MapPingDb();
    const deps = dependencies();
    const requests = [
      createMapPing(appWithDb(db), {
        userId: senderUserId,
        radiusMiles: 3,
        idempotencyKey: "30000000-0000-4000-8000-000000000004"
      }, deps),
      createMapPing(appWithDb(db), {
        userId: senderUserId,
        radiusMiles: 3,
        idempotencyKey: "30000000-0000-4000-8000-000000000005"
      }, deps)
    ];
    const results = await Promise.allSettled(requests);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "RATE_LIMITED" }
    });
    expect(db.insertCount).toBe(1);
    expect(db.postInsertCount).toBe(1);
    expect(db.queries.some(({ sql }) => sql.includes("for update"))).toBe(true);
  });

  it("returns the same Ping without duplicating map or feed rows", async () => {
    const db = new MapPingDb();
    const deps = dependencies();
    const input = {
      userId: senderUserId,
      radiusMiles: 1 as const,
      idempotencyKey: "30000000-0000-4000-8000-000000000006"
    };

    const first = await createMapPing(appWithDb(db), input, deps);
    const second = await createMapPing(appWithDb(db), input, deps);

    expect(second).toEqual(first);
    expect(db.insertCount).toBe(1);
    expect(db.postInsertCount).toBe(1);
    expect(db.queries.some(({ sql }) => /app_notifications|push_subscriptions|notification_preferences/.test(sql))).toBe(false);
  });

  it("does not recreate an expired same-key Ping tombstone", async () => {
    const idempotencyKey = "30000000-0000-4000-8000-000000000039";
    const db = new MapPingDb([
      storedPing({
        createdAt: new Date(now.getTime() - MAP_PING_ACTIVE_MS - 1),
        idempotencyKey
      })
    ]);
    const status = await createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 3,
      idempotencyKey
    }, dependencies());

    expect(status.activePing).toBeNull();
    expect(db.insertCount).toBe(0);
    expect(db.postInsertCount).toBe(0);
    expect(db.queries.some(({ sql }) => /app_notifications|push_subscriptions|notification_preferences/.test(sql))).toBe(false);
  });

  it("creates one encrypted feed post using the sender's last saved feed expiry", async () => {
    const db = new MapPingDb();
    db.profile = senderProfile(publicRules, "Coffee now", "24h");
    const deps = dependencies();

    await createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 3,
      idempotencyKey: "30000000-0000-4000-8000-000000000021"
    }, deps);

    const postInsert = db.queries.find(({ sql }) => sql.includes("insert into posts"));
    const reviewInsert = db.queries.find(({ sql }) => sql.includes("insert into content_reviews"));

    expect(db.postInsertCount).toBe(1);
    expect(db.reviewInsertCount).toBe(1);
    expect(postInsert?.sql).toContain("map_ping_id");
    expect(postInsert?.sql).toContain("on conflict (map_ping_id)");
    expect(postInsert?.params).not.toContain("Coffee now");
    expect(reviewInsert?.params).not.toContain("Coffee now");
    expect(postInsert?.params[6]).toBe("24h");
    expect(postInsert?.params[7]).toBe(new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString());
    expect(decryptTextContent(config, "feed", {
      ciphertext: String(postInsert?.params[2]),
      nonce: String(postInsert?.params[3]),
      authTag: String(postInsert?.params[4]),
      keyVersion: String(postInsert?.params[5])
    })).toBe("Coffee now");
    expect(deps.moderateSignal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      surface: "feed",
      text: "Coffee now"
    }));
  });

  it("keeps the automatic feed post when the sender's saved expiry is never", async () => {
    const db = new MapPingDb();

    await createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 3,
      idempotencyKey: "30000000-0000-4000-8000-000000000026"
    }, dependencies());

    const postInsert = db.queries.find(({ sql }) => sql.includes("insert into posts"));
    expect(postInsert?.params[6]).toBe("never");
    expect(postInsert?.params[7]).toBe("infinity");
  });

  it.each([
    ["1h", 1 * 60 * 60 * 1000, "30000000-0000-4000-8000-000000000031"],
    ["6h", 6 * 60 * 60 * 1000, "30000000-0000-4000-8000-000000000032"],
    ["24h", 24 * 60 * 60 * 1000, "30000000-0000-4000-8000-000000000033"],
    ["7d", 7 * 24 * 60 * 60 * 1000, "30000000-0000-4000-8000-000000000034"],
    ["never", null, "30000000-0000-4000-8000-000000000035"]
  ] as const)("uses the saved %s expiry for the automatic feed post", async (feedExpiry, durationMs, idempotencyKey) => {
    const db = new MapPingDb();
    db.profile = senderProfile(publicRules, "Coffee now", feedExpiry);

    await createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 3,
      idempotencyKey
    }, dependencies());

    const postInsert = db.queries.find(({ sql }) => sql.includes("insert into posts"));
    expect(postInsert?.params[6]).toBe(feedExpiry);
    expect(postInsert?.params[7]).toBe(durationMs == null
      ? "infinity"
      : new Date(now.getTime() + durationMs).toISOString());
  });

  it("re-reads and validates the saved feed expiry inside the Ping transaction", async () => {
    const db = new MapPingDb();
    db.profile = senderProfile(publicRules, "Coffee now", "24h");
    const defaultModerateSignal = dependencies().moderateSignal;
    const moderateSignal = vi.fn<MapPingDependencies["moderateSignal"]>(async (...args) => {
      db.profile = senderProfile(publicRules, "Coffee now", "1h");
      return defaultModerateSignal(...args);
    });

    await createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 3,
      idempotencyKey: "30000000-0000-4000-8000-000000000036"
    }, dependencies({ moderateSignal }));

    const expiryRead = db.queries.find(({ sql }) => sql.includes("from user_privacy_settings"));
    const postInsert = db.queries.find(({ sql }) => sql.includes("insert into posts"));
    expect(expiryRead?.sql).toContain("for share");
    expect(postInsert?.params[6]).toBe("1h");
    expect(postInsert?.params[7]).toBe(new Date(now.getTime() + 60 * 60 * 1000).toISOString());
  });

  it("fails closed when the transaction-time saved feed expiry is invalid", async () => {
    const db = new MapPingDb();
    Object.assign(db.profile, { feed_post_expiry_default: "2h" });

    await expect(createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 3,
      idempotencyKey: "30000000-0000-4000-8000-000000000037"
    }, dependencies())).rejects.toMatchObject({
      code: "FEATURE_RESTRICTED"
    });

    expect(db.insertCount).toBe(0);
    expect(db.postInsertCount).toBe(0);
    expect(db.reviewInsertCount).toBe(0);
  });

  it("does not create a Ping or feed post when feed moderation rejects the signal", async () => {
    const db = new MapPingDb();
    const moderateSignal = vi.fn<MapPingDependencies["moderateSignal"]>(async () => {
      throw new Error("CONTENT_REJECTED");
    });

    await expect(createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 3,
      idempotencyKey: "30000000-0000-4000-8000-000000000022"
    }, dependencies({ moderateSignal }))).rejects.toThrow("CONTENT_REJECTED");

    expect(db.insertCount).toBe(0);
    expect(db.postInsertCount).toBe(0);
    expect(db.reviewInsertCount).toBe(0);
  });

  it("creates only map activity and a feed post without notification dependencies", async () => {
    const db = new MapPingDb();

    await createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 1,
      idempotencyKey: "30000000-0000-4000-8000-000000000007"
    }, dependencies());

    expect(db.insertCount).toBe(1);
    expect(db.postInsertCount).toBe(1);
    expect(db.queries.some(({ sql }) => /app_notifications|push_subscriptions|notification_preferences/.test(sql))).toBe(false);
  });

  it("uses the real heart coordinate for a Ghost Ping viewer with a precise-location grant", async () => {
    const db = new MapPingDb();
    db.receivedPings = [{
      id: "20000000-0000-4000-8000-000000000025",
      source_user_id: nearbyUserId,
      radius_miles: 1,
      expires_at: new Date(now.getTime() + MAP_PING_ACTIVE_MS).toISOString()
    }];
    db.recipients = [recipientProfile(senderUserId)];
    const resolveGhostCoordinate = vi.fn<MapPingDependencies["resolveGhostCoordinate"]>(async () => ({
      coordinate: { lat: 40.72, lng: -73.9521325 },
      rotationEpoch: 1,
      radiusMeters: 1609
    }));
    const getRelationship = vi.fn<MapPingDependencies["getRelationship"]>(async () => ({
      canRevealPreciseLocation: true
    } as Awaited<ReturnType<MapPingDependencies["getRelationship"]>>));
    const ghostPolicy = {
      ...buildDefaultVisibilityPolicy(config, senderUserId),
      baseMode: "GHOST" as const
    };

    const status = await getMapPingStatus(appWithDb(db), senderUserId, dependencies({
      policy: ghostPolicy,
      locations: new Map([
        [nearbyUserId, location(nearbyUserId, 40.6828509, -73.9521325)],
        [senderUserId, location(senderUserId, 40.69, -73.9521325)]
      ]),
      resolveGhostCoordinate,
      getRelationship
    }));

    expect(status.receivedPings).toHaveLength(1);
    expect(getRelationship).toHaveBeenCalledWith(expect.anything(), senderUserId, nearbyUserId);
    expect(resolveGhostCoordinate).not.toHaveBeenCalled();
  });

  it("fails closed for missing privacy policy, Dark Room, and stale location", async () => {
    const missingPolicyDb = new MapPingDb();
    await expect(createMapPing(appWithDb(missingPolicyDb), {
      userId: senderUserId,
      radiusMiles: 5,
      idempotencyKey: "30000000-0000-4000-8000-000000000008"
    }, dependencies({ policy: null }))).rejects.toMatchObject({
      code: "FEATURE_RESTRICTED"
    });

    const stealthPolicy = {
      ...buildDefaultVisibilityPolicy(config, senderUserId),
      baseMode: "STEALTH" as const
    };
    await expect(createMapPing(appWithDb(new MapPingDb()), {
      userId: senderUserId,
      radiusMiles: 5,
      idempotencyKey: "30000000-0000-4000-8000-000000000009"
    }, dependencies({ policy: stealthPolicy, cruushPlus: true }))).rejects.toMatchObject({
      code: "FEATURE_RESTRICTED"
    });

    const staleLocation = location(
      senderUserId,
      40.6828509,
      -73.9521325,
      new Date(now.getTime() - 16 * 60 * 1000)
    );
    await expect(createMapPing(appWithDb(new MapPingDb()), {
      userId: senderUserId,
      radiusMiles: 5,
      idempotencyKey: "30000000-0000-4000-8000-000000000010"
    }, dependencies({ locations: new Map([[senderUserId, staleLocation]]) }))).rejects.toMatchObject({
      code: "LOCATION_STORAGE_UNAVAILABLE"
    });
  });

  it("stops applying a saved Stealth policy after cruush+ ends", async () => {
    const db = new MapPingDb();
    const retainedStealthPolicy = {
      ...buildDefaultVisibilityPolicy(config, senderUserId),
      baseMode: "STEALTH" as const
    };

    const status = await createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 5,
      idempotencyKey: "30000000-0000-4000-8000-000000000018"
    }, dependencies({ policy: retainedStealthPolicy, cruushPlus: false }));

    expect(status.activePing).toMatchObject({ id: expect.any(String) });
    expect(db.insertCount).toBe(1);
  });

  it("requires a moderated signal and a sender inside the beta service area", async () => {
    const emptySignalDb = new MapPingDb();
    emptySignalDb.profile = senderProfile(publicRules, "   ");

    await expect(createMapPing(appWithDb(emptySignalDb), {
      userId: senderUserId,
      radiusMiles: 5,
      idempotencyKey: "30000000-0000-4000-8000-000000000014"
    }, dependencies())).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });

    await expect(createMapPing(appWithDb(new MapPingDb()), {
      userId: senderUserId,
      radiusMiles: 5,
      idempotencyKey: "30000000-0000-4000-8000-000000000015"
    }, dependencies({
      locations: new Map([[senderUserId, location(senderUserId, 43, -73.9521325)]])
    }))).rejects.toMatchObject({
      code: "FEATURE_RESTRICTED"
    });
  });

  it("allows Ghost Mode without changing its existing display location", async () => {
    const db = new MapPingDb();
    const ghostPolicy = {
      ...buildDefaultVisibilityPolicy(config, senderUserId),
      baseMode: "GHOST" as const
    };

    const status = await createMapPing(appWithDb(db), {
      userId: senderUserId,
      radiusMiles: 5,
      idempotencyKey: "30000000-0000-4000-8000-000000000016"
    }, dependencies({
      policy: ghostPolicy,
      locations: new Map([
        [senderUserId, location(senderUserId, 40.6828509, -73.9521325)]
      ])
    }));

    expect(status.activePing).toMatchObject({ id: expect.any(String) });
    expect(db.queries.some(({ sql }) => /app_notifications|push_subscriptions|notification_preferences/.test(sql))).toBe(false);
  });

  it("uses each viewer's displayed Ghost heart for radius eligibility", async () => {
    const db = new MapPingDb();
    db.receivedPings = [{
      id: "20000000-0000-4000-8000-000000000024",
      source_user_id: nearbyUserId,
      radius_miles: 1,
      expires_at: new Date(now.getTime() + MAP_PING_ACTIVE_MS).toISOString()
    }];
    db.recipients = [recipientProfile(senderUserId)];
    const resolveGhostCoordinate = vi.fn<MapPingDependencies["resolveGhostCoordinate"]>(async () => ({
      coordinate: { lat: 40.72, lng: -73.9521325 },
      rotationEpoch: 1,
      radiusMeters: 1609
    }));
    const ghostPolicy = {
      ...buildDefaultVisibilityPolicy(config, senderUserId),
      baseMode: "GHOST" as const
    };

    const status = await getMapPingStatus(appWithDb(db), senderUserId, dependencies({
      policy: ghostPolicy,
      locations: new Map([
        [nearbyUserId, location(nearbyUserId, 40.6828509, -73.9521325)],
        [senderUserId, location(senderUserId, 40.69, -73.9521325)]
      ]),
      resolveGhostCoordinate
    }));

    expect(resolveGhostCoordinate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      subjectUserId: nearbyUserId,
      viewerUserId: senderUserId
    }));
    expect(status.receivedPings).toEqual([]);
  });

  it("returns only authorized public Ping status fields", async () => {
    const db = new MapPingDb();
    db.receivedPings = [{
      id: "20000000-0000-4000-8000-000000000020",
      source_user_id: nearbyUserId,
      radius_miles: 1,
      expires_at: new Date(now.getTime() + MAP_PING_ACTIVE_MS).toISOString()
    }];
    db.recipients = [recipientProfile(senderUserId, 1990)];

    const status = await getMapPingStatus(appWithDb(db), senderUserId, dependencies({
      locations: new Map([
        [nearbyUserId, location(nearbyUserId, 40.6828509, -73.9521325)],
        [senderUserId, location(senderUserId, 40.69, -73.9521325)]
      ])
    }));
    const serialized = JSON.stringify(status);

    expect(Object.keys(status)).toEqual(["bonusCredits", "allowance", "activePing", "receivedPings"]);
    expect(Object.keys(status.receivedPings[0] ?? {})).toEqual(["id", "sourceUserId", "expiresAt"]);
    expect(serialized).not.toMatch(/radius|distance|latitude|longitude|coordinates|recipientCount|deliveryCount/i);
    const receivedQuery = db.queries.find(({ sql }) => sql.includes("from map_pings ping"));
    expect(receivedQuery?.sql).not.toContain("app_notifications");
    expect(receivedQuery?.sql).not.toContain("notification_preferences");
    expect(receivedQuery?.sql).toContain("feature = 'map_visibility'");
    expect(receivedQuery?.sql).toContain("user_blocks");
    expect(receivedQuery?.sql).toContain("ping.expires_at > $2::timestamptz");
  });

  it("hides a received Ping when the recipient no longer matches the sender's visibility rules", async () => {
    const db = new MapPingDb();
    db.profile = senderProfile({
      ...publicRules,
      age_range: [30, 50]
    });
    db.recipients = [recipientProfile(senderUserId, 2005)];
    db.receivedPings = [{
      id: "20000000-0000-4000-8000-000000000021",
      source_user_id: nearbyUserId,
      radius_miles: 1,
      expires_at: new Date(now.getTime() + MAP_PING_ACTIVE_MS).toISOString()
    }];

    const status = await getMapPingStatus(appWithDb(db), senderUserId, dependencies({
      locations: new Map([
        [nearbyUserId, location(nearbyUserId, 40.6828509, -73.9521325)],
        [senderUserId, location(senderUserId, 40.69, -73.9521325)]
      ])
    }));

    expect(status.receivedPings).toEqual([]);
  });

  it("hides a received Ping after the recipient moves outside its selected radius", async () => {
    const db = new MapPingDb();
    db.recipients = [recipientProfile(senderUserId, 1990)];
    db.receivedPings = [{
      id: "20000000-0000-4000-8000-000000000022",
      source_user_id: nearbyUserId,
      radius_miles: 1,
      expires_at: new Date(now.getTime() + MAP_PING_ACTIVE_MS).toISOString()
    }];

    const status = await getMapPingStatus(appWithDb(db), senderUserId, dependencies({
      locations: new Map([
        [nearbyUserId, location(nearbyUserId, 40.6828509, -73.9521325)],
        [senderUserId, location(senderUserId, 40.72, -73.9521325)]
      ])
    }));

    expect(status.receivedPings).toEqual([]);
  });

  it("rejects plaintext origins and signals by construction", () => {
    const source = createMapPing.toString();

    expect(source).not.toMatch(/input\.(lat|lng|latitude|longitude|signal)/);
  });
});
