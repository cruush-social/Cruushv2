import { describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import {
  decryptDisplayLocationTokenForTest,
  createCoarseIndexTokens,
  deriveGhostCoordinate,
  distanceMiles,
  issueBrowserDisplayKey,
  loadLocationEnvelope,
  loadLocationEnvelopes,
  loadVisibilityPolicy,
  makeDisplayLocationToken,
  saveVisibilityPolicy,
  storeLocationEnvelope
} from "./location-privacy.js";

const config: AppConfig = {
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
        new Date("2026-06-10T11:30:00.000Z").getTime()
      );

      expect(tokens.length).toBeGreaterThan(600);
      expect(futureTokens.some((token) => tokens.includes(token))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("derives stable viewer-specific ghost coordinates inside the selected radius", () => {
    const first = deriveGhostCoordinate({
      config,
      subjectUserId,
      viewerUserId,
      centerLat: 40.711,
      centerLng: -74.002,
      rotationEpoch: 123,
      derivationSalt: "salt",
      radiusMeters: 1609,
      policyVersion: 2
    });
    const again = deriveGhostCoordinate({
      config,
      subjectUserId,
      viewerUserId,
      centerLat: 40.711,
      centerLng: -74.002,
      rotationEpoch: 123,
      derivationSalt: "salt",
      radiusMeters: 1609,
      policyVersion: 2
    });
    const otherViewer = deriveGhostCoordinate({
      config,
      subjectUserId,
      viewerUserId: "b8b61062-f0b1-4c75-9390-7bc769278e01",
      centerLat: 40.711,
      centerLng: -74.002,
      rotationEpoch: 123,
      derivationSalt: "salt",
      radiusMeters: 1609,
      policyVersion: 2
    });

    expect(first).toEqual(again);
    expect(first).not.toEqual(otherViewer);
    expect(distanceMiles(40.711, -74.002, first.lat, first.lng)).toBeLessThanOrEqual(1.01);
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
