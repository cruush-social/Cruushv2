import { describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import {
  decryptDisplayLocationTokenForTest,
  createCoarseIndexTokens,
  currentRotationEpoch,
  deriveGhostCoordinate,
  distanceMiles,
  GHOST_MIN_OFFSET_RATIO,
  issueBrowserDisplayKey,
  loadLocationEnvelope,
  loadLocationEnvelopes,
  loadVisibilityPolicy,
  loadVisibilityPolicyStrict,
  makeDisplayLocationToken,
  resolveViewerGhostCoordinate,
  saveVisibilityPolicy,
  storeLocationEnvelope
} from "./location-privacy.js";

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

const subjectUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
const viewerUserId = "d271f6da-c51d-4d73-a322-d9c56f45d4fa";

function createPolicyDb() {
  let row: unknown = null;
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("select") && sql.includes("encrypted_visibility_tokens")) {
      return { rows: row ? [row] : [] };
    }

    if (sql.includes("insert into encrypted_visibility_tokens")) {
      row = {
        subject_user_id: params[0],
        policy_version: params[1],
        policy_ciphertext: params[2],
        policy_nonce: params[3],
        policy_auth_tag: params[4],
        wrapped_policy_dek: params[5],
        policy_dek_nonce: params[6],
        policy_dek_auth_tag: params[7],
        key_version: params[8],
        updated_at_ms: params[9]
      };
    }

    return { rows: [] };
  });

  return { query } as unknown as Pick<DbClient, "query"> & { query: typeof query };
}

function createLocationDb() {
  let row: unknown = null;
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("select") && sql.includes("encrypted_location_envelopes")) {
      return { rows: row ? [row] : [] };
    }

    if (sql.includes("insert into encrypted_location_envelopes")) {
      row = {
        subject_user_id: params[0],
        location_version: params[1],
        location_ciphertext: params[2],
        location_nonce: params[3],
        location_auth_tag: params[4],
        wrapped_location_dek: params[5],
        location_dek_nonce: params[6],
        location_dek_auth_tag: params[7],
        key_version: params[8],
        coarse_index_tokens: params[9],
        collected_at_ms: params[10],
        expires_at_ms: params[11]
      };
    }

    return { rows: [] };
  });

  return { query } as unknown as Pick<DbClient, "query"> & { query: typeof query };
}

function createDisplayTokenDb() {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("select") && sql.includes("ghost_rotation_tokens")) {
      return { rows: [] };
    }

    if (sql.includes("insert into ghost_rotation_tokens")) {
      return { rows: [{ subject_user_id: params[0] }] };
    }

    return { rows: [] };
  });

  return { query } as unknown as Pick<DbClient, "query"> & { query: typeof query };
}

function requestWithSession() {
  return {
    headers: {
      cookie: "cruush_session=test-session-token"
    }
  } as FastifyRequest;
}

describe("location privacy", () => {
  it("round-trips encrypted visibility policy payloads", async () => {
    const db = createPolicyDb();
    const saved = await saveVisibilityPolicy({ config, db }, subjectUserId, {
      baseMode: "GHOST",
      ghostRadiusMeters: 1609,
      preciseToMutualCruushes: true
    });
    const loaded = await loadVisibilityPolicy({ config, db }, subjectUserId);

    expect(loaded).toMatchObject({
      subjectUserId,
      baseMode: "GHOST",
      ghostRadiusMeters: 1609,
      preciseToMutualCruushes: true,
      policyVersion: saved.policyVersion
    });
    expect(JSON.stringify(db.query.mock.calls)).not.toContain("GHOST");
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes("ghost_mode_anchor_ms"))).toBe(false);
  });

  it("uses the default policy only when a stored policy is missing", async () => {
    const db = createPolicyDb();

    await expect(loadVisibilityPolicyStrict({ config, db }, subjectUserId)).resolves.toBeNull();
    await expect(loadVisibilityPolicy({ config, db }, subjectUserId)).resolves.toMatchObject({
      subjectUserId,
      baseMode: "PUBLIC_PRECISE"
    });
  });

  it("fails closed when a strict visibility policy cannot be decrypted", async () => {
    const query = vi.fn(async () => ({
      rows: [{
        subject_user_id: subjectUserId,
        policy_version: 7,
        policy_ciphertext: "not-valid-ciphertext",
        policy_nonce: "not-valid-nonce",
        policy_auth_tag: "not-valid-auth-tag",
        wrapped_policy_dek: "not-valid-wrapped-key",
        policy_dek_nonce: "not-valid-key-nonce",
        policy_dek_auth_tag: "not-valid-key-auth-tag",
        key_version: "v1",
        updated_at_ms: Date.now()
      }]
    }));
    const db = { query } as unknown as Pick<DbClient, "query">;

    await expect(loadVisibilityPolicyStrict({ config, db }, subjectUserId)).rejects.toThrow(
      "Stored visibility policy could not be read."
    );
    await expect(loadVisibilityPolicy({ config, db }, subjectUserId)).resolves.toMatchObject({
      subjectUserId,
      baseMode: "STEALTH",
      policyVersion: 7,
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: []
    });
  });

  it("round-trips encrypted location envelopes without storing raw coordinate params", async () => {
    const db = createLocationDb();
    await storeLocationEnvelope({ config, db }, {
      subjectUserId,
      lat: 40.711,
      lng: -74.002,
      accuracyM: 12
    });
    const loaded = await loadLocationEnvelope({ config, db }, subjectUserId);

    expect(loaded?.latE7).toBe(407110000);
    expect(loaded?.lonE7).toBe(-740020000);
    expect(JSON.stringify(db.query.mock.calls)).not.toContain("40.711");
    expect(JSON.stringify(db.query.mock.calls)).not.toContain("-74.002");
  });

  it("loads recently collected location envelopes after legacy expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00.000Z"));

    try {
      const writeDb = createLocationDb();
      await storeLocationEnvelope({ config, db: writeDb }, {
        subjectUserId,
        lat: 40.711,
        lng: -74.002,
        accuracyM: 12
      });
      const insertCall = writeDb.query.mock.calls.find(([sql]) => String(sql).includes("insert into encrypted_location_envelopes"));
      const params = (insertCall?.[1] ?? []) as unknown[];
      const legacyExpiredRow = {
        subject_user_id: params[0],
        location_version: params[1],
        location_ciphertext: params[2],
        location_nonce: params[3],
        location_auth_tag: params[4],
        wrapped_location_dek: params[5],
        location_dek_nonce: params[6],
        location_dek_auth_tag: params[7],
        key_version: params[8],
        coarse_index_tokens: params[9],
        collected_at_ms: params[10],
        expires_at_ms: new Date("2026-06-04T11:59:00.000Z").getTime()
      };
      const readQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [legacyExpiredRow] }));
      const readDb = { query: readQuery } as unknown as Pick<DbClient, "query"> & { query: typeof readQuery };

      vi.setSystemTime(new Date("2026-06-04T12:30:00.000Z"));
      const loaded = await loadLocationEnvelopes({ config, db: readDb }, [subjectUserId]);

      expect(loaded.get(subjectUserId)?.latE7).toBe(407110000);
      expect(readQuery.mock.calls[0]?.[0]).toContain("collected_at_ms >= $3");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stores coarse index tokens for the full encrypted location ttl", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00.000Z"));

    try {
      const db = createLocationDb();
      await storeLocationEnvelope({ config, db }, {
        subjectUserId,
        lat: 40.711,
        lng: -74.002,
        accuracyM: 12
      });
      const insertCall = db.query.mock.calls.find(([sql]) => String(sql).includes("insert into encrypted_location_envelopes"));
      const tokens = (insertCall?.[1]?.[9] ?? []) as string[];
      const futureTokens = createCoarseIndexTokens(
        config,
        40.711,
        -74.002,
        new Date("2026-06-07T11:30:00.000Z").getTime()
      );

      expect(tokens.length).toBeGreaterThan(350);
      expect(futureTokens.some((token) => tokens.includes(token))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("searches far enough to cover the launch city, not just the next block", () => {
    // The search radius was 1 cell, about a mile, inside a 15 mile geofence, so
    // most people in the beta radius were stored and unexpired but never matched
    // a discovery query. Pin the reach so it cannot quietly shrink again.
    const nowMs = new Date("2026-06-03T12:00:00.000Z").getTime();
    const viewer = createCoarseIndexTokens(config, 40.711, -74.002, nowMs);

    // Two time buckets x (2r+1)^2 cells.
    expect(viewer.length).toBe(2 * 23 * 23);

    // Someone about 8 km east still shares a searched cell.
    const farLng = -74.002 + 0.02 * 5;
    const far = createCoarseIndexTokens(config, 40.711, farLng, nowMs);
    expect(far.some((token) => viewer.includes(token))).toBe(true);
  });

  it("derives a stable ghost coordinate inside the selected radius", () => {
    const ghostInput = {
      config,
      subjectUserId,
      centerLat: 40.711,
      centerLng: -74.002,
      rotationEpoch: 123,
      derivationSalt: "salt",
      radiusMeters: 1609,
      policyVersion: 2
    };
    const first = deriveGhostCoordinate(ghostInput);
    const again = deriveGhostCoordinate(ghostInput);
    const otherSubject = deriveGhostCoordinate({
      ...ghostInput,
      subjectUserId: "b8b61062-f0b1-4c75-9390-7bc769278e01"
    });

    expect(first).toEqual(again);
    // Every viewer sees the same decoy in an epoch. Deriving per viewer let one
    // attacker with several accounts gather that many independent samples at
    // once, which defeats the whole scheme far faster than patient averaging.
    expect(first).not.toEqual(otherSubject);
    const offsetMiles = distanceMiles(40.711, -74.002, first.lat, first.lng);
    expect(offsetMiles).toBeGreaterThanOrEqual(GHOST_MIN_OFFSET_RATIO - 0.01);
    expect(offsetMiles).toBeLessThanOrEqual(1.01);
  });

  it("uses the existing shared Ghost rotation epoch without a per-profile anchor", () => {
    const nowMs = new Date("2026-08-09T16:00:00.000Z").getTime();
    expect(currentRotationEpoch(nowMs)).toBe(Math.floor(nowMs / (15 * 60_000)));
  });

  it("uses the shared Ghost coordinate resolver for viewer-specific display decisions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T16:00:00.000Z"));

    try {
      const db = createDisplayTokenDb();
      const policy = {
        version: 1 as const,
        subjectUserId,
        policyVersion: 2,
        baseMode: "GHOST" as const,
        ghostRadiusMeters: 1609,
        preciseToMutualCruushes: false,
        preciseToMutualCrowds: [],
        auditRequired: false,
        updatedAtMs: Date.now(),
        expiresAtMs: null,
        keyVersion: "v1"
      };
      const location = {
        version: 1 as const,
        subjectUserId,
        locationVersion: 1,
        latE7: 407110000,
        lonE7: -740020000,
        accuracyM: 10,
        source: "GPS" as const,
        deviceReportedAtMs: Date.now(),
        collectedAtMs: Date.now(),
        expiresAtMs: Date.now() + 60_000,
        keyVersion: "v1"
      };

      const resolved = await resolveViewerGhostCoordinate({ config, db }, {
        subjectUserId,
        viewerUserId,
        policy,
        location,
        nowMs: Date.now()
      });

      expect(distanceMiles(40.711, -74.002, resolved.coordinate.lat, resolved.coordinate.lng))
        .toBeLessThanOrEqual(1.01);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("ghost_rotation_tokens"),
        expect.any(Array)
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps v1.2 Ghost display tokens static without pulse settings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T16:00:00.000Z"));

    try {
      const db = createDisplayTokenDb();
      const request = requestWithSession();
      const displayKey = issueBrowserDisplayKey(config, request, viewerUserId);
      const policy = {
        version: 1 as const,
        subjectUserId,
        policyVersion: 2,
        baseMode: "GHOST" as const,
        ghostRadiusMeters: 1609,
        preciseToMutualCruushes: false,
        preciseToMutualCrowds: [],
        auditRequired: false,
        updatedAtMs: Date.now(),
        expiresAtMs: null,
        keyVersion: "v1"
      };
      const location = {
        version: 1 as const,
        subjectUserId,
        locationVersion: 1,
        latE7: 407110000,
        lonE7: -740020000,
        accuracyM: 10,
        source: "GPS" as const,
        deviceReportedAtMs: Date.now(),
        collectedAtMs: Date.now(),
        expiresAtMs: Date.now() + 60_000,
        keyVersion: "v1"
      };
      const token = await makeDisplayLocationToken({ config, db }, request, {
        subjectUserId,
        viewerUserId,
        policy,
        location,
        displayMode: "GHOST"
      });
      const payload = decryptDisplayLocationTokenForTest({
        key: displayKey.key,
        token
      });

      expect(payload.animationHint).toBe("NONE");
      expect(db.query.mock.calls.some(([sql]) => String(sql).includes("user_privacy_settings"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses one Ghost rotation seed when first-time viewer resolutions race", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T16:00:00.000Z"));

    try {
      type RotationRow = {
        subject_user_id: string;
        rotation_epoch: number;
        policy_version: number;
        token_ciphertext: string;
        token_nonce: string;
        token_auth_tag: string;
        wrapped_token_dek: string;
        token_dek_nonce: string;
        token_dek_auth_tag: string;
        key_version: string;
        expires_at_ms: number;
        revoked_at_ms: null;
      };
      let storedRotation: RotationRow | null = null;
      let initialSelects = 0;
      let releaseInitialSelects!: () => void;
      const bothInitialSelectsStarted = new Promise<void>((resolve) => {
        releaseInitialSelects = resolve;
      });
      const query = vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("select") && sql.includes("ghost_rotation_tokens")) {
          initialSelects += 1;

          if (initialSelects <= 2) {
            if (initialSelects === 2) {
              releaseInitialSelects();
            }
            await bothInitialSelectsStarted;
            return { rows: [] };
          }

          return { rows: storedRotation ? [storedRotation] : [] };
        }

        if (sql.includes("insert into ghost_rotation_tokens")) {
          const candidate: RotationRow = {
            subject_user_id: String(params[0]),
            rotation_epoch: Number(params[1]),
            policy_version: Number(params[2]),
            token_ciphertext: String(params[3]),
            token_nonce: String(params[4]),
            token_auth_tag: String(params[5]),
            wrapped_token_dek: String(params[6]),
            token_dek_nonce: String(params[7]),
            token_dek_auth_tag: String(params[8]),
            key_version: String(params[9]),
            expires_at_ms: Number(params[11]),
            revoked_at_ms: null
          };
          const wonInsert = storedRotation === null;

          if (wonInsert || sql.includes("do update") && !sql.includes("where ghost_rotation_tokens")) {
            storedRotation = candidate;
          }

          return { rows: wonInsert ? [{ subject_user_id: candidate.subject_user_id }] : [] };
        }

        return { rows: [] };
      });
      const db = { query } as unknown as Pick<DbClient, "query">;
      const policy = {
        version: 1 as const,
        subjectUserId,
        policyVersion: 2,
        baseMode: "GHOST" as const,
        ghostRadiusMeters: 1609,
        preciseToMutualCruushes: false,
        preciseToMutualCrowds: [],
        auditRequired: false,
        updatedAtMs: Date.now(),
        expiresAtMs: null,
        keyVersion: "v1"
      };
      const location = {
        version: 1 as const,
        subjectUserId,
        locationVersion: 1,
        latE7: 407110000,
        lonE7: -740020000,
        accuracyM: 10,
        source: "GPS" as const,
        deviceReportedAtMs: Date.now(),
        collectedAtMs: Date.now(),
        expiresAtMs: Date.now() + 60_000,
        keyVersion: "v1"
      };

      const [first, second] = await Promise.all([
        resolveViewerGhostCoordinate({ config, db }, {
          subjectUserId,
          viewerUserId,
          policy,
          location,
          nowMs: Date.now()
        }),
        resolveViewerGhostCoordinate({ config, db }, {
          subjectUserId,
          viewerUserId,
          policy,
          location,
          nowMs: Date.now()
        })
      ]);

      expect(first.coordinate).toEqual(second.coordinate);
    } finally {
      vi.useRealTimers();
    }
  });

  it("encrypts display tokens against the browser display key", async () => {
    const db = createDisplayTokenDb();
    const request = requestWithSession();
    const displayKey = issueBrowserDisplayKey(config, request, viewerUserId);
    const policy = {
      version: 1 as const,
      subjectUserId,
      policyVersion: 1,
      baseMode: "PUBLIC_PRECISE" as const,
      ghostRadiusMeters: 1609,
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: [],
      auditRequired: false,
      updatedAtMs: Date.now(),
      expiresAtMs: null,
      keyVersion: "v1"
    };
    const location = {
      version: 1 as const,
      subjectUserId,
      locationVersion: 1,
      latE7: 407110000,
      lonE7: -740020000,
      accuracyM: 12,
      source: "GPS" as const,
      deviceReportedAtMs: Date.now(),
      collectedAtMs: Date.now(),
      expiresAtMs: Date.now() + 1000,
      keyVersion: "v1"
    };
    const token = await makeDisplayLocationToken({ config, db }, request, {
      subjectUserId,
      viewerUserId,
      policy,
      location,
      displayMode: "PRECISE"
    });
    const payload = decryptDisplayLocationTokenForTest({
      key: displayKey.key,
      token
    });

    expect(payload).toMatchObject({
      subjectUserId,
      viewerUserId,
      displayMode: "PRECISE",
      latE7: 407110000,
      lonE7: -740020000
    });
  });
});
