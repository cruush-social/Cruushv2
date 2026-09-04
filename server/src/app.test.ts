import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RekognitionClient } from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import { buildServer } from "./app.js";
import { createSessionCookie, generateSessionToken, hashPassword, hashSessionToken } from "./auth.js";
import type { AppConfig } from "./config.js";
import { decryptTextContent, encryptTextContent } from "./content-encryption.js";
import type { DbClient } from "./db.js";
import { DEVELOPMENT_ADMIN_EMAIL, DEVELOPMENT_ADMIN_LOCATION } from "./development-admin.js";
import {
  buildEncryptedRelationshipPayload,
  issueEncryptedRelationshipToken,
  upsertEncryptedRelationshipRecord,
  type EncryptedRelationshipRecordRow
} from "./encrypted-relationships.js";
import { emptyProfile, profileVisibilityRulesSchema } from "./profile-schema.js";
import { createCrowdTokens, encryptProfileVisibility, encryptSensitiveProfile, type ProfileVisibilityRules } from "./profile-sensitive.js";
import { createMemoryRateLimiter } from "./rate-limit.js";
import {
  buildRevokeActionToken,
  decryptDisplayLocationTokenForTest,
  saveVisibilityPolicy,
  storeLocationEnvelope,
  type VisibilityBaseMode
} from "./location-privacy.js";
import { encryptMediaBytes } from "./media-encryption.js";
import { deleteEncryptedMediaObject, readEncryptedMediaObject, writeEncryptedMediaObject } from "./media-storage.js";
import { decryptPlaceSuggestion, encryptPlaceSuggestion } from "./place-suggestion-privacy.js";
import { isDiscoveryMapPingVisible } from "./routes/users.js";

const { notifyNearbyUsersForLocationUpdate } = vi.hoisted(() => ({
  notifyNearbyUsersForLocationUpdate: vi.fn()
}));

vi.mock("./nearby-notifications.js", () => ({
  notifyNearbyUsersForLocationUpdate
}));

const query = vi.fn();
const end = vi.fn().mockResolvedValue(undefined);
const rateLimiter = createMemoryRateLimiter();

// The stored `emptyProfile` literal predates the 1.6 discovery filters, so the
// API answers with the schema's own defaults for the newer ones.
const emptyVisibilityRules = profileVisibilityRulesSchema.parse(emptyProfile.visibility_rules);

type MockQueryResult = { rows: unknown[] };
type MockQueryImplementation = (sql: string, params?: unknown[]) => MockQueryResult | Promise<MockQueryResult>;

const nativeQueryMockImplementation = query.mockImplementation.bind(query);
const nativeQueryMockReset = query.mockReset.bind(query);
const nativeQueryMockClear = query.mockClear.bind(query);
let queuedQueryImplementations: MockQueryImplementation[] = [];
let defaultQueryImplementation: MockQueryImplementation = async () => ({ rows: [] });
let defaultQueryIsSqlAware = false;

type TestGhostRotationRow = {
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
  revoked_at_ms: number | null;
};

const testEncryptedVisibilityRows = new Map<string, unknown>();
const testGhostRotationRows = new Map<string, TestGhostRotationRow>();

function resetQueryPrivacyState() {
  testEncryptedVisibilityRows.clear();
  testGhostRotationRows.clear();
}

function privacySideEffectResult(sql: string, params: unknown[] = [], interceptVisibility: boolean): MockQueryResult | null {
  const normalizedSql = sql.toLowerCase();

  if (interceptVisibility && normalizedSql.includes("insert into encrypted_visibility_tokens")) {
    testEncryptedVisibilityRows.set(String(params[0]), {
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
    });

    return { rows: [{ subject_user_id: params[0] }] };
  }

  if (normalizedSql.includes("select") && normalizedSql.includes("from ghost_rotation_tokens")) {
    const key = `${params[0]}:${params[1]}:${params[2]}`;
    const row = testGhostRotationRows.get(key);

    return {
      rows: row && row.revoked_at_ms === null && row.expires_at_ms > Number(params[3])
        ? [row]
        : []
    };
  }

  if (normalizedSql.includes("insert into ghost_rotation_tokens")) {
    const key = `${params[0]}:${params[1]}:${params[2]}`;
    const existing = testGhostRotationRows.get(key);
    const canClaim = !existing || existing.revoked_at_ms !== null || existing.expires_at_ms <= Number(params[12]);

    if (!canClaim) {
      return { rows: [] };
    }

    testGhostRotationRows.set(key, {
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
    });

    return { rows: [{ subject_user_id: params[0] }] };
  }

  if (normalizedSql.includes("update ghost_rotation_tokens")) {
    for (const row of testGhostRotationRows.values()) {
      if (row.subject_user_id === String(params[0]) && row.revoked_at_ms === null) {
        row.revoked_at_ms = Number(params[1]);
      }
    }

    return { rows: [] };
  }

  return null;
}

function installPrivacyAwareQueryMock() {
  const runQuery: MockQueryImplementation = async (sql, params = []) => {
    const privacyResult = privacySideEffectResult(String(sql), params, !defaultQueryIsSqlAware);

    if (privacyResult) {
      if (!defaultQueryIsSqlAware) {
        query.mock.calls.pop();
      }

      return privacyResult;
    }

    const queued = queuedQueryImplementations.shift();

    if (queued) {
      return queued(sql, params);
    }

    return defaultQueryImplementation(sql, params);
  };

  nativeQueryMockImplementation(runQuery);
}

(query as any).mockResolvedValueOnce = (value: MockQueryResult) => {
  queuedQueryImplementations.push(async () => value);
  installPrivacyAwareQueryMock();

  return query;
};
(query as any).mockRejectedValueOnce = (error: unknown) => {
  queuedQueryImplementations.push(async () => {
    throw error;
  });
  installPrivacyAwareQueryMock();

  return query;
};
(query as any).mockResolvedValue = (value: MockQueryResult) => {
  defaultQueryIsSqlAware = false;
  defaultQueryImplementation = async () => value;
  installPrivacyAwareQueryMock();

  return query;
};
(query as any).mockRejectedValue = (error: unknown) => {
  defaultQueryIsSqlAware = false;
  defaultQueryImplementation = async () => {
    throw error;
  };
  installPrivacyAwareQueryMock();

  return query;
};
(query as any).mockImplementation = (implementation: MockQueryImplementation) => {
  queuedQueryImplementations = [];
  defaultQueryIsSqlAware = true;
  defaultQueryImplementation = implementation;
  installPrivacyAwareQueryMock();

  return query;
};
(query as any).mockReset = () => {
  nativeQueryMockReset();
  queuedQueryImplementations = [];
  defaultQueryIsSqlAware = false;
  defaultQueryImplementation = async () => ({ rows: [] });
  resetQueryPrivacyState();
  installPrivacyAwareQueryMock();

  return query;
};
(query as any).mockClear = () => {
  nativeQueryMockClear();

  return query;
};

const app = buildServer({
  NODE_ENV: "test",
  BILLING_TEST_CHECKOUT_ENABLED: true,
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  MEDIA_PUBLIC_BASE_URL: "http://127.0.0.1:3001",
  MEDIA_MODERATION_URL_SECRET: "0123456789abcdef0123456789abcdef",
  MEDIA_MODERATION_URL_TTL_SECONDS: 120,
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
  HUMAN_MODERATION_ENABLED: true
}, {
  db: {
    query,
    end
  },
  rateLimiter
});

const developmentApp = buildServer({
  NODE_ENV: "development",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: true,
  DEVELOPMENT_ADMIN_ENABLED: true,
  DEVELOPMENT_ADMIN_PASSWORD: "admin-password",
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
  MATCH_TOKEN_KEY_VERSION: "v1"
}, {
  db: {
    query,
    end
  },
  rateLimiter
});

const lockedDevelopmentApp = buildServer({
  NODE_ENV: "development",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: false,
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
  MATCH_TOKEN_KEY_VERSION: "v1"
}, {
  db: {
    query,
    end
  },
  rateLimiter
});

const productionApp = buildServer({
  NODE_ENV: "production",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: false,
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
  MATCH_TOKEN_KEY_VERSION: "v1"
}, {
  db: {
    query,
    end
  },
  rateLimiter
});

const corsApp = buildServer({
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "https://www.cruush.app,https://staging.cruush.app",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: false,
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
  MATCH_TOKEN_KEY_VERSION: "v1"
}, {
  db: {
    query,
    end
  },
  rateLimiter
});

const emailLinkApp = buildServer({
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "https://www.cruush.app,https://staging.cruush.app",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://api.cruush.test",
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
  MATCH_TOKEN_KEY_VERSION: "v1"
}, {
  db: {
    query,
    end
  },
  rateLimiter
});

const turnstileApp = buildServer({
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: false,
  DEVELOPMENT_ADMIN_ENABLED: false,
  DEVELOPMENT_ADMIN_PASSWORD: "",
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  PROFILE_ENCRYPTION_KEY: "",
  PROFILE_TOKEN_KEY: "",
  PROFILE_TOKEN_KEY_VERSION: "v1",
  RELATIONSHIP_ENCRYPTION_KEY: "",
  RELATIONSHIP_INDEX_KEY: "",
  RELATIONSHIP_ENCRYPTION_KEY_VERSION: "v1",
  RELATIONSHIP_INDEX_KEY_VERSION: "v1",
  MATCH_TOKEN_ENCRYPTION_KEY: "",
  MATCH_TOKEN_SIGNING_KEY: "",
  MATCH_TOKEN_KEY_VERSION: "v1"
}, {
  db: {
    query,
    end
  },
  rateLimiter
});

afterAll(async () => {
  await app.close();
  await developmentApp.close();
  await lockedDevelopmentApp.close();
  await productionApp.close();
  await corsApp.close();
  await emailLinkApp.close();
  await turnstileApp.close();
});

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  notifyNearbyUsersForLocationUpdate.mockReset().mockResolvedValue({
    attempted: false,
    sent: 0
  });
  end.mockClear();
  rateLimiter.reset?.();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function appNotificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-1",
    user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
    type: "direct_message",
    title: "New notification",
    body: "Open cruush to check it.",
    link_url: "/notifications",
    actor_user_id: null,
    conversation_id: null,
    metadata: {},
    read_at: null,
    created_at: "2026-04-29T12:11:00.000Z",
    ...overrides
  };
}

async function encryptedRelationshipRecordRow(input: {
  id: string;
  type: Parameters<typeof buildEncryptedRelationshipPayload>[0]["type"];
  actorUserId: string;
  targetUserId: string;
  createdAt?: string;
  dedupeBucket?: string | null;
  targetSnapshot?: Parameters<typeof buildEncryptedRelationshipPayload>[0]["targetSnapshot"];
}) {
  const recordQuery = vi.fn(async (_sql: string, params: unknown[] = []) => ({
      rows: [{
        id: input.id,
        record_lookup_index: params[0],
        actor_user_index: params[1],
        target_user_index: params[2],
        ordered_pair_index: params[3],
        participant_one_index: params[4],
        participant_two_index: params[5],
        relationship_type_index: params[6],
        relationship_status_index: params[7],
        dedupe_bucket_index: params[8],
        record_ciphertext: params[9],
        record_nonce: params[10],
        record_auth_tag: params[11],
        encryption_key_version: params[12],
        index_key_version: params[13],
        expires_at: params[14],
        created_at: params[15],
        updated_at: input.createdAt ?? "2026-04-28T12:00:00.000Z"
      }]
    }));
  const recordDb = { query: recordQuery } as unknown as Pick<DbClient, "query">;
  const record = await upsertEncryptedRelationshipRecord({
    config: app.config,
    db: recordDb
  }, buildEncryptedRelationshipPayload({
    type: input.type,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    createdAt: input.createdAt ?? "2026-04-28T12:00:00.000Z",
    dedupeBucket: input.dedupeBucket ?? null,
    targetSnapshot: input.targetSnapshot ?? null
  }));

  return record as EncryptedRelationshipRecordRow;
}

async function encryptedMatchTokenRow(input: {
  relationshipRecordId: string;
  userOneId: string;
  userTwoId: string;
  expiresAt?: string;
}) {
  const tokenQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
  const tokenDb = { query: tokenQuery } as unknown as Pick<DbClient, "query">;

  await issueEncryptedRelationshipToken({
    config: app.config,
    db: tokenDb
  }, {
    relationshipRecordId: input.relationshipRecordId,
    userOneId: input.userOneId,
    userTwoId: input.userTwoId,
    purpose: "permissions",
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + 60_000)
  });

  const params = (tokenQuery.mock.calls[0]?.[1] ?? []) as unknown[];

  return {
    id: "token-1",
    relationship_record_id: params[0],
    purpose_index: params[1],
    token_lookup_index: params[2],
    token_ciphertext: params[3],
    token_nonce: params[4],
    token_auth_tag: params[5],
    token_signature: params[6],
    token_key_version: params[7],
    expires_at: params[8],
    created_at: "2026-04-28T12:00:00.000Z",
    revoked_at: null
  };
}

async function encryptedLocationEnvelopeRow(input: {
  subjectUserId: string;
  lat: number;
  lng: number;
  accuracyM?: number;
}) {
  const locationQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
  const locationDb = { query: locationQuery } as unknown as Pick<DbClient, "query">;

  await storeLocationEnvelope({
    config: app.config,
    db: locationDb
  }, {
    subjectUserId: input.subjectUserId,
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM ?? 0,
    source: "GPS"
  });

  const params = (locationQuery.mock.calls[0]?.[1] ?? []) as unknown[];

  return {
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

async function encryptedVisibilityPolicyRow(input: {
  subjectUserId: string;
  baseMode?: VisibilityBaseMode;
  preciseToMutualCruushes?: boolean;
  ghostRadiusMeters?: number;
}) {
  const policyQuery = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("from encrypted_visibility_tokens")) {
      return { rows: [] };
    }
    if (sql.includes("insert into ghost_rotation_tokens")) {
      return { rows: [{ subject_user_id: input.subjectUserId }] };
    }

    return { rows: [] };
  });
  const policyDb = { query: policyQuery } as unknown as Pick<DbClient, "query">;

  await saveVisibilityPolicy({
    config: app.config,
    db: policyDb
  }, input.subjectUserId, {
    baseMode: input.baseMode,
    preciseToMutualCruushes: input.preciseToMutualCruushes,
    ghostRadiusMeters: input.ghostRadiusMeters
  });

  const insertCall = policyQuery.mock.calls
    .filter(([sql]) => String(sql).includes("insert into encrypted_visibility_tokens"))
    .at(-1);
  const params = (insertCall?.[1] ?? []) as unknown[];

  return {
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

function multipartFilePayload(input: {
  fieldName: string;
  filename: string;
  contentType: string;
  content: Buffer;
  fields?: Array<{ name: string; value: string }>;
}) {
  const boundary = `----cruush-test-${Date.now()}`;
  const fields = input.fields?.map((field) => Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${field.name}"\r\n\r\n` +
    `${field.value}\r\n`
  )) ?? [];
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${input.fieldName}"; filename="${input.filename}"\r\n` +
    `Content-Type: ${input.contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    payload: Buffer.concat([...fields, head, input.content, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function buildCsamTestApp(overrides: Partial<AppConfig> = {}) {
  return buildServer({
    ...app.config,
    PHOTODNA_ENABLED: true,
    PHOTODNA_API_URL: "https://photodna.example.test",
    PHOTODNA_OPERATION_PATH: "/match",
    PHOTODNA_SUBSCRIPTION_KEY: "photo-dna-key",
    CSAM_REPORTING_ENABLED: true,
    CSAM_REPORTING_MODE: "manual_packet",
    CSAM_REPORTING_TEST_MODE: true,
    TRUST_SAFETY_ALERT_EMAIL: "trust-safety@cruush.test",
    RESEND_API_KEY: "re_test",
    MAIL_FROM: "cruush <hello@cruush.test>",
    INTERNAL_API_SECRET: "internal-secret",
    ...overrides
  } as AppConfig, {
    db: {
      query,
      end
    },
    rateLimiter
  });
}

async function validPng() {
  return sharp({
    create: {
      width: 24,
      height: 30,
      channels: 3,
      background: { r: 180, g: 40, b: 100 }
    }
  }).png().toBuffer();
}

async function validJpeg() {
  return sharp({
    create: {
      width: 24,
      height: 30,
      channels: 3,
      background: { r: 180, g: 40, b: 100 }
    }
  }).jpeg().toBuffer();
}

function mockPendingProfileMediaQueries() {
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("select photos from profiles")) {
      return { rows: [{ photos: [] }] };
    }

    if (sql.includes("with inserted_media as")) {
      return { rows: [{ id: params[0] }] };
    }

    if (sql.includes("insert into profiles (id, photos, updated_at)")) {
      return { rows: [{ photos: [params[2]] }] };
    }

    return { rows: [] };
  });
}

describe("server", () => {
  const userId = "d271f6da-c51d-4d73-a322-d9c56f45d4fa";
  const dmPartnerId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
  const conversationId = "7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2";
  const csamIncidentId = "11111111-1111-4111-8111-111111111111";
  const csamEvidenceId = "22222222-2222-4222-8222-222222222222";

  function mockPhotoDnaMatchAndAlert() {
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = input.toString();

      if (url.startsWith("https://photodna.example.test")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            isMatch: true,
            trackingId: "photodna-match-1",
            status: "matched"
          })
        };
      }

      if (url === "https://api.resend.com/emails") {
        return {
          ok: true,
          status: 200,
          text: async () => ""
        };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function mockCsamIncidentQueries(options: { conversation?: boolean } = {}) {
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql);

      if (text.includes("select photos from profiles")) {
        return { rows: [{ photos: [] }] };
      }

      if (text.includes("join conversations c")) {
        return {
          rows: options.conversation
            ? [{
              id: conversationId,
              kind: "group",
              title: "Beta crew",
              tags: [],
              updated_at: "2026-04-29T12:00:00.000Z",
              last_message: "",
              unread_count: 0,
              pinned: false,
              muted: false,
              other_user_id: null,
              other_user_name: null,
              other_user_pronouns: null,
              other_user_photo: null,
              member_count: 3,
              current_user_role: "member",
              disappearing_timer: "off",
              closed_at: null
            }]
            : []
        };
      }

      if (text.includes("join user_blocks block")) {
        return { rows: [] };
      }

      if (text.includes("select email, display_name from app_users")) {
        return { rows: [{ email: "river@example.com", display_name: "River" }] };
      }

      if (text.includes("insert into csam_incidents")) {
        return {
          rows: [{
            id: csamIncidentId,
            created_at: "2026-07-07T12:00:00.000Z"
          }]
        };
      }

      if (text.includes("insert into csam_incident_evidence")) {
        return { rows: [{ id: csamEvidenceId }] };
      }

      if (text.includes("insert into content_reviews")) {
        return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
      }

      return { rows: [{ id: params[0] ?? "row-id" }] };
    });
  }

  it("returns metadata from /api/meta", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/meta"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.json()).toEqual({
      service: "cruush-server",
      auth: "session-cookie",
      storage: "postgres",
      migratedFromSupabase: true,
      build: {
        sha: null,
        shortSha: null,
        stage: "development"
      },
      alphaTest: {
        enabled: false,
        active: false,
        endsAt: null,
        ended: false
      },
      betaAccess: {
        enabled: false
      },
      photoUploads: {
        profilePhotos: true,
        messagePhotos: true
      },
      moderation: {
        provider: "mock",
        mediaPublicBaseUrlConfigured: true,
        streamConfigKeyConfigured: false,
        streamAppIdConfigured: false
      }
    });
  });

  it("does not expose launch boundary details from the beta access check", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/beta/access/check",
      payload: {
        lat: 40.6832265,
        lng: -73.9520496
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        enabled: false,
        allowed: true
      }
    });
  });

  it("returns public build metadata from /api/build", async () => {
    const stampedApp = buildServer({
      NODE_ENV: "production",
      APP_DEPLOYMENT_STAGE: "production",
      APP_BUILD_SHA: "f230afbcf9247390dfe5b3b0ce63d97d839ce6c4",
      PORT: 3001,
      HOST: "127.0.0.1",
      DATABASE_URL: "postgres://localhost:5432/cruush",
      CORS_ORIGIN: "http://localhost:5173",
      SESSION_SECRET: "test-secret",
      APP_URL: "https://cruush.test",
      RESEND_API_KEY: "",
      MAIL_FROM: "",
      EMAIL_PREVIEW_ENABLED: false,
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
      MATCH_TOKEN_KEY_VERSION: "v1"
    }, {
      db: {
        query,
        end
      },
      rateLimiter: createMemoryRateLimiter()
    });

    try {
      const response = await stampedApp.inject({
        method: "GET",
        url: "/api/build"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        service: "cruush-server",
        sha: "f230afbcf9247390dfe5b3b0ce63d97d839ce6c4",
        shortSha: "f230afbcf924",
        stage: "production"
      });
    } finally {
      await stampedApp.close();
    }
  });

  it("keeps admin moderation routes mounted and protected when the legacy feature flag is disabled", async () => {
    const response = await productionApp.inject({
      method: "GET",
      url: "/api/admin/moderation/reports"
    });

    expect(response.statusCode).toBe(401);
  });

  it("requires the internal secret before returning a CSAM incident", async () => {
    const csamApp = buildCsamTestApp();

    const response = await csamApp.inject({
      method: "GET",
      url: `/api/internal/csam-incidents/${csamIncidentId}`
    });
    await csamApp.close();

    expect(response.statusCode).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns a CyberTipline-ready CSAM report packet through internal access", async () => {
    const csamApp = buildCsamTestApp();
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from csam_incidents")) {
        return {
          rows: [{
            id: csamIncidentId,
            user_id: userId,
            user_email: "river@example.com",
            user_display_name: "River",
            surface: "profile_photo",
            status: "awaiting_submission",
            reporting_mode: "manual_packet",
            test_mode: true,
            environment: "test",
            provider: "photodna",
            provider_request_id: "photodna-match-1",
            photodna_result: { isMatch: true },
            alert_status: "sent",
            alert_error: null,
            cybertipline_report_id: null,
            ncmec_reported_at: null,
            created_at: "2026-07-07T12:00:00.000Z",
            updated_at: "2026-07-07T12:00:00.000Z"
          }]
        };
      }

      if (text.includes("from csam_incident_evidence")) {
        return {
          rows: [{
            id: csamEvidenceId,
            object_key: `csam-evidence/${csamIncidentId}/evidence.png.enc`,
            sha256_hex: "a".repeat(64),
            original_filename: "profile.png",
            mime_type: "image/png",
            byte_size: 10,
            source_route: "POST /api/profile-photos",
            request_ip: "127.0.0.1",
            user_agent: "vitest",
            created_at: "2026-07-07T12:00:00.000Z"
          }]
        };
      }

      if (text.includes("from csam_incident_events")) {
        return {
          rows: [{
            id: "44444444-4444-4444-8444-444444444444",
            event_type: "match_detected",
            metadata: {},
            created_at: "2026-07-07T12:00:00.000Z"
          }]
        };
      }

      return { rows: [] };
    });

    const response = await csamApp.inject({
      method: "GET",
      url: `/api/internal/csam-incidents/${csamIncidentId}/report-packet`,
      headers: {
        "x-internal-secret": "internal-secret"
      }
    });
    await csamApp.close();
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data.incident.id).toBe(csamIncidentId);
    expect(body.data.reporting.destination).toBe("NCMEC CyberTipline");
    expect(body.data.reporting.mode).toBe("manual_packet");
    expect(body.data.evidence[0]).toMatchObject({
      objectKey: `csam-evidence/${csamIncidentId}/evidence.png.enc`,
      sha256Hex: "a".repeat(64),
      mimeType: "image/png"
    });
    expect(JSON.stringify(body)).not.toContain("decrypted");
    expect(JSON.stringify(body)).not.toContain("data:image");
  });

  it("marks a CSAM incident as submitted through internal access", async () => {
    const csamApp = buildCsamTestApp();
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("update csam_incidents")) {
        return {
          rows: [{
            id: csamIncidentId,
            status: "submitted",
            cybertipline_report_id: "ncmec-123",
            ncmec_reported_at: "2026-07-07T13:00:00.000Z"
          }]
        };
      }

      return { rows: [{ id: "event-id" }] };
    });

    const response = await csamApp.inject({
      method: "POST",
      url: `/api/internal/csam-incidents/${csamIncidentId}/mark-submitted`,
      headers: {
        "x-internal-secret": "internal-secret"
      },
      payload: {
        cyberTiplineReportId: "ncmec-123",
        submittedBy: "ops@cruush.app"
      }
    });
    await csamApp.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        id: csamIncidentId,
        status: "submitted",
        cyberTiplineReportId: "ncmec-123"
      }
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into csam_incident_events"))).toBe(true);
  });

  it("returns the open beta cruush+ plan catalog", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/billing/plans",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        processor: "fake",
        testCheckout: true,
        currency: "USD",
        plans: expect.arrayContaining([
          expect.objectContaining({ id: "plus_weekly", amountCents: 999, interval: "week" }),
          expect.objectContaining({ id: "plus_monthly", amountCents: 1899, interval: "month" }),
          expect.objectContaining({ id: "plus_3_month", amountCents: 3597, interval: "3_months" }),
          expect.objectContaining({ id: "plus_6_month", amountCents: 5994, interval: "6_months" }),
          expect.objectContaining({ id: "plus_annual", amountCents: 11999, interval: "year" }),
          expect.objectContaining({ id: "founder_annual", amountCents: 9900, interval: "year", supplyLimit: 1000 }),
          expect.objectContaining({ id: "lifetime_founder", amountCents: 99900, interval: "lifetime", supplyLimit: 250 })
        ])
      }
    });
  });

  it("creates and completes a visible fake lifetime founder checkout without consuming real founder supply", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "7d39c89e-e816-4684-82e0-b48e3f8127d4",
          user_id: userId,
          plan_id: "lifetime_founder",
          processor: "fake",
          status: "pending",
          test_mode: true,
          amount_cents: 99900,
          currency: "USD",
          created_at: "2026-07-07T12:00:00.000Z",
          expires_at: "2026-07-07T12:30:00.000Z",
          completed_at: null
        }]
      });

    const checkoutResponse = await app.inject({
      method: "POST",
      url: "/api/billing/checkout-sessions",
      headers: {
        "x-user-id": userId
      },
      payload: {
        planId: "lifetime_founder"
      }
    });

    expect(checkoutResponse.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("insert into billing_checkout_sessions");
    expect(checkoutResponse.json()).toMatchObject({
      data: {
        id: "7d39c89e-e816-4684-82e0-b48e3f8127d4",
        planId: "lifetime_founder",
        processor: "fake",
        testMode: true,
        testWarning: "TEST CHECKOUT - no real payment will be collected."
      }
    });

    query.mockReset();
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "7d39c89e-e816-4684-82e0-b48e3f8127d4",
          user_id: userId,
          plan_id: "lifetime_founder",
          processor: "fake",
          status: "pending",
          test_mode: true,
          amount_cents: 99900,
          currency: "USD"
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          cruush_plus_enabled: true,
          cruush_plus_expires_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const completeResponse = await app.inject({
      method: "POST",
      url: "/api/billing/checkout-sessions/7d39c89e-e816-4684-82e0-b48e3f8127d4/complete-test",
      headers: {
        "x-user-id": userId
      }
    });

    expect(completeResponse.statusCode).toBe(200);
    expect(query.mock.calls.some((call) => String(call[0]).includes("insert into cruush_plus_lifetime_access"))).toBe(true);
    expect(query.mock.calls.some((call) => String(call[0]).includes("insert into user_entitlements"))).toBe(true);
    expect(query.mock.calls.some((call) => String(call[0]).includes("insert into founder_redemptions"))).toBe(true);
    expect(query.mock.calls.some((call) => String(call[0]).includes("insert into user_badges"))).toBe(true);
    expect(query.mock.calls.find((call) => String(call[0]).includes("insert into founder_redemptions"))?.[1]).toContain(true);
    expect(completeResponse.json()).toMatchObject({
      data: {
        cruushPlus: true,
        expiresAt: null,
        badges: expect.arrayContaining(["lifetime_founder"]),
        testMode: true
      }
    });
  });

  it("redirects legacy verification page links to the root verification token route", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/verify-email?token=verification-token-1234567890"
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://cruush.test/?verifyEmailToken=verification-token-1234567890");
  });

  it("redirects legacy password reset page links to the root reset token route", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/reset-password?token=reset-token-1234567890"
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://cruush.test/?resetPasswordToken=reset-token-1234567890");
  });

  it("does not allow x-user-id auth outside test mode", async () => {
    const response = await developmentApp.inject({
      method: "GET",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
        details: null
      }
    });
  });

  it("allows only configured CORS origins", async () => {
    const allowedResponse = await corsApp.inject({
      method: "OPTIONS",
      url: "/api/auth/signup",
      headers: {
        origin: "https://staging.cruush.app",
        "access-control-request-method": "POST"
      }
    });

    expect(allowedResponse.statusCode).toBe(204);
    expect(allowedResponse.headers["access-control-allow-origin"]).toBe("https://staging.cruush.app");
    expect(allowedResponse.headers["access-control-allow-credentials"]).toBe("true");
    expect(allowedResponse.headers["access-control-allow-methods"]).toContain("POST");

    const putResponse = await corsApp.inject({
      method: "OPTIONS",
      url: "/api/profiles/me",
      headers: {
        origin: "https://staging.cruush.app",
        "access-control-request-method": "PUT"
      }
    });

    expect(putResponse.statusCode).toBe(204);
    expect(putResponse.headers["access-control-allow-origin"]).toBe("https://staging.cruush.app");
    expect(putResponse.headers["access-control-allow-methods"]).toContain("PUT");

    const blockedResponse = await corsApp.inject({
      method: "OPTIONS",
      url: "/api/auth/signup",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST"
      }
    });

    expect(blockedResponse.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects state-changing requests from untrusted origins before route handling", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      headers: {
        origin: "https://evil.example"
      },
      payload: {
        email: "river@example.com",
        password: "password-123",
        displayName: "River"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(query).not.toHaveBeenCalled();
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Request origin is not allowed.",
        details: null
      }
    });
  });

  it("rejects production state-changing requests without an origin or referer", async () => {
    const response = await productionApp.inject({
      method: "POST",
      url: "/api/auth/logout"
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Request origin is required.",
        details: null
      }
    });
  });

  it("allows production state-changing requests with an allowed origin", async () => {
    const response = await productionApp.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        origin: "http://localhost:5173"
      }
    });

    expect(response.statusCode).toBe(204);
  });

  it("rejects production state-changing requests with an untrusted origin", async () => {
    const response = await productionApp.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        origin: "https://evil.example"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Request origin is not allowed.",
        details: null
      }
    });
  });

  it("allows production state-changing requests with an allowed referer origin", async () => {
    const response = await productionApp.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        referer: "http://localhost:5173/settings"
      }
    });

    expect(response.statusCode).toBe(204);
  });

  it("rejects production state-changing requests with an untrusted referer origin", async () => {
    const response = await productionApp.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        referer: "https://evil.example/settings"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Request origin is not allowed.",
        details: null
      }
    });
  });

  it("rejects production state-changing requests when origin is untrusted even if referer is allowed", async () => {
    const response = await productionApp.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        origin: "https://evil.example",
        referer: "http://localhost:5173/settings"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Request origin is not allowed.",
        details: null
      }
    });
  });

  it("creates a verification token on POST /api/auth/signup without signing in", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          display_name: null,
          email_verified_at: null,
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          expires_at: "2026-04-30T12:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        email: "river@example.com",
        password: "password-123",
        dateOfBirth: "1994-06-15",
        termsAccepted: true,
        privacyAccepted: true,
        productUpdatesOptIn: false
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("insert into app_users");
    expect(query.mock.calls[0]?.[0]).toContain("signup_birth_year");
    expect(query.mock.calls[0]?.[0]).not.toContain("insert into profiles (id, year_of_birth)");
    expect(query.mock.calls[0]?.[1]?.[2]).toBeNull();
    expect(query.mock.calls[0]?.[1]?.[14]).toBe(1994);
    expect(query.mock.calls[1]?.[0]).toContain("delete from email_verification_tokens");
    expect(query.mock.calls[2]?.[0]).toContain("insert into email_verification_tokens");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.json()).toEqual({
      data: {
        alreadyVerified: false,
        email: "river@example.com",
        expiresAt: "2026-04-30T12:00:00.000Z",
        previewUrl: expect.stringContaining("https://cruush.test/?verifyEmailToken="),
        verificationEmailSent: false
      }
    });
  });

  it("reports signup verification delivery only when the provider accepts the email", async () => {
    const resendSignupApp = buildServer({
      ...app.config,
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "cruush <hello@cruush.test>",
      EMAIL_PREVIEW_ENABLED: false
    }, {
      db: { query, end },
      rateLimiter: createMemoryRateLimiter()
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("")
    });
    vi.stubGlobal("fetch", fetchMock);
    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          display_name: null,
          email_verified_at: null,
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ expires_at: "2026-04-30T12:00:00.000Z" }]
      });

    try {
      const response = await resendSignupApp.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: {
          email: "river@example.com",
          password: "password-123",
          dateOfBirth: "1994-06-15",
          termsAccepted: true,
          privacyAccepted: true,
          productUpdatesOptIn: false
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data).toMatchObject({
        previewUrl: null,
        verificationEmailSent: true
      });
      expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
    } finally {
      await resendSignupApp.close();
    }
  });

  it("stores a new Spot suggestion only in an encrypted envelope", async () => {
    const payload = {
      name: "Private proposed Spot",
      description: "Private review detail",
      accessInstructions: "Private entry detail",
      latitude: 40.72,
      longitude: -73.98,
      address: "Private review address",
      facilityType: "bar",
      tags: [],
      vibes: ["cruisy"],
      amenities: ["restrooms"]
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/places",
      headers: { "x-user-id": userId },
      payload
    });
    const insertCall = query.mock.calls.find(([sql]) => String(sql).includes("insert into places ("));
    const insertSql = String(insertCall?.[0]);
    const insertParams = insertCall?.[1] ?? [];

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ status: "pending", suggestionCount: 1, autoShortlisted: false });
    expect(insertSql).toContain("'[encrypted suggestion]', '', 0, 0, null, 'other'");
    expect(insertSql).toContain("submitted_by");
    expect(insertParams).not.toContain(payload.name);
    expect(insertParams).not.toContain(payload.description);
    expect(insertParams).not.toContain(payload.accessInstructions);
    expect(insertParams).not.toContain(payload.address);
    expect(insertParams).not.toContain(payload.latitude);
    expect(insertParams).not.toContain(payload.longitude);
    expect(decryptPlaceSuggestion(app.config, {
      ciphertext: String(insertParams[2]),
      nonce: String(insertParams[3]),
      authTag: String(insertParams[4]),
      keyVersion: String(insertParams[5])
    })).toEqual(payload);
  });

  it("adds anonymous duplicate support and shortlists at three supporters", async () => {
    const placeId = "10000000-0000-4000-8000-000000000099";
    const payload = {
      name: "Supported proposed Spot",
      description: "Private review detail",
      latitude: 40.72,
      longitude: -73.98,
      address: "",
      facilityType: "bar",
      tags: []
    };
    const encrypted = encryptPlaceSuggestion(app.config, payload);

    query.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes("where status = 'published'")) return Promise.resolve({ rows: [] });
      if (text.includes("p.status = 'pending'")) {
        return Promise.resolve({ rows: [{
          id: placeId,
          suggestion_ciphertext: encrypted.ciphertext,
          suggestion_nonce: encrypted.nonce,
          suggestion_auth_tag: encrypted.authTag,
          suggestion_key_version: encrypted.keyVersion
        }] });
      }
      if (text.includes("insert into place_suggestions")) return Promise.resolve({ rows: [{ place_id: placeId }] });
      if (text.includes("update places set") && text.includes("suggestion_count")) {
        return Promise.resolve({ rows: [{ suggestion_count: 3, auto_shortlisted_at: "2026-08-31T20:00:00.000Z" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/places",
      headers: { "x-user-id": userId },
      payload
    });
    const supportCall = query.mock.calls.find(([sql]) => String(sql).includes("insert into place_suggestions"));

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ id: placeId, status: "pending", suggestionCount: 3, autoShortlisted: true });
    expect(String(supportCall?.[0])).toContain("on conflict do nothing");
    expect(supportCall?.[1]?.[1]).not.toBe(userId);
    expect(String(supportCall?.[1]?.[1])).not.toContain(userId);
  });

  it("denies Spot publication before any moderator update", async () => {
    const placeId = "10000000-0000-4000-8000-000000000099";
    const response = await app.inject({
      method: "PATCH",
      url: `/api/admin/places/${placeId}`,
      headers: { "x-user-id": userId },
      payload: { status: "published" }
    });

    expect(response.statusCode).toBe(403);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("update places set status"))).toBe(false);
  });

  it("clears only the authenticated member's ratings for the selected Spot", async () => {
    const placeId = "10000000-0000-4000-8000-000000000099";
    const response = await app.inject({
      method: "DELETE",
      url: `/api/places/${placeId}/rating`,
      headers: { "x-user-id": userId }
    });
    const deleteCall = query.mock.calls.find(([sql]) => String(sql).includes("delete from place_ratings"));

    expect(response.statusCode).toBe(204);
    expect(String(deleteCall?.[0])).toContain("where place_id = $1 and user_id = $2");
    expect(deleteCall?.[1]).toEqual([placeId, userId]);
  });

  it.each([
    [undefined, "Enter your complete date of birth."],
    ["2020-02-30", "Enter a valid date of birth."],
    ["2099-01-01", "Enter a valid date of birth."],
    ["1800-01-01", "Enter a valid date of birth."],
    ["2012-06-15", "You must be at least 18 to use cruush."]
  ])("rejects ineligible signup date %s before account creation", async (dateOfBirth, expectedMessage) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        email: "river@example.com",
        password: "password-123",
        ...(dateOfBirth ? { dateOfBirth } : {})
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: expectedMessage
      }
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects alpha test signup before creating an account when alpha password is missing", async () => {
    const alphaSignupApp = buildServer({
      ...app.config,
      ALPHA_TEST_ENABLED: true,
      ALPHA_TEST_PASSWORD_HASH: await hashPassword("door-password"),
      ALPHA_TEST_ENDS_AT: "2099-08-07T03:59:00-04:00"
    }, {
      db: {
        query,
        end
      },
      rateLimiter: createMemoryRateLimiter()
    });

    try {
      const response = await alphaSignupApp.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: {
          email: "river@example.com",
          password: "password-123",
          dateOfBirth: "1994-06-15",
          termsAccepted: true,
          privacyAccepted: true,
          productUpdatesOptIn: false
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: {
          code: "ALPHA_TEST_PASSWORD_REQUIRED",
          message: "Enter the alpha password.",
          details: null
        }
      });
      expect(query).not.toHaveBeenCalled();
    } finally {
      await alphaSignupApp.close();
    }
  });

  it("allows beta signup without requesting or storing a signup location", async () => {
    const alphaGeofenceSignupApp = buildServer({
      ...app.config,
      ALPHA_TEST_ENABLED: true,
      ALPHA_TEST_PASSWORD_HASH: "",
      ALPHA_TEST_ENDS_AT: "2099-08-07T03:59:00-04:00",
      BETA_ACCESS_GEOFENCE_ENABLED: true
    }, {
      db: {
        query,
        end
      },
      rateLimiter: createMemoryRateLimiter()
    });

    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          display_name: null,
          email_verified_at: null,
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          expires_at: "2026-04-30T12:00:00.000Z"
        }]
      });

    try {
      const response = await alphaGeofenceSignupApp.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: {
          email: "river@example.com",
          password: "password-123",
          dateOfBirth: "1994-06-15",
          termsAccepted: true,
          privacyAccepted: true,
          productUpdatesOptIn: false
        }
      });

      expect(response.statusCode, response.body).toBe(201);
      expect(query.mock.calls[0]?.[0]).toContain("insert into app_users");
      expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into encrypted_location_envelopes"))).toBe(false);
    } finally {
      await alphaGeofenceSignupApp.close();
    }
  });

  it("uses the allowed frontend origin for verification links when the API has its own APP_URL", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          display_name: "River",
          email_verified_at: null,
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          expires_at: "2026-04-30T12:00:00.000Z"
        }]
      });

    const response = await emailLinkApp.inject({
      method: "POST",
      url: "/api/auth/signup",
      headers: {
        origin: "https://www.cruush.app"
      },
      payload: {
        email: "river@example.com",
        password: "password-123",
        dateOfBirth: "1994-06-15",
        termsAccepted: true,
        privacyAccepted: true,
        productUpdatesOptIn: false,
        displayName: "River"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: {
        alreadyVerified: false,
        email: "river@example.com",
        expiresAt: "2026-04-30T12:00:00.000Z",
        previewUrl: expect.stringContaining("https://cruush.app/?verifyEmailToken="),
        verificationEmailSent: false
      }
    });
  });

  it("falls back to the configured frontend origin when APP_URL points at the request host", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          display_name: "River",
          email_verified_at: null,
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          expires_at: "2026-04-30T12:00:00.000Z"
        }]
      });

    const response = await emailLinkApp.inject({
      method: "POST",
      url: "/api/auth/signup",
      headers: {
        host: "api.cruush.test"
      },
      payload: {
        email: "river@example.com",
        password: "password-123",
        dateOfBirth: "1994-06-15",
        termsAccepted: true,
        privacyAccepted: true,
        productUpdatesOptIn: false,
        displayName: "River"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: {
        alreadyVerified: false,
        email: "river@example.com",
        expiresAt: "2026-04-30T12:00:00.000Z",
        previewUrl: expect.stringContaining("https://cruush.app/?verifyEmailToken="),
        verificationEmailSent: false
      }
    });
  });

  it("rate limits repeated sign-up attempts", async () => {
    query.mockRejectedValue({ code: "23505" });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: {
          email: "river@example.com",
          password: "password-123",
          dateOfBirth: "1994-06-15",
          termsAccepted: true,
          privacyAccepted: true,
          productUpdatesOptIn: false,
          displayName: "River"
        }
      });

      expect(response.statusCode).toBe(409);
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        email: "river@example.com",
        password: "password-123",
        dateOfBirth: "1994-06-15",
        termsAccepted: true,
        privacyAccepted: true,
        productUpdatesOptIn: false,
        displayName: "River"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many sign-up attempts. Try again later.",
        details: expect.any(Object)
      }
    });
    expect(query).toHaveBeenCalledTimes(5);
  });

  it("requires a valid Turnstile token on signup when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: false })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await turnstileApp.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        email: "river@example.com",
        password: "password-123",
        dateOfBirth: "1994-06-15",
        termsAccepted: true,
        privacyAccepted: true,
        productUpdatesOptIn: false,
        displayName: "River",
        captchaToken: "invalid-captcha"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(query).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rejects login before email verification", async () => {
    const passwordHash = await hashPassword("password-123");
    query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        email: "river@example.com",
        password_hash: passwordHash,
        display_name: "River",
        email_verified_at: null,
        created_at: "2026-04-28T12:00:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "river@example.com",
        password: "password-123"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.json()).toEqual({
      error: {
        code: "EMAIL_VERIFICATION_REQUIRED",
        message: "Verify your email before signing in.",
        details: null
      }
    });
  });

  it("allows existing accounts to log in during beta access without a fresh location gate", async () => {
    const passwordHash = await hashPassword("password-123");
    const betaLoginApp = buildServer({
      ...app.config,
      BETA_ACCESS_GEOFENCE_ENABLED: true
    }, {
      db: {
        query,
        end
      },
      rateLimiter: createMemoryRateLimiter()
    });

    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          password_hash: passwordHash,
          display_name: "River",
          email_verified_at: "2026-04-28T12:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          account_status: "active",
          two_factor_enabled: false
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          app_display_name: "River",
          email_verified_at: "2026-04-28T12:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          profile_display_name: "River",
          year_of_birth: 1998,
          code_of_conduct_accepted_version: "2026-07-07",
          code_of_conduct_accepted_at: "2026-07-07T15:00:00.000Z",
          account_status: "active"
        }]
      });

    try {
      const response = await betaLoginApp.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "river@example.com",
          password: "password-123"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["set-cookie"]).toEqual(expect.arrayContaining([
        expect.stringContaining("cruush_session="),
        expect.stringContaining("cruush_device=")
      ]));
      expect(response.json().data.user.email).toBe("river@example.com");
    } finally {
      await betaLoginApp.close();
    }
  });

  it("signs in the hardcoded development admin", async () => {
    query.mockImplementation(async (sql: string) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("insert into app_users")) {
        return {
          rows: [{
            id: userId,
            email: "admin@cruush.local",
            display_name: "Admin",
            email_verified_at: "2026-04-28T12:00:00.000Z",
            created_at: "2026-04-28T12:00:00.000Z"
          }]
        };
      }

      if (normalizedSql.includes("from app_users u") && normalizedSql.includes("left join profiles")) {
        return {
          rows: [{
            id: userId,
            email: "admin@cruush.local",
            app_display_name: "Admin",
            email_verified_at: "2026-04-28T12:00:00.000Z",
            age_verified_at: "2026-04-28T12:00:00.000Z",
            created_at: "2026-04-28T12:00:00.000Z",
            profile_display_name: "Admin",
            year_of_birth: 1990
          }]
        };
      }

      return {
        rows: []
      };
    });

    const response = await developmentApp.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@cruush.local",
        password: "admin-password"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringContaining("cruush_session="),
      expect.stringContaining("cruush_device=")
    ]));
    expect(query.mock.calls[0]?.[0]).toContain("insert into app_users");
    const profileInsertCall = query.mock.calls.find(([sql]) => String(sql).includes("insert into profiles"));
    expect(profileInsertCall?.[0]).toContain("location_updated_at");
    expect(profileInsertCall?.[1]).toEqual([
      userId,
      "Admin",
      1990,
      DEVELOPMENT_ADMIN_LOCATION.lat,
      DEVELOPMENT_ADMIN_LOCATION.lng,
      DEVELOPMENT_ADMIN_LOCATION.fuzzyLat,
      DEVELOPMENT_ADMIN_LOCATION.fuzzyLng,
      DEVELOPMENT_ADMIN_LOCATION.fuzzRadiusMeters
    ]);
    const encryptedLocationCall = query.mock.calls.find(([sql]) => String(sql).includes("insert into encrypted_location_envelopes"));
    const encryptedPolicyCall = query.mock.calls.find(([sql]) => String(sql).includes("insert into encrypted_visibility_tokens"));
    const sessionInsertCall = query.mock.calls.find(([sql]) => String(sql).includes("insert into app_sessions"));
    expect(encryptedLocationCall?.[0]).toContain("coarse_index_tokens");
    expect(JSON.stringify(encryptedLocationCall?.[1])).not.toContain(String(DEVELOPMENT_ADMIN_LOCATION.lat));
    expect(JSON.stringify(encryptedLocationCall?.[1])).not.toContain(String(DEVELOPMENT_ADMIN_LOCATION.lng));
    expect(encryptedPolicyCall?.[0]).toContain("insert into encrypted_visibility_tokens");
    expect(sessionInsertCall?.[0]).toContain("insert into app_sessions");
    expect(response.json()).toEqual({
      data: {
        user: {
          id: userId,
          email: "admin@cruush.local",
          displayName: "Admin",
          emailVerifiedAt: "2026-04-28T12:00:00.000Z",
          createdAt: "2026-04-28T12:00:00.000Z",
          accountStatus: "active"
        },
        profile: {
          displayName: "Admin",
          yearOfBirth: 1990
        },
        needsOnboarding: false,
        needsAgeVerification: false,
        needsCodeOfConduct: true,
        codeOfConductVersion: "2026-07-07",
        acceptedCodeOfConductVersion: null,
        codeOfConductAcceptedAt: null
      }
    });
  });

  it("does not allow the hardcoded admin login in production", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await productionApp.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        origin: "http://localhost:5173"
      },
      payload: {
        email: "admin@cruush.local",
        password: "admin-password"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("from app_users");
  });

  it("does not allow the hardcoded admin login without explicit development opt-in", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await lockedDevelopmentApp.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@cruush.local",
        password: "admin-password"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("from app_users");
  });

  it("blocks a suspended account at login and returns only the appeal path", async () => {
    const passwordHash = await hashPassword("password-123");
    query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        email: "river@example.com",
        password_hash: passwordHash,
        display_name: "River",
        email_verified_at: "2026-04-28T12:00:00.000Z",
        created_at: "2026-04-28T12:00:00.000Z",
        account_status: "suspended",
        suspension_reason_code: "harassment"
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "river@example.com",
        password: "password-123"
      }
    });

    // The suspended screen needs the appeal link, and nothing else: no session
    // cookie, no account fields, no suspension reason.
    expect(response.statusCode).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(response.headers["set-cookie"] ?? "")).not.toContain("cruush_session=");
    expect(JSON.stringify(response.json())).not.toContain("harassment");
    expect(response.json()).toEqual({
      error: {
        code: "ACCOUNT_SUSPENDED",
        message: "Your cruush account is suspended.",
        details: { appealUrl: "/support?appeal=general" }
      }
    });
  });

  it("requires a valid Turnstile token on login when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: false })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await turnstileApp.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "river@example.com",
        password: "password-123",
        captchaToken: "invalid-captcha"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rate limits repeated login attempts for the same email", async () => {
    query.mockResolvedValue({ rows: [] });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "river@example.com",
          password: "wrong-password"
        }
      });

      expect(response.statusCode).toBe(401);
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "river@example.com",
        password: "wrong-password"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Try again later.",
        details: expect.any(Object)
      }
    });
  });

  it("does not count successful logins against a shared IP limit", async () => {
    const passwordHash = await hashPassword("password-123");
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();
      const email = String(params[0] ?? "");

      if (normalizedSql.includes("from app_users u") && normalizedSql.includes("left join profiles")) {
        return {
          rows: [{
            id: userId,
            email,
            app_display_name: email.split("@")[0],
            email_verified_at: "2026-04-28T12:00:00.000Z",
            created_at: "2026-04-28T12:00:00.000Z",
            profile_display_name: email.split("@")[0],
            year_of_birth: 1990,
            age_verified_at: "2026-04-28T12:00:00.000Z",
            code_of_conduct_accepted_version: "2026-07-07",
            code_of_conduct_accepted_at: "2026-07-07T12:00:00.000Z",
            account_status: "active"
          }]
        };
      }

      if (normalizedSql.includes("from app_users") && normalizedSql.includes("where email = $1")) {
        return {
          rows: [{
            id: userId,
            email,
            password_hash: passwordHash,
            display_name: email.split("@")[0],
            email_verified_at: "2026-04-28T12:00:00.000Z",
            created_at: "2026-04-28T12:00:00.000Z",
            account_status: "active",
            two_factor_enabled: false
          }]
        };
      }

      return { rows: [] };
    });

    for (let account = 0; account < 6; account += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: `member-${account}@example.com`,
          password: "password-123"
        }
      });

      expect(response.statusCode).toBe(200);
    }
  });

  it("keeps failed password limits account-scoped on a shared IP", async () => {
    const passwordHash = await hashPassword("password-123");
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();
      const email = String(params[0] ?? "");

      if (normalizedSql.includes("from app_users u") && normalizedSql.includes("left join profiles")) {
        return {
          rows: [{
            id: userId,
            email,
            app_display_name: "Sage",
            email_verified_at: "2026-04-28T12:00:00.000Z",
            created_at: "2026-04-28T12:00:00.000Z",
            profile_display_name: "Sage",
            year_of_birth: 1990,
            age_verified_at: "2026-04-28T12:00:00.000Z",
            code_of_conduct_accepted_version: "2026-07-07",
            code_of_conduct_accepted_at: "2026-07-07T12:00:00.000Z",
            account_status: "active"
          }]
        };
      }

      if (normalizedSql.includes("from app_users") && normalizedSql.includes("where email = $1")) {
        return email === "sage@example.com"
          ? {
              rows: [{
                id: userId,
                email,
                password_hash: passwordHash,
                display_name: "Sage",
                email_verified_at: "2026-04-28T12:00:00.000Z",
                created_at: "2026-04-28T12:00:00.000Z",
                account_status: "active",
                two_factor_enabled: false
              }]
            }
          : { rows: [] };
      }

      return { rows: [] };
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "river@example.com",
          password: "wrong-password"
        }
      });

      expect(response.statusCode).toBe(401);
    }

    const limitedResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "river@example.com",
        password: "wrong-password"
      }
    });
    expect(limitedResponse.statusCode).toBe(429);

    const validResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "sage@example.com",
        password: "password-123"
      }
    });
    expect(validResponse.statusCode).toBe(200);
  });

  it("does not count a missing MFA code as a failed sign-in", async () => {
    const passwordHash = await hashPassword("password-123");
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from app_users") && normalizedSql.includes("where email = $1")) {
        return {
          rows: [{
            id: userId,
            email: String(params[0]),
            password_hash: passwordHash,
            display_name: "River",
            email_verified_at: "2026-04-28T12:00:00.000Z",
            created_at: "2026-04-28T12:00:00.000Z",
            account_status: "active",
            two_factor_enabled: true
          }]
        };
      }

      if (normalizedSql.includes("from user_two_factor_auth") && normalizedSql.includes("for update")) {
        return {
          rows: [{
            user_id: userId,
            secret_ciphertext: "unused",
            secret_nonce: "unused",
            secret_auth_tag: "unused",
            secret_key_version: "v1",
            enabled_at: "2026-04-28T12:00:00.000Z",
            setup_created_at: "2026-04-28T12:00:00.000Z",
            trust_awarded_at: null,
            last_used_time_step: null
          }]
        };
      }

      if (normalizedSql.includes("from user_two_factor_recovery_codes")) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "river@example.com",
          password: "password-123"
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("TWO_FACTOR_REQUIRED");
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "river@example.com",
          password: "password-123",
          twoFactorCode: "RECOVERY-INVALID"
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("INVALID_TWO_FACTOR_CODE");
    }

    const limitedResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "river@example.com",
        password: "password-123",
        twoFactorCode: "RECOVERY-INVALID"
      }
    });
    expect(limitedResponse.statusCode).toBe(429);
  });

  it("sends a password reset email without leaking whether the account exists", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          expires_at: "2026-04-30T12:00:00.000Z"
        }]
      });

    const existingResponse = await app.inject({
      method: "POST",
      url: "/api/auth/password/forgot",
      payload: {
        email: "river@example.com"
      }
    });

    expect(existingResponse.statusCode).toBe(202);
    expect(query.mock.calls[0]?.[0]).toContain("from app_users");
    expect(query.mock.calls[1]?.[0]).toContain("delete from password_reset_tokens");
    expect(query.mock.calls[2]?.[0]).toContain("insert into password_reset_tokens");
    expect(existingResponse.json()).toEqual({
      data: {
        accepted: true,
        previewUrl: expect.stringContaining("https://cruush.test/?resetPasswordToken=")
      }
    });

    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] });

    const missingResponse = await app.inject({
      method: "POST",
      url: "/api/auth/password/forgot",
      payload: {
        email: "missing@example.com"
      }
    });

    expect(missingResponse.statusCode).toBe(202);
    expect(query).toHaveBeenCalledTimes(1);
    expect(missingResponse.json()).toEqual({
      data: {
        accepted: true,
        previewUrl: null
      }
    });
  });

  it("does not reveal existing accounts when reset email delivery is unavailable", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          expires_at: "2026-04-30T12:00:00.000Z"
        }]
      });

    const response = await lockedDevelopmentApp.inject({
      method: "POST",
      url: "/api/auth/password/forgot",
      payload: {
        email: "river@example.com"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      data: {
        accepted: true,
        previewUrl: null
      }
    });
  });

  it("resets a password with a valid reset token, invalidates sessions, and deletes outstanding reset tokens", async () => {
    const resetToken = "reset-token-1234567890";
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: []
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/password/reset",
      payload: {
        token: resetToken,
        password: "new-password-123"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from password_reset_tokens");
    expect(query.mock.calls[0]?.[1]).toEqual([hashSessionToken(resetToken)]);
    expect(query.mock.calls[1]?.[0]).toContain("update app_users");
    expect(query.mock.calls[2]?.[0]).toContain("delete from app_sessions");
    expect(query.mock.calls[2]?.[1]).toEqual([userId]);
    expect(query.mock.calls[3]?.[0]).toContain("delete from password_reset_tokens");
    expect(response.json()).toEqual({
      data: {
        reset: true
      }
    });
  });

  it("changes the current user's password and keeps the current session active", async () => {
    const sessionToken = "test-session-token";
    const passwordHash = await hashPassword("current-password");
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          password_hash: passwordHash
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/password/change",
      cookies: {
        cruush_session: sessionToken
      },
      payload: {
        currentPassword: "current-password",
        newPassword: "new-password-123"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(query.mock.calls[0]?.[1]).toEqual([hashSessionToken(sessionToken)]);
    expect(query.mock.calls[1]?.[0]).toContain("from app_users");
    expect(query.mock.calls[2]?.[0]).toContain("update app_users");
    expect(query.mock.calls[2]?.[1]?.[0]).not.toBe("new-password-123");
    expect(query.mock.calls[3]?.[0]).toContain("delete from password_reset_tokens");
    expect(query.mock.calls[4]?.[0]).toContain("delete from app_sessions");
    expect(query.mock.calls[4]?.[1]).toEqual([userId, hashSessionToken(sessionToken)]);
    expect(response.json()).toEqual({
      data: {
        changed: true
      }
    });
  });

  it("holds the new address in a pending request until the confirmation link is opened", async () => {
    const sessionToken = "test-session-token";
    const passwordHash = await hashPassword("current-password");
    query
      .mockResolvedValueOnce({ rows: [{ user_id: userId }] })
      .mockResolvedValueOnce({ rows: [{ id: userId, email: "old@example.com", password_hash: passwordHash }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/email/change",
      cookies: { cruush_session: sessionToken },
      payload: { currentPassword: "current-password", newEmail: "New@Example.com" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.pendingEmail).toBe("new@example.com");
    // The address on app_users must not move before the new address is proven.
    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((statement) => statement.includes("update app_users"))).toBe(false);
    expect(statements.some((statement) => statement.includes("insert into email_change_requests"))).toBe(true);
  });

  it("refuses an email change when the password is wrong", async () => {
    const sessionToken = "test-session-token";
    const passwordHash = await hashPassword("current-password");
    query
      .mockResolvedValueOnce({ rows: [{ user_id: userId }] })
      .mockResolvedValueOnce({ rows: [{ id: userId, email: "old@example.com", password_hash: passwordHash }] });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/email/change",
      cookies: { cruush_session: sessionToken },
      payload: { currentPassword: "wrong-password", newEmail: "new@example.com" }
    });

    expect(response.statusCode).toBe(401);
    expect(query.mock.calls.map((call) => String(call[0])).some((statement) => statement.includes("email_change_requests"))).toBe(false);
  });

  it("moves the address only when a live confirmation token is presented", async () => {
    const confirmToken = "confirm-token-value-that-is-long-enough";
    query
      .mockResolvedValueOnce({ rows: [{ user_id: userId, new_email: "new@example.com" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: userId, email: "new@example.com" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/email/change/confirm",
      payload: { token: confirmToken }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { changed: true, email: "new@example.com" } });
    expect(query.mock.calls[0]?.[1]).toEqual([hashSessionToken(confirmToken)]);
    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((statement) => statement.includes("update app_users"))).toBe(true);
    expect(statements.some((statement) => statement.includes("delete from password_reset_tokens"))).toBe(true);
  });

  it("rejects password changes when the current password is wrong", async () => {
    const passwordHash = await hashPassword("current-password");
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          password_hash: passwordHash
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/password/change",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        currentPassword: "wrong-password",
        newPassword: "new-password-123"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Current password is incorrect.",
        details: null
      }
    });
    expect(query.mock.calls.map((call) => String(call[0])).join("\n")).not.toContain("update app_users");
  });

  it("rate limits repeated password change attempts", async () => {
    const passwordHash = await hashPassword("current-password");
    query.mockImplementation((sql) => {
      const text = String(sql);

      if (text.includes("from app_sessions s")) {
        return Promise.resolve({
          rows: [{
            user_id: userId
          }]
        });
      }

      if (text.includes("from app_users") && text.includes("password_hash")) {
        return Promise.resolve({
          rows: [{
            id: userId,
            password_hash: passwordHash
          }]
        });
      }

      return Promise.resolve({ rows: [] });
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/password/change",
        cookies: {
          cruush_session: "test-session-token"
        },
        payload: {
          currentPassword: "wrong-password",
          newPassword: "new-password-123"
        }
      });

      expect(response.statusCode).toBe(401);
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/password/change",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        currentPassword: "wrong-password",
        newPassword: "new-password-123"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many password change attempts. Try again later.",
        details: expect.any(Object)
      }
    });
  });

  it("rate limits repeated password reset token attempts", async () => {
    query.mockResolvedValue({ rows: [] });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/password/reset",
        payload: {
          token: "invalid-reset-token-1234567890",
          password: "new-password-123"
        }
      });

      expect(response.statusCode).toBe(400);
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/password/reset",
      payload: {
        token: "invalid-reset-token-1234567890",
        password: "new-password-123"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many password reset attempts. Try again later.",
        details: expect.any(Object)
      }
    });
    expect(query).toHaveBeenCalledTimes(5);
  });

  it("returns the current session from GET /api/auth/me", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          app_display_name: "River",
          email_verified_at: null,
          created_at: "2026-04-28T12:00:00.000Z",
          profile_display_name: "River",
          year_of_birth: 1998,
          signup_birth_year: 1998,
          age_verified_at: "2026-04-28T12:00:00.000Z",
          code_of_conduct_accepted_version: null,
          code_of_conduct_accepted_at: null
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(response.json()).toEqual({
      data: {
        user: {
          id: userId,
          email: "river@example.com",
          displayName: "River",
          emailVerifiedAt: null,
          createdAt: "2026-04-28T12:00:00.000Z",
          accountStatus: "active"
        },
        profile: {
          displayName: "River",
          yearOfBirth: 1998
        },
        needsOnboarding: false,
        needsAgeVerification: false,
        needsCodeOfConduct: true,
        codeOfConductVersion: "2026-07-07",
        acceptedCodeOfConductVersion: null,
        codeOfConductAcceptedAt: null
      }
    });
  });

  it("requires verified age before a legacy session can use account APIs", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        user_id: userId,
        email: "river@example.com",
        account_status: "active",
        age_verified_at: null
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      cookies: {
        cruush_session: "legacy-session-token"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "AGE_VERIFICATION_REQUIRED",
        message: "Confirm your date of birth to continue.",
        details: null
      }
    });
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
  });

  it("records adult age verification for a legacy session", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          email: "river@example.com",
          account_status: "active"
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: userId }] })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          app_display_name: "River",
          email_verified_at: "2026-04-28T12:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          profile_display_name: "River",
          year_of_birth: 1998,
          signup_birth_year: 1998,
          age_verified_at: "2026-08-13T12:00:00.000Z",
          code_of_conduct_accepted_version: "2026-07-07",
          code_of_conduct_accepted_at: "2026-08-13T12:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/age-verification",
      cookies: {
        cruush_session: "legacy-session-token"
      },
      payload: {
        dateOfBirth: "1998-06-15"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("set signup_birth_year = $2");
    expect(query.mock.calls[1]?.[1]).toEqual([userId, 1998]);
    expect(response.json().data.needsAgeVerification).toBe(false);
  });

  it("deletes the current user's account and queues media cleanup", async () => {
    const sessionToken = "test-session-token";
    const passwordHash = await hashPassword("current-password");

    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          account_status: "active"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          password_hash: passwordHash
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: userId }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      cookies: {
        cruush_session: sessionToken
      },
      payload: {
        password: "current-password",
        confirmation: "DELETE"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(query.mock.calls[0]?.[1]).toEqual([hashSessionToken(sessionToken)]);
    expect(query.mock.calls[2]?.[0]).toBe("begin");
    expect(query.mock.calls[3]?.[0]).toContain("insert into account_deletion_media_cleanup");
    expect(query.mock.calls[3]?.[0]).toContain("media_variants");
    expect(query.mock.calls[4]?.[0]).toContain("delete from app_sessions");
    expect(query.mock.calls[5]?.[0]).toContain("delete from app_users");
    expect(query.mock.calls[6]?.[0]).toBe("commit");
    expect(response.headers["set-cookie"]).toContain("cruush_session=");
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");
  });

  it("requires authentication before deleting an account", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      payload: {
        password: "current-password",
        confirmation: "DELETE"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("lets a banned account delete itself when an owned media object cannot be cleaned up", async () => {
    const passwordHash = await hashPassword("current-password");
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          account_status: "banned"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          password_hash: passwordHash
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: userId }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        password: "current-password",
        confirmation: "DELETE"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(query.mock.calls[3]?.[0]).toContain("insert into account_deletion_media_cleanup");
    expect(query.mock.calls[5]?.[0]).toContain("delete from app_users");
  });

  it("completes the account deletion flow for a suspended account", async () => {
    const passwordHash = await hashPassword("current-password");
    let deleted = false;

    query.mockImplementation(async (sql: string) => {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();

      if (normalizedSql.includes("from app_sessions s")) {
        return {
          rows: deleted
            ? []
            : [{ user_id: userId, email: "suspended@example.com", account_status: "suspended" }]
        };
      }

      if (normalizedSql.startsWith("select id, password_hash")) {
        return {
          rows: deleted ? [] : [{ id: userId, password_hash: passwordHash }]
        };
      }

      if (normalizedSql.startsWith("delete from app_users")) {
        deleted = true;
        return { rows: [{ id: userId }] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        password: "current-password",
        confirmation: "DELETE"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(deleted).toBe(true);

    const sessionAfterDeletion = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(sessionAfterDeletion.statusCode).toBe(401);
  });

  it("requires the exact account deletion confirmation", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        user_id: userId,
        account_status: "active"
      }]
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        password: "current-password",
        confirmation: "delete"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed"
      }
    });
  });

  it("rejects account deletion when the password is wrong", async () => {
    const passwordHash = await hashPassword("current-password");
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          account_status: "active"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          password_hash: passwordHash
        }]
      });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        password: "wrong-password",
        confirmation: "DELETE"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Password is incorrect.",
        details: null
      }
    });
    expect(query.mock.calls.map((call) => String(call[0])).join("\n")).not.toContain("delete from app_users");
  });

  it("rolls back the account deletion transaction when the user row is missing", async () => {
    const passwordHash = await hashPassword("current-password");
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          account_status: "active"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          password_hash: passwordHash
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        password: "current-password",
        confirmation: "DELETE"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(query.mock.calls[2]?.[0]).toBe("begin");
    expect(query.mock.calls[3]?.[0]).toContain("insert into account_deletion_media_cleanup");
    expect(query.mock.calls[4]?.[0]).toContain("delete from app_sessions");
    expect(query.mock.calls[5]?.[0]).toContain("delete from app_users");
    expect(query.mock.calls[6]?.[0]).toBe("rollback");
  });

  it("revokes the current session when the account is deleted", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          account_status: "deleted"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(query.mock.calls[1]?.[0]).toContain("delete from app_sessions");
    expect(query.mock.calls[1]?.[1]).toEqual([hashSessionToken("test-session-token")]);
  });

  it("blocks under-review cookie-backed sessions from unsafe account actions without revoking the session", async () => {
    const postId = "59e01d61-4a76-4359-915a-1f25b7815ff4";
    query.mockResolvedValueOnce({
      rows: [{
        user_id: userId,
        account_status: "under_review",
        age_verified_at: "2026-04-28T12:00:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/posts/${postId}`,
      cookies: {
        cruush_session: "under-review-session-token"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(response.json()).toEqual({
      error: {
        code: "ACCOUNT_UNDER_REVIEW",
        message: "This account is under review. Unsafe actions are unavailable.",
        details: null
      }
    });
  });

  it("allows active cookie-backed sessions to perform unsafe account actions", async () => {
    const postId = "59e01d61-4a76-4359-915a-1f25b7815ff4";
    query
      .mockResolvedValueOnce({
      rows: [{
        user_id: userId,
        account_status: "active",
        age_verified_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          id: postId
        }]
      });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/posts/${postId}`,
      cookies: {
        cruush_session: "active-session-token"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(query.mock.calls[0]?.[1]).toEqual([hashSessionToken("active-session-token")]);
    expect(query.mock.calls[2]?.[0]).toContain("delete from posts");
  });

  it("revokes suspended cookie-backed sessions on routes using the shared auth helper", async () => {
    query
      .mockResolvedValueOnce({
      rows: [{
        user_id: userId,
        account_status: "suspended",
        age_verified_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/posts",
      cookies: {
        cruush_session: "suspended-session-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(query.mock.calls[1]?.[0]).toContain("delete from app_sessions");
    expect(query.mock.calls[1]?.[1]).toEqual([hashSessionToken("suspended-session-token")]);
  });

  it("revokes deleted cookie-backed sessions on routes using the shared auth helper", async () => {
    query
      .mockResolvedValueOnce({
      rows: [{
        user_id: userId,
        account_status: "deleted",
        age_verified_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/posts",
      cookies: {
        cruush_session: "deleted-session-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(query.mock.calls[1]?.[0]).toContain("delete from app_sessions");
    expect(query.mock.calls[1]?.[1]).toEqual([hashSessionToken("deleted-session-token")]);
  });

  it("blocks a user through POST /api/blocks", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    query
      .mockResolvedValueOnce({ rows: [{ id: targetUserId }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/blocks",
      headers: {
        "x-user-id": userId
      },
      payload: {
        userId: targetUserId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from app_users");
    expect(query.mock.calls[1]?.[0]).toContain("insert into user_blocks");
    expect(query.mock.calls[1]?.[0]).toContain("on conflict");
    expect(query.mock.calls[1]?.[1]).toEqual([userId, targetUserId]);
    expect(response.json()).toEqual({
      data: {
        userId: targetUserId,
        blocked: true
      }
    });
  });

  it("treats repeated block requests as idempotent", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    query
      .mockResolvedValueOnce({ rows: [{ id: targetUserId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: targetUserId }] })
      .mockResolvedValueOnce({ rows: [] });

    const firstResponse = await app.inject({
      method: "POST",
      url: "/api/blocks",
      headers: {
        "x-user-id": userId
      },
      payload: {
        userId: targetUserId
      }
    });
    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/blocks",
      headers: {
        "x-user-id": userId
      },
      payload: {
        userId: targetUserId
      }
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("on conflict");
    expect(query.mock.calls[3]?.[0]).toContain("on conflict");
  });

  it("unblocks a user through DELETE /api/blocks/:userId idempotently", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/blocks/${targetUserId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(204);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("delete from user_blocks");
    expect(query.mock.calls[0]?.[1]).toEqual([userId, targetUserId]);
  });

  it("rejects self-block attempts before querying", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/blocks",
      headers: {
        "x-user-id": userId
      },
      payload: {
        userId
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "You cannot block yourself.",
        details: null
      }
    });
  });

  it("rejects block attempts for nonexistent or deleted users", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/blocks",
      headers: {
        "x-user-id": userId
      },
      payload: {
        userId: targetUserId
      }
    });

    expect(response.statusCode).toBe(404);
    expect(query.mock.calls[0]?.[0]).toContain("coalesce(account_status, 'active') <> 'deleted'");
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "User not found.",
        details: null
      }
    });
  });

  it("lists blocked users without private fields", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    query.mockResolvedValueOnce({
      rows: [{
        id: targetUserId,
        display_name: "Alex",
        photo: "https://example.com/alex.jpg",
        created_at: "2026-04-28T12:00:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/blocks",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from user_blocks block");
    expect(query.mock.calls[0]?.[0]).not.toContain("email");
    expect(response.json()).toEqual({
      data: {
        blockedUsers: [{
          userId: targetUserId,
          displayName: "Alex",
          photo: "https://example.com/alex.jpg",
          photoExplicit: false,
          createdAt: "2026-04-28T12:00:00.000Z"
        }]
      }
    });
    expect(JSON.stringify(response.json())).not.toContain("account_status");
  });

  it("blocks under-review cookie-backed sessions from block mutations", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          account_status: "under_review"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          account_status: "under_review"
        }]
      });

    const blockResponse = await app.inject({
      method: "POST",
      url: "/api/blocks",
      cookies: {
        cruush_session: "under-review-block-session"
      },
      payload: {
        userId: targetUserId
      }
    });
    const unblockResponse = await app.inject({
      method: "DELETE",
      url: `/api/blocks/${targetUserId}`,
      cookies: {
        cruush_session: "under-review-unblock-session"
      }
    });

    expect(blockResponse.statusCode).toBe(403);
    expect(unblockResponse.statusCode).toBe(403);
    expect(query.mock.calls.every(([sql]) => !String(sql).includes("insert into user_blocks"))).toBe(true);
    expect(query.mock.calls.every(([sql]) => !String(sql).includes("delete from user_blocks"))).toBe(true);
  });

  it("marks the current session as having accepted the current code of conduct", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          app_display_name: "River",
          email_verified_at: "2026-04-28T12:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          profile_display_name: "River",
          year_of_birth: 1998,
          code_of_conduct_accepted_version: "2026-07-07",
          code_of_conduct_accepted_at: "2026-07-07T15:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      needsOnboarding: false,
      needsCodeOfConduct: false,
      codeOfConductVersion: "2026-07-07",
      acceptedCodeOfConductVersion: "2026-07-07",
      codeOfConductAcceptedAt: "2026-07-07T15:00:00.000Z"
    });
  });

  it("requires authentication before accepting the code of conduct", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/code-of-conduct/accept",
      payload: {
        version: "2026-07-07"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects stale code of conduct acceptance versions", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        user_id: userId
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/code-of-conduct/accept",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        version: "2026-01-01"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Code of conduct version is out of date.",
        details: null
      }
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("stores code of conduct acceptance and returns a refreshed session", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          app_display_name: "River",
          email_verified_at: "2026-04-28T12:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          profile_display_name: "River",
          year_of_birth: 1998,
          code_of_conduct_accepted_version: "2026-07-07",
          code_of_conduct_accepted_at: "2026-07-07T15:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/code-of-conduct/accept",
      cookies: {
        cruush_session: "test-session-token"
      },
      payload: {
        version: "2026-07-07"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("update app_users");
    expect(query.mock.calls[1]?.[0]).toContain("code_of_conduct_accepted_version");
    expect(query.mock.calls[1]?.[1]).toEqual(["2026-07-07", userId]);
    expect(response.json().data).toMatchObject({
      needsCodeOfConduct: false,
      codeOfConductVersion: "2026-07-07",
      acceptedCodeOfConductVersion: "2026-07-07",
      codeOfConductAcceptedAt: "2026-07-07T15:00:00.000Z"
    });
  });

  it("creates a verification token on POST /api/auth/verification/send", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          display_name: "River",
          email_verified_at: null
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          expires_at: "2026-04-30T12:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/verification/send",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(query.mock.calls[2]?.[0]).toContain("delete from email_verification_tokens");
    expect(query.mock.calls[3]?.[0]).toContain("insert into email_verification_tokens");
    expect(response.json()).toEqual({
      data: {
        alreadyVerified: false,
        expiresAt: "2026-04-30T12:00:00.000Z",
        previewUrl: expect.stringContaining("https://cruush.test/?verifyEmailToken=")
      }
    });
  });

  it("resends verification email from POST /api/auth/verification/resend for unverified credentials", async () => {
    const passwordHash = await hashPassword("password-123");
    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          password_hash: passwordHash,
          display_name: "River",
          email_verified_at: null,
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          expires_at: "2026-04-30T12:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/verification/resend",
      payload: {
        email: "river@example.com",
        password: "password-123"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(query.mock.calls[0]?.[0]).toContain("from app_users");
    expect(query.mock.calls[1]?.[0]).toContain("delete from email_verification_tokens");
    expect(query.mock.calls[2]?.[0]).toContain("insert into email_verification_tokens");
    expect(response.json()).toEqual({
      data: {
        alreadyVerified: false,
        expiresAt: "2026-04-30T12:00:00.000Z",
        previewUrl: expect.stringContaining("https://cruush.test/?verifyEmailToken=")
      }
    });
  });

  it("verifies an email token on POST /api/auth/verification/verify", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          display_name: "River",
          email_verified_at: "2026-04-29T12:05:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "river@example.com",
          app_display_name: "River",
          email_verified_at: "2026-04-29T12:05:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          profile_display_name: "River",
          year_of_birth: 1998
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/verification/verify",
      payload: {
        token: "verification-token-1234567890"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from email_verification_tokens");
    expect(query.mock.calls[1]?.[0]).toContain("update app_users");
    expect(query.mock.calls[2]?.[0]).toContain("delete from email_verification_tokens");
    expect(response.json()).toEqual({
      data: {
        verified: true,
        email: "river@example.com"
      }
    });
  });

  it("rate limits repeated email verification token attempts", async () => {
    query.mockResolvedValue({ rows: [] });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verification/verify",
        payload: {
          token: "invalid-verification-token"
        }
      });

      expect(response.statusCode).toBe(400);
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/verification/verify",
      payload: {
        token: "invalid-verification-token"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many verification attempts. Try again later.",
        details: expect.any(Object)
      }
    });
  });

  it("does not spend the verification rate limit on successful verifications", async () => {
    // Every request reports the same address behind the proxy, so charging the
    // limiter for successes locked out everyone once a handful of people had
    // verified inside the window.
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("from email_verification_tokens")) {
        return { rows: [{ user_id: userId }] };
      }

      if (sql.includes("update app_users")) {
        return {
          rows: [{
            id: userId,
            email: "river@example.com",
            display_name: "River",
            email_verified_at: "2026-04-29T12:05:00.000Z",
            created_at: "2026-04-28T12:00:00.000Z"
          }]
        };
      }

      return { rows: [] };
    });

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verification/verify",
        payload: {
          token: `valid-verification-token-${attempt}`
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.verified).toBe(true);
    }
  });

  it("returns conversations from GET /api/conversations", async () => {
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-conversation-list",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: dmPartnerId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-conversation-list",
      userOneId: userId,
      userTwoId: dmPartnerId
    });

    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: ["Hosting", "Now"],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "hosting for another hour",
          unread_count: 2,
          pinned: true,
          muted: false,
          other_user_id: dmPartnerId,
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: "https://example.com/alex.jpg",
          member_count: 2
        }]
      })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/conversations",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from conversation_members cm");
    expect(response.json()).toEqual({
      data: [{
        id: conversationId,
        kind: "dm",
        user: {
          id: dmPartnerId,
          name: "Alex",
          pronouns: "they/them",
          photo: "https://example.com/alex.jpg",
          photoExplicit: false,
          travelling: false
        },
        distance: "Nearby",
        updatedAt: "2026-04-29T12:00:00.000Z",
        lastMessage: "hosting for another hour",
        unreadCount: 2,
        pinned: true,
        muted: false,
        mutual: true,
        canMessage: true,
        tags: ["Hosting", "Now"]
      }]
    });
  });

  it("keeps legacy non-mutual dm conversations readable but disables replies", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: conversationId,
        kind: "dm",
        title: null,
        tags: [],
        updated_at: "2026-04-29T12:00:00.000Z",
        last_message: "legacy chat",
        unread_count: 0,
        pinned: false,
        muted: false,
        other_user_id: dmPartnerId,
        other_user_name: "Alex",
        other_user_pronouns: ["they/them"],
        other_user_photo: null,
        member_count: 2
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/conversations",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [{
        id: conversationId,
        kind: "dm",
        user: {
          id: dmPartnerId,
          name: "Alex",
          pronouns: "they/them",
          photo: null,
          photoExplicit: false,
          travelling: false
        },
        distance: "Nearby",
        updatedAt: "2026-04-29T12:00:00.000Z",
        lastMessage: "legacy chat",
        unreadCount: 0,
        pinned: false,
        muted: false,
        mutual: false,
        canMessage: false,
        tags: []
      }]
    });
  });

  it("falls back to plaintext message previews when encrypted message metadata is unreadable", async () => {
    const invalidNonce = Buffer.alloc(12).toString("base64");
    const invalidAuthTag = Buffer.alloc(16).toString("base64");
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-conversation-preview",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: dmPartnerId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-conversation-preview",
      userOneId: userId,
      userTwoId: dmPartnerId
    });

    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "legacy preview",
          last_message_ciphertext: Buffer.from("bad-preview").toString("base64"),
          last_message_nonce: invalidNonce,
          last_message_auth_tag: invalidAuthTag,
          last_message_key_version: "v1",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: dmPartnerId,
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: null,
          member_count: 2
        }]
      })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/conversations",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].lastMessage).toBe("legacy preview");
  });

  it("opens or creates a dm conversation on POST /api/conversations/dm", async () => {
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-1",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-1",
      userOneId: userId,
      userTwoId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
    });

    query
      .mockResolvedValueOnce({
        rows: [matchRecord]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: "https://example.com/alex.jpg",
          member_count: 2
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/conversations/dm",
      headers: {
        "x-user-id": userId
      },
      payload: {
        otherUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[3]?.[0]).toContain("encrypted_relationship_tokens");
    expect(query.mock.calls[6]?.[0]).toContain("insert into conversations");
    expect(query.mock.calls[7]?.[0]).toContain("insert into conversation_members");
    expect(response.json()).toEqual({
      data: {
        id: conversationId,
        kind: "dm",
        user: {
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          name: "Alex",
          pronouns: "they/them",
          photo: "https://example.com/alex.jpg",
          photoExplicit: false,
          travelling: false
        },
        distance: "Nearby",
        updatedAt: "2026-04-29T12:00:00.000Z",
        lastMessage: "",
        unreadCount: 0,
        pinned: false,
        muted: false,
        mutual: true,
        canMessage: true,
        tags: []
      }
    });
  });

  it("creates a group conversation with the creator as owner", async () => {
    const memberId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-group-1",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: memberId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-group-1",
      userOneId: userId,
      userTwoId: memberId
    });

    query.mockResolvedValueOnce({ rows: [{ email: "user@example.com" }] });
    query.mockResolvedValueOnce({
      rows: [matchRecord]
    })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
      rows: [{
        id: conversationId,
        kind: "group",
        title: "Beta crew",
        tags: [],
        updated_at: "2026-04-29T12:00:00.000Z",
        last_message: "",
        unread_count: 0,
        pinned: false,
        muted: false,
        other_user_id: null,
        other_user_name: null,
        other_user_pronouns: null,
        other_user_photo: null,
        member_count: 2,
        current_user_role: "owner",
        disappearing_timer: "24h",
        closed_at: null
      }]
    })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/conversations/groups",
      headers: {
        "x-user-id": userId
      },
      payload: {
        title: "Beta crew",
        memberIds: [
          memberId
        ],
        disappearingTimer: "24h"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[1]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[4]?.[0]).toContain("encrypted_relationship_tokens");
    expect(query.mock.calls[6]?.[0]).toContain("insert into conversations");
    expect(query.mock.calls[6]?.[0]).toContain("insert into conversation_members");
    expect(query.mock.calls[6]?.[0]).toContain("'owner'");
    expect(query.mock.calls[7]?.[0]).toContain("insert into app_notifications");
    expect(query.mock.calls[7]?.[1]).toEqual([
      memberId,
      "group_membership",
      "You were added to Beta crew",
      "Open cruush to see the group.",
      `/chat/group/${conversationId}`,
      userId,
      conversationId,
      `group:created:${conversationId}:${memberId}`,
      { conversationKind: "group" }
    ]);
    expect(response.json().data).toMatchObject({
      id: conversationId,
      kind: "group",
      currentUserRole: "owner",
      disappearingTimer: "24h",
      closed: false,
      membersLabel: "2 people"
    });
  });

  it("rejects non-mutual users before creating a group conversation", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/conversations/groups",
      headers: {
        "x-user-id": userId
      },
      payload: {
        title: "Beta crew",
        memberIds: ["53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"],
        disappearingTimer: "24h"
      }
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "MUTUAL_CRUUSH_REQUIRED",
        message: "Groups can only include mutual cruushes.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into conversations"))).toBe(false);
  });

  it("lets group admins update title and disappearing timer", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          role: "admin",
          closed_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: conversationId }] })
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "group",
          title: "Updated crew",
          tags: [],
          updated_at: "2026-04-29T12:05:00.000Z",
          last_message: "",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: null,
          other_user_name: null,
          other_user_pronouns: null,
          other_user_photo: null,
          member_count: 3,
          current_user_role: "admin",
          disappearing_timer: "7d",
          closed_at: null
        }]
      });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/groups/${conversationId}`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        title: "Updated crew",
        disappearingTimer: "7d"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("update conversations");
    expect(response.json().data).toMatchObject({
      id: conversationId,
      kind: "group",
      currentUserRole: "admin",
      disappearingTimer: "7d"
    });
  });

  it("lets a dm participant change the disappearing timer to 1h", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: null,
          member_count: 2,
          disappearing_timer: "off",
          closed_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: conversationId }] })
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:05:00.000Z",
          last_message: "",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: null,
          member_count: 2,
          disappearing_timer: "1h",
          closed_at: null
        }]
      });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/disappearing-timer`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        disappearingTimer: "1h"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("disappearing_timer");
    expect(response.json().data).toMatchObject({
      id: conversationId,
      kind: "dm",
      disappearingTimer: "1h"
    });
  });

  it("does not let group members change the disappearing timer", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: conversationId,
        kind: "group",
        title: "Beta crew",
        tags: [],
        updated_at: "2026-04-29T12:00:00.000Z",
        last_message: "",
        unread_count: 0,
        pinned: false,
        muted: false,
        other_user_id: null,
        other_user_name: null,
        other_user_pronouns: null,
        other_user_photo: null,
        member_count: 3,
        current_user_role: "member",
        disappearing_timer: "24h",
        closed_at: null
      }]
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/disappearing-timer`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        disappearingTimer: "1h"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Only group admins can manage this group.",
        details: null
      }
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("clears a dm conversation for everyone without hard-deleting messages", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "old message",
          unread_count: 1,
          pinned: false,
          muted: false,
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: null,
          member_count: 2,
          disappearing_timer: "24h",
          closed_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: conversationId }] })
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:05:00.000Z",
          last_message: "",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: null,
          member_count: 2,
          disappearing_timer: "24h",
          closed_at: null,
          cleared_at: "2026-04-29T12:05:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/clear-for-everyone`,
      headers: {
        "x-user-id": userId
      }
    });
    const updateSql = String(query.mock.calls[1]?.[0] ?? "");

    expect(response.statusCode).toBe(200);
    expect(updateSql).toContain("cleared_at");
    expect(updateSql).not.toContain("delete from messages");
    expect(response.json().data).toMatchObject({
      id: conversationId,
      lastMessage: ""
    });
  });

  it("deletes a dm conversation for everyone by hard-deleting the conversation", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "old message",
          unread_count: 1,
          pinned: false,
          muted: false,
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: null,
          member_count: 2,
          disappearing_timer: "24h",
          closed_at: null
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId
        }]
      });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/conversations/${conversationId}`,
      headers: {
        "x-user-id": userId
      }
    });
    const deleteSql = String(query.mock.calls[1]?.[0] ?? "");

    expect(response.statusCode).toBe(204);
    expect(deleteSql).toContain("delete from conversations");
    expect(deleteSql).toContain("returning id::text as id");
    expect(query.mock.calls[1]?.[1]).toEqual([conversationId]);
  });

  it("does not let group members delete a group conversation for everyone", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: conversationId,
        kind: "group",
        title: "Beta crew",
        tags: [],
        updated_at: "2026-04-29T12:00:00.000Z",
        last_message: "",
        unread_count: 0,
        pinned: false,
        muted: false,
        other_user_id: null,
        other_user_name: null,
        other_user_pronouns: null,
        other_user_photo: null,
        member_count: 3,
        current_user_role: "member",
        disappearing_timer: "24h",
        closed_at: null
      }]
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/conversations/${conversationId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Only group admins can manage this group.",
        details: null
      }
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("lets group admins add members", async () => {
    const memberId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-add-member-1",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: memberId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-add-member-1",
      userOneId: userId,
      userTwoId: memberId
    });

    query
      .mockResolvedValueOnce({
        rows: [{
          role: "admin",
          closed_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: memberId }] })
      .mockResolvedValueOnce({
        rows: [appNotificationRow({
          user_id: memberId,
          type: "group_membership",
          title: "You were added to Group chat",
          link_url: `/chat/group/${conversationId}`,
          actor_user_id: userId,
          conversation_id: conversationId
        })]
      });

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/groups/${conversationId}/members`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        userId: memberId
      }
    });

    expect(response.statusCode).toBe(204);
    expect(query.mock.calls[1]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[4]?.[0]).toContain("encrypted_relationship_tokens");
    expect(query.mock.calls[6]?.[0]).toContain("insert into conversation_members");
    expect(query.mock.calls[6]?.[0]).toContain("'member'");
    expect(query.mock.calls[7]?.[0]).toContain("insert into app_notifications");
    expect(query.mock.calls[7]?.[1]).toEqual([
      memberId,
      "group_membership",
      "You were added to Group chat",
      "Open cruush to see the group.",
      `/chat/group/${conversationId}`,
      userId,
      conversationId,
      `group:member:${conversationId}:${memberId}:${memberId}`,
      { conversationKind: "group" }
    ]);
  });

  it("rejects non-mutual users before adding them to a group", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          role: "admin",
          closed_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/groups/${conversationId}/members`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        userId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
      }
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "MUTUAL_CRUUSH_REQUIRED",
        message: "Groups can only include mutual cruushes.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into conversation_members"))).toBe(false);
  });

  it("lets group admins promote members", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          role: "owner",
          closed_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97" }] });

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/groups/${conversationId}/admins`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        userId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(query.mock.calls[1]?.[0]).toContain("update conversation_members");
    expect(query.mock.calls[1]?.[0]).toContain("role = 'admin'");
  });

  it("allows a direct conversation before a mutual cruush when the recipient selected Public", async () => {
    const publicTargetPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: dmPartnerId,
      baseMode: "PUBLIC_PRECISE"
    });

    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql);

      if (text.includes("from encrypted_relationship_records")) {
        return { rows: [] };
      }

      if (text.includes("from encrypted_visibility_tokens")) {
        return { rows: params[0] === dmPartnerId ? [publicTargetPolicy] : [] };
      }

      if (text.includes("from user_blocks")) {
        return { rows: [] };
      }

      if (text.includes("from user_cruush_match_settings")) {
        return {
          rows: [{
            message_visibility: "public",
            nsfw_message_visibility: "public",
            nsfw_send_visibility: "public",
            updated_at: "2026-08-09T08:00:00.000Z"
          }]
        };
      }

      if (text.includes("from app_users")) {
        return { rows: [{ id: dmPartnerId }] };
      }

      if (text.includes("insert into conversations")) {
        return { rows: [{ id: conversationId }] };
      }

      if (text.includes("insert into conversation_members")) {
        return { rows: [] };
      }

      if (text.includes("from conversation_members cm")) {
        return {
          rows: [{
            id: conversationId,
            kind: "dm",
            title: null,
            tags: [],
            updated_at: "2026-04-29T12:00:00.000Z",
            last_message: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            other_user_id: dmPartnerId,
            other_user_name: "Alex",
            other_user_pronouns: ["they/them"],
            other_user_photo: null,
            other_user_photo_explicit: true,
            member_count: 2
          }]
        };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/conversations/dm",
      headers: {
        "x-user-id": userId
      },
      payload: {
        otherUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({
      id: conversationId,
      kind: "dm",
      mutual: false,
      user: {
        id: dmPartnerId,
        name: "Alex"
      }
    });
  });

  it("blocks dm conversation creation when either user blocked the other", async () => {
    const otherUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-blocked-dm",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: otherUserId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-blocked-dm",
      userOneId: userId,
      userTwoId: otherUserId
    });

    query
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [{ exists: true }] });

    const response = await app.inject({
      method: "POST",
      url: "/api/conversations/dm",
      headers: {
        "x-user-id": userId
      },
      payload: {
        otherUserId
      }
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(403);
    expect(query.mock.calls[4]?.[0]).toContain("from user_blocks");
    expect(query.mock.calls[4]?.[1]).toEqual([userId, otherUserId]);
    expect(queries.some((sql) => sql.includes("insert into conversations"))).toBe(false);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "This user is not accepting messages from you right now.",
        details: null
      }
    });
  });

  it("returns a conversation and its messages from GET /api/messages/:conversationId", async () => {
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-message-load",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: dmPartnerId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-message-load",
      userOneId: userId,
      userTwoId: dmPartnerId
    });

    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: ["Hosting"],
          updated_at: "2026-04-29T12:00:00.000Z",
          pinned: false,
          muted: false,
          other_user_id: dmPartnerId,
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: "https://example.com/alex.jpg",
          member_count: 2
        }]
      })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-1",
          user_id: dmPartnerId,
          sender_name: "Alex",
          sender_pronouns: ["they/them"],
          sender_photo: "https://example.com/alex.jpg",
          content: "you around now?",
          created_at: "2026-04-29T12:05:00.000Z"
        }, {
          id: "msg-2",
          user_id: userId,
          sender_name: "Jordan",
          sender_pronouns: ["he/him"],
          sender_photo: "https://example.com/jordan.jpg",
          content: "yeah nearby",
          created_at: "2026-04-29T12:06:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: `/api/messages/${conversationId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("join conversations c");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("from messages m"))).toBe(true);
    expect(query.mock.calls.some(([sql, params]) =>
      String(sql).includes("update conversation_members")
      && String(sql).includes("last_read_at = now()")
      && JSON.stringify(params) === JSON.stringify([conversationId, userId])
    )).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("sender_profile.photos[1] as sender_photo"))).toBe(true);
    expect(response.json()).toEqual({
      data: {
        conversation: {
          id: conversationId,
          kind: "dm",
          user: {
            id: dmPartnerId,
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg",
            photoExplicit: false,
            travelling: false
          },
          distance: "Nearby",
          updatedAt: "2026-04-29T12:00:00.000Z",
          lastMessage: "",
          unreadCount: 0,
          pinned: false,
          muted: false,
          mutual: true,
          canMessage: true,
          tags: ["Hosting"]
        },
        messages: [{
          id: "msg-1",
          userId: dmPartnerId,
          content: "you around now?",
          timestamp: "2026-04-29T12:05:00.000Z",
          user: {
            id: dmPartnerId,
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg",
            photoExplicit: false
          }
        }, {
          id: "msg-2",
          userId: userId,
          content: "yeah nearby",
          timestamp: "2026-04-29T12:06:00.000Z",
          user: {
            id: userId,
            name: "Jordan",
            pronouns: "he/him",
            photo: "https://example.com/jordan.jpg",
            photoExplicit: false
          }
        }]
      }
    });
  });

  it("returns sender profile metadata for group messages", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "group",
          title: "Beta crew",
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "",
          last_message_ciphertext: null,
          last_message_nonce: null,
          last_message_auth_tag: null,
          last_message_key_version: null,
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: null,
          other_user_name: null,
          other_user_pronouns: null,
          other_user_photo: null,
          member_count: 3,
          current_user_role: "member",
          disappearing_timer: "24h",
          closed_at: null
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-1",
          user_id: dmPartnerId,
          sender_name: "cas",
          sender_pronouns: ["he/him"],
          sender_photo: "https://example.com/cas.jpg",
          content: "pull up",
          created_at: "2026-04-29T12:05:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: `/api/messages/${conversationId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("sender_profile.photos[1] as sender_photo"))).toBe(true);
    expect(response.json().data.messages).toEqual([{
      id: "msg-1",
      userId: dmPartnerId,
      content: "pull up",
      timestamp: "2026-04-29T12:05:00.000Z",
      user: {
        id: dmPartnerId,
        name: "cas",
        pronouns: "he/him",
        photo: "https://example.com/cas.jpg",
        photoExplicit: false
      }
    }]);
  });

  it("falls back to plaintext message content when encrypted message metadata is unreadable", async () => {
    const invalidNonce = Buffer.alloc(12).toString("base64");
    const invalidAuthTag = Buffer.alloc(16).toString("base64");
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-message-fallback",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: dmPartnerId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-message-fallback",
      userOneId: userId,
      userTwoId: dmPartnerId
    });

    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          pinned: false,
          muted: false,
          other_user_id: dmPartnerId,
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: null,
          member_count: 2
        }]
      })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-legacy",
          user_id: dmPartnerId,
          content: "legacy body",
          content_ciphertext: Buffer.from("bad-body").toString("base64"),
          content_nonce: invalidNonce,
          content_auth_tag: invalidAuthTag,
          content_key_version: "v1",
          created_at: "2026-04-29T12:05:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: `/api/messages/${conversationId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.messages[0].content).toBe("legacy body");
  });

  it("hides legacy non-mutual dm conversations from GET /api/messages/:conversationId", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: conversationId,
        kind: "dm",
        title: null,
        tags: [],
        updated_at: "2026-04-29T12:00:00.000Z",
        pinned: false,
        muted: false,
        other_user_id: dmPartnerId,
        other_user_name: "Alex",
        other_user_pronouns: ["they/them"],
        other_user_photo: null,
        member_count: 2
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/messages/${conversationId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.messages).toEqual([]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("where m.conversation_id::text = $1"))).toBe(true);
  });

  it("rejects invalid conversation ids before querying messages", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/messages/not-a-uuid",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("creates a message on POST /api/messages", async () => {
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-1",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-1",
      userOneId: userId,
      userTwoId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
    });

    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: "https://example.com/alex.jpg",
          member_count: 2
        }]
      })
      .mockResolvedValueOnce({
        rows: [matchRecord]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: "user@example.com" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-3",
          user_id: userId,
          content: "on my way",
          created_at: "2026-04-29T12:10:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          muted: false,
          sender_name: "Jordan",
          conversation_title: null
        }]
      })
      .mockResolvedValueOnce({
        rows: [appNotificationRow({
          user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          title: "Jordan sent you a message",
          link_url: `/chat/${conversationId}`,
          actor_user_id: userId,
          conversation_id: conversationId,
          metadata: { conversationKind: "dm" }
        })]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      headers: {
        "x-user-id": userId
      },
      payload: {
        conversationId,
        content: "on my way"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("from conversation_members cm");
    expect(query.mock.calls[1]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[4]?.[0]).toContain("encrypted_relationship_tokens");
    expect(query.mock.calls[7]?.[0]).toContain("insert into messages");
    expect(query.mock.calls[7]?.[0]).toContain("lower(trim(coalesce(u.email, ''))) = 'julienlenazny@gmail.com'");
    expect(query.mock.calls[7]?.[0]).toContain("content_ciphertext");
    expect(query.mock.calls[7]?.[1]).not.toContain("on my way");
    expect(query.mock.calls[7]?.[1]).toContain("keyword_prefilter");
    expect(query.mock.calls[8]?.[0]).toContain("from conversation_members cm");
    expect(query.mock.calls[9]?.[0]).toContain("insert into app_notifications");
    expect(query.mock.calls[9]?.[1]).toEqual([
      "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      "direct_message",
      "Jordan sent you a message",
      "Open cruush to reply.",
      `/chat/${conversationId}`,
      userId,
      conversationId,
      `message:msg-3:53fd68d7-24fc-4cff-8cd7-a97ec0cadf97`,
      { conversationKind: "dm" }
    ]);
    expect(response.json()).toEqual({
      data: {
        id: "msg-3",
        userId: userId,
        content: "on my way",
        timestamp: "2026-04-29T12:10:00.000Z"
      }
    });
  });

  it("creates a dm message when a participant privacy policy cannot be decrypted", async () => {
    const otherUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-privacy-unreadable",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: otherUserId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-privacy-unreadable",
      userOneId: userId,
      userTwoId: otherUserId
    });
    const privacyDecryptError = new Error("Unsupported state or unable to authenticate data");

    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "dm",
          title: null,
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: otherUserId,
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: "https://example.com/alex.jpg",
          member_count: 2
        }]
      })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockRejectedValueOnce(privacyDecryptError)
      .mockRejectedValueOnce(privacyDecryptError)
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: "member@example.com" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-privacy-unreadable",
          user_id: userId,
          content: "still sending",
          created_at: "2026-04-29T12:10:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: otherUserId,
          muted: false,
          sender_name: "Jordan",
          conversation_title: null
        }]
      })
      .mockResolvedValueOnce({
        rows: [appNotificationRow({
          user_id: otherUserId,
          title: "Jordan sent you a message",
          link_url: `/chat/${conversationId}`,
          actor_user_id: userId,
          conversation_id: conversationId,
          metadata: { conversationKind: "dm" }
        })]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      headers: {
        "x-user-id": userId
      },
      payload: {
        conversationId,
        content: "still sending"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[4]?.[0]).toContain("encrypted_relationship_tokens");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into messages"))).toBe(true);
    expect(response.json().data).toEqual(expect.objectContaining({
      id: "msg-privacy-unreadable",
      content: "still sending"
    }));
  });

  it("rejects severe-safety message text before inserting the message", async () => {
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from conversation_members cm")) {
        return {
          rows: [{
            id: conversationId,
            kind: "group",
            title: "Beta crew",
            tags: [],
            updated_at: "2026-04-29T12:00:00.000Z",
            last_message: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            other_user_id: null,
            other_user_name: null,
            other_user_pronouns: null,
            other_user_photo: null,
            member_count: 3,
            current_user_role: "member",
            disappearing_timer: "off",
            closed_at: null
          }]
        };
      }

      if (text.includes("insert into content_reviews")) {
        return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      headers: {
        "x-user-id": userId
      },
      payload: {
        conversationId,
        content: "I am going to hurt you"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CONTENT_REJECTED");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into messages"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into content_reviews"))).toBe(true);
  });

  it.each([
    [
      "an inactive account",
      { account_status: "under_review", suspended: false, trust_score: 50, active_suspensions: 0, active_restrictions: 0 },
      "Text messaging is unavailable because your account is not active."
    ],
    [
      "a suspension",
      { account_status: "active", suspended: false, trust_score: 50, active_suspensions: 1, active_restrictions: 0 },
      "Text messaging is unavailable while your account is suspended."
    ],
    [
      "a low trust score",
      { account_status: "active", suspended: false, trust_score: 20, active_suspensions: 0, active_restrictions: 0 },
      "Text messaging is unavailable while your trust score is low."
    ],
    [
      "a messaging feature restriction",
      { account_status: "active", suspended: false, trust_score: 50, active_suspensions: 0, active_restrictions: 1 },
      "Text messaging is restricted on your account."
    ]
  ])("explains an empty text-message insert caused by %s", async (_reason, sender, expectedMessage) => {
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from conversation_members cm") && text.includes("join conversations c")) {
        return {
          rows: [{
            id: conversationId,
            kind: "group",
            title: "Beta crew",
            tags: [],
            updated_at: "2026-04-29T12:00:00.000Z",
            last_message: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            other_user_id: null,
            other_user_name: null,
            other_user_pronouns: null,
            other_user_photo: null,
            member_count: 3,
            current_user_role: "member",
            disappearing_timer: "off",
            closed_at: null
          }]
        };
      }

      if (text.includes("join user_blocks block")) {
        return { rows: [] };
      }

      if (text.includes("select email") && text.includes("from app_users")) {
        return { rows: [{ email: "member@example.com" }] };
      }

      if (text.includes("insert into messages")) {
        return { rows: [] };
      }

      if (text.includes("as active_suspensions") && text.includes("as active_restrictions")) {
        return { rows: [sender] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      headers: {
        "x-user-id": userId
      },
      payload: {
        conversationId,
        content: "see you there"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(query.mock.calls.find(([sql]) => String(sql).includes("insert into messages"))?.[0])
      .toContain("u.account_status = 'active'");
    expect(response.json()).toEqual({
      error: {
        code: "FEATURE_RESTRICTED",
        message: expectedMessage,
        details: null
      }
    });
  });

  it("applies a 1h group conversation timer to new messages", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "group",
          title: "Beta crew",
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: null,
          other_user_name: null,
          other_user_pronouns: null,
          other_user_photo: null,
          member_count: 3,
          current_user_role: "member",
          disappearing_timer: "1h",
          closed_at: null
      }]
    })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: "user@example.com" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-group-1",
          user_id: userId,
          content: "see you there",
          created_at: "2026-04-29T12:10:00.000Z",
          expires_at: "2026-04-29T13:10:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      headers: {
        "x-user-id": userId
      },
      payload: {
        conversationId,
        content: "see you there"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[3]?.[0]).toContain("expires_at");
    expect(query.mock.calls[3]?.[0]).toContain("interval '1 hour'");
    expect(response.json().data).toMatchObject({
      id: "msg-group-1",
      content: "see you there",
      expiresAt: "2026-04-29T13:10:00.000Z"
    });
  });

  it("blocks group message sends when a member has a block relationship with the sender", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          kind: "group",
          title: "Beta crew",
          tags: [],
          updated_at: "2026-04-29T12:00:00.000Z",
          last_message: "",
          unread_count: 0,
          pinned: false,
          muted: false,
          other_user_id: null,
          other_user_name: null,
          other_user_pronouns: null,
          other_user_photo: null,
          member_count: 3,
          current_user_role: "member",
          disappearing_timer: "1h",
          closed_at: null
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      headers: {
        "x-user-id": userId
      },
      payload: {
        conversationId,
        content: "see you there"
      }
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(403);
    expect(query.mock.calls[1]?.[0]).toContain("join user_blocks block");
    expect(query.mock.calls[1]?.[1]).toEqual([userId, conversationId]);
    expect(queries.some((sql) => sql.includes("insert into messages"))).toBe(false);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "You cannot message one or more blocked group members.",
        details: null
      }
    });
  });

  it("creates a view-once adult-nudity photo in a private group message", async () => {
    let messageCiphertext: unknown = null;
    let messageNonce: unknown = null;
    let messageAuthTag: unknown = null;
    let messageKeyVersion: unknown = null;
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql);

      if (text.includes("from conversation_members cm") && text.includes("sender_profile")) {
        return {
          rows: [{
            user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            muted: true,
            sender_name: "Jordan",
            conversation_title: "Beta crew"
          }]
        };
      }

      if (text.includes("insert into app_notifications")) {
        return {
          rows: [appNotificationRow({
            user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            type: "group_message",
            title: "New message in Beta crew",
            link_url: `/chat/group/${conversationId}`,
            actor_user_id: userId,
            conversation_id: conversationId,
            metadata: { conversationKind: "group" }
          })]
        };
      }

      if (text.includes("from conversation_members cm") && text.includes("where cm.user_id = $1")) {
        return {
          rows: [{
            id: conversationId,
            kind: "group",
            title: "Beta crew",
            tags: [],
            updated_at: "2026-04-29T12:00:00.000Z",
            last_message: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            other_user_id: null,
            other_user_name: null,
            other_user_pronouns: null,
            other_user_photo: null,
            member_count: 3,
            current_user_role: "member",
            disappearing_timer: "24h",
            closed_at: null
          }]
        };
      }

      if (text.includes("join user_blocks block")) {
        return { rows: [] };
      }

      if (text.includes("with inserted_media as")) {
        return { rows: [{ id: "media-1" }] };
      }

      if (text.includes("select email") && text.includes("from app_users")) {
        return { rows: [{ email: "member@example.com" }] };
      }

      if (text.includes("join app_users app_user")) {
        return { rows: [{ user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97" }] };
      }

      if (text.includes("from user_cruush_match_settings")) {
        return {
          rows: [{
            user_id: userId,
            nsfw_message_visibility: "public",
            nsfw_send_visibility: "public",
            updated_at: "2026-04-29T12:05:00.000Z"
          }, {
            user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            nsfw_message_visibility: "public",
            nsfw_send_visibility: "public",
            updated_at: "2026-04-29T12:05:00.000Z"
          }]
        };
      }

      if (text.includes("closed_at is not null")) {
        return { rows: [{ closed: false }] };
      }

      if (text.includes("coalesce(t.trust_score, 50) as trust_score")) {
        return {
          rows: [{
            account_status: "active",
            suspended: false,
            trust_score: 100,
            suspensions: 0,
            restrictions: 0
          }]
        };
      }

      if (text.includes("update media_objects") && text.includes("moderation_status = 'approved'")) {
        return { rows: [{ id: "media-1" }] };
      }

      if (text.includes("insert into messages")) {
        messageCiphertext = params[2];
        messageNonce = params[3];
        messageAuthTag = params[4];
        messageKeyVersion = params[5];
        return {
          rows: [{
            id: "msg-photo-1",
            user_id: userId,
            content: "",
            content_ciphertext: params[2],
            content_nonce: params[3],
            content_auth_tag: params[4],
            content_key_version: params[5],
            created_at: "2026-04-29T12:10:00.000Z",
            expires_at: "2026-04-30T12:10:00.000Z"
          }]
        };
      }

      if (text.includes("from messages m") && text.includes("message_media_attachments")) {
        return {
          rows: [{
            id: "msg-photo-1",
            user_id: userId,
            content: "",
            content_ciphertext: messageCiphertext,
            content_nonce: messageNonce,
            content_auth_tag: messageAuthTag,
            content_key_version: messageKeyVersion,
            created_at: "2026-04-29T12:10:00.000Z",
            expires_at: "2026-04-30T12:10:00.000Z",
            attachments: [{
              id: "media-1",
              url: "/api/media/assets/media-1/display",
              mediaType: "image",
              mimeType: "image/png",
              viewOnce: true,
              viewedAt: null,
              explicit: true
            }]
          }]
        };
      }

      return { rows: [] };
    });
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-nudity-message.png",
      contentType: "image/png",
      content: png,
      fields: [
        { name: "conversationId", value: conversationId },
        { name: "content", value: "photo caption" },
        { name: "viewOnce", value: "true" }
      ]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages/photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode, response.body).toBe(201);
    const mediaInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into media_objects"));
    const messageInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into messages"));
    const mediaApprove = query.mock.calls.find(([sql]) => String(sql).includes("update media_objects") && String(sql).includes("moderation_status = 'approved'"));
    const contentReviewInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into content_reviews"));
    const attachmentInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into message_media_attachments"));
    const notificationLookup = query.mock.calls.find(([sql]) => String(sql).includes("from conversation_members cm") && String(sql).includes("sender_profile"));
    const notificationInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into app_notifications"));
    expect(mediaInsert?.[1]?.[2]).toBe("message_photo");
    expect(mediaApprove?.[0]).toContain("explicit_classification = case when $6 then 'explicit'");
    expect(mediaApprove?.[1]?.[5]).toBe(true);
    expect(contentReviewInsert).toBeDefined();
    expect(messageInsert).toBeDefined();
    expect(attachmentInsert?.[1]?.[2]).toBe(true);
    expect(notificationLookup).toBeDefined();
    expect(notificationInsert?.[1]).toEqual([
      "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      "group_message",
      "New message in Beta crew",
      "Open cruush to reply.",
      `/chat/group/${conversationId}`,
      userId,
      conversationId,
      "message:msg-photo-1:53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      { conversationKind: "group" }
    ]);
    expect(response.json()).toEqual({
      data: {
        id: "msg-photo-1",
        userId,
        content: "photo caption",
        timestamp: "2026-04-29T12:10:00.000Z",
        expiresAt: "2026-04-30T12:10:00.000Z",
        attachments: [{
          id: "media-1",
          url: "/api/media/assets/media-1/display",
          mediaType: "image",
          mimeType: "image/png",
          viewOnce: true,
          viewedAt: null,
          explicit: true
        }]
      }
    });
  });

  it("allows the owner account to upload favorite message images even when account restrictions would otherwise block it", async () => {
    const ownerSessionToken = "owner-favorite-image-session";
    const ownerMediaId = "64a5f8da-f6c1-4684-b94e-1b34bc29c1ef";
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql);

      if (text.includes("from app_sessions s")) {
        return {
          rows: [{
            user_id: userId,
            email: "julienlenazny@gmail.com",
            account_status: "under_review",
            age_verified_at: "2026-04-28T12:00:00.000Z"
          }]
        };
      }

      if (text.includes("select email") && text.includes("from app_users")) {
        return { rows: [{ email: "julienlenazny@gmail.com" }] };
      }

      if (text.includes("with inserted_media as")) {
        return { rows: [{ id: ownerMediaId }] };
      }

      if (text.includes("update media_objects media") && text.includes("moderation_status = 'approved'")) {
        return { rows: [{ id: ownerMediaId }] };
      }

      if (text.includes("insert into content_reviews")) {
        return { rows: [{ id: "review-favorite-image" }] };
      }

      if (text.includes("update media_objects") && text.includes("content_review_id")) {
        return { rows: [{ id: ownerMediaId }] };
      }

      if (text.includes("insert into message_favorite_images")) {
        return {
          rows: [{
              id: "favorite-owner-image",
              media_object_id: ownerMediaId,
              label: "go-to",
              url: `/api/media/assets/${ownerMediaId}/display`,
              thumbnail_url: `/api/media/assets/${ownerMediaId}/thumbnail`,
              media_type: "image",
              mime_type: "image/webp",
              explicit: false,
              created_at: "2026-04-29T12:10:00.000Z",
              updated_at: "2026-04-29T12:10:00.000Z"
            }]
        };
      }

      return { rows: [] };
    });
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-human-favorite.png",
      contentType: "image/png",
      content: await validPng(),
      fields: [
        { name: "label", value: "go-to" }
      ]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages/favorite-images",
      headers: {
        cookie: createSessionCookie(ownerSessionToken, {
          secure: false,
          maxAgeSeconds: 60
        }),
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const favoriteMediaApprove = query.mock.calls.find(([sql]) => String(sql).includes("update media_objects media") && String(sql).includes("moderation_status = 'approved'"));
    const favoriteReviewInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into content_reviews"));
    const favoriteInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into message_favorite_images"));
    const favoriteMediaApproveSql = String(favoriteMediaApprove?.[0] ?? "");
    const favoriteMediaApproveParams = (favoriteMediaApprove?.[1] ?? []) as unknown[];
    const favoriteMediaApprovePlaceholders = Array.from(
      new Set(Array.from(favoriteMediaApproveSql.matchAll(/\$(\d+)/g), (match) => Number(match[1])))
    ).sort((left, right) => left - right);

    expect(response.statusCode, response.body).toBe(201);
    expect(favoriteMediaApprovePlaceholders).toEqual(
      Array.from({ length: favoriteMediaApproveParams.length }, (_, index) => index + 1)
    );
    expect(favoriteMediaApproveParams).toHaveLength(9);
    expect(favoriteReviewInsert?.[0]).toContain("$2::text");
    expect(favoriteMediaApprove?.[0]).not.toContain("media.moderation_status = 'pending'");
    expect(favoriteInsert?.[0]).not.toContain("feature_restrictions");
    expect(favoriteInsert?.[1]?.[2]).toBe("go-to");
    expect(response.json()).toEqual({
      data: {
        id: "favorite-owner-image",
        mediaObjectId: ownerMediaId,
        label: "go-to",
        url: `/api/media/assets/${ownerMediaId}/display`,
        thumbnailUrl: `/api/media/assets/${ownerMediaId}/thumbnail`,
        mediaType: "image",
        mimeType: "image/webp",
        explicit: false,
        createdAt: "2026-04-29T12:10:00.000Z",
        updatedAt: "2026-04-29T12:10:00.000Z"
      }
    });
  });

  it("rejects severe-safety message photo captions before storing media", async () => {
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from conversation_members cm")) {
        return {
          rows: [{
            id: conversationId,
            kind: "group",
            title: "Beta crew",
            tags: [],
            updated_at: "2026-04-29T12:00:00.000Z",
            last_message: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            other_user_id: null,
            other_user_name: null,
            other_user_pronouns: null,
            other_user_photo: null,
            member_count: 3,
            current_user_role: "member",
            disappearing_timer: "24h",
            closed_at: null
          }]
        };
      }

      if (text.includes("insert into content_reviews")) {
        return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
      }

      return { rows: [] };
    });
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "message.png",
      contentType: "image/png",
      content: png,
      fields: [
        { name: "conversationId", value: conversationId },
        { name: "content", value: "I am going to hurt you" }
      ]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages/photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CONTENT_REJECTED");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into media_objects"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into messages"))).toBe(false);
  });

  it("does not expose a generic video media upload endpoint", async () => {
    const mp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x02, 0x00
    ]);
    const multipart = multipartFilePayload({
      fieldName: "media",
      filename: "clip.mp4",
      contentType: "video/mp4",
      content: mp4,
      fields: [
        { name: "conversationId", value: conversationId },
        { name: "content", value: "video caption" },
        { name: "viewOnce", value: "true" }
      ]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages/media",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });

  it("creates a CSAM incident and does not store a message photo on a PhotoDNA match", async () => {
    const csamApp = buildCsamTestApp();
    mockPhotoDnaMatchAndAlert();
    mockCsamIncidentQueries({ conversation: true });
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "message.png",
      contentType: "image/png",
      content: png,
      fields: [
        { name: "conversationId", value: conversationId }
      ]
    });

    const response = await csamApp.inject({
      method: "POST",
      url: "/api/messages/photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    await csamApp.close();
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "CONTENT_REJECTED",
        message: "This photo was not saved because an automated safety check rejected it. Write to reports@cruush.app if you think this is wrong.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into csam_incidents"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into csam_incident_evidence"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into messages"))).toBe(false);
    expect(queries.some((sql) => sql.includes("message_media_attachments"))).toBe(false);
  });

  it("opens a view-once photo once and records the view before returning bytes", async () => {
    const plaintext = Buffer.from("view-once-photo-bytes");
    const encrypted = encryptMediaBytes(app.config, plaintext);
    const objectKey = `message-photos/${userId}-${Date.now()}-view-once-test.png.enc`;
    const messageId = "28bbd9a5-e48e-46ea-8a43-9ef80ed9473d";
    const mediaObjectId = "cb4dc89b-8732-4c22-9452-bb2d06159355";

    await writeEncryptedMediaObject(app.config, objectKey, encrypted.ciphertext);

    query.mockResolvedValueOnce({
      rows: [{
        object_key: objectKey,
        mime_type: "image/png",
        encrypted_data_key: encrypted.encryptedDataKey,
        data_key_nonce: encrypted.dataKeyNonce,
        data_key_auth_tag: encrypted.dataKeyAuthTag,
        content_nonce: encrypted.nonce,
        content_auth_tag: encrypted.authTag,
        key_version: encrypted.keyVersion
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/messages/${messageId}/attachments/${mediaObjectId}/view`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("insert into message_media_views");
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.body).toBe(plaintext.toString());
  });

  it("denies a view-once photo after it has already been viewed", async () => {
    const messageId = "28bbd9a5-e48e-46ea-8a43-9ef80ed9473d";
    const mediaObjectId = "cb4dc89b-8732-4c22-9452-bb2d06159355";
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: `/api/messages/${messageId}/attachments/${mediaObjectId}/view`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Media not found.",
        details: null
      }
    });
  });

  it("deletes prohibited message photos without attaching them", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: conversationId,
        kind: "group",
        title: "Beta crew",
        tags: [],
        updated_at: "2026-04-29T12:00:00.000Z",
        last_message: "",
        unread_count: 0,
        pinned: false,
        muted: false,
        other_user_id: null,
        other_user_name: null,
        other_user_pronouns: null,
        other_user_photo: null,
        member_count: 3,
        current_user_role: "member",
        disappearing_timer: "off",
        closed_at: null
      }]
    })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: "user@example.com" }] })
      .mockResolvedValueOnce({ rows: [{ id: "media-pending" }] })
      .mockResolvedValue({ rows: [] });
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "drug-sales.png",
      contentType: "image/png",
      content: png,
      fields: [
        { name: "conversationId", value: conversationId }
      ]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages/photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "CONTENT_REJECTED",
        message: "This was not saved. Automated moderation flagged it for harm, hate, threats, nudity where it is not allowed, or illegal activity. Write to reports@cruush.app if you think this is wrong.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into messages"))).toBe(false);
    expect(queries.some((sql) => sql.includes("message_media_attachments"))).toBe(false);
  });

  it("rejects prohibited message content before storage", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: conversationId,
        kind: "group",
        title: "Afterparty",
        tags: [],
        updated_at: "2026-04-29T12:00:00.000Z",
        last_message: "",
        unread_count: 0,
        pinned: false,
        muted: false,
        other_user_id: null,
        other_user_name: null,
        other_user_pronouns: null,
        other_user_photo: null,
        member_count: 4
      }]
    })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      headers: {
        "x-user-id": userId
      },
      payload: {
        conversationId,
        content: "Selling meth delivery menu tonight"
      }
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "CONTENT_REJECTED",
        message: "This was not saved. Automated moderation flagged it for harm, hate, threats, nudity where it is not allowed, or illegal activity. Write to reports@cruush.app if you think this is wrong.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into messages"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into trust_events"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into suspensions"))).toBe(true);
  });

  it("blocks a dm message when either participant has blocked the other", async () => {
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from conversation_members cm")) {
        return {
          rows: [{
            id: conversationId,
            kind: "dm",
            title: null,
            tags: [],
            updated_at: "2026-04-29T12:00:00.000Z",
            last_message: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            other_user_id: dmPartnerId,
            other_user_name: "Alex",
            other_user_pronouns: ["they/them"],
            other_user_photo: null,
            member_count: 2
          }]
        };
      }

      if (text.includes("from user_blocks")) {
        return { rows: [{ exists: true }] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      headers: {
        "x-user-id": userId
      },
      payload: {
        conversationId,
        content: "on my way"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "This user is not accepting messages from you right now.",
        details: null
      }
    });
  });

  it("rejects invalid message conversation ids before querying messages", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      headers: {
        "x-user-id": userId
      },
      payload: {
        conversationId: "not-a-uuid",
        content: "nearby now"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("creates a profile report on POST /api/reports", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "report-1",
          status: "open",
          created_at: "2026-04-29T12:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "profile",
        targetUserId,
        reason: "harassment",
        details: "keeps sending threats"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("from profiles");
    expect(query.mock.calls[1]?.[0]).toContain("insert into reports");
    expect(query.mock.calls[1]?.[1]).toEqual([
      userId,
      "profile",
      targetUserId,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "harassment",
      "keeps sending threats"
    ]);
    expect(response.json()).toEqual({
      data: {
        id: "report-1",
        status: "open",
        createdAt: "2026-04-29T12:00:00.000Z"
      }
    });
  });

  it("emails moderation reports to the reports inbox", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const reportApp = buildServer({
      ...app.config,
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "cruush <hello@cruush.test>",
      SUPPORT_INBOX_EMAIL: "support@cruush.app"
    }, {
      db: {
        query,
        end
      },
      rateLimiter
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => ""
    });
    vi.stubGlobal("fetch", fetchMock);

    query
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "report-email-1",
          status: "open",
          created_at: "2026-07-30T22:00:00.000Z"
        }]
      });

    const response = await reportApp.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "profile",
        targetUserId,
        reason: "harassment",
        details: "keeps sending threats"
      }
    });
    await reportApp.close();

    expect(response.statusCode).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
    const emailBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(emailBody.to).toEqual(["reports@cruush.app"]);
    expect(emailBody.subject).toBe("[report] profile: harassment");
    expect(emailBody.html).toContain("report-email-1");
    expect(emailBody.text).toContain("keeps sending threats");
  }, 10000);

  it("does not create a profile report when the reporter cannot view the target profile", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const targetVisibility = encryptProfileVisibility(app.config, {
      ...emptyProfile.visibility_rules,
      active_crowd_modes: ["T4T"]
    });
    const viewerSensitiveProfile = encryptSensitiveProfile(app.config, {
      is_trans: false,
      crowds: ["Dyke"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });

    query
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId,
          ...targetVisibility,
          updated_at: "2026-04-29T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          year_of_birth: 1994,
          identities: [],
          presentation: [],
          sexuality: [],
          body_type: [],
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
          substance_boundaries: [],
          lat: null,
          lng: null,
          fuzzy_lat: null,
          fuzzy_lng: null,
          ...viewerSensitiveProfile
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "profile",
        targetUserId,
        reason: "harassment",
        details: "known hidden profile id"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Profile not found",
        details: null
      }
    });
    expect(query.mock.calls.some((call) => String(call[0]).includes("insert into reports"))).toBe(false);
  });

  it("requires conversation membership before creating a conversation report", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "conversation",
        conversationId,
        reason: "spam_scam"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Conversation not found.",
        details: null
      }
    });
  });

  it("creates a conversation report for a member conversation", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          conversation_id: conversationId,
          target_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "report-2",
          status: "open",
          created_at: "2026-04-29T12:10:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "conversation",
        conversationId,
        reason: "privacy_location"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("from conversation_members cm");
    expect(query.mock.calls[1]?.[1]).toEqual([
      userId,
      "conversation",
      "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      conversationId,
      null,
      null,
      null,
      null,
      null,
      null,
      "privacy_location",
      ""
    ]);
  });

  it("creates a user report on POST /api/reports", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "report-user",
          status: "open",
          created_at: "2026-04-29T12:15:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "user",
        targetId: targetUserId,
        reason: "spam_scam"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("from app_users");
    expect(query.mock.calls[1]?.[1]).toEqual([
      userId,
      "user",
      targetUserId,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "spam_scam",
      ""
    ]);
    const contentReviewCall = query.mock.calls.find(([sql]) => String(sql).includes("insert into content_reviews"));
    expect(JSON.stringify(contentReviewCall?.[1] ?? [])).toContain("user_report");
  });

  it("creates a post report on POST /api/reports", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const postId = "59e01d61-4a76-4359-915a-1f25b7815ff4";

    query
      .mockResolvedValueOnce({
        rows: [{
          post_id: postId,
          target_user_id: targetUserId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "report-post",
          status: "open",
          created_at: "2026-04-29T12:20:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "post",
        postId,
        reason: "hate"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("from posts");
    expect(query.mock.calls[1]?.[1]).toEqual([
      userId,
      "post",
      targetUserId,
      null,
      null,
      postId,
      null,
      null,
      null,
      null,
      "hate",
      ""
    ]);
  });

  it("creates a message report when the message belongs to another conversation member", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const messageId = "0759d8df-8ba5-4b12-a8fb-c46d4ea63df7";

    query
      .mockResolvedValueOnce({
        rows: [{
          message_id: messageId,
          conversation_id: conversationId,
          target_user_id: targetUserId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "report-message",
          status: "open",
          created_at: "2026-04-29T12:25:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "message",
        targetId: messageId,
        reason: "violence_threat"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("from messages m");
    expect(query.mock.calls[1]?.[1]).toEqual([
      userId,
      "message",
      targetUserId,
      conversationId,
      messageId,
      null,
      null,
      null,
      null,
      null,
      "violence_threat",
      ""
    ]);
  });

  it("creates a profile-photo report with owner and media context", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const mediaObjectId = "0759d8df-8ba5-4b12-a8fb-c46d4ea63df7";
    const profilePhotoUrl = `/api/media/assets/${mediaObjectId}/display`;

    query
      .mockResolvedValueOnce({ rows: [{ id: targetUserId }] })
      .mockResolvedValueOnce({ rows: [{ media_object_id: mediaObjectId, profile_photo_url: profilePhotoUrl }] })
      .mockResolvedValueOnce({
        rows: [{ id: "report-photo", status: "open", created_at: "2026-04-29T12:26:00.000Z" }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: { "x-user-id": userId },
      payload: {
        targetType: "profile_photo",
        targetUserId,
        mediaObjectId,
        reason: "non_consensual_imagery"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[1]?.[0]).toContain("cross join lateral unnest");
    expect(query.mock.calls[2]?.[1]).toEqual([
      userId,
      "profile_photo",
      targetUserId,
      null,
      null,
      null,
      mediaObjectId,
      profilePhotoUrl,
      null,
      null,
      "non_consensual_imagery",
      ""
    ]);
  });

  it("rejects invalid report target types", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "comment",
        targetId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        reason: "harassment"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
  });

  it("rejects nonexistent report targets without exposing private details", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "post",
        targetId: "59e01d61-4a76-4359-915a-1f25b7815ff4",
        reason: "harassment"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Post not found.",
        details: null
      }
    });
  });

  it("rejects self-reporting where inappropriate", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "user",
        targetId: userId,
        reason: "harassment"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Choose another user to report.",
        details: null
      }
    });
  });

  it("blocks normal users from listing moderation reports", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/moderation/reports",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(403);
    expect(query.mock.calls[0]?.[0]).toContain("moderator_users");
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Moderator access required.",
        details: null
      }
    });
  });

  it("lets moderators list reports with minimal safe display context", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query
      .mockResolvedValueOnce({
        rows: [{
          role: "moderator"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "2f35619f-e09d-4f65-a7ea-8f6dd149ec11",
          reporter_user_id: userId,
          target_type: "post",
          target_user_id: targetUserId,
          conversation_id: null,
          message_id: null,
          post_id: "59e01d61-4a76-4359-915a-1f25b7815ff4",
          media_object_id: null,
          profile_photo_url: null,
          reason: "harassment",
          details: "threatening post",
          status: "open",
          created_at: "2026-04-29T12:00:00.000Z",
          updated_at: "2026-04-29T12:00:00.000Z",
          reporter_display_name: "River",
          target_display_name: "Jordan"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/moderation/reports?status=open&limit=25",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("moderator_users");
    expect(query.mock.calls[1]?.[0]).toContain("from reports");
    expect(query.mock.calls[1]?.[1]).toEqual(["open", 25, 0]);
    expect(response.json()).toEqual({
      data: {
        reports: [{
          id: "2f35619f-e09d-4f65-a7ea-8f6dd149ec11",
          reporter: {
            userId,
            displayName: "River"
          },
          target: {
            type: "post",
            userId: targetUserId,
            displayName: "Jordan",
            accountStatus: "active",
            conversationId: null,
            messageId: null,
            postId: "59e01d61-4a76-4359-915a-1f25b7815ff4",
            mediaObjectId: null,
            profilePhotoUrl: null
          },
          reason: "harassment",
          details: "threatening post",
          status: "open",
          createdAt: "2026-04-29T12:00:00.000Z",
          updatedAt: "2026-04-29T12:00:00.000Z"
        }]
      }
    });
    expect(JSON.stringify(response.json())).not.toContain("@");
  });

  it("returns a paginated unified queue with reports and automod candidates", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const reportId = "2f35619f-e09d-4f65-a7ea-8f6dd149ec11";
    const reviewId = "c6c09b96-80ea-4272-a6f5-91727250c4ce";
    const base = {
      created_at: "2026-04-29T12:00:00.000Z",
      updated_at: "2026-04-29T12:00:00.000Z",
      target_user_id: targetUserId,
      conversation_id: null,
      message_id: null,
      post_id: null,
      media_object_id: null,
      profile_photo_url: null,
      subject_display_name: "Jordan",
      account_status: "active",
      reporter_user_id: null,
      reporter_display_name: null,
      normalized_labels: [],
      policy_decision: {},
      content_ref: {},
      total_count: "2"
    };
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({
        rows: [{
          ...base,
          item_kind: "report",
          id: reportId,
          queue_status: "open",
          reason: "harassment",
          summary: "reported post",
          target_type: "post",
          post_id: "59e01d61-4a76-4359-915a-1f25b7815ff4",
          reporter_user_id: userId,
          reporter_display_name: "River",
          content_review_id: reviewId,
          surface: "feed",
          content_type: "text",
          provider: "user_report"
        }, {
          ...base,
          item_kind: "review",
          id: reviewId,
          queue_status: "pending_review",
          reason: "provider_flagged_by_automod",
          summary: "Automated moderation review",
          target_type: "message",
          content_review_id: reviewId,
          surface: "direct_message",
          content_type: "text",
          provider: "stream"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/moderation/queue?source=all&state=open&limit=25",
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("coalesce(review.provider, '') <> 'user_report'");
    expect(query.mock.calls[1]?.[0]).toContain("photodna_csam_match");
    expect(query.mock.calls[1]?.[0]).toContain("coalesce(review.policy_decision ->> 'category', '') <> 'provider_unavailable'");
    expect(response.json().data.page).toEqual({ limit: 25, offset: 0, total: 2, hasMore: false });
    expect(response.json().data.items.map((item: { kind: string }) => item.kind)).toEqual(["report", "review"]);
  });

  it("returns grouped unresolved moderation provider errors with diagnostic context", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "2f35619f-e09d-4f65-a7ea-8f6dd149ec11",
          provider: "stream",
          surface: "profile_photo",
          content_type: "image",
          error_code: "http_503",
          error_message: "Stream moderation request failed.",
          last_content_id: "media-123",
          last_provider_request_id: "stream-request-123",
          occurrences: 3,
          first_seen_at: "2026-08-09T10:00:00.000Z",
          last_seen_at: "2026-08-09T10:05:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/moderation/system-errors?limit=25&offset=0",
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("from moderation_system_errors");
    expect(query.mock.calls[1]?.[1]).toEqual([25, 0]);
    expect(response.json().data.errors).toEqual([{
      id: "2f35619f-e09d-4f65-a7ea-8f6dd149ec11",
      provider: "stream",
      surface: "profile_photo",
      contentType: "image",
      errorCode: "http_503",
      errorMessage: "Stream moderation request failed.",
      lastContentId: "media-123",
      lastProviderRequestId: "stream-request-123",
      occurrences: 3,
      firstSeenAt: "2026-08-09T10:00:00.000Z",
      lastSeenAt: "2026-08-09T10:05:00.000Z"
    }]);
  });

  it("returns moderator notification history with masked emails", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "notification-1",
          user_id: targetUserId,
          user_display_name: "Jordan",
          user_email: "jordan@example.com",
          actor_user_id: userId,
          actor_display_name: "River",
          type: "direct_message",
          title: "New message",
          body: "River sent you a message.",
          link_url: "/messages/conversation-1",
          conversation_id: "59e01d61-4a76-4359-915a-1f25b7815ff4",
          metadata: {},
          read_at: null,
          created_at: "2026-04-29T12:00:00.000Z",
          total_count: "1"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/moderation/notifications?filter=unread&limit=25",
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("from app_notifications");
    expect(query.mock.calls[1]?.[1]).toEqual(["unread", 25, 0]);
    expect(response.json().data).toMatchObject({
      page: { limit: 25, offset: 0, total: 1, hasMore: false },
      notifications: [{
        title: "New message",
        readAt: null,
        user: {
          displayName: "Jordan",
          email: "j*****@example.com"
        },
        actor: {
          displayName: "River"
        }
      }]
    });
  });

  it("lets moderators send a site-wide notification to active verified accounts", async () => {
    const recipientOne = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const recipientTwo = "63fd68d7-24fc-4cff-8cd7-a97ec0cadf98";
    const notificationRow = (userId: string, id: string) => ({
      id,
      user_id: userId,
      type: "announcement",
      title: "New release",
      body: "The latest cruush updates are live.",
      link_url: "/changelog",
      actor_user_id: null,
      conversation_id: null,
      metadata: { kind: "site_wide_announcement" },
      read_at: null,
      created_at: "2026-08-17T12:00:00.000Z"
    });
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({ rows: [{ id: recipientOne }, { id: recipientTwo }] })
      .mockResolvedValueOnce({ rows: [notificationRow(recipientOne, "notification-1")] })
      .mockResolvedValueOnce({ rows: [notificationRow(recipientTwo, "notification-2")] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/moderation/announcements",
      headers: { "x-user-id": userId },
      payload: {
        title: "New release",
        body: "The latest cruush updates are live.",
        linkUrl: "/changelog"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("email_verified_at is not null");
    expect(response.json().data).toEqual({ recipients: 2, notificationsCreated: 2, pushesAttempted: 2 });
    expect(query.mock.calls[4]?.[0]).toContain("insert into moderation_access_events");
  });

  it("returns and updates support requests from the email dashboard", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const requestId = "2f35619f-e09d-4f65-a7ea-8f6dd149ec11";
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: requestId,
          requester_user_id: targetUserId,
          requester_display_name: "Jordan",
          requester_email: "jordan@example.com",
          contact_email: "contact@example.com",
          category: "bug",
          subject: "Messages are missing",
          message: "The chat screen is blank.",
          source: "settings",
          page_url: "/messages",
          ai_triage_status: "complete",
          status: "open",
          github_issue_number: 42,
          triage_branch: "bug/messages",
          triage_pr_url: null,
          triage_attempts: 1,
          triage_claimed_at: null,
          metadata: {},
          created_at: "2026-04-29T12:00:00.000Z",
          updated_at: "2026-04-29T12:00:00.000Z",
          total_count: "1"
        }]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            message: [
              "Overall experience (1–5): 5",
              "Ease of use (1–5): 4",
              "Map experience (1–5): 3",
              "Privacy controls (1–5): 2"
            ].join("\n")
          },
          {
            message: [
              "Overall experience (1–5): 3",
              "Ease of use (1–5): 4",
              "Map experience (1–5): Not answered",
              "Privacy controls (1–5): 2"
            ].join("\n")
          }
        ]
      });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/admin/moderation/support-requests?status=open&limit=25",
      headers: { "x-user-id": userId }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(query.mock.calls[2]?.[0]).toContain("from support_requests");
    expect(query.mock.calls[2]?.[0]).toContain("support.category = $2");
    expect(query.mock.calls[2]?.[1]).toEqual(["open", null, 25, 0]);
    expect(listResponse.json().data.requests[0]).toMatchObject({
      subject: "Messages are missing",
      contactEmail: "c******@example.com",
      githubIssueNumber: 42,
      requester: {
        displayName: "Jordan",
        email: "j*****@example.com"
      }
    });
    expect(listResponse.json().data.surveySummary).toEqual({
      responseCount: 2,
      ratings: [
        { key: "overall", responseCount: 2, average: 4, distribution: [0, 0, 1, 0, 1] },
        { key: "ease", responseCount: 2, average: 4, distribution: [0, 0, 0, 2, 0] },
        { key: "map", responseCount: 1, average: 3, distribution: [0, 0, 1, 0, 0] },
        { key: "privacy", responseCount: 2, average: 2, distribution: [0, 2, 0, 0, 0] }
      ]
    });

    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const appealListResponse = await app.inject({
      method: "GET",
      url: "/api/admin/moderation/support-requests?status=open&category=suspension_appeal&limit=25",
      headers: { "x-user-id": userId }
    });

    expect(appealListResponse.statusCode).toBe(200);
    expect(query.mock.calls[6]?.[1]).toEqual(["open", "suspension_appeal", 25, 0]);

    query.mockReset();
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: requestId,
          requester_user_id: targetUserId,
          requester_display_name: null,
          requester_email: null,
          contact_email: "contact@example.com",
          category: "bug",
          subject: "Messages are missing",
          message: "The chat screen is blank.",
          source: "settings",
          page_url: "/messages",
          ai_triage_status: "complete",
          status: "closed",
          github_issue_number: 42,
          triage_branch: "bug/messages",
          triage_pr_url: null,
          triage_attempts: 1,
          triage_claimed_at: null,
          metadata: {},
          created_at: "2026-04-29T12:00:00.000Z",
          updated_at: "2026-04-29T12:30:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/admin/moderation/support-requests/${requestId}`,
      headers: { "x-user-id": userId },
      payload: { status: "closed" }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("update support_requests");
    expect(query.mock.calls[1]?.[1]).toEqual([requestId, "closed"]);
    expect(query.mock.calls[3]?.[0]).toContain("insert into moderation_access_events");
    expect(updateResponse.json().data.request).toMatchObject({
      id: requestId,
      status: "closed"
    });
  });

  it("returns decrypted reported content and full moderation history in queue detail", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const reportId = "2f35619f-e09d-4f65-a7ea-8f6dd149ec11";
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({ rows: [{
        id: reportId,
        reporter_user_id: userId,
        target_type: "post",
        target_user_id: targetUserId,
        conversation_id: null,
        message_id: null,
        post_id: "59e01d61-4a76-4359-915a-1f25b7815ff4",
        media_object_id: null,
        profile_photo_url: null,
        content_review_id: "c6c09b96-80ea-4272-a6f5-91727250c4ce",
        reason: "harassment",
        details: "reported context",
        status: "open",
        created_at: "2026-04-29T12:00:00.000Z",
        updated_at: "2026-04-29T12:00:00.000Z",
        reporter_display_name: "River",
        target_display_name: "Jordan",
        target_account_status: "active"
      }] })
      .mockResolvedValueOnce({ rows: [{
        content: "reported plaintext",
        content_ciphertext: null,
        content_nonce: null,
        content_auth_tag: null,
        content_key_version: null,
        created_at: "2026-04-29T11:59:00.000Z",
        display_name: "Jordan"
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: "7bc5eaec-a2b9-4f11-88f2-56d30a5d83fb",
        action: "note",
        reason_code: "triaged",
        notes: "Prior triage note.",
        created_at: "2026-04-29T12:05:00.000Z",
        actor_display_name: "Moderator"
      }] });

    const response = await app.inject({
      method: "GET",
      url: `/api/admin/moderation/queue/report/${reportId}`,
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.context).toEqual(expect.objectContaining({
      kind: "post",
      text: "reported plaintext",
      author: "Jordan"
    }));
    expect(response.json().data.history[0]).toEqual(expect.objectContaining({
      action: "note",
      notes: "Prior triage note."
    }));
    expect(query.mock.calls[4]?.[0]).toContain("insert into moderation_access_events");
    expect(query.mock.calls[4]?.[1]?.slice(0, 5)).toEqual([
      userId,
      reportId,
      "c6c09b96-80ea-4272-a6f5-91727250c4ce",
      null,
      "queue_detail"
    ]);
  });

  it("exposes retained encrypted age-review photos through moderator queue detail", async () => {
    const reviewId = "c6c09b96-80ea-4272-a6f5-91727250c4ce";
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const mediaObjectId = "0759d8df-8ba5-4b12-a8fb-c46d4ea63df7";
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({ rows: [{
        id: reviewId,
        user_id: targetUserId,
        display_name: "Jordan",
        account_status: "suspended",
        surface: "profile_photo",
        content_type: "image",
        status: "rejected",
        content_id: mediaObjectId,
        content_ref: {},
        provider: "stream",
        provider_request_id: "provider-age-1",
        normalized_labels: [{ normalized_label: "minor_face_detected" }],
        policy_decision: {
          category: "minor_face_detected",
          user_message_code: "minor_face_review_suspension"
        },
        moderation_status: "pending_review",
        flagged_reason: "minor_face_detected",
        moderation_provider: "stream",
        created_at: "2026-04-29T12:00:00.000Z",
        completed_at: "2026-04-29T12:00:00.000Z"
      }] })
      .mockResolvedValueOnce({ rows: [{ id: mediaObjectId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: `/api/admin/moderation/queue/review/${reviewId}`,
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.context).toEqual({
      kind: "media",
      mediaObjectId,
      previewUrl: `/api/admin/moderation/media/${mediaObjectId}/preview`,
      message: null
    });
    expect(response.json().data.availableActions.canDecideReview).toBe(true);
    expect(query.mock.calls[4]?.[0]).toContain("insert into moderation_access_events");
    expect(query.mock.calls[4]?.[1]?.slice(0, 5)).toEqual([
      userId,
      null,
      reviewId,
      mediaObjectId,
      "queue_detail"
    ]);
  });

  it("lets moderators decide an automated review and records a linked action", async () => {
    const reviewId = "c6c09b96-80ea-4272-a6f5-91727250c4ce";
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({ rows: [{
        id: reviewId,
        user_id: targetUserId,
        display_name: "Jordan",
        account_status: "active",
        surface: "feed",
        content_type: "text",
        status: "queued",
        content_id: null,
        content_ref: {},
        provider: "stream",
        provider_request_id: "provider-1",
        normalized_labels: [],
        policy_decision: { decision: "quarantine" },
        moderation_status: "pending_review",
        flagged_reason: "provider_flagged_by_automod",
        moderation_provider: "stream",
        created_at: "2026-04-29T12:00:00.000Z",
        completed_at: "2026-04-29T12:00:00.000Z"
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: "7bc5eaec-a2b9-4f11-88f2-56d30a5d83fb",
        created_at: "2026-04-29T12:10:00.000Z"
      }] });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/moderation/reviews/${reviewId}/decision`,
      headers: { "x-user-id": userId },
      payload: {
        action: "reject",
        reasonCode: "manual_review_rejected",
        notes: "Confirmed by moderator."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[2]?.[0]).toContain("update content_reviews");
    expect(query.mock.calls[2]?.[1]).toEqual([reviewId, "rejected", "blocked"]);
    expect(query.mock.calls[3]?.[1]?.[3]).toBe(reviewId);
    expect(query.mock.calls[3]?.[1]?.[4]).toBe("reject_content");
  });

  it("removes reported Ping posts and transactionally expires their map activity", async () => {
    const reportId = "2f35619f-e09d-4f65-a7ea-8f6dd149ec11";
    const reviewId = "c6c09b96-80ea-4272-a6f5-91727250c4ce";
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const postId = "59e01d61-4a76-4359-915a-1f25b7815ff4";
    const pingId = "10000000-0000-4000-8000-000000000001";
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({ rows: [{
        id: reportId,
        status: "open",
        target_type: "post",
        target_user_id: targetUserId,
        conversation_id: null,
        message_id: null,
        post_id: postId,
        media_object_id: null,
        profile_photo_url: null,
        content_review_id: reviewId
      }] })
      .mockResolvedValueOnce({ rows: [{ id: postId, map_ping_id: pingId }] })
      .mockResolvedValueOnce({ rows: [{ id: pingId }] })
      .mockResolvedValueOnce({ rows: [{ id: postId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: "7bc5eaec-a2b9-4f11-88f2-56d30a5d83fb",
        created_at: "2026-04-29T12:20:00.000Z"
      }] });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/moderation/reports/${reportId}/remove-content`,
      headers: { "x-user-id": userId },
      payload: { reasonCode: "reported_content_removed", notes: "Confirmed violation." }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[2]?.[0]).toContain("select id::text, map_ping_id::text as map_ping_id");
    expect(query.mock.calls[2]?.[0]).toContain("for update");
    expect(query.mock.calls[3]?.[0]).toContain("update map_pings");
    expect(query.mock.calls[3]?.[0]).toContain("expires_at = least(expires_at, now())");
    expect(query.mock.calls[3]?.[1]).toEqual([pingId]);
    expect(query.mock.calls[4]?.[0]).toContain("delete from posts");
    expect(query.mock.calls[4]?.[1]).toEqual([postId]);
    expect(query.mock.calls[5]?.[0]).toContain("status = 'resolved'");
    expect(query.mock.calls[6]?.[0]).toContain("moderation_status = 'removed'");
    expect(query.mock.calls.some((call) => String(call[0]).includes("delete from app_notifications"))).toBe(false);
    expect(response.json().data.action).toBe("remove_post");
  });

  it("lets moderators resolve reports and records a moderation action", async () => {
    const reportId = "2f35619f-e09d-4f65-a7ea-8f6dd149ec11";
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query
      .mockResolvedValueOnce({
        rows: [{
          role: "admin"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: reportId,
          status: "open",
          target_type: "post",
          target_user_id: targetUserId,
          conversation_id: null,
          message_id: null,
          post_id: "59e01d61-4a76-4359-915a-1f25b7815ff4",
          media_object_id: null,
          profile_photo_url: null
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: reportId,
          status: "resolved",
          updated_at: "2026-04-29T12:35:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "c6c09b96-80ea-4272-a6f5-91727250c4ce",
          created_at: "2026-04-29T12:35:01.000Z"
        }]
      });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/admin/moderation/reports/${reportId}`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        status: "resolved",
        reasonCode: "reviewed_valid_report",
        notes: "Handled in beta queue."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[2]?.[0]).toContain("update reports");
    expect(query.mock.calls[2]?.[1]).toEqual([reportId, "resolved"]);
    expect(query.mock.calls[3]?.[0]).toContain("insert into moderation_actions");
    expect(query.mock.calls[3]?.[1]?.slice(0, 7)).toEqual([
      userId,
      targetUserId,
      reportId,
      null,
      "resolve_report",
      "reviewed_valid_report",
      "Handled in beta queue."
    ]);
    expect(JSON.parse(String(query.mock.calls[3]?.[1]?.[7]))).toEqual(expect.objectContaining({
      previousStatus: "open",
      newStatus: "resolved",
      targetType: "post"
    }));
    expect(response.json()).toEqual({
      data: {
        report: {
          id: reportId,
          status: "resolved",
          updatedAt: "2026-04-29T12:35:00.000Z"
        },
        moderationAction: {
          id: "c6c09b96-80ea-4272-a6f5-91727250c4ce",
          createdAt: "2026-04-29T12:35:01.000Z"
        }
      }
    });
  });

  it("lets moderators dismiss reports and records a moderation action", async () => {
    const reportId = "2f35619f-e09d-4f65-a7ea-8f6dd149ec11";

    query
      .mockResolvedValueOnce({
        rows: [{
          role: "moderator"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: reportId,
          status: "open",
          target_type: "profile",
          target_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          conversation_id: null,
          message_id: null,
          post_id: null,
          media_object_id: null,
          profile_photo_url: null
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: reportId,
          status: "dismissed",
          updated_at: "2026-04-29T12:36:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "c6c09b96-80ea-4272-a6f5-91727250c4ce",
          created_at: "2026-04-29T12:36:01.000Z"
        }]
      });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/admin/moderation/reports/${reportId}`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        status: "dismissed",
        reasonCode: "not_actionable"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[3]?.[1]?.[4]).toBe("dismiss_report");
    expect(response.json().data.report.status).toBe("dismissed");
  });

  it("lets moderators place a user under review and updates account_status_updated_at", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query
      .mockResolvedValueOnce({
        rows: [{
          role: "moderator"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId,
          account_status: "active",
          account_status_updated_at: "2026-04-29T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId,
          account_status: "under_review",
          account_status_updated_at: "2026-04-29T12:40:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "c6c09b96-80ea-4272-a6f5-91727250c4ce",
          created_at: "2026-04-29T12:40:01.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/moderation/users/${targetUserId}/status`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        status: "under_review",
        reasonCode: "needs_manual_review",
        notes: "Multiple credible reports."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[2]?.[0]).toContain("account_status_updated_at = now()");
    expect(query.mock.calls[2]?.[1]).toEqual([targetUserId, "under_review"]);
    expect(query.mock.calls[3]?.[1]?.slice(0, 7)).toEqual([
      userId,
      targetUserId,
      null,
      null,
      "mark_under_review",
      "needs_manual_review",
      "Multiple credible reports."
    ]);
    expect(JSON.parse(String(query.mock.calls[3]?.[1]?.[7]))).toEqual({
      previousStatus: "active",
      newStatus: "under_review"
    });
    expect(response.json()).toEqual({
      data: {
        user: {
          id: targetUserId,
          accountStatus: "under_review",
          accountStatusUpdatedAt: "2026-04-29T12:40:00.000Z"
        },
        moderationAction: {
          id: "c6c09b96-80ea-4272-a6f5-91727250c4ce",
          createdAt: "2026-04-29T12:40:01.000Z"
        }
      }
    });
  });

  it("lets moderators suspend a user and existing auth enforcement blocks that session", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query
      .mockResolvedValueOnce({
        rows: [{
          role: "admin"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId,
          account_status: "active",
          account_status_updated_at: "2026-04-29T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId,
          account_status: "suspended",
          account_status_updated_at: "2026-04-29T12:45:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "c6c09b96-80ea-4272-a6f5-91727250c4ce",
          created_at: "2026-04-29T12:45:01.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: targetUserId,
          account_status: "suspended"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/moderation/users/${targetUserId}/status`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        status: "suspended",
        reasonCode: "abuse_confirmed",
        reportId: "2f35619f-e09d-4f65-a7ea-8f6dd149ec11"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[2]?.[0]).toContain("account_status_updated_at = now()");
    expect(query.mock.calls[3]?.[1]?.slice(0, 7)).toEqual([
      userId,
      targetUserId,
      "2f35619f-e09d-4f65-a7ea-8f6dd149ec11",
      null,
      "suspend_user",
      "abuse_confirmed",
      ""
    ]);

    const authResponse = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: {
        cruush_session: "suspended-after-admin-action"
      }
    });

    expect(query.mock.calls[4]?.[0]).toContain("delete from app_sessions where user_id");
    expect(query.mock.calls[4]?.[1]).toEqual([targetUserId]);

    expect(authResponse.statusCode).toBe(401);
    expect(query.mock.calls[5]?.[0]).toContain("from app_sessions s");
    expect(query.mock.calls[6]?.[0]).toContain("delete from app_sessions");
    expect(query.mock.calls[6]?.[1]).toEqual([hashSessionToken("suspended-after-admin-action")]);
  });

  it("lets moderators permanently ban a user and revokes every session", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query
      .mockResolvedValueOnce({ rows: [{ role: "admin" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId,
          email: "reported@example.com",
          account_status: "suspended",
          account_status_updated_at: "2026-04-29T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId,
          account_status: "banned",
          account_status_updated_at: "2026-04-29T12:45:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "c6c09b96-80ea-4272-a6f5-91727250c4ce",
          created_at: "2026-04-29T12:45:01.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/moderation/users/${targetUserId}/status`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        status: "banned",
        reasonCode: "severe_abuse_permanent_ban",
        notes: "Confirmed severe abuse."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.user.accountStatus).toBe("banned");
    expect(query.mock.calls[3]?.[1]?.slice(4, 7)).toEqual([
      "ban_user",
      "severe_abuse_permanent_ban",
      "Confirmed severe abuse."
    ]);
    expect(query.mock.calls[4]?.[0]).toContain("delete from app_sessions where user_id");
    expect(query.mock.calls[4]?.[1]).toEqual([targetUserId]);
  });

  it("lets an admin unban a user and clears every active enforcement row", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query
      .mockResolvedValueOnce({ rows: [{ role: "admin" }] })
      .mockResolvedValueOnce({ rows: [{ id: targetUserId, email: "reported@example.com", account_status: "banned", account_status_updated_at: "2026-04-29T12:00:00.000Z" }] })
      .mockResolvedValueOnce({ rows: [{ id: targetUserId, account_status: "active", account_status_updated_at: "2026-04-29T12:45:00.000Z" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "restore-action", created_at: "2026-04-29T12:45:01.000Z" }] });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/moderation/users/${targetUserId}/status`,
      headers: { "x-user-id": userId },
      payload: { status: "active", reasonCode: "review_cleared" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.user.accountStatus).toBe("active");
    const sql = query.mock.calls.map(([statement]) => String(statement));
    expect(sql.some((statement) => statement.includes("update suspensions"))).toBe(true);
    expect(sql.some((statement) => statement.includes("update feature_restrictions"))).toBe(true);
    expect(sql.some((statement) => statement.includes("delete from severe_access_bans"))).toBe(true);
    expect(sql.some((statement) => statement.includes("set is_suspended = false"))).toBe(true);
  });

  it("refuses to restrict the owner account", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query
      .mockResolvedValueOnce({ rows: [{ role: "admin" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId,
          email: "julienlenazny@gmail.com",
          account_status: "active",
          account_status_updated_at: "2026-04-29T12:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/moderation/users/${targetUserId}/status`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        status: "banned",
        reasonCode: "severe_abuse_permanent_ban"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query.mock.calls.some((call) => String(call[0]).includes("update app_users set account_status"))).toBe(false);
  });

  it("searches moderated accounts and masks emails from non-admin moderators", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ role: "moderator" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          email: "jordan@example.com",
          display_name: "Jordan",
          account_status: "banned",
          account_status_updated_at: "2026-04-29T12:45:00.000Z",
          created_at: "2026-01-02T09:00:00.000Z",
          moderator_role: null,
          open_report_count: "2",
          total_report_count: "5",
          total_count: "1"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/moderation/users?query=jordan",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.page.total).toBe(1);
    expect(body.users[0]).toMatchObject({
      displayName: "Jordan",
      email: "j*****@example.com",
      accountStatus: "banned",
      openReportCount: 2,
      totalReportCount: 5,
      isOwner: false
    });
    expect(String(query.mock.calls[1]?.[0])).toContain('select base.*,\n       count(*) over() as total_count');
    expect(String(query.mock.calls[1]?.[0])).not.toContain('base.*,,');
    expect(query.mock.calls[1]?.[1]?.[0]).toBe("jordan");
  });

  it("rate limits repeated report creation", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query.mockImplementation(async (sql: string) => {
      if (sql.includes("from profiles")) {
        return { rows: [{ id: targetUserId }] };
      }

      return {
        rows: [{
          id: "report-rate-limit",
          status: "open",
          created_at: "2026-04-29T12:00:00.000Z"
        }]
      };
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/reports",
        headers: {
          "x-user-id": userId
        },
        payload: {
          targetType: "profile",
          targetUserId,
          reason: "harassment"
        }
      });

      expect(response.statusCode).toBe(201);
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: {
        "x-user-id": userId
      },
      payload: {
        targetType: "profile",
        targetUserId,
        reason: "harassment"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many reports. Try again later.",
        details: expect.any(Object)
      }
    });
  });

  it("creates an anonymous support request with contact email on POST /api/support-requests", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: "support-1",
        status: "open",
        ai_triage_status: "pending",
        created_at: "2026-07-07T12:00:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      headers: {
        "user-agent": "vitest"
      },
      payload: {
        category: "question",
        subject: "Question about account access",
        message: "Can support help me understand the bank reviewer login path?",
        contactEmail: "reviewer@example.com",
        source: "auth",
        pageUrl: "https://cruush.test/"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("insert into support_requests");
    expect(query.mock.calls[0]?.[1]).toEqual([
      null,
      "reviewer@example.com",
      "question",
      "Question about account access",
      "Can support help me understand the bank reviewer login path?",
      "auth",
      "https://cruush.test/",
      expect.objectContaining({
        userAgent: "vitest",
        aiSupport: expect.objectContaining({ status: "pending" })
      })
    ]);
    expect(response.json()).toEqual({
      data: {
        id: "support-1",
        status: "open",
        aiTriageStatus: "pending",
        createdAt: "2026-07-07T12:00:00.000Z"
      }
    });
  });

  it("requires a reply email for signed-out support requests", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      payload: {
        category: "bug",
        subject: "Map issue",
        message: "The map did not load after sign in.",
        source: "auth"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter an email so support can reply.",
        details: null
      }
    });
  });

  it("creates a signed-in support request without requiring contact email", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ email: "river@example.com" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "support-2",
          status: "open",
          ai_triage_status: "pending",
          created_at: "2026-07-07T12:05:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      headers: {
        "x-user-id": userId
      },
      payload: {
        category: "bug",
        subject: "Settings bug",
        message: "The settings screen got stuck after opening support.",
        source: "settings"
      }
    });

    expect(response.statusCode).toBe(201);
    // The member never types an address: support replies to the account email
    // read from app_users.
    expect(String(query.mock.calls[0]?.[0])).toContain("select email from app_users");
    expect(query.mock.calls[1]?.[1]).toEqual([
      userId,
      "river@example.com",
      "bug",
      "Settings bug",
      "The settings screen got stuck after opening support.",
      "settings",
      "",
      expect.objectContaining({
        userAgent: expect.any(String),
        aiSupport: expect.objectContaining({ status: "pending" })
      })
    ]);
  });

  it("forwards support requests to the reports inbox", async () => {
    const supportApp = buildServer({
      ...app.config,
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "cruush <hello@cruush.test>",
      SUPPORT_INBOX_EMAIL: "support@cruush.app"
    }, {
      db: {
        query,
        end
      },
      rateLimiter
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => ""
    });
    vi.stubGlobal("fetch", fetchMock);
    query.mockResolvedValueOnce({
      rows: [{
        id: "support-3",
        status: "open",
        ai_triage_status: "pending",
        created_at: "2026-07-07T12:10:00.000Z"
      }]
    });

    const response = await supportApp.inject({
      method: "POST",
      url: "/api/support-requests",
      headers: {
        "user-agent": "vitest"
      },
      payload: {
        category: "question",
        subject: "Can AI answer support?",
        message: "I want to know how most support replies will be handled.",
        contactEmail: "founder@example.com",
        source: "auth",
        pageUrl: "/"
      }
    });
    await supportApp.close();

    expect(response.statusCode).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
    const emailBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(emailBody.to).toEqual(["reports@cruush.app"]);
    expect(emailBody.reply_to).toBe("founder@example.com");
    expect(emailBody.subject).toBe("[support] question: Can AI answer support?");
    expect(emailBody.html).toContain("support-3");
    expect(emailBody.html).toContain("I want to know how most support replies will be handled.");
  }, 10000);

  it("keeps support requests saved when support inbox delivery fails", async () => {
    const supportApp = buildServer({
      ...app.config,
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "cruush <hello@cruush.test>",
      SUPPORT_INBOX_EMAIL: "support@cruush.app"
    }, {
      db: {
        query,
        end
      },
      rateLimiter
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway"
    });
    vi.stubGlobal("fetch", fetchMock);
    query.mockResolvedValueOnce({
      rows: [{
        id: "support-4",
        status: "open",
        ai_triage_status: "pending",
        created_at: "2026-07-07T12:15:00.000Z"
      }]
    });

    const response = await supportApp.inject({
      method: "POST",
      url: "/api/support-requests",
      payload: {
        category: "bug",
        subject: "Inbox failure should not block",
        message: "The DB record should still be returned even if Resend fails.",
        contactEmail: "founder@example.com",
        source: "auth"
      }
    });
    await supportApp.close();

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("insert into support_requests");
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
    expect(response.json()).toEqual({
      data: {
        id: "support-4",
        status: "open",
        aiTriageStatus: "pending",
        createdAt: "2026-07-07T12:15:00.000Z"
      }
    });
  });

  it("uploads a profile photo on POST /api/profile-photos", async () => {
    query.mockImplementation(async (_sql: string, params: unknown[] = []) => ({
      rows: String(_sql).includes("select photos from profiles")
        ? [{ photos: [] }]
        : String(_sql).includes("with inserted_media as")
          ? [{ id: params[0] }]
          : [{ photos: [params[2]] }]
    }));
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-human-profile.png",
      contentType: "image/png",
      content: png
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode, response.body).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      data: {
        url: expect.stringMatching(/^\/api\/media\/assets\/[0-9a-f-]{36}\/display$/),
        explicit: false,
        photos: [expect.stringMatching(/^\/api\/media\/assets\/[0-9a-f-]{36}\/display$/)]
      }
    });
    expect(body.data.url).not.toContain(userId);
    const profileLookup = query.mock.calls.find(([sql]) => String(sql).includes("select photos from profiles"));
    const mediaInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into media_objects"));
    const profileInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into profiles (id, photos, updated_at)"));
    expect(profileLookup?.[1]).toEqual([userId, false]);
    expect(profileLookup?.[0]).toContain("photo_uploads_allowed");
    expect(mediaInsert?.[0]).toContain("encrypted_data_key");
    expect(mediaInsert?.[0]).toContain("insert into media_variants");
    expect(mediaInsert?.[0]).toContain("'pending'");
    expect(profileInsert?.[0]).toContain("array_append(profiles.photos, $3)");
    expect(profileInsert?.[1]).toEqual(expect.arrayContaining([userId, body.data.url]));
  });

  it("rejects restricted profile-photo uploads before creating pending media", async () => {
    query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("select photos from profiles")
        ? [{ photos: [], photo_uploads_allowed: false }]
        : []
    }));
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-human-profile.png",
      contentType: "image/png",
      content: png
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FEATURE_RESTRICTED",
        message: "Photo uploads are unavailable for this account.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(false);
  });

  it("deletes quarantined ciphertext when the profile transaction fails", async () => {
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("select photos from profiles")) {
        return { rows: [{ photos: [] }] };
      }

      if (sql.includes("with inserted_media as")) {
        return { rows: [{ id: params[0] }] };
      }

      if (sql.includes("insert into profiles (id, photos, updated_at)")) {
        throw new Error("simulated profile transaction failure");
      }

      return { rows: [] };
    });
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-human-profile.png",
      contentType: "image/png",
      content: await validPng()
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const mediaInsert = query.mock.calls.find(([sql]) => String(sql).includes("with inserted_media as"));
    const mediaParams = mediaInsert?.[1] as unknown[];

    expect(response.statusCode).toBe(500);
    for (const objectKey of [mediaParams[3], mediaParams[14], mediaParams[25]] as string[]) {
      await expect(readEncryptedMediaObject(app.config, objectKey)).rejects.toThrow();
    }
    expect(query.mock.calls.some(([sql]) => String(sql).includes("delete from media_objects"))).toBe(true);
  });

  it("accepts fishnet arms as a profile photo of the uploader", async () => {
    mockPendingProfileMediaQueries();
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "fishnet-arms.png",
      contentType: "image/png",
      content: png
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode).toBe(201);
    const queries = query.mock.calls.map(([sql]) => String(sql));
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(true);
  });

  it.each([
    "adult-human-clothed-face.png",
    "adult-human-clothed-body-part.png"
  ])("accepts an age-confirmed non-explicit human profile photo: %s", async (filename) => {
    mockPendingProfileMediaQueries();
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename,
      contentType: "image/png",
      content: png
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into media_objects"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into profiles"))).toBe(true);
  });

  it.each([
    "adult-human-nude-face.png",
    "adult-human-nude-body-part.png"
  ])("accepts and classifies an adult nude profile photo for alpha upload testing: %s", async (filename) => {
    mockPendingProfileMediaQueries();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename,
      contentType: "image/png",
      content: await validPng()
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: {
        url: expect.stringMatching(/^\/api\/media\/assets\/[0-9a-f-]{36}\/display$/),
        photos: [expect.stringMatching(/^\/api\/media\/assets\/[0-9a-f-]{36}\/display$/)],
        explicit: true
      }
    });
    expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(true);
  });

  it("allows an age-inference filename when content-safety otherwise passes", async () => {
    mockPendingProfileMediaQueries();
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "underage-adult-human-profile.png",
      contentType: "image/png",
      content: png
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(201);
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into suspensions"))).toBe(false);
  });

  it("creates a CSAM incident, preserves encrypted evidence, and locks the account on a PhotoDNA profile-photo match", async () => {
    const csamApp = buildCsamTestApp();
    const fetchMock = mockPhotoDnaMatchAndAlert();
    mockCsamIncidentQueries();
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-human-profile.png",
      contentType: "image/png",
      content: png
    });

    const response = await csamApp.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType,
        "user-agent": "vitest"
      },
      payload: multipart.payload
    });
    await csamApp.close();
    const queries = query.mock.calls.map(([sql]) => String(sql));
    const resendBody = JSON.parse(fetchMock.mock.calls.find(([url]) => String(url) === "https://api.resend.com/emails")?.[1]?.body as string);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "CONTENT_REJECTED",
        message: "This photo was not saved because an automated safety check rejected it. Write to reports@cruush.app if you think this is wrong.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into csam_incidents"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into csam_incident_evidence"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into suspensions"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into feature_restrictions"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(false);
    expect(resendBody.subject).toBe(`[TEST] PhotoDNA match incident ${csamIncidentId}`);
    expect(resendBody.html).toContain("photodna-match-1");
    expect(resendBody.html).not.toContain("csam-evidence");
  });

  it("fails closed without creating a CSAM incident when PhotoDNA is unavailable", async () => {
    const csamApp = buildCsamTestApp();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (input.toString().startsWith("https://photodna.example.test")) {
        return {
          ok: false,
          status: 502,
          text: async () => "bad gateway"
        };
      }

      throw new Error(`Unexpected fetch URL: ${input.toString()}`);
    }));
    mockPendingProfileMediaQueries();
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-human-profile.png",
      contentType: "image/png",
      content: png
    });

    const response = await csamApp.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    await csamApp.close();
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      data: {
        status: "pending_review",
        assetId: expect.any(String)
      }
    });
    expect(queries.some((sql) => sql.includes("insert into csam_incidents"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(false);
  });

  it("retains a mock-provider profile photo for retry when Rekognition is unavailable", async () => {
    const rekognitionSend = vi.spyOn(RekognitionClient.prototype, "send").mockRejectedValue(
      Object.assign(new Error("Rekognition unavailable"), {
        name: "ServiceUnavailableException",
        $metadata: { httpStatusCode: 503, requestId: "rekognition-mock-outage-1" }
      })
    );
    const outageApp = buildServer({
      ...app.config,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true
    }, {
      db: { query, end },
      rateLimiter
    });
    mockPendingProfileMediaQueries();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-human-profile.png",
      contentType: "image/png",
      content: await validPng()
    });

    try {
      const response = await outageApp.inject({
        method: "POST",
        url: "/api/profile-photos",
        headers: {
          "x-user-id": userId,
          "content-type": multipart.contentType
        },
        payload: multipart.payload
      });
      const queries = query.mock.calls.map(([sql]) => String(sql));

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({
        data: {
          status: "pending_review",
          assetId: expect.any(String)
        }
      });
      expect(rekognitionSend).toHaveBeenCalled();
      expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
      expect(queries.some((sql) => sql.includes("moderation_failure_reason = 'provider_unavailable'"))).toBe(true);
      expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(false);
      expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(false);
    } finally {
      await outageApp.close();
      rekognitionSend.mockRestore();
    }
  });

  it("accepts a gear-only profile photo while preserving independent safety checks", async () => {
    mockPendingProfileMediaQueries();
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "non-human.png",
      contentType: "image/png",
      content: png
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual({
      data: {
        url: expect.stringMatching(/^\/api\/media\/assets\/[0-9a-f-]{36}\/display$/),
        photos: [expect.stringMatching(/^\/api\/media\/assets\/[0-9a-f-]{36}\/display$/)],
        explicit: false
      }
    });
    expect(queries.some((sql) => sql.includes("select photos from profiles"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(true);
  });

  it("never stores the capability URL, token, object key, final URL, or original filename in moderation records", async () => {
    const bridgeApp = buildServer({
      ...app.config,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: true,
      BANK_PROFILE_PHOTO_TESTER_USER_IDS: [userId],
      MODERATION_MEDIA_BASE_URL: "https://moderation-media-staging.cruush.app",
      STREAM_PSEUDONYM_KEY: "0123456789abcdef0123456789abcdef"
    }, {
      db: { query, end },
      rateLimiter
    });
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql === "select photos from profiles where id = $1") {
        return { rows: [{ photos: [] }] };
      }

      if (sql.includes("with inserted_media as")) {
        return { rows: [{ id: params[0] }] };
      }

      return { rows: [] };
    });
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "private-original-name.png",
      contentType: "image/png",
      content: await validPng()
    });

    const response = await bridgeApp.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    await bridgeApp.close();
    const reviewCall = query.mock.calls.find(([sql]) => String(sql).includes("insert into content_reviews"));
    const reviewParams = JSON.stringify(reviewCall?.[1] ?? []);

    expect(response.statusCode).toBe(202);
    expect(reviewParams).not.toContain("moderation-media-staging.cruush.app");
    expect(reviewParams).not.toContain("private-original-name.png");
    expect(reviewParams).not.toContain("profile-photos/");
    expect(reviewParams).not.toContain("/api/media/profile-photos/");
    // Nothing was tagged, so the upload passes and writes no moderation record
    // at all. There is nothing held, and nothing to leak.
    expect(reviewParams).not.toContain("assetId");
  });

  it("rejects profile photo uploads when the profile already has 4 photos", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ email: "user@example.com" }] })
      .mockResolvedValueOnce({
        rows: [{
          photos: Array.from({ length: 4 }, (_, index) => `https://example.com/photo-${index}.jpg`)
        }]
      });
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "profile.png",
      contentType: "image/png",
      content: png
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "You can add up to 4 photos.",
        details: null
      }
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("deletes scat profile photos from quarantine", async () => {
    mockPendingProfileMediaQueries();
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-human-scat-profile.png",
      contentType: "image/png",
      content: png
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "CONTENT_REJECTED",
        message: "This was not saved. Automated moderation flagged it for harm, hate, threats, nudity where it is not allowed, or illegal activity. Write to reports@cruush.app if you think this is wrong.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(false);
  });

  it("deletes prohibited profile photos from quarantine", async () => {
    mockPendingProfileMediaQueries();
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "drug-sales.png",
      contentType: "image/png",
      content: png
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "CONTENT_REJECTED",
        message: "This was not saved. Automated moderation flagged it for harm, hate, threats, nudity where it is not allowed, or illegal activity. Write to reports@cruush.app if you think this is wrong.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("select photos from profiles"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(true);
  });

  it("rejects unsupported profile photo MIME types", async () => {
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "profile.txt",
      contentType: "text/plain",
      content: Buffer.from("not an image")
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Upload a valid JPEG, PNG, or WebP image.",
        details: null
      }
    });
  });

  it("rejects a profile photo whose declared MIME type does not match its bytes", async () => {
    const jpeg = await validJpeg();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-human-profile.png",
      contentType: "image/png",
      content: jpeg
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Image content does not match its declared type.",
        details: null
      }
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("select email");
  });

  it("requires authentication before accepting a profile photo", async () => {
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "adult-human-profile.png",
      contentType: "image/png",
      content: png
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects oversized profile photo uploads", async () => {
    const oversizedPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(5 * 1024 * 1024 + 1)
    ]);
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "profile.png",
      contentType: "image/png",
      content: oversizedPng
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Profile photo must be 5 MB or smaller.",
        details: null
      }
    });
  });

  it("returns nearby users from GET /api/users", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const targetLocation = await encryptedLocationEnvelopeRow({
      subjectUserId: targetUserId,
      lat: 40.711,
      lng: -74.002,
      accuracyM: 50
    });

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: targetUserId,
          display_name: "Alex",
          year_of_birth: 1998,
          pronouns: ["they/them"],
          looking_for: ["Fun"],
          vibes: ["Chill"],
          position: ["Top"],
          hosting_travel: ["Can Host"],
          photos: ["https://example.com/alex.jpg"],
          lat: 40.711,
          lng: -74.002,
          fuzzy_lat: 40.7115,
          fuzzy_lng: -74.0025,
          updated_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [targetLocation] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(11);
    expect(query.mock.calls[1]?.[0]).toContain("from profiles");
    expect(query.mock.calls[1]?.[0]).toContain("join encrypted_location_envelopes");
    expect(query.mock.calls[1]?.[0]).toContain("profiles.display_name as display_name");
    expect(query.mock.calls[1]?.[0]).toContain("media.explicit_classification = 'explicit'");
    expect(query.mock.calls[1]?.[0]).toContain("), false) as primary_photo_explicit");
    expect(query.mock.calls[1]?.[0]).not.toContain("media.explicit_classification is distinct from 'non_explicit'");
    expect(query.mock.calls[1]?.[0]).toContain("where profiles.id <> $1");
    expect(query.mock.calls[1]?.[0]).toContain("profiles.location_updated_at >= now() - make_interval(hours => coalesce(pin_settings.map_presence_hours, pin_settings.map_presence_days * 24, 168))");
    expect(query.mock.calls[1]?.[0]).toContain("location_envelopes.collected_at_ms >=");
    expect(query.mock.calls[1]?.[0]).not.toContain("discovery_match");
    expect(query.mock.calls[1]?.[0]).toContain("limit $3");
    expect(query.mock.calls[1]?.[1]?.[0]).toBe(userId);
    expect(Array.isArray(query.mock.calls[1]?.[1]?.[1])).toBe(true);
    expect(query.mock.calls[1]?.[1]?.[2]).toBe(500);

    const body = response.json();
    expect(body.data.mapEpochMs).toEqual(expect.any(Number));
    expect(Array.isArray(body.data.profiles)).toBe(true);
    expect(body.data.profiles[0]).toMatchObject({
      profileToken: targetUserId,
      name: "Alex",
      display_name: "Alex",
      pronouns: "they/them",
      lookingFor: ["Fun"],
      vibes: ["Chill"],
      position: ["Top"],
      hostingTravel: ["Can Host"],
      photo: "https://example.com/alex.jpg",
      relationshipContext: "PUBLIC",
      relationship: expect.objectContaining({
        mutualCruush: false,
        canMessage: false
      })
    });
    expect(body.data.profiles[0]).not.toHaveProperty("lat");
    expect(body.data.profiles[0]).not.toHaveProperty("lng");
    expect(body.data.profiles[0]).not.toHaveProperty("__pulseLat");
    expect(body.data.profiles[0]).not.toHaveProperty("__pulseLng");
    expect(body.data.profiles[0].displayLocationToken).toMatchObject({
      version: 1,
      tokenVersion: 1,
      ciphertext: expect.any(String),
      nonce: expect.any(String)
    });
    expect(body.data.profiles[0].distanceLabel).toBe("Nearby");
    expect(body.data.profiles[0].lastActive).toMatch(/ago$/);
    const activePingQuery = query.mock.calls.find(([sql]) => String(sql).includes("from map_pings"));
    expect(activePingQuery?.[0]).toContain("radius_miles");
  });

  it("returns the Mile High Club invitation contract beyond the viewer browse radius", async () => {
    const viewerLocation = await encryptedLocationEnvelopeRow({
      subjectUserId: userId,
      lat: 40.7128,
      lng: -74.006,
      accuracyM: 25
    });
    query.mockImplementation(async (sql: string) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return { rows: [viewerLocation] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=39.9526&lng=-75.1652",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        mapEpochMs: expect.any(Number),
        profiles: [],
        browseRadiusMiles: 50,
        outsideBrowseRadius: true
      }
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("from map_pings"))).toBe(false);
  });

  it("limits discovery Pulse visibility to the sender-selected radius", () => {
    const viewerCoordinates = { lat: 40.7128, lng: -74.006 };

    expect(isDiscoveryMapPingVisible({
      viewerCoordinates,
      shownCoordinates: { lat: 40.72, lng: -74.006 },
      radiusMiles: 1
    })).toBe(true);
    expect(isDiscoveryMapPingVisible({
      viewerCoordinates,
      shownCoordinates: { lat: 40.75, lng: -74.006 },
      radiusMiles: 1
    })).toBe(false);
    expect(isDiscoveryMapPingVisible({
      viewerCoordinates: null,
      shownCoordinates: { lat: 40.7128, lng: -74.006 },
      radiusMiles: 5
    })).toBe(false);
    expect(isDiscoveryMapPingVisible({
      viewerCoordinates,
      shownCoordinates: null,
      radiusMiles: 5
    })).toBe(false);
  });

  it("shows Ghost Mode profiles at shifted coordinates in nearby discovery", async () => {
    const targetUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const activePingId = "10000000-0000-4000-8000-000000000001";
    const targetLocation = await encryptedLocationEnvelopeRow({
      subjectUserId: targetUserId,
      lat: 40.711,
      lng: -74.002,
      accuracyM: 50
    });
    const viewerLocation = await encryptedLocationEnvelopeRow({
      subjectUserId: userId,
      lat: 40.711,
      lng: -74.002,
      accuracyM: 50
    });
    const targetPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: targetUserId,
      baseMode: "GHOST"
    });

    query.mockImplementation((sql: string) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from profiles") && normalizedSql.includes("join app_users")) {
        return Promise.resolve({ rows: [{
          id: targetUserId,
          display_name: "Alex",
          year_of_birth: 1998,
          pronouns: ["they/them"],
          photos: ["https://example.com/alex.jpg"],
          lat: 40.711,
          lng: -74.002,
          fuzzy_lat: 40.7115,
          fuzzy_lng: -74.0025,
          updated_at: "2026-04-28T12:00:00.000Z"
        }] });
      }

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({ rows: [targetLocation, viewerLocation] });
      }

      if (normalizedSql.includes("from encrypted_visibility_tokens")) {
        return Promise.resolve({ rows: [targetPolicy] });
      }

      if (normalizedSql.includes("insert into ghost_rotation_tokens")) {
        return Promise.resolve({ rows: [{ subject_user_id: targetUserId }] });
      }

      if (normalizedSql.includes("from map_pings")) {
        return Promise.resolve({
          rows: [{
            id: activePingId,
            user_id: targetUserId,
            expires_at: "2099-04-30T12:00:00.000Z",
            radius_miles: 0.01
          }]
        });
      }

      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    const displayKeyResponse = await app.inject({
      method: "GET",
      url: "/api/location/display-key",
      headers: {
        "x-user-id": userId
      }
    });
    const profile = response.json().data.profiles[0];
    const payload = decryptDisplayLocationTokenForTest({
      key: displayKeyResponse.json().data.key,
      token: profile.displayLocationToken
    });

    expect(profile.profileToken).toBe(targetUserId);
    expect(profile).not.toHaveProperty("lat");
    expect(profile).not.toHaveProperty("lng");
    expect(profile).not.toHaveProperty("ghostRadiusMeters");
    expect(profile.activePing).toBeNull();
    expect(payload.displayMode).toBe("GHOST");
    expect({ lat: payload.latE7 / 10_000_000, lng: payload.lonE7 / 10_000_000 })
      .not.toEqual({ lat: 40.711, lng: -74.002 });
  });

  it("allows free users to apply up to three seeking filter categories", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006&lookingFor=hookup&vibes=Goth&kinks=leather",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.some((call) => String(call[0]).includes("from user_entitlements"))).toBe(false);
    expect(query.mock.calls[1]?.[0]).toContain("from profiles");
    expect(response.json()).toMatchObject({
      data: {
        profiles: []
      }
    });
  });

  it("does not issue discovery location tokens outside the launch area", async () => {
    const targetUserId = "4d9ae00c-d3e1-4adf-b2b1-e7ddc2f78b82";
    const targetLocation = await encryptedLocationEnvelopeRow({
      subjectUserId: targetUserId,
      lat: 42.3601,
      lng: -71.0589,
      accuracyM: 50
    });

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("join encrypted_location_envelopes")) {
        return Promise.resolve({
          rows: [{
            id: targetUserId,
            display_name: "Outside",
            lat: 42.3601,
            lng: -71.0589,
            fuzzy_lat: 42.3601,
            fuzzy_lng: -71.0589,
            updated_at: "2026-04-28T12:00:00.000Z"
          }]
        });
      }

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({ rows: [targetLocation] });
      }

      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.profiles).toEqual([]);
  });

  it("requires cruush+ before applying more than three seeking filter categories", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: false,
        cruush_plus_expires_at: null
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006&lookingFor=hookup&vibes=Goth&kinks=leather&roles=dominant",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(402);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("from user_entitlements");
    expect(response.json()).toEqual({
      error: {
        code: "CRUUSH_PLUS_REQUIRED",
        message: "Upgrade to cruush+ to use all seeking filters.",
        details: null
      }
    });
  });

  it("honors a bounded discovery limit on GET /api/users", async () => {
    const targetRows = Array.from({ length: 25 }, (_, index) => ({
      id: `seeded-user-${index + 1}`,
      display_name: `Seeded ${index + 1}`,
      year_of_birth: 1998,
      pronouns: ["they/them"],
      looking_for: ["Testing"],
      vibes: ["Map pin"],
      position: ["Top"],
      hosting_travel: [],
      photos: [],
      lat: 40.711 + index / 1000,
      lng: -74.002 - index / 1000,
      fuzzy_lat: 40.7115 + index / 1000,
      fuzzy_lng: -74.0025 - index / 1000,
      updated_at: "2026-04-28T12:00:00.000Z"
    }));
    const locationRows = await Promise.all(targetRows.map((row) => encryptedLocationEnvelopeRow({
      subjectUserId: row.id,
      lat: row.lat,
      lng: row.lng,
      accuracyM: 50
    })));

    query.mockImplementation((sql: string) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("join encrypted_location_envelopes")) {
        return Promise.resolve({ rows: targetRows });
      }

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({ rows: locationRows });
      }

      if (normalizedSql.includes("from map_pings")) {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006&limit=20",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("limit $3");
    expect(query.mock.calls[1]?.[1]?.[0]).toBe(userId);
    expect(query.mock.calls[1]?.[1]?.[2]).toBe(20);
    expect(response.json().data.profiles).toHaveLength(20);
  });

  it("ghosts exactly half of seeded NPC discovery profiles when the codeveloper dev demo flag is enabled", async () => {
    const seededRows = Array.from({ length: 20 }, (_, index) => {
      const seedNumber = index + 1;
      return {
        id: `00000000-0000-4000-8000-${String(seedNumber).padStart(12, "0")}`,
        email: `test-cruush-${String(seedNumber).padStart(2, "0")}@cruush.local`,
        display_name: `Test cruush ${seedNumber}`,
        year_of_birth: 1998,
        pronouns: ["they/them"],
        looking_for: ["Testing"],
        vibes: ["Map pin"],
        scenes: [],
        archetypes: [],
        position: ["Top"],
        role: [],
        hosting_travel: [],
        photos: [],
        identities: [],
        presentation: [],
        sexuality: [],
        body_type: [],
        availability: [],
        hobbies: [],
        substance_boundaries: [],
        profile_sensitive_ciphertext: null,
        profile_sensitive_nonce: null,
        profile_sensitive_auth_tag: null,
        profile_sensitive_key_version: "v1",
        profile_visibility_ciphertext: null,
        profile_visibility_nonce: null,
        profile_visibility_auth_tag: null,
        profile_visibility_key_version: "v1",
        lat: null,
        lng: null,
        fuzzy_lat: null,
        fuzzy_lng: null,
        updated_at: "2026-04-28T12:00:00.000Z"
      };
    });
    const nonNpcRow = {
      ...seededRows[0],
      id: "00000000-0000-4000-8000-000000000099",
      email: "real-user@example.com",
      display_name: "Real Nearby"
    };
    const profileRows = [...seededRows, nonNpcRow];
    const locationRows = await Promise.all(profileRows.map((row, index) => encryptedLocationEnvelopeRow({
      subjectUserId: row.id,
      lat: 40.7128 + index * 0.0001,
      lng: -74.006 - index * 0.0001,
      accuracyM: 25
    })));

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from profiles") && normalizedSql.includes("join app_users")) {
        return Promise.resolve({ rows: profileRows });
      }

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({ rows: locationRows });
      }

      if (normalizedSql.includes("from app_users")) {
        return Promise.resolve({
          rows: [{
            email: "codeveloper-nyc@cruush.local"
          }]
        });
      }

      if (normalizedSql.includes("insert into ghost_rotation_tokens")) {
        return Promise.resolve({ rows: [{ subject_user_id: String(params[0]) }] });
      }

      return Promise.resolve({ rows: [] });
    });

    const displayKeyResponse = await app.inject({
      method: "GET",
      url: "/api/location/display-key",
      headers: {
        "x-user-id": userId
      }
    });
    const displayKey = displayKeyResponse.json().data;
    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006&limit=50&npcGhostDemo=1",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const profiles = body.data.profiles as Array<{
      profileToken: string;
      displayLocationToken: Parameters<typeof decryptDisplayLocationTokenForTest>[0]["token"];
      demoDisplayMode?: "NPC_GHOST_TEST";
    }>;
    const payloadsById = new Map(profiles.map((profile) => [
      profile.profileToken,
      decryptDisplayLocationTokenForTest({
        key: displayKey.key,
        token: profile.displayLocationToken
      })
    ]));
    const seededPayloads = seededRows.map((row) => payloadsById.get(row.id));
    const ghostedSeedNumbers = seededRows
      .filter((row) => payloadsById.get(row.id)?.displayMode === "GHOST")
      .map((row) => Number(row.email.match(/test-cruush-(\d{2})/)?.[1]));
    const preciseSeedNumbers = seededRows
      .filter((row) => payloadsById.get(row.id)?.displayMode === "PRECISE")
      .map((row) => Number(row.email.match(/test-cruush-(\d{2})/)?.[1]));
    const profilesById = new Map(profiles.map((profile) => [profile.profileToken, profile]));
    const demoTaggedSeedNumbers = seededRows
      .filter((row) => profilesById.get(row.id)?.demoDisplayMode === "NPC_GHOST_TEST")
      .map((row) => Number(row.email.match(/test-cruush-(\d{2})/)?.[1]));

    expect(profiles).toHaveLength(21);
    expect(seededPayloads).toHaveLength(20);
    expect(ghostedSeedNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(preciseSeedNumbers).toEqual([]);
    expect(demoTaggedSeedNumbers).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(profilesById.get(nonNpcRow.id)?.demoDisplayMode).toBeUndefined();
    expect(payloadsById.get(nonNpcRow.id)?.displayMode).toBe("GHOST");
    expect(JSON.stringify(body)).not.toContain("@cruush.local");
    expect(JSON.stringify(body)).not.toContain("real-user@example.com");
    for (const profile of profiles) {
      expect(profile).not.toHaveProperty("lat");
      expect(profile).not.toHaveProperty("lng");
      expect(profile).not.toHaveProperty("ghost_mode_enabled");
      expect(profile).not.toHaveProperty("ghostRadiusMeters");
      expect(profile).not.toHaveProperty("email");
    }
    expect(query.mock.calls.some(([sql]) => {
      const normalizedSql = String(sql).toLowerCase();
      return (
        (/\binsert\b/.test(normalizedSql) || /\bupdate\b/.test(normalizedSql)) &&
        normalizedSql.includes("user_privacy_settings")
      );
    })).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).toLowerCase().includes("insert into encrypted_visibility_tokens"))).toBe(true);
  });

  it("ignores the NPC Ghost demo flag for non-admin discovery users", async () => {
    const evenNpcRow = {
      id: "00000000-0000-4000-8000-000000000002",
      email: "test-cruush-02@cruush.local",
      display_name: "Test cruush 2",
      year_of_birth: 1998,
      pronouns: ["they/them"],
      looking_for: ["Testing"],
      vibes: ["Map pin"],
      scenes: [],
      archetypes: [],
      position: ["Top"],
      role: [],
      hosting_travel: [],
      photos: [],
      identities: [],
      presentation: [],
      sexuality: [],
      body_type: [],
      availability: [],
      hobbies: [],
      substance_boundaries: [],
      profile_sensitive_ciphertext: null,
      profile_sensitive_nonce: null,
      profile_sensitive_auth_tag: null,
      profile_sensitive_key_version: "v1",
      profile_visibility_ciphertext: null,
      profile_visibility_nonce: null,
      profile_visibility_auth_tag: null,
      profile_visibility_key_version: "v1",
      lat: null,
      lng: null,
      fuzzy_lat: null,
      fuzzy_lng: null,
      updated_at: "2026-04-28T12:00:00.000Z"
    };
    const locationRow = await encryptedLocationEnvelopeRow({
      subjectUserId: evenNpcRow.id,
      lat: 40.7128,
      lng: -74.006,
      accuracyM: 25
    });

    query.mockImplementation((sql: string) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from app_users")) {
        return Promise.resolve({
          rows: [{
            email: "bank-reviewer-nyc@cruush.local"
          }]
        });
      }

      if (normalizedSql.includes("join encrypted_location_envelopes")) {
        return Promise.resolve({ rows: [evenNpcRow] });
      }

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({ rows: [locationRow] });
      }

      return Promise.resolve({ rows: [] });
    });

    const displayKeyResponse = await app.inject({
      method: "GET",
      url: "/api/location/display-key",
      headers: {
        "x-user-id": userId
      }
    });
    const displayKey = displayKeyResponse.json().data;
    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006&npcGhostDemo=1",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    const profile = response.json().data.profiles[0];
    const payload = decryptDisplayLocationTokenForTest({
      key: displayKey.key,
      token: profile.displayLocationToken
    });

    expect(payload.displayMode).toBe("GHOST");
    expect(profile.demoDisplayMode).toBeUndefined();
    expect(query.mock.calls.some(([sql]) => String(sql).toLowerCase().includes("insert into ghost_rotation_tokens"))).toBe(true);
  });

  it("ignores the NPC Ghost demo flag in production discovery", async () => {
    const sessionToken = generateSessionToken();
    const cookie = createSessionCookie(sessionToken, {
      secure: true,
      expiresAt: new Date(Date.now() + 60_000)
    });
    const evenNpcRow = {
      id: "00000000-0000-4000-8000-000000000002",
      email: "test-cruush-02@cruush.local",
      display_name: "Test cruush 2",
      year_of_birth: 1998,
      pronouns: ["they/them"],
      looking_for: ["Testing"],
      vibes: ["Map pin"],
      scenes: [],
      archetypes: [],
      position: ["Top"],
      role: [],
      hosting_travel: [],
      photos: [],
      identities: [],
      presentation: [],
      sexuality: [],
      body_type: [],
      availability: [],
      hobbies: [],
      substance_boundaries: [],
      profile_sensitive_ciphertext: null,
      profile_sensitive_nonce: null,
      profile_sensitive_auth_tag: null,
      profile_sensitive_key_version: "v1",
      profile_visibility_ciphertext: null,
      profile_visibility_nonce: null,
      profile_visibility_auth_tag: null,
      profile_visibility_key_version: "v1",
      lat: null,
      lng: null,
      fuzzy_lat: null,
      fuzzy_lng: null,
      updated_at: "2026-04-28T12:00:00.000Z"
    };
    const locationRow = await encryptedLocationEnvelopeRow({
      subjectUserId: evenNpcRow.id,
      lat: 40.7128,
      lng: -74.006,
      accuracyM: 25
    });

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from app_sessions")) {
        return Promise.resolve({
          rows: params[0] === hashSessionToken(sessionToken)
            ? [{ user_id: userId, age_verified_at: "2026-04-28T12:00:00.000Z" }]
            : []
        });
      }

      if (normalizedSql.includes("join encrypted_location_envelopes")) {
        return Promise.resolve({ rows: [evenNpcRow] });
      }

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({ rows: [locationRow] });
      }

      return Promise.resolve({ rows: [] });
    });

    const displayKeyResponse = await productionApp.inject({
      method: "GET",
      url: "/api/location/display-key",
      headers: {
        cookie
      }
    });
    const displayKey = displayKeyResponse.json().data;
    const response = await productionApp.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006&npcGhostDemo=1",
      headers: {
        cookie
      }
    });

    expect(response.statusCode).toBe(200);
    const profile = response.json().data.profiles[0];
    const payload = decryptDisplayLocationTokenForTest({
      key: displayKey.key,
      token: profile.displayLocationToken
    });

    expect(payload.displayMode).toBe("GHOST");
    expect(profile.demoDisplayMode).toBeUndefined();
    expect(query.mock.calls.some(([sql]) => String(sql).toLowerCase().includes("insert into ghost_rotation_tokens"))).toBe(true);
  });

  it("marks active mutual cruushes and honors the target's precise-location preference", async () => {
    const matchedUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const otherUserId = "8f707f0b-81aa-470d-b0e1-321d493d04d2";
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-1",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: matchedUserId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-1",
      userOneId: userId,
      userTwoId: matchedUserId
    });
    let targetPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: matchedUserId,
      baseMode: "GHOST",
      preciseToMutualCruushes: true
    });
    const locationRows = await Promise.all([
      encryptedLocationEnvelopeRow({
        subjectUserId: matchedUserId,
        lat: 40.711,
        lng: -74.002,
        accuracyM: 50
      }),
      encryptedLocationEnvelopeRow({
        subjectUserId: otherUserId,
        lat: 40.712,
        lng: -74.003,
        accuracyM: 50
      })
    ]);
    const profileRows = [{
      id: matchedUserId,
      display_name: "Alex",
      year_of_birth: 1998,
      pronouns: ["they/them"],
      looking_for: ["Fun"],
      vibes: ["Chill"],
      position: ["Top"],
      hosting_travel: ["Can Host"],
      photos: ["https://example.com/alex.jpg"],
      lat: 40.711,
      lng: -74.002,
      fuzzy_lat: 40.7115,
      fuzzy_lng: -74.0025,
      updated_at: "2026-04-28T12:00:00.000Z"
    }, {
      id: otherUserId,
      display_name: "River",
      year_of_birth: 1997,
      pronouns: ["he/him"],
      looking_for: ["Dates"],
      vibes: ["Soft"],
      position: ["Bottom"],
      hosting_travel: [],
      photos: [],
      lat: 40.712,
      lng: -74.003,
      fuzzy_lat: 40.7125,
      fuzzy_lng: -74.0035,
      updated_at: "2026-04-28T11:00:00.000Z"
    }];

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from profiles") && normalizedSql.includes("join app_users")) {
        return Promise.resolve({ rows: profileRows });
      }

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({ rows: locationRows });
      }

      if (normalizedSql.includes("from encrypted_visibility_tokens")) {
        return Promise.resolve({ rows: params[0] === matchedUserId ? [targetPolicy] : [] });
      }

      if (normalizedSql.includes("from encrypted_relationship_records")) {
        return Promise.resolve({ rows: params[0] === matchRecord.record_lookup_index ? [matchRecord] : [] });
      }

      if (normalizedSql.includes("from encrypted_relationship_tokens")) {
        return Promise.resolve({ rows: params[0] === matchRecord.id ? [matchToken] : [] });
      }

      if (normalizedSql.includes("insert into ghost_rotation_tokens")) {
        return Promise.resolve({ rows: [{ subject_user_id: matchedUserId }] });
      }

      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    const displayKeyResponse = await app.inject({
      method: "GET",
      url: "/api/location/display-key",
      headers: {
        "x-user-id": userId
      }
    });
    const matchedProfile = response.json().data.profiles[0];
    const matchedLocation = decryptDisplayLocationTokenForTest({
      key: displayKeyResponse.json().data.key,
      token: matchedProfile.displayLocationToken
    });

    expect(matchedLocation).toMatchObject({
      displayMode: "PRECISE",
      latE7: 407110000,
      lonE7: -740020000
    });
    expect(response.json().data.profiles).toEqual([
      expect.objectContaining({
        profileToken: matchedUserId,
        relationship: expect.objectContaining({
          mutualCruush: true,
          canMessage: true
        })
      }),
      expect.objectContaining({
        profileToken: otherUserId,
        relationship: expect.objectContaining({
          mutualCruush: false,
          canMessage: false
        })
      })
    ]);

    targetPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: matchedUserId,
      baseMode: "GHOST",
      preciseToMutualCruushes: false
    });
    const privateResponse = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });
    const privateMatchedProfile = privateResponse.json().data.profiles[0];
    const privateMatchedLocation = decryptDisplayLocationTokenForTest({
      key: displayKeyResponse.json().data.key,
      token: privateMatchedProfile.displayLocationToken
    });

    expect(privateResponse.statusCode).toBe(200);
    expect(privateMatchedLocation.displayMode).toBe("GHOST");
    expect({
      latE7: privateMatchedLocation.latE7,
      lonE7: privateMatchedLocation.lonE7
    }).not.toEqual({
      latE7: 407110000,
      lonE7: -740020000
    });
    expect(privateMatchedProfile.relationship).toMatchObject({
      mutualCruush: true,
      precision: "fuzzy"
    });
  });

  it("rejects discovery limits above the backend cap", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/users?limit=501",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects unknown discovery query parameters before querying users", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/users?debug=true",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("matches Dyke discovery crowd filters against legacy Sapphic blind tokens", async () => {
    query.mockResolvedValue({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006&crowds=Dyke",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    const discoveryCall = query.mock.calls.find(([sql]) => String(sql).includes("from profile_sensitive_tokens pst"));
    const tokenHashes = discoveryCall?.[1]?.[2] as string[] | undefined;
    const expectedTokenHashes = createCrowdTokens(app.config, ["Dyke"]).map((token) => token.token_hash);

    expect(tokenHashes).toEqual(expect.arrayContaining(expectedTokenHashes));
    expect(tokenHashes).toHaveLength(expectedTokenHashes.length);
  });

  it("filters discovery by the current user's active crowd modes", async () => {
    const viewerVisibility = encryptProfileVisibility(app.config, {
      ...emptyProfile.visibility_rules,
      active_crowd_modes: ["T4T"]
    });
    const viewerSensitive = encryptSensitiveProfile(app.config, {
      is_trans: true,
      crowds: ["T4T"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });
    const t4tSensitive = encryptSensitiveProfile(app.config, {
      is_trans: true,
      crowds: ["T4T"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });
    const t4tVisibility = encryptProfileVisibility(app.config, {
      ...emptyProfile.visibility_rules,
      active_crowd_modes: ["T4T"],
      distance: 5
    });
    const dykeSensitive = encryptSensitiveProfile(app.config, {
      is_trans: false,
      crowds: ["Dyke"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });
    const locationRows = await Promise.all([
      encryptedLocationEnvelopeRow({
        subjectUserId: "t4t-user",
        lat: 40.711,
        lng: -74.002,
        accuracyM: 50
      }),
      encryptedLocationEnvelopeRow({
        subjectUserId: "dyke-user",
        lat: 40.711,
        lng: -74.002,
        accuracyM: 50
      })
    ]);
    const t4tPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: "t4t-user",
      baseMode: "PUBLIC_PRECISE"
    });

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({ rows: locationRows });
      }

      if (normalizedSql.includes("from map_pings")) {
        return Promise.resolve({ rows: [] });
      }

      if (normalizedSql.includes("insert into encrypted_visibility_tokens") ||
          normalizedSql.includes("insert into ghost_rotation_tokens")) {
        return Promise.resolve({ rows: [{ subject_user_id: params[0] }] });
      }

      if (normalizedSql.includes("from encrypted_visibility_tokens")) {
        return Promise.resolve({ rows: params[0] === "t4t-user" ? [t4tPolicy] : [] });
      }

      if (normalizedSql.startsWith("select true as exists from user_blocks")) {
        return Promise.resolve({ rows: [] });
      }

      if (normalizedSql.includes("from encrypted_relationship_records") ||
          normalizedSql.includes("from encrypted_relationship_tokens") ||
          normalizedSql.includes("from encrypted_privacy_audit_events") ||
          normalizedSql.includes("from ghost_rotation_tokens")) {
        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("profile_visibility_ciphertext") && sql.includes("where id = $1")) {
        return Promise.resolve({
          rows: [{
            year_of_birth: 1994,
            identities: [],
            presentation: [],
            sexuality: [],
            body_type: [],
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
            substance_boundaries: [],
            lat: 40.7128,
            lng: -74.006,
            fuzzy_lat: 40.7128,
            fuzzy_lng: -74.006,
            ...viewerSensitive,
            ...viewerVisibility
          }]
        });
      }

      return Promise.resolve({
        rows: [
          {
            id: "t4t-user",
            display_name: "T4T Alex",
            year_of_birth: 1998,
            pronouns: ["they/them"],
            looking_for: ["Fun"],
            vibes: ["Chill"],
            scenes: [],
            archetypes: [],
            position: ["Top"],
            role: [],
            hosting_travel: ["Can Host"],
            photos: ["https://example.com/t4t.jpg"],
            lat: 40.711,
            lng: -74.002,
            fuzzy_lat: 40.7115,
            fuzzy_lng: -74.0025,
            ...t4tSensitive,
            ...t4tVisibility,
            updated_at: "2026-04-28T12:00:00.000Z"
          },
          {
            id: "dyke-user",
            display_name: "Dyke River",
            year_of_birth: 1998,
            pronouns: ["she/her"],
            looking_for: ["Fun"],
            vibes: ["Chill"],
            scenes: [],
            archetypes: [],
            position: ["Top"],
            role: [],
            hosting_travel: ["Can Host"],
            photos: ["https://example.com/dyke.jpg"],
            lat: 40.711,
            lng: -74.002,
            fuzzy_lat: 40.7115,
            fuzzy_lng: -74.0025,
            ...dykeSensitive,
            profile_visibility_ciphertext: null,
            profile_visibility_nonce: null,
            profile_visibility_auth_tag: null,
            profile_visibility_key_version: "v1",
            updated_at: "2026-04-28T12:00:00.000Z"
          }
        ]
      });
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.profiles.map((user: { profileToken: string }) => user.profileToken)).toEqual(["t4t-user"]);
    const viewerProfileQuery = query.mock.calls.find(([sql]) =>
      String(sql).includes("profile_visibility_ciphertext") && String(sql).includes("where id = $1")
    );
    expect(viewerProfileQuery?.[0]).toContain("fuzzy_lat");
    expect(viewerProfileQuery?.[0]).not.toContain("null::double precision as fuzzy_lat");
  });

  it("returns an empty array when no nearby profiles have stored coordinates", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        mapEpochMs: expect.any(Number),
        profiles: []
      }
    });
  });

  it("falls back to the legacy profile schema on GET /api/users", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce({
        code: "42703",
        message: 'column "year_of_birth" does not exist'
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "27",
          display_name: "Jordan",
          age: 29,
          pronouns: "they/them",
          looking_for: ["Fun", "Dates"],
          legacy_vibe_tags: ["Goth"],
          primary_photo_url: "https://example.com/jordan.jpg",
          last_active: "2026-04-28T12:00:00.000Z",
          lat: 40.71,
          lng: -74.0,
          fuzzy_lat: 40.7105,
          fuzzy_lng: -74.0005
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls[2]?.[0]).toContain("tribes as legacy_vibe_tags");
    expect(query.mock.calls[2]?.[0]).toContain("where last_active >= now() - interval '4 days'");

    expect(response.json()).toEqual({
      data: expect.objectContaining({
        mapEpochMs: expect.any(Number),
        profiles: expect.arrayContaining([
        expect.objectContaining({
          profileToken: "27",
          name: "Jordan",
          display_name: "Jordan",
          age: 29,
          pronouns: "they/them",
          lookingFor: ["Fun", "Dates"],
          vibes: ["Goth"],
          position: [],
          hostingTravel: [],
          photo: "https://example.com/jordan.jpg"
        })
      ])
      })
    });
  });

  it("keeps Stealth users out of legacy discovery fallback results", async () => {
    const legacyUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const stealthPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: legacyUserId,
      baseMode: "STEALTH"
    });

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from profiles") && normalizedSql.includes("where id = $1")) {
        return Promise.resolve({ rows: [] });
      }
      if (normalizedSql.includes("from profiles") && normalizedSql.includes("join app_users")) {
        return Promise.reject({ code: "42703", message: 'column "year_of_birth" does not exist' });
      }
      if (normalizedSql.includes("tribes as legacy_vibe_tags")) {
        return Promise.resolve({
          rows: [{
            id: legacyUserId,
            display_name: "Hidden Jordan",
            age: 29,
            pronouns: "they/them",
            looking_for: ["Fun"],
            legacy_vibe_tags: ["Goth"],
            primary_photo_url: null,
            last_active: "2026-04-28T12:00:00.000Z",
            lat: 40.71,
            lng: -74.0,
            fuzzy_lat: 40.7105,
            fuzzy_lng: -74.0005
          }]
        });
      }
      if (normalizedSql.includes("from encrypted_visibility_tokens")) {
        return Promise.resolve({ rows: params[0] === legacyUserId ? [stealthPolicy] : [] });
      }
      if (normalizedSql.includes("from user_entitlements")) {
        return Promise.resolve({
          rows: [{
            cruush_plus_enabled: true,
            cruush_plus_expires_at: null
          }]
        });
      }

      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.profiles).toEqual([]);
  });

  it("restores a legacy discovery profile when its saved Stealth policy outlives cruush+", async () => {
    const legacyUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const retainedStealthPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: legacyUserId,
      baseMode: "STEALTH"
    });

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from profiles") && normalizedSql.includes("where id = $1")) {
        return Promise.resolve({ rows: [] });
      }
      if (normalizedSql.includes("from profiles") && normalizedSql.includes("join app_users")) {
        return Promise.reject({ code: "42703", message: 'column "year_of_birth" does not exist' });
      }
      if (normalizedSql.includes("tribes as legacy_vibe_tags")) {
        return Promise.resolve({
          rows: [{
            id: legacyUserId,
            display_name: "Visible Jordan",
            age: 29,
            pronouns: "they/them",
            looking_for: ["Fun"],
            legacy_vibe_tags: ["Goth"],
            primary_photo_url: null,
            last_active: "2026-04-28T12:00:00.000Z",
            lat: 40.71,
            lng: -74.0,
            fuzzy_lat: 40.7105,
            fuzzy_lng: -74.0005
          }]
        });
      }
      if (normalizedSql.includes("from encrypted_visibility_tokens")) {
        return Promise.resolve({ rows: params[0] === legacyUserId ? [retainedStealthPolicy] : [] });
      }
      if (normalizedSql.includes("from user_entitlements")) {
        return Promise.resolve({
          rows: [{
            cruush_plus_enabled: false,
            cruush_plus_expires_at: "2026-08-11T12:00:00.000Z"
          }]
        });
      }

      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.profiles).toEqual([
      expect.objectContaining({
        profileToken: legacyUserId,
        name: "Visible Jordan"
      })
    ]);
  });

  it("keeps Ghost location rendering in legacy discovery fallback results", async () => {
    const legacyUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const ghostPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: legacyUserId,
      baseMode: "GHOST"
    });

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from profiles") && normalizedSql.includes("where id = $1")) {
        return Promise.resolve({ rows: [] });
      }
      if (normalizedSql.includes("from profiles") && normalizedSql.includes("join app_users")) {
        return Promise.reject({ code: "42703", message: 'column "year_of_birth" does not exist' });
      }
      if (normalizedSql.includes("tribes as legacy_vibe_tags")) {
        return Promise.resolve({
          rows: [{
            id: legacyUserId,
            display_name: "Ghost Jordan",
            age: 29,
            pronouns: "they/them",
            looking_for: ["Fun"],
            legacy_vibe_tags: ["Goth"],
            primary_photo_url: null,
            last_active: "2026-04-28T12:00:00.000Z",
            lat: 40.71,
            lng: -74.0,
            fuzzy_lat: 40.7105,
            fuzzy_lng: -74.0005
          }]
        });
      }
      if (normalizedSql.includes("from encrypted_visibility_tokens")) {
        return Promise.resolve({ rows: params[0] === legacyUserId ? [ghostPolicy] : [] });
      }
      if (normalizedSql.includes("insert into ghost_rotation_tokens")) {
        return Promise.resolve({ rows: [{ subject_user_id: legacyUserId }] });
      }

      return Promise.resolve({ rows: [] });
    });

    const displayKeyResponse = await app.inject({
      method: "GET",
      url: "/api/location/display-key",
      headers: { "x-user-id": userId }
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: { "x-user-id": userId }
    });
    const profile = response.json().data.profiles[0];
    const payload = decryptDisplayLocationTokenForTest({
      key: displayKeyResponse.json().data.key,
      token: profile.displayLocationToken
    });

    expect(response.statusCode).toBe(200);
    expect(profile.profileToken).toBe(legacyUserId);
    expect(payload.displayMode).toBe("GHOST");
    expect(profile.distanceLabel).toBe("Nearby");
  });

  it("requires the temporary x-user-id header on GET /api/posts", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/posts"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
        details: expect.any(Object)
      }
    });
  });

  it("returns the local feed from GET /api/posts", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          age_verified_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "post-1",
          user_id: userId,
          content: "Looking now",
          expires_in: "6h",
          expires_at: "2026-04-28T18:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          display_name: "Cruusher",
          pronouns: ["they/them"],
          photos: ["https://example.com/photo.jpg"],
          feed_tags: ["hosting"]
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/posts",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(query.mock.calls[1]?.[0]).toContain("from posts p");
    expect(query.mock.calls[1]?.[0]).toContain("join profiles pr on pr.id = p.user_id");
    expect(query.mock.calls[1]?.[0]).toContain("lower(trim(coalesce(pr.display_name, ''))) <> 'user deleted profile'");
    expect(query.mock.calls[1]?.[0]).toContain("p.map_ping_id");
    expect(response.json()).toEqual({
      data: [{
        id: "post-1",
        content: "Looking now",
        expiresIn: "6h",
        expiresAt: "2026-04-28T18:00:00.000Z",
        createdAt: "2026-04-28T12:00:00.000Z",
        audience: "public",
        distance: "Nearby",
        tags: ["hosting"],
        user: {
          id: userId,
          name: "Cruusher",
          pronouns: "they/them",
          photo: "https://example.com/photo.jpg",
          photoExplicit: false,
          canMessage: false
        }
      }]
    });
  });

  it("returns Ping feed posts through normal feed privacy without exposing their internal Ping link", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ user_id: userId, age_verified_at: "2026-04-28T12:00:00.000Z" }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "post-ping-1",
          user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          content: "Coffee now",
          expires_in: "24h",
          expires_at: "2026-08-10T18:00:00.000Z",
          created_at: "2026-08-09T18:00:00.000Z",
          display_name: "Nearby person",
          pronouns: ["they/them"],
          photos: [],
          map_ping_id: "10000000-0000-4000-8000-000000000001",
          distance_miles: 0.4,
          feed_location_pin_visibility: "public",
          has_live_location: true
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/posts",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(200);
    const feedSql = String(query.mock.calls[1]?.[0]);
    expect(feedSql).toContain("p.map_ping_id");
    expect(feedSql).toContain("from user_blocks block");
    expect(feedSql).not.toContain("notification.dedupe_key = 'map-ping:'");
    expect(response.json()).toEqual({
      data: [{
        id: "post-ping-1",
        content: "Coffee now",
        expiresIn: "24h",
        expiresAt: "2026-08-10T18:00:00.000Z",
        createdAt: "2026-08-09T18:00:00.000Z",
        audience: "public",
        distance: "<1 mi",
        locationPin: {
          userId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          visibility: "public"
        },
        tags: [],
        user: {
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          name: "Nearby person",
          pronouns: "they/them",
          photo: null,
          photoExplicit: false,
          canMessage: false
        }
      }]
    });
    expect(JSON.stringify(response.json())).not.toMatch(/mapPingId|radiusMiles/i);
  });

  it("filters blocked relationships from GET /api/posts at the query boundary", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          age_verified_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/posts",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("from user_blocks block");
    expect(query.mock.calls[1]?.[0]).toContain("blocker_user_id = $1");
    expect(query.mock.calls[1]?.[0]).toContain("blocked_user_id = p.user_id");
    expect(query.mock.calls[1]?.[1]).toEqual([userId, "7d", null, null, 50, null, 30]);
  });

  it("filters crowd-targeted posts by the reader's crowd memberships at the query boundary", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          age_verified_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/posts",
      cookies: {
        cruush_session: "test-session-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain("feed_post_crowd_targets target");
    expect(query.mock.calls[1]?.[0]).toContain("profile_sensitive_tokens viewer_crowd_token");
    expect(query.mock.calls[1]?.[0]).toContain("viewer_crowd_token.user_id = $1");
  });

  it("persists the feed expiry choice used by future Pings", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ cruush_plus_enabled: true, cruush_plus_expires_at: null }]
      })
      .mockResolvedValueOnce({
        rows: [{
          feed_location_pin_visibility: "mutuals",
          feed_show_distance_labels: true,
          feed_post_expiry_default: "24h"
        }]
      });

    const response = await app.inject({
      method: "PUT",
      url: "/api/feed/settings",
      headers: {
        "x-user-id": userId
      },
      payload: {
        locationPinVisibility: "mutuals",
        showDistanceLabels: true,
        postExpiryDefault: "24h"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[1]?.[0]).toContain(
      "feed_post_expiry_default = coalesce($4::text, user_privacy_settings.feed_post_expiry_default)"
    );
    expect(query.mock.calls[1]?.[1]).toEqual([userId, "mutuals", true, "24h", null]);
    expect(response.json()).toEqual({
      data: {
        locationPinVisibility: "mutuals",
        showDistanceLabels: true,
        postExpiryDefault: "24h",
        feedWindow: "7d"
      }
    });
  });

  it("returns the persisted feed expiry choice on another page or device", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        feed_location_pin_visibility: "off",
        feed_show_distance_labels: false,
        feed_post_expiry_default: "7d"
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/feed/settings",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        locationPinVisibility: "off",
        showDistanceLabels: false,
        postExpiryDefault: "7d",
        feedWindow: "7d"
      }
    });
  });

  it("preserves the saved feed expiry when a legacy settings payload omits it", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        feed_location_pin_visibility: "public",
        feed_show_distance_labels: false,
        feed_post_expiry_default: "24h"
      }]
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/feed/settings",
      headers: {
        "x-user-id": userId
      },
      payload: {
        locationPinVisibility: "public",
        showDistanceLabels: false
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain(
      "feed_post_expiry_default = coalesce($4::text, user_privacy_settings.feed_post_expiry_default)"
    );
    expect(query.mock.calls[0]?.[1]).toEqual([userId, "public", false, null, null]);
    expect(response.json().data.postExpiryDefault).toBe("24h");
  });

  it("validates the payload on POST /api/posts", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: "",
        expiresIn: "2h"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
  });

  it("creates a post on POST /api/posts for a member without cruush+", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          cruush_plus_enabled: false,
          cruush_plus_expires_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "post-2",
          user_id: userId,
          content: "Hosting tonight",
          audience: "public",
          expires_in: "never",
          expires_at: "infinity",
          created_at: "2026-04-28T12:10:00.000Z",
          display_name: "Cruusher",
          pronouns: ["they/them"],
          photos: []
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: "Hosting tonight",
        expiresIn: "never"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2]?.[0]).toContain("insert into posts");
    expect(query.mock.calls[2]?.[0]).toContain("content_ciphertext");
    expect(query.mock.calls[2]?.[0]).toContain("'[encrypted]'");
    expect(query.mock.calls[2]?.[1]).not.toContain("Hosting tonight");
    expect(decryptTextContent(app.config, "feed", {
      ciphertext: String(query.mock.calls[2]?.[1]?.[2]),
      nonce: String(query.mock.calls[2]?.[1]?.[3]),
      authTag: String(query.mock.calls[2]?.[1]?.[4]),
      keyVersion: String(query.mock.calls[2]?.[1]?.[5])
    })).toBe("Hosting tonight");
    expect(response.json()).toEqual({
      data: {
        id: "post-2",
        content: "Hosting tonight",
        expiresIn: "never",
        expiresAt: null,
        createdAt: "2026-04-28T12:10:00.000Z",
        audience: "public",
        distance: "Nearby",
        tags: [],
        user: {
          id: userId,
          name: "Cruusher",
          pronouns: "they/them",
          photo: null,
          photoExplicit: false,
          canMessage: false
        }
      }
    });
  });

  it("keeps custom Feed timers behind cruush+", async () => {
    query.mockResolvedValueOnce({
      rows: [{ cruush_plus_enabled: false, cruush_plus_expires_at: null }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: { "x-user-id": userId },
      payload: {
        content: "One hour only",
        expiresIn: "1h",
        audience: "public"
      }
    });

    expect(response.statusCode).toBe(402);
    expect(response.json().error).toMatchObject({
      code: "CRUUSH_PLUS_REQUIRED",
      message: "Choosing a Feed timer is part of cruush+."
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("keeps Feed photo posts behind cruush+", async () => {
    query.mockResolvedValueOnce({
      rows: [{ cruush_plus_enabled: false, cruush_plus_expires_at: null }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: { "x-user-id": userId },
      payload: {
        content: "Photo post",
        expiresIn: "never",
        audience: "public",
        photoMediaIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]
      }
    });

    expect(response.statusCode).toBe(402);
    expect(response.json().error).toMatchObject({
      code: "CRUUSH_PLUS_REQUIRED",
      message: "Photo posts are part of cruush+."
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects Feed photo assets that are not approved, owned, and unattached", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ cruush_plus_enabled: true, cruush_plus_expires_at: null }]
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: { "x-user-id": userId },
      payload: {
        content: "Photo post",
        expiresIn: "never",
        audience: "public",
        photoMediaIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Choose up to three approved Feed photos that you uploaded."
    });
    expect(query.mock.calls[1]?.[0]).toContain("media.owner_user_id = $1");
    expect(query.mock.calls[1]?.[0]).toContain("media.moderation_status = 'approved'");
    expect(query.mock.calls[1]?.[0]).toContain("from feed_post_attachments attachment");
  });

  it("attaches approved Feed photos to a cruush+ post in request order", async () => {
    const photoId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    query
      .mockResolvedValueOnce({
        rows: [{ cruush_plus_enabled: true, cruush_plus_expires_at: null }]
      })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "post-photo",
          user_id: userId,
          content: "Photo post",
          audience: "public",
          expires_in: "never",
          expires_at: "infinity",
          created_at: "2026-04-28T12:10:00.000Z",
          feed_photos: [{ id: photoId, explicit: true }],
          display_name: "Cruusher",
          pronouns: ["they/them"],
          photos: []
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: { "x-user-id": userId },
      payload: {
        content: "Photo post",
        expiresIn: "never",
        audience: "public",
        photoMediaIds: [photoId]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[3]?.[0]).toContain("insert into feed_post_attachments");
    expect(query.mock.calls[3]?.[0]).toContain("with ordinality");
    expect(query.mock.calls[3]?.[1]?.[17]).toEqual([photoId]);
    expect(response.json().data.photos).toEqual([{
      id: photoId,
      url: `/api/media/assets/${photoId}/display`,
      thumbnailUrl: `/api/media/assets/${photoId}/thumbnail`,
      explicit: true
    }]);
  });

  it("keeps a specific Crowd Feed audience behind cruush+", async () => {
    query.mockResolvedValueOnce({
      rows: [{ cruush_plus_enabled: false, cruush_plus_expires_at: null }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: { "x-user-id": userId },
      payload: {
        content: "For one crowd",
        expiresIn: "never",
        audience: "crowd",
        crowdTargets: ["Dyke"]
      }
    });

    expect(response.statusCode).toBe(402);
    expect(response.json().error).toMatchObject({
      code: "CRUUSH_PLUS_REQUIRED",
      message: "Posting to a specific Crowd is part of cruush+."
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("creates feed posts with seven-day and never expiry options", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          cruush_plus_enabled: true,
          cruush_plus_expires_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "post-seven-days",
          user_id: userId,
          content: "Staying up for a week",
          expires_in: "7d",
          expires_at: "2026-05-05T12:00:00.000Z",
          created_at: "2026-04-28T12:10:00.000Z",
          display_name: "Cruusher",
          pronouns: ["they/them"],
          photos: []
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          cruush_plus_enabled: true,
          cruush_plus_expires_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "post-never",
          user_id: userId,
          content: "Stays up",
          expires_in: "never",
          expires_at: "infinity",
          created_at: "2026-04-28T12:11:00.000Z",
          display_name: "Cruusher",
          pronouns: ["they/them"],
          photos: []
        }]
      });

    const sevenDayResponse = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: "Staying up for a week",
        expiresIn: "7d"
      }
    });

    const neverResponse = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: "Stays up",
        expiresIn: "never"
      }
    });

    expect(sevenDayResponse.statusCode).toBe(201);
    expect(neverResponse.statusCode).toBe(201);
    expect(query.mock.calls[2]?.[0]).toContain("when $2 = '7d' then interval '7 days'");
    expect(query.mock.calls[5]?.[0]).toContain("when $2 = 'never' then 'infinity'::timestamptz");
    expect(query.mock.calls[2]?.[1]?.[1]).toBe("7d");
    expect(query.mock.calls[5]?.[1]?.[1]).toBe("never");
    expect(sevenDayResponse.json().data.expiresAt).toBe("2026-05-05T12:00:00.000Z");
    expect(neverResponse.json().data.expiresAt).toBeNull();
  });

  it.each([
    ["suspended", { account_suspended: true }, "FEED_POSTING_SUSPENDED"],
    ["low trust", { low_trust: true }, "FEED_POSTING_LOW_TRUST"],
    ["feature restricted", { feature_restricted: true }, "FEED_POSTING_RESTRICTED"],
    ["unknown eligibility failure", {}, "FEED_POSTING_UNAVAILABLE"]
  ] as const)("returns a distinct feed-post error for %s", async (_caseName, reason, code) => {
    query
      .mockResolvedValueOnce({
        rows: [{
          cruush_plus_enabled: true,
          cruush_plus_expires_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          trust_suspended: false,
          account_suspended: false,
          low_trust: false,
          feature_restricted: false,
          ...reason
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: "Hosting tonight",
        expiresIn: "1h"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe(code);
  });

  it("creates a Feed+ post for one specific Crowd only when the author belongs to it", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          cruush_plus_enabled: true,
          cruush_plus_expires_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "post-crowds",
          user_id: userId,
          content: "Hosting for the crowd",
          expires_in: "6h",
          expires_at: "2026-04-28T18:00:00.000Z",
          created_at: "2026-04-28T12:10:00.000Z",
          display_name: "Cruusher",
          pronouns: ["they/them"],
          photos: [],
          audience: "crowd",
          crowd_targets: ["Dyke"]
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: "Hosting for the crowd",
        expiresIn: "6h",
        audience: "crowd",
        crowdTargets: ["Dyke"]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[2]?.[0]).toContain("profile_sensitive_tokens author_crowd_token");
    expect(query.mock.calls[2]?.[0]).toContain("insert into feed_post_crowd_targets");
    expect(query.mock.calls[2]?.[1]).toContainEqual(["Dyke"]);
    expect(response.json().data.audience).toBe("crowd");
    expect(response.json().data.crowdTargets).toEqual(["Dyke"]);
  });

  it("deletes the current user's feed post on DELETE /api/posts/:postId", async () => {
    const postId = "7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2";
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: postId }] });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/posts/${postId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("delete from posts");
    expect(query.mock.calls[1]?.[0]).toContain("user_id = $1");
    expect(query.mock.calls[1]?.[1]).toEqual([userId, postId]);
  });

  it("does not delete another user's feed post on DELETE /api/posts/:postId", async () => {
    const postId = "7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2";
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/posts/${postId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Feed post not found.",
        details: null
      }
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("delete from posts");
    expect(query.mock.calls[1]?.[1]).toEqual([userId, postId]);
  });

  it("rejects prohibited feed content before storing a post", async () => {
    query.mockResolvedValue({ rows: [] });
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: true,
        cruush_plus_expires_at: null
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: "Selling meth delivery menu tonight",
        expiresIn: "1h"
      }
    });

    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "CONTENT_REJECTED",
        message: "This was not saved. Automated moderation flagged it for harm, hate, threats, nudity where it is not allowed, or illegal activity. Write to reports@cruush.app if you think this is wrong.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into posts"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into trust_events"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into suspensions"))).toBe(true);
  });

  it("rejects public coded drug language before storing a feed post", async () => {
    query.mockResolvedValue({ rows: [] });
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: true,
        cruush_plus_expires_at: null
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: "party later ❄️",
        expiresIn: "1h"
      }
    });

    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(400);
    expect(queries.some((sql) => sql.includes("insert into posts"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into feature_restrictions"))).toBe(true);
  });

  it("normalizes post text before storing it", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          cruush_plus_enabled: true,
          cruush_plus_expires_at: null
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "post-1",
          user_id: userId,
          content: "Hosting now",
          expires_in: "6h",
          expires_at: "2026-04-28T18:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          display_name: "Cruusher",
          pronouns: ["they/them"],
          photos: []
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      headers: {
        "x-user-id": userId
      },
      payload: {
        content: " \u0000Hosting\u0007 now\u0000 ",
        expiresIn: "6h"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[1]?.[1]).not.toContain("Hosting now");
    expect(query.mock.calls[1]?.[1]).not.toContain(" \u0000Hosting\u0007 now\u0000 ");
  });

  it("forbids reading another user's cruush activity", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/cruush/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "You can only access your own cruush activity.",
        details: null
      }
    });
  });

  it("rejects invalid cruush activity user ids before authorization checks", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/cruush/not-a-uuid",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
  });

  it("returns cruush activity from GET /api/cruush/:userId", async () => {
    const incomingRecord = await encryptedRelationshipRecordRow({
      id: "cruush-1",
      type: "cruush",
      actorUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      targetUserId: userId,
      createdAt: "2026-04-28T12:00:00.000Z"
    });
    const sentTargetUserId = "8f707f0b-81aa-470d-b0e1-321d493d04d2";
    const sentRecord = await encryptedRelationshipRecordRow({
      id: "cruush-2",
      type: "cruush",
      actorUserId: userId,
      targetUserId: sentTargetUserId,
      createdAt: "2026-04-28T12:05:00.000Z",
      targetSnapshot: {
        name: "Jordan",
        pronouns: "they/them",
        photo: null
      }
    });

    query
      .mockResolvedValueOnce({ rows: [incomingRecord] })
      .mockResolvedValueOnce({ rows: [sentRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          display_name: "Alex",
          pronouns: ["they/them"],
          photos: ["https://example.com/alex.jpg"],
          vibes: ["Artsy", "Chill"],
          scenes: ["Drag"],
          archetypes: [],
          ghost_mode_enabled: false
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: `/api/cruush/${userId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(17);
    expect(query.mock.calls[0]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[1]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[4]?.[0]).toContain("from profiles");
    expect(response.json()).toEqual({
      data: {
        received: [{
          id: "cruush-1",
          fromUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          toUserId: userId,
          createdAt: "2026-04-28T12:00:00.000Z",
          mutual: false,
          user: {
            id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg",
            photoExplicit: false,
            travelling: false,
            vibes: ["Artsy", "Chill", "Drag"]
          }
        }],
        sent: [{
          id: "cruush-2",
          fromUserId: userId,
          toUserId: sentTargetUserId,
          createdAt: "2026-04-28T12:05:00.000Z",
          mutual: false,
          user: {
            id: sentTargetUserId,
            name: "Jordan",
            pronouns: "they/them",
            photo: null,
            photoExplicit: false,
            travelling: false,
            vibes: []
          }
        }]
      }
    });
  });

  it("filters blocked users out of cruush activity", async () => {
    const incomingUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const sentTargetUserId = "8f707f0b-81aa-470d-b0e1-321d493d04d2";
    const incomingRecord = await encryptedRelationshipRecordRow({
      id: "blocked-incoming",
      type: "cruush",
      actorUserId: incomingUserId,
      targetUserId: userId,
      createdAt: "2026-04-28T12:00:00.000Z"
    });
    const sentRecord = await encryptedRelationshipRecordRow({
      id: "blocked-sent",
      type: "cruush",
      actorUserId: userId,
      targetUserId: sentTargetUserId,
      createdAt: "2026-04-28T12:05:00.000Z"
    });

    query
      .mockResolvedValueOnce({ rows: [incomingRecord] })
      .mockResolvedValueOnce({ rows: [sentRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          user_id: incomingUserId
        }, {
          user_id: sentTargetUserId
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: `/api/cruush/${userId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3]?.[0]).toContain("from user_blocks");
    expect(response.json()).toEqual({
      data: {
        received: [],
        sent: []
      }
    });
  });

  it("returns locked free activity from GET /api/cruush/me", async () => {
    const incomingOne = await encryptedRelationshipRecordRow({
      id: "incoming-1",
      type: "cruush",
      actorUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      targetUserId: userId,
      createdAt: "2026-04-28T12:00:00.000Z"
    });
    const incomingTwo = await encryptedRelationshipRecordRow({
      id: "incoming-2",
      type: "cruush",
      actorUserId: "8f707f0b-81aa-470d-b0e1-321d493d04d2",
      targetUserId: userId,
      createdAt: "2026-04-28T11:00:00.000Z"
    });
    const sentOne = await encryptedRelationshipRecordRow({
      id: "sent-1",
      type: "cruush",
      actorUserId: userId,
      targetUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      createdAt: "2026-04-28T12:05:00.000Z"
    });
    const viewOne = await encryptedRelationshipRecordRow({
      id: "view-1",
      type: "profile_view",
      actorUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      targetUserId: userId,
      createdAt: "2026-04-28T12:10:00.000Z",
      dedupeBucket: "2026-04-28T12:00:00.000Z"
    });
    const viewTwo = await encryptedRelationshipRecordRow({
      id: "view-2",
      type: "profile_view",
      actorUserId: "8f707f0b-81aa-470d-b0e1-321d493d04d2",
      targetUserId: userId,
      createdAt: "2026-04-28T11:10:00.000Z",
      dedupeBucket: "2026-04-28T11:00:00.000Z"
    });

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          lat: 40.7128,
          lng: -74.006,
          fuzzy_lat: 40.713,
          fuzzy_lng: -74.005,
          profile_sensitive_ciphertext: null,
          profile_sensitive_nonce: null,
          profile_sensitive_auth_tag: null,
          profile_sensitive_key_version: null
        }]
      })
      .mockResolvedValueOnce({ rows: [incomingOne, incomingTwo] })
      .mockResolvedValueOnce({ rows: [sentOne] })
      .mockResolvedValueOnce({ rows: [viewOne, viewTwo] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          display_name: "Alex",
          pronouns: ["they/them"],
          photos: ["https://example.com/alex.jpg"],
          vibes: ["Artsy", "Chill"],
          scenes: ["Drag"],
          archetypes: [],
          ghost_mode_enabled: false
        }, {
          id: "8f707f0b-81aa-470d-b0e1-321d493d04d2",
          display_name: "Sam",
          pronouns: ["she/they"],
          photos: [],
          vibes: ["Soft", "Goth", "Geek"],
          scenes: [],
          archetypes: [],
          ghost_mode_enabled: false
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/cruush/me",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        entitlement: {
          cruushPlus: false,
          expiresAt: null,
          ownerFullAccess: false
        },
        counts: {
          incoming: 2,
          sent: 1,
          mutual: 0,
          views: 2
        },
        incoming: [{
          id: "incoming-1",
          createdAt: "2026-04-28T12:00:00.000Z",
          mutual: false,
          locked: false,
          permissions: {
            canMessage: true,
            canRevealPreciseLocation: false,
            matchId: null
          },
          user: {
            id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg",
            photoExplicit: false,
            travelling: false,
            vibes: ["Artsy", "Chill", "Drag"]
          }
        }, {
          id: "incoming-2",
          createdAt: "2026-04-28T11:00:00.000Z",
          mutual: false,
          locked: true,
          permissions: {
            canMessage: true,
            canRevealPreciseLocation: false,
            matchId: null
          },
          user: null
        }],
        sent: [{
          id: "sent-1",
          createdAt: "2026-04-28T12:05:00.000Z",
          mutual: false,
          locked: false,
          permissions: {
            canMessage: true,
            canRevealPreciseLocation: false,
            matchId: null
          },
          user: {
            id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg",
            photoExplicit: false,
            travelling: false,
            vibes: ["Artsy", "Chill", "Drag"]
          }
        }],
        mutual: [],
        views: [{
          id: "view-1",
          createdAt: "2026-04-28T12:10:00.000Z",
          viewedAt: "2026-04-28T12:10:00.000Z",
          locked: false,
          user: {
            id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg",
            photoExplicit: false,
            travelling: false,
            vibes: ["Artsy", "Chill", "Drag"]
          }
        }, {
          id: "view-2",
          createdAt: "2026-04-28T11:10:00.000Z",
          viewedAt: "2026-04-28T11:10:00.000Z",
          locked: true,
          user: null
        }]
      }
    });
  });

  it("returns tokenized mutual map pins when saved Stealth outlives cruush+", async () => {
    const otherUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-1",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: otherUserId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-1",
      userOneId: userId,
      userTwoId: otherUserId
    });
    const viewerLocation = await encryptedLocationEnvelopeRow({
      subjectUserId: userId,
      lat: 40.7128,
      lng: -74.006,
      accuracyM: 20
    });
    const targetLocation = await encryptedLocationEnvelopeRow({
      subjectUserId: otherUserId,
      lat: 40.711,
      lng: -74.002,
      accuracyM: 50
    });
    const retainedTargetPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: otherUserId,
      baseMode: "STEALTH"
    });

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({
          rows: params[0] === userId ? [viewerLocation] : [targetLocation]
        });
      }

      if (normalizedSql.includes("from encrypted_visibility_tokens")) {
        return Promise.resolve({
          rows: params[0] === userId ? [] : [retainedTargetPolicy]
        });
      }

      if (normalizedSql.includes("from user_entitlements")) {
        return Promise.resolve({
          rows: [{
            cruush_plus_enabled: false,
            cruush_plus_expires_at: "2026-08-11T12:00:00.000Z"
          }]
        });
      }

      if (normalizedSql.includes("participant_one_index") && normalizedSql.includes("from encrypted_relationship_records")) {
        return Promise.resolve({ rows: [matchRecord] });
      }

      if (normalizedSql.includes("record_lookup_index = $1") && normalizedSql.includes("from encrypted_relationship_records")) {
        return Promise.resolve({ rows: params[0] === matchRecord.record_lookup_index ? [matchRecord] : [] });
      }

      if (normalizedSql.includes("from encrypted_relationship_tokens")) {
        return Promise.resolve({ rows: params[0] === matchRecord.id ? [matchToken] : [] });
      }

      if (normalizedSql.includes("where profiles.id = any")) {
        return Promise.resolve({
          rows: [{
            id: otherUserId,
            display_name: "Alex",
            pronouns: ["they/them"],
            photos: ["https://example.com/alex.jpg"],
            updated_at: "2026-04-28T12:00:00.000Z",
            lat: 40.711,
            lng: -74.002,
            fuzzy_lat: 40.7115,
            fuzzy_lng: -74.0025,
            vibes: ["Chill"],
            scenes: [],
            archetypes: [],
            profile_sensitive_ciphertext: null,
            profile_sensitive_nonce: null,
            profile_sensitive_auth_tag: null,
            profile_sensitive_key_version: "v1",
            ghost_mode_enabled: true,
            precise_location_visibility: "mutual_cruushes"
          }]
        });
      }

      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/cruush/mutual-map",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        mapEpochMs: expect.any(Number),
        profiles: [
          expect.objectContaining({
            profileToken: otherUserId,
            displayLocationToken: expect.objectContaining({
              version: 1,
              tokenVersion: 1,
              ciphertext: expect.any(String)
            }),
            relationshipContext: "MUTUAL_CRUUSH"
          })
        ]
      }
    });
    expect(response.json().data.profiles[0]).not.toHaveProperty("lat");
    expect(response.json().data.profiles[0]).not.toHaveProperty("lng");
  });

  it("enforces both sides of Crowd Mode on mutual map pins", async () => {
    const otherUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "crowd-mode-match",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: otherUserId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: matchRecord.id,
      userOneId: userId,
      userTwoId: otherUserId
    });
    const viewerLocation = await encryptedLocationEnvelopeRow({
      subjectUserId: userId,
      lat: 40.7128,
      lng: -74.006
    });
    const targetLocation = await encryptedLocationEnvelopeRow({
      subjectUserId: otherUserId,
      lat: 40.711,
      lng: -74.002
    });
    const targetPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: otherUserId,
      baseMode: "PUBLIC_PRECISE"
    });
    const viewerSensitive = encryptSensitiveProfile(app.config, {
      is_trans: true,
      crowds: ["T4T"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });
    const viewerVisibility = encryptProfileVisibility(app.config, {
      ...emptyProfile.visibility_rules,
      active_crowd_modes: ["T4T"]
    });
    let targetSensitive = encryptSensitiveProfile(app.config, {
      is_trans: false,
      crowds: ["Dyke"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });
    let targetVisibility = encryptProfileVisibility(app.config, emptyProfile.visibility_rules);

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({
          rows: params[0] === userId ? [viewerLocation] : [targetLocation]
        });
      }

      if (normalizedSql.includes("from encrypted_visibility_tokens")) {
        return Promise.resolve({ rows: params[0] === otherUserId ? [targetPolicy] : [] });
      }

      if (normalizedSql.includes("participant_one_index") && normalizedSql.includes("from encrypted_relationship_records")) {
        return Promise.resolve({ rows: [matchRecord] });
      }

      if (normalizedSql.includes("record_lookup_index = $1") && normalizedSql.includes("from encrypted_relationship_records")) {
        return Promise.resolve({ rows: params[0] === matchRecord.record_lookup_index ? [matchRecord] : [] });
      }

      if (normalizedSql.includes("from encrypted_relationship_tokens")) {
        return Promise.resolve({ rows: params[0] === matchRecord.id ? [matchToken] : [] });
      }

      if (normalizedSql.includes("where profiles.id = any")) {
        return Promise.resolve({
          rows: [{
            id: otherUserId,
            display_name: "Alex",
            pronouns: ["they/them"],
            photos: ["https://example.com/alex.jpg"],
            updated_at: "2026-04-28T12:00:00.000Z",
            year_of_birth: 1994,
            lat: null,
            lng: null,
            fuzzy_lat: null,
            fuzzy_lng: null,
            looking_for: [],
            vibes: ["Chill"],
            scenes: [],
            archetypes: [],
            identities: [],
            presentation: [],
            sexuality: [],
            body_type: [],
            availability: [],
            hobbies: [],
            position: [],
            role: [],
            hosting_travel: [],
            substance_boundaries: [],
            ...targetSensitive,
            ...targetVisibility,
            ghost_mode_enabled: false,
            precise_location_visibility: "none"
          }]
        });
      }

      if (normalizedSql.includes("from profiles") && normalizedSql.includes("where id = $1")) {
        return Promise.resolve({
          rows: [{
            year_of_birth: 1994,
            looking_for: [],
            vibes: [],
            scenes: [],
            archetypes: [],
            identities: [],
            presentation: [],
            sexuality: [],
            body_type: [],
            availability: [],
            hobbies: [],
            position: [],
            role: [],
            hosting_travel: [],
            substance_boundaries: [],
            lat: null,
            lng: null,
            fuzzy_lat: null,
            fuzzy_lng: null,
            ...viewerSensitive,
            ...viewerVisibility
          }]
        });
      }

      return Promise.resolve({ rows: [] });
    });

    const getProfiles = async (queryString = "") => {
      const response = await app.inject({
        method: "GET",
        url: `/api/cruush/mutual-map${queryString}`,
        headers: {
          "x-user-id": userId
        }
      });

      expect(response.statusCode).toBe(200);
      return response.json().data.profiles;
    };

    expect(await getProfiles()).toEqual([]);

    targetSensitive = encryptSensitiveProfile(app.config, {
      is_trans: true,
      crowds: ["T4T"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });
    targetVisibility = encryptProfileVisibility(app.config, {
      ...emptyProfile.visibility_rules,
      active_crowd_modes: ["Gay"]
    });
    expect(await getProfiles()).toEqual([]);

    targetVisibility = encryptProfileVisibility(app.config, {
      ...emptyProfile.visibility_rules,
      active_crowd_modes: ["T4T"],
      distance: 5
    });
    expect(await getProfiles()).toEqual([
      expect.objectContaining({
        profileToken: otherUserId,
        relationshipContext: "MUTUAL_CRUUSH"
      })
    ]);
    expect(await getProfiles("?identities=Trans")).toEqual([]);
  });

  it("filters blocked users out of the mutual cruush map", async () => {
    const otherUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "blocked-match-map",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: otherUserId
    });

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({
        rows: [{
          user_id: otherUserId
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/cruush/mutual-map",
      headers: {
        "x-user-id": userId
      }
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[3]?.[0]).toContain("from user_blocks");
    expect(query.mock.calls[4]?.[0]).toContain("from user_travel_pins");
    expect(queries.some((sql) => sql.includes("where profiles.id = any"))).toBe(false);
    expect(response.json()).toEqual({
      data: {
        mapEpochMs: expect.any(Number),
        profiles: []
      }
    });
  });

  it("creates or updates a cruush on POST /api/cruush", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "cruush-3",
          from_user_id: userId,
          to_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          created_at: "2026-04-28T12:10:00.000Z",
          mutual: false
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/cruush",
      headers: {
        "x-user-id": userId
      },
      payload: {
        toUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        targetUser: {
          name: "Jordan",
          pronouns: "they/them",
          photo: null
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[0]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[2]?.[0]).toContain("insert into encrypted_relationship_records");
    expect(query.mock.calls[4]?.[0]).toContain("insert into app_notifications");
    expect(JSON.stringify(query.mock.calls[2]?.[1])).not.toContain("Jordan");
    expect(JSON.stringify(query.mock.calls[2]?.[1])).not.toContain("53fd68d7-24fc-4cff-8cd7-a97ec0cadf97");
    expect(response.json()).toEqual({
      data: {
        id: "cruush-3",
        fromUserId: userId,
        toUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        createdAt: expect.any(String),
        mutual: false
      }
    });
  });

  it("unsends an outgoing cruush without touching a reciprocal cruush", async () => {
    const otherUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const outgoingCruush = await encryptedRelationshipRecordRow({
      id: "outgoing-cruush",
      type: "cruush",
      actorUserId: userId,
      targetUserId: otherUserId
    });

    query
      .mockResolvedValueOnce({ rows: [outgoingCruush] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "removed-cruush" }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/cruush/${otherUserId}`,
      headers: {
        "x-user-id": userId
      }
    });
    const relationshipUpdates = query.mock.calls.filter(([sql]) =>
      String(sql).includes("update encrypted_relationship_records")
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        revoked: true,
        mutualRevoked: false
      }
    });
    expect(relationshipUpdates).toHaveLength(1);
    expect(relationshipUpdates[0]?.[1]?.[0]).toBe("outgoing-cruush");
    expect(query.mock.calls[3]?.[0]).toContain("insert into encrypted_relationship_records");
    expect(query.mock.calls[4]?.[0]).toContain("delete from app_notifications");
    expect(query.mock.calls[4]?.[1]?.[1]).toEqual([
      `incoming-cruush:outgoing-cruush:${otherUserId}`
    ]);
  });

  it("unsends a mutual cruush while preserving the other user's outgoing cruush", async () => {
    const otherUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const outgoingCruush = await encryptedRelationshipRecordRow({
      id: "outgoing-mutual-cruush",
      type: "cruush",
      actorUserId: userId,
      targetUserId: otherUserId
    });
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "mutual-match",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: otherUserId
    });

    query
      .mockResolvedValueOnce({ rows: [outgoingCruush] })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "removed-mutual-cruush" }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/cruush/${otherUserId}`,
      headers: {
        "x-user-id": userId
      }
    });
    const relationshipUpdates = query.mock.calls.filter(([sql]) =>
      String(sql).includes("update encrypted_relationship_records")
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        revoked: true,
        mutualRevoked: true
      }
    });
    expect(relationshipUpdates.map((call) => call[1]?.[0])).toEqual([
      "outgoing-mutual-cruush",
      "mutual-match"
    ]);
    expect(relationshipUpdates.map((call) => call[1]?.[0])).not.toContain("reciprocal-cruush");
    expect(query.mock.calls[4]?.[0]).toContain("update encrypted_relationship_tokens");
    expect(query.mock.calls[6]?.[0]).toContain("delete from app_notifications");
    expect(query.mock.calls[6]?.[1]?.[1]).toEqual([
      `incoming-cruush:outgoing-mutual-cruush:${otherUserId}`,
      `mutual-cruush:mutual-match:${userId}`,
      `mutual-cruush:mutual-match:${otherUserId}`
    ]);
  });

  it("blocks cruush creation when either user blocked the other", async () => {
    const otherUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ exists: true }] });

    const response = await app.inject({
      method: "POST",
      url: "/api/cruush",
      headers: {
        "x-user-id": userId
      },
      payload: {
        toUserId: otherUserId,
        targetUser: {
          name: "Jordan",
          pronouns: "they/them",
          photo: null
        }
      }
    });
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(404);
    expect(query.mock.calls[1]?.[0]).toContain("from user_blocks");
    expect(query.mock.calls[1]?.[1]).toEqual([userId, otherUserId]);
    expect(queries.some((sql) => sql.includes("insert into encrypted_relationship_records"))).toBe(false);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "User not found.",
        details: null
      }
    });
  });

  it("toggles cruush+ through the development debug endpoint", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: true,
        cruush_plus_expires_at: null
      }]
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/dev/cruush-plus",
      headers: {
        "x-user-id": userId
      },
      payload: {
        enabled: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("insert into user_entitlements");
    expect(query.mock.calls[0]?.[1]).toEqual([userId, true]);
    expect(response.json()).toEqual({
      data: {
        cruushPlus: true,
        expiresAt: null
      }
    });
  });

  it("does not expose the cruush+ debug entitlement route in production", async () => {
    const response = await productionApp.inject({
      method: "GET",
      url: "/api/dev/cruush-plus",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(expect.objectContaining({
      statusCode: 404,
      error: "Not Found"
    }));
    expect(query).not.toHaveBeenCalled();
  });

  it("creates a mutual match and server-managed token for reciprocal cruushes", async () => {
    const reciprocalCruush = await encryptedRelationshipRecordRow({
      id: "reciprocal-cruush",
      type: "cruush",
      actorUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      targetUserId: userId,
      createdAt: "2026-04-28T12:00:00.000Z"
    });
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-1",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-1",
      userOneId: userId,
      userTwoId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
    });

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "cruush-4",
          from_user_id: userId,
          to_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          created_at: "2026-04-28T12:15:00.000Z",
          mutual: true
        }]
      })
      .mockResolvedValueOnce({ rows: [reciprocalCruush] })
      .mockResolvedValueOnce({
        rows: [{
          id: "match-1"
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [matchToken]
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/cruush",
      headers: {
        "x-user-id": userId
      },
      payload: {
        toUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        targetUser: {
          name: "Jordan",
          pronouns: "they/them",
          photo: null
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[4]?.[0]).toContain("insert into encrypted_relationship_records");
    expect(query.mock.calls[5]?.[0]).toContain("insert into encrypted_relationship_tokens");
    expect(query.mock.calls[9]?.[0]).toContain("encrypted_relationship_tokens");
    expect(response.json()).toEqual({
      data: {
        id: "cruush-4",
        fromUserId: userId,
        toUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        createdAt: expect.any(String),
        mutual: true,
        permissions: {
          matchId: "match-1",
          canMessage: true,
          canRevealPreciseLocation: false
        }
      }
    });
  });

  it("returns existing mutual state without refreshing cruushes or reissuing tokens", async () => {
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-existing",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      createdAt: "2026-04-28T12:15:00.000Z"
    });
    const existingCruush = await encryptedRelationshipRecordRow({
      id: "cruush-existing",
      type: "cruush",
      actorUserId: userId,
      targetUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      createdAt: "2026-04-28T12:15:00.000Z"
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-existing",
      userOneId: userId,
      userTwoId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
    });

    query
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existingCruush] })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/api/cruush",
      headers: {
        "x-user-id": userId
      },
      payload: {
        toUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        targetUser: {
          name: "Jordan",
          pronouns: "they/them",
          photo: null
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(8);
    expect(query.mock.calls[0]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls.map((call) => call[0]).join("\n")).not.toContain("insert into encrypted_relationship_tokens");
    expect(response.json()).toEqual({
      data: {
        id: "cruush-existing",
        fromUserId: userId,
        toUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        createdAt: "2026-04-28T12:15:00.000Z",
        mutual: true,
        permissions: {
          matchId: "match-existing",
          canMessage: true,
          canRevealPreciseLocation: false
        }
      }
    });
  });

  it("rejects invalid cruush target ids before querying", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/cruush",
      headers: {
        "x-user-id": userId
      },
      payload: {
        toUserId: "not-a-uuid"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("requires the temporary x-user-id header on GET /api/profiles/me", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
        details: expect.any(Object)
      }
    });
  });

  it("rejects invalid auth headers on GET /api/profiles/me", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": "not-a-uuid"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
        details: expect.any(Object)
      }
    });
  });

  it("returns Ghost privacy settings with the next rotation deadline", async () => {
    const policy = await encryptedVisibilityPolicyRow({
      subjectUserId: userId,
      baseMode: "GHOST"
    });

    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("from encrypted_visibility_tokens")) {
        return { rows: [policy] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me/privacy-settings",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(expect.objectContaining({
      baseMode: "GHOST",
      ghostModeEnabled: true,
      ghostRotationExpiresAtMs: expect.any(Number)
    }));
    expect(response.json().data).not.toHaveProperty("animationHint");
    expect(query.mock.calls.some(([sql]) => /ghost_mode_anchor_ms|ghost_pulse_enabled/.test(String(sql)))).toBe(false);
  });

  it("returns normal public visibility when a saved Stealth policy outlives cruush+", async () => {
    const policy = await encryptedVisibilityPolicyRow({
      subjectUserId: userId,
      baseMode: "STEALTH"
    });

    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from encrypted_visibility_tokens")) {
        return { rows: [policy] };
      }

      if (text.includes("from user_entitlements")) {
        return {
          rows: [{
            cruush_plus_enabled: false,
            cruush_plus_expires_at: "2026-08-11T12:00:00.000Z"
          }]
        };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me/privacy-settings",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(expect.objectContaining({
      baseMode: "PUBLIC_PRECISE",
      ghostModeEnabled: false
    }));
    expect(query.mock.calls.some(([sql]) => String(sql).includes("from user_entitlements"))).toBe(true);
  });

  it("returns the next rotation deadline when Ghost Mode is enabled", async () => {
    const currentPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: userId,
      baseMode: "PUBLIC_PRECISE"
    });

    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("from encrypted_visibility_tokens")) {
        return { rows: [currentPolicy] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me/privacy-settings",
      headers: {
        "x-user-id": userId
      },
      payload: {
        baseMode: "GHOST",
        ghostRadiusMeters: 1609
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(expect.objectContaining({
      baseMode: "GHOST",
      ghostModeEnabled: true,
      ghostRotationExpiresAtMs: expect.any(Number)
    }));
    expect(response.json().data).not.toHaveProperty("animationHint");
    expect(query.mock.calls.some(([sql]) => /ghost_mode_anchor_ms|ghost_pulse_enabled/.test(String(sql)))).toBe(false);
  });

  it("serves the Ghost pulse preference routes with the countdown on by default", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ ghost_pulse_enabled: false }] });

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/privacy/ghost-pulse",
      headers: {
        "x-user-id": userId
      }
    });
    const putResponse = await app.inject({
      method: "PUT",
      url: "/api/privacy/ghost-pulse",
      headers: {
        "x-user-id": userId
      },
      payload: {
        enabled: false
      }
    });

    expect(getResponse.statusCode).toBe(200);
    // No stored row means nobody has opted out, so the countdown reads as on.
    expect(getResponse.json().data).toEqual({ enabled: true });
    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.json().data).toEqual({ enabled: false });
    expect(query.mock.calls.some(([sql]) => /ghost_pulse_enabled/.test(String(sql)))).toBe(true);
  });

  it("requires cruush+ before enabling stealth mode", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: false,
        cruush_plus_expires_at: null
      }]
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me/privacy-settings",
      headers: {
        "x-user-id": userId
      },
      payload: {
        baseMode: "STEALTH"
      }
    });

    expect(response.statusCode).toBe(402);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("from user_entitlements");
    expect(response.json()).toEqual({
      error: {
        code: "CRUUSH_PLUS_REQUIRED",
        message: "Upgrade to cruush+ to use Dark Room.",
        details: null
      }
    });
  });

  it.each([
    ["precise mutual cruush sharing", { preciseToMutualCruushes: true }],
    [
      "precise mutual crowd sharing",
      {
        preciseToMutualCrowds: [{
          crowdId: "Gay",
          precisionEnabled: true
        }]
      }
    ]
  ])("allows a basic member to enable %s through the primary privacy settings endpoint", async (_setting, payload) => {
    const currentPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: userId,
      baseMode: "PUBLIC_PRECISE"
    });
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from user_entitlements")) {
        return {
          rows: [{
            cruush_plus_enabled: false,
            cruush_plus_expires_at: null
          }]
        };
      }

      if (text.includes("from encrypted_visibility_tokens")) {
        return { rows: [currentPolicy] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me/privacy-settings",
      headers: {
        "x-user-id": userId
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("from user_entitlements"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into encrypted_visibility_tokens"))).toBe(true);
  });

  it("requires cruush+ before the legacy Ghost Mode endpoint enables Stealth", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: false,
        cruush_plus_expires_at: null
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/privacy/ghost-mode",
      headers: {
        "x-user-id": userId
      },
      payload: { baseMode: "STEALTH" }
    });

    expect(response.statusCode).toBe(402);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("from user_entitlements");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into encrypted_visibility_tokens"))).toBe(false);
    expect(response.json()).toEqual({
      error: {
        code: "CRUUSH_PLUS_REQUIRED",
        message: "Upgrade to cruush+ to use Dark Room.",
        details: null
      }
    });
  });

  it.each([
    ["precise mutual cruush sharing", { preciseToMutualCruushes: true }],
    [
      "precise mutual crowd sharing",
      {
        preciseToMutualCrowds: [{
          crowdId: "Gay",
          precisionEnabled: true
        }]
      }
    ]
  ])("allows a basic member to enable %s through the legacy Ghost Mode endpoint", async (_setting, payload) => {
    const currentPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: userId,
      baseMode: "PUBLIC_PRECISE"
    });
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from user_entitlements")) {
        return {
          rows: [{
            cruush_plus_enabled: false,
            cruush_plus_expires_at: null
          }]
        };
      }

      if (text.includes("from encrypted_visibility_tokens")) {
        return { rows: [currentPolicy] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/privacy/ghost-mode",
      headers: {
        "x-user-id": userId
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("from user_entitlements"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into encrypted_visibility_tokens"))).toBe(true);
  });

  it("allows cruush+ to enable Stealth through the legacy Ghost Mode endpoint", async () => {
    const currentPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: userId,
      baseMode: "PUBLIC_PRECISE"
    });
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from user_entitlements")) {
        return {
          rows: [{
            cruush_plus_enabled: true,
            cruush_plus_expires_at: null
          }]
        };
      }

      if (text.includes("from encrypted_visibility_tokens")) {
        return { rows: [currentPolicy] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/privacy/ghost-mode",
      headers: {
        "x-user-id": userId
      },
      payload: {
        baseMode: "STEALTH"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.baseMode).toBe("STEALTH");
    const entitlementIndex = query.mock.calls.findIndex(([sql]) => String(sql).includes("from user_entitlements"));
    const policyWriteIndex = query.mock.calls.findIndex(([sql]) => String(sql).includes("insert into encrypted_visibility_tokens"));
    expect(entitlementIndex).toBeGreaterThan(-1);
    expect(entitlementIndex).toBeLessThan(policyWriteIndex);
  });

  it("revokes active Pings before switching profile map privacy to Stealth", async () => {
    const currentPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: userId,
      baseMode: "PUBLIC_PRECISE"
    });
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from user_entitlements")) {
        return {
          rows: [{
            cruush_plus_enabled: true,
            cruush_plus_expires_at: null
          }]
        };
      }

      if (text.includes("from encrypted_visibility_tokens")) {
        return { rows: [currentPolicy] };
      }

      if (text.includes("from map_pings") && text.includes("for update")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }

      if (text.includes("clock_timestamp()")) {
        return { rows: [{ revoked_at: "2026-08-09T20:00:00.000Z" }] };
      }

      if (text.includes("update map_pings")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me/privacy-settings",
      headers: {
        "x-user-id": userId
      },
      payload: {
        baseMode: "STEALTH"
      }
    });

    expect(response.statusCode).toBe(200);
    const pingRevocationIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("update map_pings"));
    const policyWriteIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("insert into encrypted_visibility_tokens"));
    const senderLockIndex = query.mock.calls.findIndex((call) =>
      String(call[0]).includes("from app_users") && String(call[0]).includes("for update")
    );
    const commitIndex = query.mock.calls.findIndex((call) => String(call[0]).trim().toLowerCase() === "commit");
    expect(pingRevocationIndex).toBeGreaterThan(-1);
    expect(senderLockIndex).toBeLessThan(policyWriteIndex);
    expect(policyWriteIndex).toBeLessThan(pingRevocationIndex);
    expect(pingRevocationIndex).toBeLessThan(commitIndex);
    expect(response.json().data.baseMode).toBe("STEALTH");
  });

  it("revokes active Pings before narrowing the Ghost Mode map policy", async () => {
    const currentPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: userId,
      baseMode: "PUBLIC_PRECISE"
    });
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from encrypted_visibility_tokens")) {
        return { rows: [currentPolicy] };
      }

      if (text.includes("from map_pings") && text.includes("for update")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }

      if (text.includes("clock_timestamp()")) {
        return { rows: [{ revoked_at: "2026-08-09T20:00:00.000Z" }] };
      }

      if (text.includes("update map_pings")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/privacy/ghost-mode",
      headers: {
        "x-user-id": userId
      },
      payload: {
        baseMode: "GHOST",
        ghostRadiusMeters: 4828
      }
    });

    expect(response.statusCode).toBe(200);
    const pingRevocationIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("update map_pings"));
    const policyWriteIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("insert into encrypted_visibility_tokens"));
    const commitIndex = query.mock.calls.findIndex((call) => String(call[0]).trim().toLowerCase() === "commit");
    expect(pingRevocationIndex).toBeGreaterThan(-1);
    expect(policyWriteIndex).toBeLessThan(pingRevocationIndex);
    expect(pingRevocationIndex).toBeLessThan(commitIndex);
    expect(response.json().data.baseMode).toBe("GHOST");
  });

  it("revokes an active Ping in the same transaction as a precise-viewer revocation", async () => {
    const viewerUserId = dmPartnerId;
    const relationshipId = "10000000-0000-4000-8000-000000000020";
    const relationship = await encryptedRelationshipRecordRow({
      id: relationshipId,
      type: "mutual_cruush",
      actorUserId: viewerUserId,
      targetUserId: userId
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: relationshipId,
      userOneId: viewerUserId,
      userTwoId: userId
    });
    const subjectPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: userId,
      baseMode: "PUBLIC_PRECISE",
      preciseToMutualCruushes: true
    });
    const viewerPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: viewerUserId,
      baseMode: "PUBLIC_PRECISE"
    });
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql);

      if (text.includes("from encrypted_visibility_tokens")) {
        return { rows: [params[0] === viewerUserId ? viewerPolicy : subjectPolicy] };
      }
      if (text.includes("from encrypted_relationship_records")) {
        return { rows: [relationship] };
      }
      if (text.includes("from encrypted_relationship_tokens")) {
        return { rows: [matchToken] };
      }
      if (text.includes("select true as exists") && text.includes("encrypted_privacy_audit_events")) {
        return { rows: [] };
      }
      if (text.includes("from user_blocks")) {
        return { rows: [] };
      }
      if (text.includes("from app_users") && text.includes("for update")) {
        return { rows: [{ id: userId }] };
      }
      if (text.includes("from map_pings") && text.includes("for update")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }
      if (text.includes("clock_timestamp()")) {
        return { rows: [{ revoked_at: "2026-08-09T20:00:00.000Z" }] };
      }
      if (text.includes("update map_pings")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/privacy/revoke",
      headers: {
        "x-user-id": userId
      },
      payload: {
        revoke_action_token: buildRevokeActionToken(app.config, {
          subjectUserId: userId,
          viewerUserId,
          permissionType: "mutual_cruush"
        })
      }
    });

    expect(response.statusCode).toBe(200);
    const privacyWriteIndex = query.mock.calls.findIndex((call) =>
      String(call[0]).includes("insert into encrypted_privacy_audit_events")
    );
    const pingRevocationIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("update map_pings"));
    const commitIndex = query.mock.calls.findIndex((call) => String(call[0]).trim().toLowerCase() === "commit");
    expect(privacyWriteIndex).toBeGreaterThan(-1);
    expect(privacyWriteIndex).toBeLessThan(pingRevocationIndex);
    expect(pingRevocationIndex).toBeLessThan(commitIndex);
  });

  it("returns the authenticated profile on GET /api/profiles/me", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        display_name: "Cruusher",
        photos: [],
        photo_metadata: [],
        side_badges: {
          left: null,
          right: null
        },
        bio: "Hello",
        tags: ["leatherdaddy"],
        signal: "",
        pronouns: ["they/them"],
        custom_pronouns: "",
        year_of_birth: 1994,
        ethnicity: ["Latinx"],
        identities: ["Non-binary"],
        presentation: ["Femme"],
        sexuality: ["Queer"],
        body_type: ["Athletic"],
        body_hair: ["Smooth"],
        pubic_hair: ["Trimmed"],
        facial_hair: ["Beard"],
        height: "5'8\"",
        weight: "155 lbs",
        position: ["Vers"],
        role: ["Switch"],
        is_trans: null,
        trans_status_visibility: "mutual_cruushes",
        crowds: [],
        availability: ["Tonight"],
        hosting_travel: ["Hosting"],
        preferred_spots: ["Bars"],
        birth_control: [],
        relationship_status: [],
        zodiac: [],
        kinks: ["Leather"],
        kinks_visibility: "mutual_crowds",
        kink_interests: [{
          kink_id: "leather",
          label: "Leather",
        }],
        vibes: ["Playful"],
        scenes: [],
        archetypes: [],
        hobbies: ["Hiking"],
        custom_hobby: "",
        looking_for: ["Dates"],
        hiv_status: ["Negative"],
        hiv_status_visibility: "mutual_cruushes",
        custom_hiv_status: "",
        condoms: ["Always"],
        custom_condoms: "",
        prep: ["Daily"],
        custom_prep: "",
        doxypep: ["Sometimes"],
        custom_doxypep: "",
        covid_vaccine: ["Boosted"],
        custom_covid_vaccine: "",
        mpox_vaccine: ["Vaccinated"],
        custom_mpox_vaccine: "",
        protections: [],
        substance_boundaries: ["No alcohol involved", "Let's discuss"],
        protection_boundaries: ["Condoms required"],
        lat: 40.7128,
        lng: -74.006,
        fuzzy_lat: 40.713,
        fuzzy_lng: -74.005,
        location_fuzz_radius_meters: 250,
        location_updated_at: "2026-06-02T12:00:00.000Z",
        updated_at: "2026-04-28T12:00:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("from profiles"), [userId]);
    expect(response.json()).toEqual({
      data: {
        id: userId,
        display_name: "Cruusher",
        photos: [],
        photo_metadata: [],
        side_badges: {
          left: null,
          right: null
        },
        bio: "Hello",
        tags: ["leatherdaddy"],
        signal: "",
        pronouns: ["they/them"],
        custom_pronouns: "",
        year_of_birth: 1994,
        ethnicity: "Latinx",
        identities: ["Non-binary"],
        presentation: ["Femme"],
        sexuality: ["Queer"],
        body_type: ["Athletic"],
        body_hair: ["Smooth"],
        pubic_hair: ["Trimmed"],
        facial_hair: ["Beard"],
        height: "5'8\"",
        weight: "155 lbs",
        position: ["Vers"],
        role: ["Switch"],
        is_trans: null,
        trans_status_visibility: "mutual_cruushes",
        crowds: [],
        availability: ["Tonight"],
        hosting_travel: ["Hosting"],
        preferred_spots: ["Bars"],
        birth_control: [],
        relationship_status: [],
        zodiac: [],
        kinks: ["Leather"],
        kinks_visibility: "mutual_crowds",
        kink_interests: [{
          kink_id: "leather",
          label: "Leather",
        }],
        vibes: ["Playful"],
        scenes: [],
        archetypes: [],
        hobbies: ["Hiking"],
        custom_hobby: "",
        looking_for: ["Dates"],
        hiv_status: ["Negative"],
        hiv_status_visibility: "mutual_cruushes",
        custom_hiv_status: "",
        condoms: ["Always"],
        custom_condoms: "",
        prep: ["Daily"],
        custom_prep: "",
        doxypep: ["Sometimes"],
        custom_doxypep: "",
        covid_vaccine: ["Boosted"],
        custom_covid_vaccine: "",
        mpox_vaccine: ["Vaccinated"],
        custom_mpox_vaccine: "",
        protections: [],
        substance_boundaries: ["No alcohol involved", "Let's discuss"],
        protection_boundaries: ["Condoms required"],
        health_preferences: [],
        visibility_rules: emptyProfile.visibility_rules,
        updated_at: "2026-04-28T12:00:00.000Z"
      }
    });
    expect(response.json().data).not.toHaveProperty("location");
  });

  it("returns kink and fetish interests with field-level visibility metadata", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          display_name: "Cruusher",
          ethnicity: [],
          kinks: [],
          kinks_visibility: "mutual_crowds",
          substance_boundaries: [],
          updated_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          kink_id: "leather",
          label: "Leather",
          category: "Gear"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        birth_control: [],
        relationship_status: [],
        zodiac: [],
        kinks: ["Leather"],
        kinks_visibility: "mutual_crowds",
        kink_interests: [{
          kink_id: "leather",
          label: "Leather",
          category: "Gear"
        }]
      })
    });
  });

  it("returns another user's profile on GET /api/profiles/:userId", async () => {
    const targetSensitiveProfile = encryptSensitiveProfile(app.config, {
      is_trans: true,
      crowds: ["T4T", "Dyke"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });
    const viewerCrowdTokens = createCrowdTokens(app.config, ["T4T"]).map((token) => ({
      token_hash: token.token_hash
    }));

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          display_name: "Alex",
          photos: ["https://example.com/alex.jpg"],
          bio: "Nearby now",
          pronouns: ["they/them"],
          custom_pronouns: "",
          year_of_birth: 1998,
          ethnicity: ["Latinx"],
          identities: ["Non-binary"],
          presentation: ["Femme"],
          sexuality: ["Queer"],
          body_type: ["Athletic"],
          height: "5'8\"",
          weight: "155 lbs",
          position: ["Vers"],
          availability: ["Now"],
          hosting_travel: ["Hosting"],
          kinks: ["Leather"],
          vibes: ["Playful"],
          hobbies: ["Hiking"],
          custom_hobby: "",
          looking_for: ["Dates"],
          hiv_status: ["Negative"],
          custom_hiv_status: "",
          condoms: ["Always"],
          custom_condoms: "",
          prep: ["Daily"],
          custom_prep: "",
          doxypep: ["Sometimes"],
          custom_doxypep: "",
          covid_vaccine: ["Boosted"],
          custom_covid_vaccine: "",
          mpox_vaccine: ["Vaccinated"],
          custom_mpox_vaccine: "",
          substance_boundaries: ["No alcohol involved", "Let's discuss"],
          ...targetSensitiveProfile,
          updated_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: viewerCrowdTokens })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("from profiles"), ["53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"]);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        display_name: "Alex",
        bio: "Nearby now",
        pronouns: ["they/them"],
        looking_for: ["Dates"],
        crowds: ["T4T"]
      })
    });
    expect(response.json().data.crowds).not.toContain("Dyke");
  });

  it("returns 404 for profile detail when either user has blocked the other", async () => {
    query.mockResolvedValueOnce({ rows: [{ exists: true }] });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("from user_blocks");
    expect(query.mock.calls[0]?.[1]).toEqual([userId, "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"]);
    expect(query.mock.calls.map(([sql]) => String(sql)).join("\n")).not.toContain("from profiles");
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Profile not found",
        details: null
      }
    });
  });

  it("rejects invalid profile ids before querying profiles", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/not-a-uuid",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("returns 404 when another user's visibility rules exclude the viewer profile fields", async () => {
    const targetVisibility = encryptProfileVisibility(app.config, {
      ...emptyProfile.visibility_rules,
      crowds: ["T4T"]
    });
    const viewerSensitiveProfile = encryptSensitiveProfile(app.config, {
      is_trans: true,
      crowds: ["Dyke"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          display_name: "Alex",
          ethnicity: [],
          position: [],
          role: [],
          kinks: [],
          kinks_visibility: "public",
          substance_boundaries: [],
          ...targetVisibility,
          updated_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          year_of_birth: 1994,
          identities: [],
          presentation: [],
          sexuality: [],
          body_type: [],
          looking_for: [],
          availability: [],
          hosting_travel: [],
          vibes: [],
          scenes: [],
          archetypes: [],
          hobbies: [],
          position: [],
          role: [],
          substance_boundaries: [],
          lat: 40.7128,
          lng: -74.006,
          ...viewerSensitiveProfile
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Profile not found",
        details: null
      }
    });
  });

  it("hides another user's kinks when the field is not public", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          display_name: "Alex",
          ethnicity: [],
          position: ["top"],
          role: [],
          kinks: ["Leather"],
          kinks_visibility: "mutual_cruushes",
          substance_boundaries: [],
          updated_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          kink_id: "leather",
          label: "Leather",
          category: "Gear"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        kinks: [],
        kink_interests: [],
        kinks_visibility: "mutual_cruushes"
      })
    });
  });

  it("reveals mutual-cruush protected kinks only when the viewer has an active match", async () => {
    const matchRecord = await encryptedRelationshipRecordRow({
      id: "match-1",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
    });
    const matchToken = await encryptedMatchTokenRow({
      relationshipRecordId: "match-1",
      userOneId: userId,
      userTwoId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
    });

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          display_name: "Alex",
          ethnicity: [],
          position: ["top"],
          role: [],
          kinks: ["Leather"],
          kinks_visibility: "mutual_cruushes",
          substance_boundaries: [],
          updated_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [matchRecord]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          kink_id: "leather",
          label: "Leather",
          category: "Gear"
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        kinks: ["Leather"],
        kink_interests: [{
          kink_id: "leather",
          label: "Leather"
        }],
        kinks_visibility: "mutual_cruushes",
        viewer_relationship: expect.objectContaining({
          match_id: "match-1",
          mutual_cruush: true,
          outgoing_cruush: true,
          can_message: true,
          can_reveal_precise_location: false,
          location_mode: "GHOST",
          dark_room_distance_label: false
        })
      })
    });
  });

  it("does not log profile views when the viewer has Ghost Mode enabled", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          display_name: "Alex",
          ethnicity: [],
          position: [],
          role: [],
          kinks: [],
          kinks_visibility: "public",
          substance_boundaries: [],
          updated_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          match_id: null,
          has_active_match_token: false,
          viewer_ghost_mode_enabled: true,
          target_ghost_mode_enabled: false,
          target_precise_location_visibility: "none"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.map((call) => call[0]).join("\n")).not.toContain("profile_view_events");
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        viewer_relationship: expect.objectContaining({
          mutual_cruush: false,
          can_message: false
        })
      })
    });
  });

  it("marks profiles with an outgoing non-mutual cruush as sent", async () => {
    const outgoingCruush = await encryptedRelationshipRecordRow({
      id: "cruush-1",
      type: "cruush",
      actorUserId: userId,
      targetUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"
    });

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          display_name: "Alex",
          ethnicity: [],
          position: [],
          role: [],
          kinks: [],
          kinks_visibility: "public",
          substance_boundaries: [],
          updated_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [outgoingCruush] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        viewer_relationship: expect.objectContaining({
          match_id: null,
          mutual_cruush: false,
          outgoing_cruush: true,
          can_message: false
        })
      })
    });
  });

  it("rate limits repeated reads of another user's profile", async () => {
    const profileRow = {
      id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      display_name: "Alex",
      photos: ["https://example.com/alex.jpg"],
      bio: "Nearby now",
      pronouns: ["they/them"],
      custom_pronouns: "",
      year_of_birth: 1998,
      ethnicity: ["Latinx"],
      identities: ["Non-binary"],
      presentation: ["Femme"],
      sexuality: ["Queer"],
      body_type: ["Athletic"],
      height: "5'8\"",
      weight: "155 lbs",
      position: ["Vers"],
      availability: ["Now"],
      hosting_travel: ["Hosting"],
      kinks: ["Leather"],
      vibes: ["Playful"],
      hobbies: ["Hiking"],
      custom_hobby: "",
      looking_for: ["Dates"],
      hiv_status: ["Negative"],
      custom_hiv_status: "",
      condoms: ["Always"],
      custom_condoms: "",
      prep: ["Daily"],
      custom_prep: "",
      doxypep: ["Sometimes"],
      custom_doxypep: "",
      covid_vaccine: ["Boosted"],
      custom_covid_vaccine: "",
      mpox_vaccine: ["Vaccinated"],
      custom_mpox_vaccine: "",
      substance_boundaries: ["No alcohol involved", "Let's discuss"],
      updated_at: "2026-04-28T12:00:00.000Z"
    };

    query.mockImplementation((sql: string) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from profiles") && normalizedSql.includes("where id = $1")) {
        return Promise.resolve({ rows: [profileRow] });
      }

      return Promise.resolve({ rows: [] });
    });

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/api/profiles/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        headers: {
          "x-user-id": userId
        }
      });

      expect(response.statusCode).toBe(200);
    }

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many profile requests. Try again later.",
        details: expect.any(Object)
      }
    });
  });

  it("returns 404 when the profile does not exist", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Profile not found",
        details: null
      }
    });
  });

  it("validates the payload on PUT /api/profiles/me", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        display_name: "A"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
  });

  it("rejects invalid auth headers on PUT /api/profiles/me", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": "not-a-uuid"
      },
      payload: {
        display_name: "Cruusher"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
        details: expect.any(Object)
      }
    });
  });

  it("rejects unexpected fields on PUT /api/profiles/me", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        display_name: "Cruusher",
        unexpected: "nope"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: expect.any(Object)
      }
    });
  });

  // The profile insert column list grows with the taxonomy, so read each value
  // back by column name instead of pinning a positional index that shifts every
  // time a field is added.
  function profileInsertValue(call: unknown[] | undefined, column: string) {
    const sql = String(call?.[0] ?? "");
    const columnList = sql.slice(sql.indexOf("(") + 1, sql.indexOf(")"));
    const columnIndex = columnList.split(",").map((name) => name.trim()).indexOf(column);
    expect(columnIndex).toBeGreaterThan(-1);
    return (call?.[1] as unknown[] | undefined)?.[columnIndex];
  }

  it("upserts the authenticated profile on PUT /api/profiles/me", async () => {
    query
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          display_name: "Cruusher",
          photos: [],
          bio: "Updated bio",
          pronouns: ["they/them"],
          custom_pronouns: "",
          year_of_birth: 1994,
          ethnicity: ["Latinx"],
          identities: ["Non-binary"],
          presentation: [],
          sexuality: [],
          body_type: [],
          height: "",
          weight: "",
          position: [],
          role: ["submissive"],
          availability: [],
          hosting_travel: [],
          kinks: [],
          kinks_visibility: "public",
          vibes: ["Playful"],
          hobbies: [],
          custom_hobby: "",
          looking_for: ["Dates"],
          hiv_status: [],
          custom_hiv_status: "",
          condoms: [],
          custom_condoms: "",
          prep: [],
          custom_prep: "",
          doxypep: [],
          custom_doxypep: "",
          covid_vaccine: [],
          custom_covid_vaccine: "",
          mpox_vaccine: [],
          custom_mpox_vaccine: "",
          protections: [],
          substance_boundaries: [],
          updated_at: "2026-04-28T12:05:00.000Z"
        }]
      });

    query.mockReset().mockImplementation(async (sql: string) => {
      if (String(sql).includes("trans_crowds_changed_at") && String(sql).includes("from profiles")) {
        return {
          rows: [{
            profile_sensitive_ciphertext: null,
            profile_sensitive_nonce: null,
            profile_sensitive_auth_tag: null,
            profile_sensitive_key_version: null,
            profile_visibility_ciphertext: null,
            profile_visibility_nonce: null,
            profile_visibility_auth_tag: null,
            profile_visibility_key_version: null,
            trans_crowds_changed_at: null,
            identities: [],
            year_of_birth: 1994,
            signal: ""
          }]
        };
      }

      if (String(sql).includes("insert into profiles") && String(sql).includes("returning")) {
        return {
          rows: [{
            id: userId,
            ...payload,
            year_of_birth: 1994,
            ethnicity: [payload.ethnicity],
            updated_at: "2026-04-28T12:05:00.000Z"
          }]
        };
      }

      return { rows: [] };
    });

    const payload = {
      display_name: "Cruusher",
      photos: [],
      bio: "Updated bio",
      tags: [],
      signal: "",
      pronouns: ["they/them"],
      custom_pronouns: "",
      year_of_birth: 1980,
      ethnicity: "Latinx",
      identities: ["Non-binary"],
      presentation: [],
      sexuality: [],
      body_type: [],
      body_hair: ["Smooth"],
      pubic_hair: ["Trimmed"],
      facial_hair: ["Beard"],
      height: "",
      weight: "",
      position: [],
      role: ["submissive"],
      availability: [],
      hosting_travel: [],
      preferred_spots: ["Bars"],
      kinks: [],
      kink_interests: [],
      kinks_visibility: "public",
      vibes: ["Playful"],
      hobbies: [],
      custom_hobby: "",
      looking_for: ["Dates"],
      hiv_status: [],
      custom_hiv_status: "",
      condoms: [],
      custom_condoms: "",
      prep: [],
      custom_prep: "",
      doxypep: [],
      custom_doxypep: "",
      covid_vaccine: [],
      custom_covid_vaccine: "",
      mpox_vaccine: [],
      custom_mpox_vaccine: "",
      protections: [],
      substance_boundaries: [],
      protection_boundaries: ["Condoms required"]
    };

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        ...payload
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.some((call) => String(call[0]).trim().toLowerCase() === "begin")).toBe(true);
    expect(query.mock.calls.some((call) => String(call[0]).trim().toLowerCase() === "commit")).toBe(true);
    const profileInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profiles"));
    const appUserDisplayNameUpdateCall = query.mock.calls.find((call) => String(call[0]).includes("update app_users") && String(call[0]).includes("display_name"));
    expect(profileInsertCall?.[0]).toContain("insert into profiles");
    expect(profileInsertCall?.[1]?.[0]).toBe(userId);
    expect(profileInsertValue(profileInsertCall, "year_of_birth")).toBe(1994);
    expect(profileInsertValue(profileInsertCall, "ethnicity")).toEqual(["Latinx"]);
    expect(profileInsertCall?.[0]).not.toContain("updated_at)");
    expect(appUserDisplayNameUpdateCall?.[1]).toEqual([userId, "Cruusher"]);
    expect(response.json()).toEqual({
      data: {
        id: userId,
        ...payload,
        birth_control: [],
        relationship_status: [],
        zodiac: [],
        health_preferences: [],
        year_of_birth: 1994,
        photo_metadata: [],
        side_badges: {
          left: null,
          right: null
        },
        is_trans: null,
        trans_status_visibility: "mutual_cruushes",
        crowds: [],
        scenes: [],
        archetypes: [],
        hiv_status_visibility: "mutual_cruushes",
        visibility_rules: emptyProfile.visibility_rules,
        updated_at: "2026-04-28T12:05:00.000Z"
      }
    });
  });

  it("lets a legacy unfinished account complete onboarding without re-entering age", async () => {
    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("insert into profiles") && String(sql).includes("returning")) {
        return {
          rows: [{
            id: userId,
            ...emptyProfile,
            display_name: "Cruusher",
            updated_at: "2026-04-28T12:05:00.000Z"
          }]
        };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        ...emptyProfile,
        display_name: "Cruusher",
        year_of_birth: null
      }
    });

    expect(response.statusCode).toBe(200);
    const profileInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profiles"));
    expect(profileInsertValue(profileInsertCall, "year_of_birth")).toBeNull();
  });

  it("uses the account signup birth year when creating a profile", async () => {
    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("select signup_birth_year from app_users")) {
        return { rows: [{ signup_birth_year: 1994 }] };
      }

      if (String(sql).includes("insert into profiles") && String(sql).includes("returning")) {
        return {
          rows: [{
            id: userId,
            ...emptyProfile,
            display_name: "Cruusher",
            year_of_birth: 1994,
            updated_at: "2026-04-28T12:05:00.000Z"
          }]
        };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: { "x-user-id": userId },
      payload: {
        ...emptyProfile,
        display_name: "Cruusher",
        year_of_birth: null
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledWith(
      "select signup_birth_year from app_users where id = $1",
      [userId]
    );
    const profileInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profiles"));
    expect(profileInsertValue(profileInsertCall, "year_of_birth")).toBe(1994);
  });

  it("rejects an under-18 date of birth when creating a profile", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        ...emptyProfile,
        display_name: "Cruusher",
        date_of_birth: "2012-06-15"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed"
      }
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("accepts field-level mutual crowd visibility for kinks and fetishes", async () => {
    query
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          display_name: "Cruusher",
          photos: [],
          bio: "Updated bio",
          pronouns: [],
          custom_pronouns: "",
          year_of_birth: 1994,
          ethnicity: [],
          identities: [],
          presentation: [],
          sexuality: [],
          body_type: [],
          height: "",
          weight: "",
          position: ["top"],
          role: ["switch"],
          availability: [],
          hosting_travel: [],
          kinks: ["leather"],
          kinks_visibility: "mutual_crowds",
          vibes: [],
          hobbies: [],
          custom_hobby: "",
          looking_for: [],
          hiv_status: [],
          custom_hiv_status: "",
          condoms: [],
          custom_condoms: "",
          prep: [],
          custom_prep: "",
          doxypep: [],
          custom_doxypep: "",
          covid_vaccine: [],
          custom_covid_vaccine: "",
          mpox_vaccine: [],
          custom_mpox_vaccine: "",
          protections: [],
          substance_boundaries: [],
          updated_at: "2026-04-28T12:05:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    query.mockReset().mockImplementation(async (sql: string) => {
      if (String(sql).includes("insert into profiles") && String(sql).includes("returning")) {
        return {
          rows: [{
            id: userId,
            ...payload,
            ethnicity: [],
            updated_at: "2026-04-28T12:05:00.000Z"
          }]
        };
      }

      return { rows: [] };
    });

    const payload = {
      ...emptyProfile,
      display_name: "Cruusher",
      date_of_birth: "1994-06-15",
      year_of_birth: 1994,
      position: ["top"],
      role: ["switch"],
      kinks: ["leather"],
      kinks_visibility: "mutual_crowds",
      kink_interests: [{
        kink_id: "leather",
        label: "leather",
        roles: ["give"],
        is_seeking: true,
        visibility: "public"
      }]
    };

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    const tokenInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profile_sensitive_tokens"));
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("is_seeking");
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("roles");
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("visibility");
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        position: ["top"],
        role: ["switch"],
        kinks: ["leather"],
        kinks_visibility: "mutual_crowds",
        kink_interests: [expect.objectContaining({
          kink_id: "leather"
        })]
      })
    });
  });

  it("stores trans status, crowds, kinks, and HIV status through encrypted profile storage and blind tokens", async () => {
    query.mockResolvedValue({
      rows: [{
        id: userId,
        display_name: "Cruusher",
        photos: [],
        bio: "Updated bio",
        pronouns: [],
        custom_pronouns: "",
        year_of_birth: 1994,
        ethnicity: [],
        identities: [],
        presentation: [],
        sexuality: [],
        body_type: [],
        height: "",
        weight: "",
        position: [],
        role: [],
        availability: [],
        hosting_travel: [],
        kinks: [],
        kinks_visibility: "mutual_crowds",
        trans_status_visibility: "mutual_crowds",
        hiv_status: [],
        hiv_status_visibility: "mutual_cruushes",
        vibes: ["Goth"],
        scenes: ["Leather"],
        archetypes: ["Daddy"],
        hobbies: [],
        custom_hobby: "",
        looking_for: [],
        custom_hiv_status: "",
        condoms: [],
        custom_condoms: "",
        prep: [],
        custom_prep: "",
        doxypep: [],
        custom_doxypep: "",
        covid_vaccine: [],
        custom_covid_vaccine: "",
        mpox_vaccine: [],
        custom_mpox_vaccine: "",
        protections: [],
        substance_boundaries: [],
        profile_sensitive_ciphertext: "encrypted",
        profile_sensitive_nonce: "nonce",
        profile_sensitive_auth_tag: "tag",
        profile_sensitive_key_version: "v1",
        profile_sensitive_token_key_version: "v1",
        updated_at: "2026-04-28T12:05:00.000Z"
      }]
    });

    const payload = {
      ...emptyProfile,
      display_name: "Cruusher",
      year_of_birth: 1994,
      is_trans: true,
      trans_status_visibility: "mutual_crowds",
      crowds: ["T4T", "Dyke"],
      kinks: ["leather"],
      kink_interests: [{
        kink_id: "leather",
        label: "leather"
      }],
      kinks_visibility: "mutual_crowds",
      hiv_status: ["undetectable"],
      hiv_status_visibility: "mutual_cruushes",
      vibes: ["Goth"],
      scenes: ["Leather"],
      archetypes: ["Daddy"]
    };

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    const profileInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profiles"));
    expect(profileInsertCall?.[0]).toContain("profile_sensitive_ciphertext");
    expect(profileInsertCall?.[0]).toContain("profile_sensitive_token_key_version");
    expect(profileInsertCall?.[1]).not.toContain("leather");
    expect(profileInsertCall?.[1]).not.toContain("undetectable");
    expect(profileInsertCall?.[1]).not.toContain("T4T");
    expect(profileInsertCall?.[1]).not.toContain("Dyke");
    expect(profileInsertCall?.[1]).not.toContain(true);

    const tokenInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profile_sensitive_tokens"));
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("leather");
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("undetectable");
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("T4T");

    expect(response.json()).toEqual({
      data: expect.objectContaining({
        is_trans: true,
        trans_status_visibility: "mutual_crowds",
        crowds: ["T4T", "Dyke"],
        kinks: ["leather"],
        kinks_visibility: "mutual_crowds",
        hiv_status: ["undetectable"],
        hiv_status_visibility: "mutual_cruushes",
        scenes: ["Leather"],
        archetypes: ["Daddy"]
      })
    });
  });

  it("stores profile visibility rules and active crowd modes through encrypted storage and blind tokens", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: true,
        cruush_plus_expires_at: null
      }]
    });
    query.mockResolvedValue({
      rows: [{
        id: userId,
        display_name: "Cruusher",
        photos: [],
        bio: "Updated bio",
        pronouns: [],
        custom_pronouns: "",
        year_of_birth: 1994,
        ethnicity: [],
        identities: [],
        presentation: [],
        sexuality: [],
        body_type: [],
        height: "",
        weight: "",
        position: [],
        role: [],
        availability: [],
        hosting_travel: [],
        kinks: [],
        kinks_visibility: "public",
        trans_status_visibility: "public",
        hiv_status: [],
        hiv_status_visibility: "mutual_cruushes",
        vibes: [],
        scenes: [],
        archetypes: [],
        hobbies: [],
        custom_hobby: "",
        looking_for: [],
        custom_hiv_status: "",
        condoms: [],
        custom_condoms: "",
        prep: [],
        custom_prep: "",
        doxypep: [],
        custom_doxypep: "",
        covid_vaccine: [],
        custom_covid_vaccine: "",
        mpox_vaccine: [],
        custom_mpox_vaccine: "",
        protections: [],
        substance_boundaries: [],
        profile_sensitive_ciphertext: "encrypted",
        profile_sensitive_nonce: "nonce",
        profile_sensitive_auth_tag: "tag",
        profile_sensitive_key_version: "v1",
        profile_sensitive_token_key_version: "v1",
        profile_visibility_ciphertext: "encrypted-visibility",
        profile_visibility_nonce: "visibility-nonce",
        profile_visibility_auth_tag: "visibility-tag",
        profile_visibility_key_version: "v1",
        profile_visibility_token_key_version: "v1",
        trans_crowds_changed_at: "2026-04-01T12:00:00.000Z",
        revoked_at: "2026-08-09T20:00:00.000Z",
        updated_at: "2026-04-28T12:05:00.000Z"
      }]
    });

    const payload = {
      ...emptyProfile,
      display_name: "Cruusher",
      year_of_birth: 1994,
      is_trans: true,
      crowds: ["T4T", "Dyke"],
      visibility_rules: {
        active_crowd_modes: ["T4T", "Dyke"],
        age_range: [25, 45],
        distance: 25,
        identities: ["nonbinary"],
        presentations: [],
        looking_for: [],
        timing: [],
        hosting: [],
        vibes: [],
        crowds: ["Dyke"],
        hobbies: [],
        positions: [],
        roles: [],
        kinks: ["leather"],
        body_types: ["bear"],
        sexuality: [],
        substance_boundaries: []
      }
    };

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    const profileInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profiles"));
    expect(profileInsertCall?.[0]).toContain("profile_visibility_ciphertext");
    expect(profileInsertCall?.[0]).toContain("profile_visibility_token_key_version");
    expect(profileInsertCall?.[1]).not.toContain("T4T");
    expect(profileInsertCall?.[1]).not.toContain("Dyke");
    expect(profileInsertCall?.[1]).not.toContain("leather");

    const tokenInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profile_sensitive_tokens"));
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("T4T");
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("Dyke");
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("crowd-mode");

    expect(response.json()).toEqual({
      data: expect.objectContaining({
        visibility_rules: {
          ...emptyVisibilityRules,
          ...payload.visibility_rules,
          search_query: "",
          mile_high_club_members: false
        }
      })
    });
  });

  it("allows three profile visibility filters and revokes active Pings before narrowing them", async () => {
    query.mockResolvedValue({
      rows: [{
        id: userId,
        display_name: "Cruusher",
        photos: [],
        bio: "Updated bio",
        pronouns: [],
        custom_pronouns: "",
        year_of_birth: 1994,
        ethnicity: [],
        identities: [],
        presentation: [],
        sexuality: [],
        body_type: [],
        height: "",
        weight: "",
        position: [],
        role: [],
        availability: [],
        hosting_travel: [],
        kinks: [],
        kinks_visibility: "public",
        trans_status_visibility: "public",
        hiv_status: [],
        hiv_status_visibility: "mutual_cruushes",
        vibes: [],
        scenes: [],
        archetypes: [],
        hobbies: [],
        custom_hobby: "",
        looking_for: [],
        custom_hiv_status: "",
        condoms: [],
        custom_condoms: "",
        prep: [],
        custom_prep: "",
        doxypep: [],
        custom_doxypep: "",
        covid_vaccine: [],
        custom_covid_vaccine: "",
        mpox_vaccine: [],
        custom_mpox_vaccine: "",
        protections: [],
        substance_boundaries: [],
        profile_sensitive_ciphertext: null,
        profile_sensitive_nonce: null,
        profile_sensitive_auth_tag: null,
        profile_sensitive_key_version: null,
        profile_visibility_ciphertext: "encrypted-visibility",
        profile_visibility_nonce: "visibility-nonce",
        profile_visibility_auth_tag: "visibility-tag",
        profile_visibility_key_version: "v1",
        profile_visibility_token_key_version: "v1",
        trans_crowds_changed_at: null,
        revoked_at: "2026-08-09T20:00:00.000Z",
        updated_at: "2026-04-28T12:05:00.000Z"
      }]
    });

    const visibilityRules = {
      ...emptyVisibilityRules,
      distance: 25,
      identities: ["nonbinary"],
      looking_for: ["hookup"]
    };

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        ...emptyProfile,
        display_name: "Cruusher",
        year_of_birth: 1994,
        visibility_rules: visibilityRules
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.some((call) => String(call[0]).includes("from user_entitlements"))).toBe(false);
    const pingRevocationIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("update map_pings"));
    const profileWriteIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("insert into profiles"));
    const commitIndex = query.mock.calls.findIndex((call) => String(call[0]).trim().toLowerCase() === "commit");
    expect(pingRevocationIndex).toBeGreaterThan(-1);
    expect(profileWriteIndex).toBeLessThan(pingRevocationIndex);
    expect(pingRevocationIndex).toBeLessThan(commitIndex);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        visibility_rules: visibilityRules
      })
    });
  });

  it("revokes an active Ping when the sender changes their signal", async () => {
    const identityState = {
      profile_sensitive_ciphertext: null,
      profile_sensitive_nonce: null,
      profile_sensitive_auth_tag: null,
      profile_sensitive_key_version: null,
      profile_visibility_ciphertext: null,
      profile_visibility_nonce: null,
      profile_visibility_auth_tag: null,
      profile_visibility_key_version: null,
      trans_crowds_changed_at: null,
      identities: [],
      year_of_birth: 1994,
      signal: "Before"
    };
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("trans_crowds_changed_at") && text.includes("from profiles")) {
        return { rows: [identityState] };
      }
      if (text.includes("insert into profiles") && text.includes("returning")) {
        return {
          rows: [{
            id: userId,
            display_name: "Cruusher",
            signal: "After",
            year_of_birth: 1994,
            updated_at: "2026-08-09T20:00:00.000Z"
          }]
        };
      }
      if (text.includes("from app_users") && text.includes("for update")) {
        return { rows: [{ id: userId }] };
      }
      if (text.includes("from map_pings") && text.includes("for update")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }
      if (text.includes("clock_timestamp()")) {
        return { rows: [{ revoked_at: "2026-08-09T20:00:00.000Z" }] };
      }
      if (text.includes("update map_pings")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        ...emptyProfile,
        display_name: "Cruusher",
        signal: "After",
        year_of_birth: 1994
      }
    });

    expect(response.statusCode).toBe(200);
    const profileWriteIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("insert into profiles"));
    const pingRevocationIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("update map_pings"));
    const commitIndex = query.mock.calls.findIndex((call) => String(call[0]).trim().toLowerCase() === "commit");
    expect(profileWriteIndex).toBeLessThan(pingRevocationIndex);
    expect(pingRevocationIndex).toBeLessThan(commitIndex);
  });

  it("updates manual visibility rules and revokes active Pings when the rules narrow", async () => {
    const visibilityRules: ProfileVisibilityRules = {
      ...emptyVisibilityRules,
      distance: 25,
      identities: ["nonbinary"],
      looking_for: ["hookup"]
    };
    const encryptedProfileVisibility = encryptProfileVisibility(app.config, emptyProfile.visibility_rules);
    const profileRow = {
      id: userId,
      display_name: "Cruusher",
      photos: ["/api/media/profile-photos/c6ba810b-0607-4d2d-955b-b2f2828cfd13.png"],
      bio: "",
      pronouns: [],
      custom_pronouns: "",
      year_of_birth: 1994,
      ethnicity: [],
      identities: [],
      presentation: [],
      sexuality: [],
      body_type: [],
      height: "",
      weight: "",
      position: [],
      role: [],
      availability: [],
      hosting_travel: [],
      kinks: [],
      kinks_visibility: "public",
      trans_status_visibility: "mutual_cruushes",
      hiv_status: [],
      hiv_status_visibility: "mutual_cruushes",
      vibes: [],
      scenes: [],
      archetypes: [],
      hobbies: [],
      custom_hobby: "",
      looking_for: [],
      custom_hiv_status: "",
      condoms: [],
      custom_condoms: "",
      prep: [],
      custom_prep: "",
      doxypep: [],
      custom_doxypep: "",
      covid_vaccine: [],
      custom_covid_vaccine: "",
      mpox_vaccine: [],
      custom_mpox_vaccine: "",
      protections: [],
      substance_boundaries: [],
      profile_sensitive_ciphertext: null,
      profile_sensitive_nonce: null,
      profile_sensitive_auth_tag: null,
      profile_sensitive_key_version: null,
      profile_sensitive_token_key_version: null,
      ...encryptedProfileVisibility,
      trans_crowds_changed_at: null,
      updated_at: "2026-07-31T12:05:00.000Z"
    };

    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from map_pings") && text.includes("for update")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }

      if (text.includes("clock_timestamp()")) {
        return { rows: [{ revoked_at: "2026-08-09T20:00:00.000Z" }] };
      }

      if (
        (text.includes("from profiles") && text.includes("where id = $1")) ||
        text.includes("update profiles")
      ) {
        return {
          rows: [profileRow]
        };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me/visibility-rules",
      headers: {
        "x-user-id": userId
      },
      payload: {
        visibility_rules: visibilityRules
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.some((call) => String(call[0]).includes("from user_entitlements"))).toBe(false);
    expect(query.mock.calls.some((call) => String(call[0]).includes("insert into profiles"))).toBe(false);
    expect(query.mock.calls.some((call) => String(call[0]).includes("update profiles"))).toBe(true);
    const pingRevocationIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("update map_pings"));
    const profileUpdateIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("update profiles"));
    const commitIndex = query.mock.calls.findIndex((call) => String(call[0]).trim().toLowerCase() === "commit");
    expect(pingRevocationIndex).toBeGreaterThan(-1);
    expect(profileUpdateIndex).toBeLessThan(pingRevocationIndex);
    expect(pingRevocationIndex).toBeLessThan(commitIndex);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        visibility_rules: visibilityRules
      })
    });
  });

  it("requires cruush+ when manual visibility rules exceed three exclusion filters", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        email: "not-owner@example.com"
      }]
    }).mockResolvedValueOnce({
      rows: [{
        email: "not-owner@example.com"
      }]
    }).mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: false,
        cruush_plus_expires_at: null
      }]
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me/visibility-rules",
      headers: {
        "x-user-id": userId
      },
      payload: {
        visibility_rules: {
          ...emptyProfile.visibility_rules,
          distance: 25,
          identities: ["nonbinary"],
          looking_for: ["hookup"],
          kinks: ["leather"]
        }
      }
    });

    expect(response.statusCode).toBe(402);
    expect(query.mock.calls.some((call) => String(call[0]).includes("from user_entitlements"))).toBe(true);
    expect(query.mock.calls.some((call) => String(call[0]).includes("update profiles"))).toBe(false);
    expect(response.json()).toEqual({
      error: {
        code: "CRUUSH_PLUS_REQUIRED",
        message: "Free accounts can use up to 3 visibility filters. Upgrade to cruush+ for more.",
        details: null
      }
    });
  });

  it("requires cruush+ when free users save more than three visibility exclusion filters", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: false,
        cruush_plus_expires_at: null
      }]
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        ...emptyProfile,
        display_name: "Cruusher",
        year_of_birth: 1994,
        visibility_rules: {
          ...emptyProfile.visibility_rules,
          distance: 25,
          identities: ["nonbinary"],
          looking_for: ["hookup"],
          kinks: ["leather"]
        }
      }
    });

    expect(response.statusCode).toBe(402);
    expect(query.mock.calls[0]?.[0]).toContain("from user_entitlements");
    expect(query.mock.calls.some((call) => String(call[0]).includes("insert into profiles"))).toBe(false);
    expect(response.json()).toEqual({
      error: {
        code: "CRUUSH_PLUS_REQUIRED",
        message: "Free accounts can use up to 3 visibility filters. Upgrade to cruush+ for more.",
        details: null
      }
    });
  });

  it("requires cruush+ before creating saved visibility sets", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: false,
        cruush_plus_expires_at: null
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profiles/me/visibility-sets",
      headers: {
        "x-user-id": userId
      },
      payload: {
        name: "Night out",
        visibility_rules: {
          ...emptyProfile.visibility_rules,
          distance: 25
        }
      }
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toEqual({
      error: {
        code: "CRUUSH_PLUS_REQUIRED",
        message: "Upgrade to cruush+ to save visibility sets.",
        details: null
      }
    });
  });

  it("rejects saved visibility set predicates for HIV status, trans status, and ethnicity", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: true,
        cruush_plus_expires_at: null
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/profiles/me/visibility-sets",
      headers: {
        "x-user-id": userId
      },
      payload: {
        name: "Blocked fields",
        visibility_rules: {
          ...emptyProfile.visibility_rules,
          hiv_status: ["undetectable"],
          trans_status: [true],
          ethnicity: ["Latinx"]
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query.mock.calls.some((call) => String(call[0]).includes("insert into profile_visibility_sets"))).toBe(false);
  });

  it("lets cruush+ users create, list, update, and delete saved visibility sets", async () => {
    const savedSetId = "9a58ce18-7b9c-4da0-b6ef-183414c41ed8";
    const savedRules = {
      ...emptyVisibilityRules,
      distance: 25,
      looking_for: ["hookup"],
      kinks: ["leather"]
    };
    const updatedRules = {
      ...emptyVisibilityRules,
      active_crowd_modes: ["T4T"],
      distance: 10
    };
    const encryptedSavedRules = encryptProfileVisibility(app.config, savedRules);

    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from user_entitlements")) {
        return {
          rows: [{
            cruush_plus_enabled: true,
            cruush_plus_expires_at: null
          }]
        };
      }

      if (text.includes("insert into profile_visibility_sets")) {
        return {
          rows: [{
            id: savedSetId,
            name: "Night out",
            created_at: "2026-07-08T12:00:00.000Z",
            updated_at: "2026-07-08T12:00:00.000Z"
          }]
        };
      }

      if (text.includes("from profile_visibility_sets") && text.includes("order by")) {
        return {
          rows: [{
            id: savedSetId,
            user_id: userId,
            name: "Night out",
            ...encryptedSavedRules,
            created_at: "2026-07-08T12:00:00.000Z",
            updated_at: "2026-07-08T12:00:00.000Z"
          }]
        };
      }

      if (text.includes("update profile_visibility_sets")) {
        return {
          rows: [{
            id: savedSetId,
            name: "T4T close",
            created_at: "2026-07-08T12:00:00.000Z",
            updated_at: "2026-07-08T12:05:00.000Z"
          }]
        };
      }

      if (text.includes("delete from profile_visibility_sets")) {
        return { rows: [{ id: savedSetId }] };
      }

      return { rows: [] };
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/profiles/me/visibility-sets",
      headers: {
        "x-user-id": userId
      },
      payload: {
        name: "Night out",
        visibility_rules: savedRules
      }
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toEqual({
      data: expect.objectContaining({
        id: savedSetId,
        name: "Night out",
        visibility_rules: savedRules
      })
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/profiles/me/visibility-sets",
      headers: {
        "x-user-id": userId
      }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      data: [expect.objectContaining({
        id: savedSetId,
        name: "Night out",
        visibility_rules: savedRules
      })]
    });

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/api/profiles/me/visibility-sets/${savedSetId}`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        name: "T4T close",
        visibility_rules: updatedRules
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual({
      data: expect.objectContaining({
        id: savedSetId,
        name: "T4T close",
        visibility_rules: updatedRules
      })
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/profiles/me/visibility-sets/${savedSetId}`,
      headers: {
        "x-user-id": userId
      }
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({
      data: {
        deleted: true,
        id: savedSetId
      }
    });
  });

  it("applies a saved visibility set through the normal profile visibility save path", async () => {
    const savedSetId = "9a58ce18-7b9c-4da0-b6ef-183414c41ed8";
    const savedRules: ProfileVisibilityRules = {
      ...emptyProfile.visibility_rules,
      active_crowd_modes: ["T4T"],
      distance: 10
    };
    const encryptedSavedRules = encryptProfileVisibility(app.config, savedRules);
    const encryptedSensitiveProfile = encryptSensitiveProfile(app.config, {
      is_trans: true,
      crowds: ["T4T"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });
    const encryptedProfileVisibility = encryptProfileVisibility(app.config, emptyProfile.visibility_rules);

    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from user_entitlements")) {
        return {
          rows: [{
            cruush_plus_enabled: true,
            cruush_plus_expires_at: null
          }]
        };
      }

      if (text.includes("from profile_visibility_sets") && text.includes("where user_id = $1")) {
        return {
          rows: [{
            id: savedSetId,
            user_id: userId,
            name: "T4T close",
            ...encryptedSavedRules,
            created_at: "2026-07-08T12:00:00.000Z",
            updated_at: "2026-07-08T12:00:00.000Z"
          }]
        };
      }

      if (text.includes("from map_pings") && text.includes("for update")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }

      if (text.includes("clock_timestamp()")) {
        return { rows: [{ revoked_at: "2026-08-09T20:00:00.000Z" }] };
      }

      if (text.includes("update map_pings")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }

      if (text.includes("from profiles") && text.includes("where id = $1")) {
        return {
          rows: [{
            id: userId,
            display_name: "Cruusher",
            photos: [],
            bio: "",
            pronouns: [],
            custom_pronouns: "",
            year_of_birth: 1994,
            ethnicity: [],
            identities: [],
            presentation: [],
            sexuality: [],
            body_type: [],
            height: "",
            weight: "",
            position: [],
            role: [],
            availability: [],
            hosting_travel: [],
            kinks: [],
            kinks_visibility: "public",
            trans_status_visibility: "mutual_cruushes",
            hiv_status: [],
            hiv_status_visibility: "mutual_cruushes",
            vibes: [],
            scenes: [],
            archetypes: [],
            hobbies: [],
            custom_hobby: "",
            looking_for: [],
            custom_hiv_status: "",
            condoms: [],
            custom_condoms: "",
            prep: [],
            custom_prep: "",
            doxypep: [],
            custom_doxypep: "",
            covid_vaccine: [],
            custom_covid_vaccine: "",
            mpox_vaccine: [],
            custom_mpox_vaccine: "",
            protections: [],
            substance_boundaries: [],
            ...encryptedSensitiveProfile,
            ...encryptedProfileVisibility,
            trans_crowds_changed_at: null,
            updated_at: "2026-07-08T12:05:00.000Z"
          }]
        };
      }

      if (text.includes("update profiles")) {
        return {
          rows: [{
            id: userId,
            display_name: "Cruusher",
            photos: [],
            bio: "",
            pronouns: [],
            custom_pronouns: "",
            year_of_birth: 1994,
            ethnicity: [],
            identities: [],
            presentation: [],
            sexuality: [],
            body_type: [],
            height: "",
            weight: "",
            position: [],
            role: [],
            availability: [],
            hosting_travel: [],
            kinks: [],
            kinks_visibility: "public",
            trans_status_visibility: "mutual_cruushes",
            hiv_status: [],
            hiv_status_visibility: "mutual_cruushes",
            vibes: [],
            scenes: [],
            archetypes: [],
            hobbies: [],
            custom_hobby: "",
            looking_for: [],
            custom_hiv_status: "",
            condoms: [],
            custom_condoms: "",
            prep: [],
            custom_prep: "",
            doxypep: [],
            custom_doxypep: "",
            covid_vaccine: [],
            custom_covid_vaccine: "",
            mpox_vaccine: [],
            custom_mpox_vaccine: "",
            protections: [],
            substance_boundaries: [],
            ...encryptedSensitiveProfile,
            ...encryptedProfileVisibility,
            trans_crowds_changed_at: null,
            updated_at: "2026-07-08T12:05:00.000Z"
          }]
        };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/profiles/me/visibility-sets/${savedSetId}/apply`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.some((call) => String(call[0]).includes("update profiles"))).toBe(true);
    expect(query.mock.calls.some((call) => String(call[0]).includes("insert into profile_sensitive_tokens"))).toBe(true);
    const profileWriteIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("update profiles"));
    const pingRevocationIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("update map_pings"));
    const commitIndex = query.mock.calls.findIndex((call) => String(call[0]).trim().toLowerCase() === "commit");
    expect(profileWriteIndex).toBeLessThan(pingRevocationIndex);
    expect(pingRevocationIndex).toBeLessThan(commitIndex);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        visibility_rules: savedRules
      })
    });
  });

  it("rejects gender identity, trans status, and crowd selection changes within the 3 day lock window", async () => {
    const existingSensitiveProfile = encryptSensitiveProfile(app.config, {
      is_trans: true,
      crowds: ["T4T"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });

    query.mockResolvedValueOnce({
      rows: [{
        ...existingSensitiveProfile,
        identities: ["nonbinary"],
        trans_crowds_changed_at: new Date().toISOString()
      }]
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        ...emptyProfile,
        display_name: "Cruusher",
        year_of_birth: 1994,
        identities: ["woman"],
        is_trans: true,
        crowds: ["T4T", "Dyke"]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Gender identity, trans status, and crowd selection can only be changed once every 3 days.",
        details: null
      }
    });
  });

  it("rejects local data image profile photos on PUT /api/profiles/me", async () => {
    const localPhoto = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        ...emptyProfile,
        display_name: "Cruusher",
        year_of_birth: 1994,
        photos: [localPhoto]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed"
      }
    });
  });

  it("stores the authenticated profile location on PUT /api/profiles/me/location", async () => {
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from map_pings") && text.includes("for update")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }
      if (text.includes("clock_timestamp()")) {
        return { rows: [{ revoked_at: "2026-08-09T20:00:00.000Z" }] };
      }
      if (text.includes("update map_pings")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me/location",
      headers: {
        "x-user-id": userId
      },
      payload: {
        lat: 40.711,
        lng: -74.002,
        fuzz_radius_meters: 50
      }
    });

    expect(response.statusCode).toBe(200);
    const profileWriteIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("insert into profiles"));
    const locationWriteIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("insert into encrypted_location_envelopes"));
    const pingRevocationIndex = query.mock.calls.findIndex((call) => String(call[0]).includes("update map_pings"));
    const commitIndex = query.mock.calls.findIndex((call) => String(call[0]).trim().toLowerCase() === "commit");
    expect(query.mock.calls[profileWriteIndex]?.[0]).toContain("location_updated_at");
    expect(query.mock.calls[profileWriteIndex]?.[1]?.[0]).toBe(userId);
    expect(profileWriteIndex).toBeLessThan(locationWriteIndex);
    expect(locationWriteIndex).toBeLessThan(pingRevocationIndex);
    expect(pingRevocationIndex).toBeLessThan(commitIndex);
    const persistedLocationParams = query.mock.calls[locationWriteIndex]?.[1] ?? [];
    expect(persistedLocationParams).not.toContain(40.711);
    expect(persistedLocationParams).not.toContain(-74.002);
    expect(response.json()).toMatchObject({
      data: {
        id: userId,
        display_location_token: expect.objectContaining({
          version: 1,
          tokenVersion: 1,
          ciphertext: expect.any(String)
        }),
        display_expires_at_ms: expect.any(Number),
        display_mode: "PRECISE",
        animation_hint: "NONE",
        location_updated_at: expect.any(String)
      }
    });
    expect(response.json().data).not.toHaveProperty("lat");
    expect(response.json().data).not.toHaveProperty("lng");
    expect(notifyNearbyUsersForLocationUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns a separate self-only public Ghost decoy token when syncing an active Ghost location", async () => {
    const ghostPolicy = await encryptedVisibilityPolicyRow({
      subjectUserId: userId,
      baseMode: "GHOST",
      ghostRadiusMeters: 1609
    });
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("from encrypted_visibility_tokens")) {
        return { rows: [ghostPolicy] };
      }
      if (text.includes("insert into ghost_rotation_tokens")) {
        return { rows: [{ subject_user_id: userId }] };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me/location",
      headers: {
        "x-user-id": userId
      },
      payload: {
        lat: 40.711,
        lng: -74.002,
        fuzz_radius_meters: 50
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        id: userId,
        display_location_token: expect.objectContaining({
          version: 1,
          tokenVersion: 1,
          ciphertext: expect.any(String)
        }),
        display_mode: "PRECISE",
        ghost_display_location_token: expect.objectContaining({
          version: 1,
          tokenVersion: 1,
          ciphertext: expect.any(String)
        }),
        ghost_display_expires_at_ms: expect.any(Number)
      }
    });
    expect(response.json().data.ghost_display_location_token.tokenId)
      .not.toBe(response.json().data.display_location_token.tokenId);
    expect(response.json().data).not.toHaveProperty("lat");
    expect(response.json().data).not.toHaveProperty("lng");
  });

  it.each([
    ["recently visible", false, 0],
    ["returning after the map window", true, 1]
  ])("dispatches nearby notifications only for a profile that is %s", async (_state, isNewMapAppearance, expectedDispatches) => {
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);

      if (text.includes("as is_new_map_appearance") && text.includes("for update")) {
        return { rows: [{ is_new_map_appearance: isNewMapAppearance }] };
      }

      return { rows: [] };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me/location",
      headers: {
        "x-user-id": userId
      },
      payload: {
        lat: 40.711,
        lng: -74.002,
        fuzz_radius_meters: 50
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("as is_new_map_appearance"))).toBe(true);
    expect(notifyNearbyUsersForLocationUpdate).toHaveBeenCalledTimes(expectedDispatches);
  });

  it("stores a Ping location sync without dispatching nearby notifications", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me/location",
      headers: {
        "x-user-id": userId
      },
      payload: {
        lat: 40.711,
        lng: -74.002,
        fuzz_radius_meters: 50,
        sync_reason: "PING"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls.some((call) => String(call[0]).includes("insert into encrypted_location_envelopes"))).toBe(true);
    expect(notifyNearbyUsersForLocationUpdate).not.toHaveBeenCalled();
  });

  it("invalidates active sessions after resetting a password", async () => {
    const resetToken = "reset-token-1234567890";
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: []
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/password/reset",
      payload: {
        token: resetToken,
        password: "new-password-123"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[2]?.[0]).toContain("delete from app_sessions");
    expect(query.mock.calls[2]?.[1]).toEqual([userId]);
    expect(query.mock.calls[3]?.[0]).toContain("delete from password_reset_tokens");
  });

  it("rate limits repeated forgot password requests for the same email", async () => {
    query.mockResolvedValue({ rows: [] });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/password/forgot",
        payload: {
          email: "river@example.com"
        }
      });

      expect(response.statusCode).toBe(202);
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/password/forgot",
      payload: {
        email: "river@example.com"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many password reset requests. Try again later.",
        details: expect.any(Object)
      }
    });
  });

  it("returns a consistent 500 payload for unexpected errors", async () => {
    query.mockRejectedValueOnce(new Error("db unavailable"));

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        details: null
      }
    });
  });

  it.each([
    ["nearest", "distance_miles asc nulls last, lower(name) asc, id asc"],
    ["active", "active_checkins desc, recent_activity_at desc nulls last, distance_miles asc nulls last, id asc"],
    ["recent", "recent_activity_at desc nulls last, active_checkins desc, distance_miles asc nulls last, id asc"],
    ["top_rated", "(rating_count >= 3) desc, rating_average desc nulls last, rating_count desc, distance_miles asc nulls last, id asc"],
    ["az", "lower(name) asc, distance_miles asc nulls last, id asc"]
  ])("lists published Spots with the %s sort and bounded pagination", async (sort, expectedOrder) => {
    const response = await app.inject({
      method: "GET",
      url: `/api/places?lat=40.7128&lng=-74.006&radiusMiles=100&sort=${sort}&limit=23&offset=46`,
      headers: { "x-user-id": userId }
    });
    const listCall = query.mock.calls.find(([sql]) => String(sql).includes("where p.status = 'published'"));
    const listSql = String(listCall?.[0]);

    expect(response.statusCode).toBe(200);
    expect(response.json().page).toEqual({ limit: 23, offset: 46, hasMore: false });
    expect(listSql).toContain(`order by ${expectedOrder}`);
    expect(listSql).toContain("limit $10 offset $11");
    expect(listCall?.[1]).toEqual(expect.arrayContaining([100, 23, 46]));
    // The page stays bounded, and both radius limits still apply: the viewport
    // radius and the independent NYC service-area radius.
    expect(listCall?.[1]?.[8]).toBe(100);
    expect(listCall?.[1]?.[9]).toBe(23);
    expect(listCall?.[1]?.[10]).toBe(46);
    expect(listCall?.[1]?.[13]).toBe(100);
  });

  it("rejects a published Spot search radius above 100 miles before database access", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/places?lat=40.7128&lng=-74.006&radiusMiles=100.01",
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("reads encrypted Spot board messages and uses encrypted mutual relationships", async () => {
    const placeId = "10000000-0000-4000-8000-000000000001";
    const authorUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const encrypted = encryptTextContent(app.config, "feed", "Meet by the entrance");
    const mutualRecord = await encryptedRelationshipRecordRow({
      id: "spot-board-mutual",
      type: "mutual_cruush",
      actorUserId: userId,
      targetUserId: authorUserId
    });

    query.mockImplementation((sql: string) => {
      const text = sql.toLowerCase();

      if (text.includes("from places where id")) {
        return Promise.resolve({ rows: [{ id: placeId, latitude: 40.7, longitude: -74 }] });
      }

      if (text.includes("from place_board_messages m")) {
        return Promise.resolve({
          rows: [{
            id: "20000000-0000-4000-8000-000000000001",
            user_id: authorUserId,
            content: "[encrypted]",
            content_ciphertext: encrypted.ciphertext,
            content_nonce: encrypted.nonce,
            content_auth_tag: encrypted.authTag,
            content_key_version: encrypted.keyVersion,
            created_at: "2026-08-31T16:00:00.000Z",
            expires_at: "2026-08-31T19:00:00.000Z",
            display_name: "River",
            photo: null,
            photo_explicit: false,
            pronouns: ["they/them"],
            vibes: [],
            scenes: [],
            archetypes: [],
            badges: [],
            side_badges: null,
            travelling: false
          }]
        });
      }

      if (text.includes("from encrypted_relationship_records")) {
        return Promise.resolve({ rows: [mutualRecord] });
      }

      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/places/${placeId}/board`,
      headers: { "x-user-id": userId }
    });
    const boardSql = String(query.mock.calls.find(([sql]) => String(sql).includes("from place_board_messages m"))?.[0]);
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toEqual(expect.objectContaining({
      content: "Meet by the entrance",
      canDelete: false,
      user: expect.objectContaining({ id: authorUserId, mutual: true })
    }));
    expect(boardSql).toContain("b.blocker_user_id = $2 and b.blocked_user_id = m.user_id");
    expect(boardSql).toContain("b.blocker_user_id = m.user_id and b.blocked_user_id = $2");
    // Pink Book posts persist until deleted, so the read is gated on an active
    // check-in instead of a message expiry: without one a viewer sees only
    // their own posts.
    expect(boardSql).toContain("($5::boolean or m.user_id = $2)");
    expect(boardSql).not.toContain("m.expires_at >");
    expect(queries.some((sql) => sql.includes("from place_checkins")
      && sql.includes("expires_at > now()"))).toBe(true);
    expect(queries.some((sql) => sql.includes("encrypted_relationship_records"))).toBe(true);
    expect(queries.every((sql) => !sql.includes("cruush_matches"))).toBe(true);
  });

  it("stores new Spot board text only as encrypted content", async () => {
    const placeId = "10000000-0000-4000-8000-000000000001";
    const content = "Meet by the entrance";
    let boardInsertSql = "";
    let boardInsertParams: unknown[] = [];
    let checkinInsertSql = "";
    let checkinInsertParams: unknown[] = [];

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const text = sql.toLowerCase();

      if (text.includes("from places where id")) {
        return Promise.resolve({ rows: [{ id: placeId, latitude: 40.7, longitude: -74 }] });
      }

      if (text.includes("select exists") && text.includes("feature_restrictions")) {
        return Promise.resolve({ rows: [{ allowed: true }] });
      }

      if (text.includes("insert into place_checkin_events")) {
        return Promise.resolve({ rows: [{ place_id: placeId }], rowCount: 1 });
      }

      if (text.includes("insert into place_checkins")) {
        checkinInsertSql = sql;
        checkinInsertParams = params;
        return Promise.resolve({ rows: [{ expires_at: "2026-08-31T19:00:00.000Z" }] });
      }

      if (text.includes("insert into place_board_messages")) {
        boardInsertSql = sql;
        boardInsertParams = params;
        return Promise.resolve({ rows: [{ id: "20000000-0000-4000-8000-000000000001" }] });
      }

      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/places/${placeId}/check-ins`,
      headers: { "x-user-id": userId },
      payload: {
        content,
        durationHours: 3,
        visible: true,
        latitude: 40.7,
        longitude: -74,
        accuracyMeters: 10,
        observedAt: new Date().toISOString()
      }
    });

    expect(response.statusCode).toBe(201);
    expect(boardInsertSql).toContain("'[encrypted]'");
    // The Pink Book post outlives the check-in that carried it: it is stored
    // with no expiry and removed only when its author deletes it.
    expect(boardInsertSql).toContain("expires_at");
    expect(boardInsertSql).toContain(", null)");
    expect(boardInsertSql).not.toContain("interval '1 hour'");
    expect(boardInsertParams).not.toContain(content);
    expect(boardInsertParams).toHaveLength(6);
    // The check-in itself still expires on the requested schedule.
    expect(checkinInsertSql).toContain("now() + ($4::int * interval '1 hour')");
    expect(checkinInsertParams).toEqual([userId, placeId, true, 3]);
    expect(decryptTextContent(app.config, "feed", {
      ciphertext: String(boardInsertParams[2]),
      nonce: String(boardInsertParams[3]),
      authTag: String(boardInsertParams[4]),
      keyVersion: String(boardInsertParams[5])
    })).toBe(content);
  });

  it("derives Who's Here mutual state from encrypted relationships", async () => {
    const placeId = "10000000-0000-4000-8000-000000000001";
    const checkedInUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";
    const mutualRecord = await encryptedRelationshipRecordRow({
      id: "spot-who-is-here-mutual",
      type: "mutual_cruush",
      actorUserId: checkedInUserId,
      targetUserId: userId
    });

    query.mockImplementation((sql: string) => {
      const text = sql.toLowerCase();

      if (text.includes("from places p where p.id")) {
        return Promise.resolve({
          rows: [{
            id: placeId,
            slug: "test-spot",
            name: "Test Spot",
            description: "",
            latitude: 40.7,
            longitude: -74,
            address: null,
            facility_type: "bar",
            status: "published",
            source_kind: "community",
            source_url: null,
            source_attribution: null,
            verified_at: null,
            created_at: "2026-08-31T16:00:00.000Z",
            tags: [],
            distance_miles: null,
            active_checkins: 1,
            recent_activity_at: null,
            rating_average: null,
            rating_count: 0,
            viewer_rating: null,
            suggestion_count: 1,
            auto_shortlisted_at: null
          }]
        });
      }

      if (text.includes("from place_checkins c") && text.includes("join app_users u")) {
        return Promise.resolve({
          rows: [{
            id: checkedInUserId,
            name: "River",
            photo: null,
            photo_explicit: false,
            pronouns: ["they/them"],
            side_badges: null,
            badges: [],
            travelling: false
          }]
        });
      }

      if (text.includes("from encrypted_relationship_records")) {
        return Promise.resolve({ rows: [mutualRecord] });
      }

      return Promise.resolve({ rows: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/places/${placeId}`,
      headers: { "x-user-id": userId }
    });
    const peopleSql = String(query.mock.calls.find(([sql]) => {
      const text = String(sql);
      return text.includes("from place_checkins c") && text.includes("join app_users u");
    })?.[0]);
    const queries = query.mock.calls.map(([sql]) => String(sql));
    const popularTimesSql = queries.find((sql) => sql.includes("select extract(isodow") && sql.includes("from place_activity_hourly"));
    const ratingsSql = queries.find((sql) => sql.includes("from unnest(array['overall'"));

    expect(response.statusCode).toBe(200);
    expect(response.json().data.visiblePeople).toEqual([
      expect.objectContaining({ id: checkedInUserId, mutual: true })
    ]);
    expect(peopleSql).toContain("b.blocker_user_id = $2 and b.blocked_user_id = c.user_id");
    expect(peopleSql).toContain("b.blocker_user_id = c.user_id and b.blocked_user_id = $2");
    expect(peopleSql).toContain("c.visible = true and c.expires_at > now()");
    expect(queries.some((sql) => sql.includes("encrypted_relationship_records"))).toBe(true);
    expect(queries.every((sql) => !sql.includes("cruush_matches"))).toBe(true);
    expect(popularTimesSql).toContain("bucket_start >= now() - interval '90 days'");
    // Imported venue baselines sit beside member check-ins, and a bucket is
    // still withheld below three visits.
    expect(popularTimesSql).toContain("sum(checkin_count)::int as count");
    expect(popularTimesSql).toContain("from place_popular_time_baselines");
    expect(popularTimesSql).toContain("having sum(count) >= 3");
    expect(ratingsSql).toContain("'overall', 'gender_inclusivity', 'lgbtq_friendliness', 'safety', 'accessibility', 'cleanliness'");
  });

  it("enforces Spot board message deletion ownership in the delete statement", async () => {
    const placeId = "10000000-0000-4000-8000-000000000001";
    const messageId = "20000000-0000-4000-8000-000000000001";
    const otherUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      if (sql.toLowerCase().includes("from places where id")) {
        return Promise.resolve({ rows: [{ id: placeId, latitude: 40.7, longitude: -74 }] });
      }

      if (sql.toLowerCase().includes("delete from place_board_messages")) {
        return Promise.resolve({ rows: [], rowCount: params[2] === userId ? 1 : 0 });
      }

      return Promise.resolve({ rows: [] });
    });

    const denied = await app.inject({
      method: "DELETE",
      url: `/api/places/${placeId}/board/${messageId}`,
      headers: { "x-user-id": otherUserId }
    });
    const allowed = await app.inject({
      method: "DELETE",
      url: `/api/places/${placeId}/board/${messageId}`,
      headers: { "x-user-id": userId }
    });
    const deleteCalls = query.mock.calls.filter(([sql]) => String(sql).includes("delete from place_board_messages"));

    expect(denied.statusCode).toBe(404);
    expect(allowed.statusCode).toBe(204);
    expect(deleteCalls).toHaveLength(2);
    expect(String(deleteCalls[0]?.[0])).toContain("user_id = $3");
    expect(deleteCalls[0]?.[1]).toEqual([messageId, placeId, otherUserId]);
    expect(deleteCalls[1]?.[1]).toEqual([messageId, placeId, userId]);
  });

  it("denies Feed photo bytes when the authenticated viewer is outside the post audience", async () => {
    const assetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const ownerUserId = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

    query
      .mockResolvedValueOnce({
        rows: [{
          owner_user_id: ownerUserId,
          surface: "feed_photo",
          object_key: "feed-photos/not-read.enc",
          mime_type: "image/webp",
          encrypted_data_key: "unused",
          data_key_nonce: "unused",
          data_key_auth_tag: "unused",
          content_nonce: "unused",
          content_auth_tag: "unused",
          key_version: "v1"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          owner_user_id: ownerUserId,
          audience: "crowd",
          has_shared_crowd: false
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: `/api/media/assets/${assetId}/display`,
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(404);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1]?.[0]).toContain("from feed_post_attachments attachment");
    expect(query.mock.calls[1]?.[0]).toContain("post.expires_at > now()");
    expect(query.mock.calls[1]?.[0]).toContain("viewer_token.user_id = $2");
    expect(query.mock.calls[2]?.[0]).toContain("from user_blocks");
  });
});
