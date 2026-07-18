import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { buildServer } from "./app.js";
import { createSessionCookie, generateSessionToken, hashPassword, hashSessionToken } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { DEVELOPMENT_ADMIN_EMAIL, DEVELOPMENT_ADMIN_LOCATION } from "./development-admin.js";
import {
  buildEncryptedRelationshipPayload,
  issueEncryptedRelationshipToken,
  upsertEncryptedRelationshipRecord,
  type EncryptedRelationshipRecordRow
} from "./encrypted-relationships.js";
import { emptyProfile } from "./profile-schema.js";
import { createCrowdTokens, encryptProfileVisibility, encryptSensitiveProfile, type ProfileVisibilityRules } from "./profile-sensitive.js";
import { createMemoryRateLimiter } from "./rate-limit.js";
import {
  decryptDisplayLocationTokenForTest,
  saveVisibilityPolicy,
  storeLocationEnvelope,
  type VisibilityBaseMode
} from "./location-privacy.js";
import { encryptMediaBytes } from "./media-encryption.js";
import { deleteEncryptedMediaObject, readEncryptedMediaObject, writeEncryptedMediaObject } from "./media-storage.js";

const query = vi.fn();
const end = vi.fn().mockResolvedValue(undefined);
const rateLimiter = createMemoryRateLimiter();
const app = buildServer({
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
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
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
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
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
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
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
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
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
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
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
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
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
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
  query.mockReset();
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

  const insertCall = policyQuery.mock.calls.find(([sql]) => String(sql).includes("insert into encrypted_visibility_tokens"));
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
      migratedFromSupabase: true
    });
  });

  it("does not mount admin moderation routes while human moderation is disabled", async () => {
    const response = await productionApp.inject({
      method: "GET",
      url: "/api/admin/moderation/reports"
    });

    expect(response.statusCode).toBe(404);
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
      url: "/api/auth/signup",
      payload: {
        email: "river@example.com",
        password: "password-123",
        displayName: "River"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("insert into app_users");
    expect(query.mock.calls[1]?.[0]).toContain("delete from email_verification_tokens");
    expect(query.mock.calls[2]?.[0]).toContain("insert into email_verification_tokens");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.json()).toEqual({
      data: {
        alreadyVerified: false,
        email: "river@example.com",
        expiresAt: "2026-04-30T12:00:00.000Z",
        previewUrl: expect.stringContaining("https://cruush.test/?verifyEmailToken=")
      }
    });
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
        displayName: "River"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: {
        alreadyVerified: false,
        email: "river@example.com",
        expiresAt: "2026-04-30T12:00:00.000Z",
        previewUrl: expect.stringContaining("https://www.cruush.app/?verifyEmailToken=")
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
        displayName: "River"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: {
        alreadyVerified: false,
        email: "river@example.com",
        expiresAt: "2026-04-30T12:00:00.000Z",
        previewUrl: expect.stringContaining("https://www.cruush.app/?verifyEmailToken=")
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

  it("rejects login for suspended accounts without revealing account state", async () => {
    const passwordHash = await hashPassword("password-123");
    query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        email: "river@example.com",
        password_hash: passwordHash,
        display_name: "River",
        email_verified_at: "2026-04-28T12:00:00.000Z",
        created_at: "2026-04-28T12:00:00.000Z",
        account_status: "suspended"
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

    expect(response.statusCode).toBe(401);
    expect(query).toHaveBeenCalledTimes(1);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Invalid email or password.",
        details: null
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
        needsCodeOfConduct: true,
        codeOfConductVersion: "2026-07-07",
        acceptedCodeOfConductVersion: null,
        codeOfConductAcceptedAt: null
      }
    });
  });

  it("deletes the current user's account, media objects, sessions, and session cookie", async () => {
    const sessionToken = "test-session-token";
    const passwordHash = await hashPassword("current-password");
    const objectKey = `profile-photos/${userId}/delete-account-test.enc`;
    await writeEncryptedMediaObject(app.config, objectKey, Buffer.from("encrypted"));
    await expect(readEncryptedMediaObject(app.config, objectKey)).resolves.toEqual(Buffer.from("encrypted"));

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
      .mockResolvedValueOnce({
        rows: [{
          object_key: objectKey
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: userId
        }]
      })
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
    await expect(readEncryptedMediaObject(app.config, objectKey)).rejects.toThrow();
    expect(query.mock.calls[0]?.[0]).toContain("from app_sessions s");
    expect(query.mock.calls[0]?.[1]).toEqual([hashSessionToken(sessionToken)]);
    expect(query.mock.calls[2]?.[0]).toContain("from media_objects");
    expect(query.mock.calls[3]?.[0]).toBe("begin");
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
    expect(query.mock.calls[3]?.[0]).toBe("begin");
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
        account_status: "under_review"
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
          account_status: "active"
        }]
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
    expect(query.mock.calls[1]?.[0]).toContain("delete from posts");
  });

  it("revokes suspended cookie-backed sessions on routes using the shared auth helper", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId,
          account_status: "suspended"
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
          account_status: "deleted"
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

    for (let attempt = 0; attempt < 5; attempt += 1) {
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
    expect(query).toHaveBeenCalledTimes(5);
  });

  it("returns conversations from GET /api/conversations", async () => {
    query.mockResolvedValueOnce({
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
        other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        other_user_name: "Alex",
        other_user_pronouns: ["they/them"],
        other_user_photo: "https://example.com/alex.jpg",
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
    expect(query.mock.calls[0]?.[0]).toContain("from conversation_members cm");
    expect(response.json()).toEqual({
      data: [{
        id: conversationId,
        kind: "dm",
        user: {
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          name: "Alex",
          pronouns: "they/them",
          photo: "https://example.com/alex.jpg"
        },
        distance: "Nearby",
        updatedAt: "2026-04-29T12:00:00.000Z",
        lastMessage: "hosting for another hour",
        unreadCount: 2,
        pinned: true,
        muted: false,
        mutual: false,
        membersLabel: undefined,
        tags: ["Hosting", "Now"]
      }]
    });
  });

  it("falls back to plaintext message previews when encrypted message metadata is unreadable", async () => {
    const invalidNonce = Buffer.alloc(12).toString("base64");
    const invalidAuthTag = Buffer.alloc(16).toString("base64");

    query.mockResolvedValueOnce({
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
        other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
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
          photo: "https://example.com/alex.jpg"
        },
        distance: "Nearby",
        updatedAt: "2026-04-29T12:00:00.000Z",
        lastMessage: "",
        unreadCount: 0,
        pinned: false,
        muted: false,
        mutual: false,
        membersLabel: undefined,
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
    expect(query.mock.calls[0]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[3]?.[0]).toContain("encrypted_relationship_tokens");
    expect(query.mock.calls[5]?.[0]).toContain("insert into conversations");
    expect(query.mock.calls[5]?.[0]).toContain("insert into conversation_members");
    expect(query.mock.calls[5]?.[0]).toContain("'owner'");
    expect(query.mock.calls[6]?.[0]).toContain("insert into app_notifications");
    expect(query.mock.calls[6]?.[1]).toEqual([
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

  it("requires a mutual cruush before opening a new dm conversation", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

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

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "MUTUAL_CRUUSH_REQUIRED",
        message: "You can message after a mutual cruush.",
        details: null
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
        code: "MUTUAL_CRUUSH_REQUIRED",
        message: "You can message after a mutual cruush.",
        details: null
      }
    });
  });

  it("returns a conversation and its messages from GET /api/messages/:conversationId", async () => {
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
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: "https://example.com/alex.jpg",
          member_count: 2
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-1",
          user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          content: "you around now?",
          created_at: "2026-04-29T12:05:00.000Z"
        }, {
          id: "msg-2",
          user_id: userId,
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
    expect(query.mock.calls[1]?.[0]).toContain("from messages m");
    expect(response.json()).toEqual({
      data: {
        conversation: {
          id: conversationId,
          kind: "dm",
          user: {
            id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg"
          },
          distance: "Nearby",
          updatedAt: "2026-04-29T12:00:00.000Z",
          lastMessage: "",
          unreadCount: 0,
          pinned: false,
          muted: false,
          mutual: false,
          membersLabel: undefined,
          tags: ["Hosting"]
        },
        messages: [{
          id: "msg-1",
          userId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          content: "you around now?",
          timestamp: "2026-04-29T12:05:00.000Z"
        }, {
          id: "msg-2",
          userId: userId,
          content: "yeah nearby",
          timestamp: "2026-04-29T12:06:00.000Z"
        }]
      }
    });
  });

  it("falls back to plaintext message content when encrypted message metadata is unreadable", async () => {
    const invalidNonce = Buffer.alloc(12).toString("base64");
    const invalidAuthTag = Buffer.alloc(16).toString("base64");

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
          other_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          other_user_name: "Alex",
          other_user_pronouns: ["they/them"],
          other_user_photo: null,
          member_count: 2
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-legacy",
          user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
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
    expect(query.mock.calls[6]?.[0]).toContain("insert into messages");
    expect(query.mock.calls[6]?.[0]).toContain("content_ciphertext");
    expect(query.mock.calls[6]?.[1]).not.toContain("on my way");
    expect(query.mock.calls[6]?.[1]).toContain("keyword_prefilter");
    expect(query.mock.calls[7]?.[0]).toContain("from conversation_members cm");
    expect(query.mock.calls[8]?.[0]).toContain("insert into app_notifications");
    expect(query.mock.calls[8]?.[1]).toEqual([
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
    expect(query.mock.calls[6]?.[0]).toContain("insert into messages");
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
    expect(query.mock.calls[2]?.[0]).toContain("expires_at");
    expect(query.mock.calls[2]?.[0]).toContain("interval '1 hour'");
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
        code: "MUTUAL_CRUUSH_REQUIRED",
        message: "You can message after a mutual cruush.",
        details: null
      }
    });
  });

  it("creates a view-once photo message with encrypted media on POST /api/messages/photos", async () => {
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
          disappearing_timer: "24h",
          closed_at: null
      }]
    })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "media-1"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-photo-1",
          user_id: userId,
          content: "photo caption",
          created_at: "2026-04-29T12:10:00.000Z",
          expires_at: "2026-04-30T12:10:00.000Z",
          attachments: [{
            id: "media-1",
            url: `/api/media/message-photos/${userId}-photo-id.png`,
            mediaType: "image",
            mimeType: "image/png",
            viewOnce: true
          }]
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          muted: true,
          sender_name: "Jordan",
          conversation_title: "Beta crew"
        }]
      })
      .mockResolvedValueOnce({
        rows: [appNotificationRow({
          user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          type: "group_message",
          title: "New message in Beta crew",
          link_url: `/chat/group/${conversationId}`,
          actor_user_id: userId,
          conversation_id: conversationId,
          metadata: { conversationKind: "group" }
        })]
      });
    const png = await validPng();
    const multipart = multipartFilePayload({
      fieldName: "photo",
      filename: "message.png",
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

    expect(response.statusCode).toBe(201);
    const mediaInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into media_objects"));
    const messageInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into messages"));
    const notificationLookup = query.mock.calls.find(([sql]) => String(sql).includes("from conversation_members cm") && String(sql).includes("sender_profile"));
    const notificationInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into app_notifications"));
    expect(mediaInsert?.[1]?.[2]).toBe("message_photo");
    expect(messageInsert?.[0]).toContain("message_media_attachments");
    expect(messageInsert?.[0]).toContain("view_once");
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
          url: `/api/media/message-photos/${userId}-photo-id.png`,
          mediaType: "image",
          mimeType: "image/png",
          viewOnce: true
        }]
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
        message: "This photo violates cruush safety rules and cannot be saved.",
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
        message: "This content violates cruush safety rules and cannot be saved.",
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
        message: "This content violates cruush safety rules and cannot be saved.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into messages"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into trust_events"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into suspensions"))).toBe(true);
  });

  it("requires a mutual cruush before sending a dm message", async () => {
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
          member_count: 2
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

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
        code: "MUTUAL_CRUUSH_REQUIRED",
        message: "You can message after a mutual cruush.",
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
      "spam_scam",
      ""
    ]);
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
      "violence_threat",
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
    expect(query.mock.calls[0]?.[0]).toContain("from moderator_users");
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
    expect(query.mock.calls[0]?.[0]).toContain("from moderator_users");
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
    expect(query.mock.calls[3]?.[1]?.slice(0, 6)).toEqual([
      userId,
      targetUserId,
      reportId,
      "resolve_report",
      "reviewed_valid_report",
      "Handled in beta queue."
    ]);
    expect(JSON.parse(String(query.mock.calls[3]?.[1]?.[6]))).toEqual(expect.objectContaining({
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
    expect(query.mock.calls[3]?.[1]?.[3]).toBe("dismiss_report");
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
    expect(query.mock.calls[3]?.[1]?.slice(0, 6)).toEqual([
      userId,
      targetUserId,
      null,
      "mark_under_review",
      "needs_manual_review",
      "Multiple credible reports."
    ]);
    expect(JSON.parse(String(query.mock.calls[3]?.[1]?.[6]))).toEqual({
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
    expect(query.mock.calls[3]?.[1]?.slice(0, 6)).toEqual([
      userId,
      targetUserId,
      "2f35619f-e09d-4f65-a7ea-8f6dd149ec11",
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

    expect(authResponse.statusCode).toBe(401);
    expect(query.mock.calls[4]?.[0]).toContain("from app_sessions s");
    expect(query.mock.calls[5]?.[0]).toContain("delete from app_sessions");
    expect(query.mock.calls[5]?.[1]).toEqual([hashSessionToken("suspended-after-admin-action")]);
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
    query.mockResolvedValueOnce({
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
    expect(query.mock.calls[0]?.[1]).toEqual([
      userId,
      null,
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

  it("forwards support requests to the configured support inbox", async () => {
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
    expect(emailBody.to).toEqual(["support@cruush.app"]);
    expect(emailBody.reply_to).toBe("founder@example.com");
    expect(emailBody.subject).toBe("[support] question: Can AI answer support?");
    expect(emailBody.html).toContain("support-3");
    expect(emailBody.html).toContain("I want to know how most support replies will be handled.");
  });

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
        url: expect.stringMatching(/^\/api\/media\/assets\/[0-9a-f-]{36}\/display$/)
      }
    });
    expect(body.data.url).not.toContain(userId);
    const profileLookup = query.mock.calls.find(([sql]) => String(sql) === "select photos from profiles where id = $1");
    const mediaInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into media_objects"));
    const profileInsert = query.mock.calls.find(([sql]) => String(sql).includes("insert into profiles (id, photos, updated_at)"));
    expect(profileLookup?.[1]).toEqual([userId]);
    expect(mediaInsert?.[0]).toContain("encrypted_data_key");
    expect(mediaInsert?.[0]).toContain("insert into media_variants");
    expect(mediaInsert?.[0]).toContain("'pending'");
    expect(profileInsert?.[0]).toContain("array_append(profiles.photos, $3)");
    expect(profileInsert?.[1]).toEqual(expect.arrayContaining([userId, body.data.url]));
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
  ])("accepts an adult explicit profile photo when other safety checks pass: %s", async (filename) => {
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
        message: "This photo violates cruush safety rules and cannot be saved.",
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

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "MODERATION_UNAVAILABLE",
        message: "Automated photo safety checks are temporarily unavailable. Try again later.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into csam_incidents"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(false);
  });

  it("rejects profile photos without adult-human proof and deletes quarantine storage", async () => {
    mockPendingProfileMediaQueries();
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
    const queries = query.mock.calls.map(([sql]) => String(sql));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "CONTENT_REJECTED",
        message: "Profile photo must be of you.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("select photos from profiles"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("delete from media_objects"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into profiles"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(true);
  });

  it("never stores the capability URL, token, object key, final URL, or original filename in moderation records", async () => {
    const bridgeApp = buildServer({
      ...app.config,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
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

    expect(response.statusCode).toBe(400);
    expect(reviewParams).not.toContain("moderation-media-staging.cruush.app");
    expect(reviewParams).not.toContain("private-original-name.png");
    expect(reviewParams).not.toContain("profile-photos/");
    expect(reviewParams).not.toContain("/api/media/profile-photos/");
    expect(reviewParams).toContain("assetId");
  });

  it("rejects profile photo uploads when the profile already has 4 photos", async () => {
    query.mockResolvedValueOnce({
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
    expect(query).toHaveBeenCalledTimes(1);
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
        message: "This content violates cruush safety rules and cannot be saved.",
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
        message: "This content violates cruush safety rules and cannot be saved.",
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
    expect(query).not.toHaveBeenCalled();
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
    expect(query).toHaveBeenCalledTimes(9);
    expect(query.mock.calls[1]?.[0]).toContain("from profiles");
    expect(query.mock.calls[1]?.[0]).toContain("join encrypted_location_envelopes");
    expect(query.mock.calls[1]?.[0]).toContain("profiles.display_name as display_name");
    expect(query.mock.calls[1]?.[0]).toContain("where profiles.id <> $1");
    expect(query.mock.calls[1]?.[0]).toContain("profiles.updated_at");
    expect(query.mock.calls[1]?.[0]).not.toContain("discovery_match");
    expect(query.mock.calls[1]?.[0]).toContain("limit $3");
    expect(query.mock.calls[1]?.[1]?.[0]).toBe(userId);
    expect(Array.isArray(query.mock.calls[1]?.[1]?.[1])).toBe(true);
    expect(query.mock.calls[1]?.[1]?.[2]).toBe(50);

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
      relationship: null
    });
    expect(body.data.profiles[0]).not.toHaveProperty("lat");
    expect(body.data.profiles[0]).not.toHaveProperty("lng");
    expect(body.data.profiles[0].displayLocationToken).toMatchObject({
      version: 1,
      tokenVersion: 1,
      ciphertext: expect.any(String),
      nonce: expect.any(String)
    });
    expect(body.data.profiles[0].distanceLabel).toMatch(/ mi$/);
    expect(body.data.profiles[0].lastActive).toMatch(/ago$/);
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
        display_name: `Test Cruush ${seedNumber}`,
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

    query.mockImplementation((sql: string) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("join encrypted_location_envelopes")) {
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
    expect(ghostedSeedNumbers).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(preciseSeedNumbers).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
    expect(demoTaggedSeedNumbers).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(profilesById.get(nonNpcRow.id)?.demoDisplayMode).toBeUndefined();
    expect(payloadsById.get(nonNpcRow.id)?.displayMode).toBe("PRECISE");
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
        (normalizedSql.includes("encrypted_visibility_tokens") || normalizedSql.includes("user_privacy_settings"))
      );
    })).toBe(false);
  });

  it("ignores the NPC Ghost demo flag for non-admin discovery users", async () => {
    const evenNpcRow = {
      id: "00000000-0000-4000-8000-000000000002",
      email: "test-cruush-02@cruush.local",
      display_name: "Test Cruush 2",
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

    expect(payload.displayMode).toBe("PRECISE");
    expect(profile.demoDisplayMode).toBeUndefined();
    expect(query.mock.calls.some(([sql]) => String(sql).toLowerCase().includes("insert into ghost_rotation_tokens"))).toBe(false);
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
      display_name: "Test Cruush 2",
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
            ? [{ user_id: userId }]
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

    expect(payload.displayMode).toBe("PRECISE");
    expect(profile.demoDisplayMode).toBeUndefined();
    expect(query.mock.calls.some(([sql]) => String(sql).toLowerCase().includes("insert into ghost_rotation_tokens"))).toBe(false);
  });

  it("marks active mutual cruushes in discovery results", async () => {
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

      if (normalizedSql.includes("join encrypted_location_envelopes")) {
        return Promise.resolve({ rows: profileRows });
      }

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({ rows: locationRows });
      }

      if (normalizedSql.includes("from encrypted_relationship_records")) {
        return Promise.resolve({ rows: params[0] === matchRecord.record_lookup_index ? [matchRecord] : [] });
      }

      if (normalizedSql.includes("from encrypted_relationship_tokens")) {
        return Promise.resolve({ rows: params[0] === matchRecord.id ? [matchToken] : [] });
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
        relationship: null
      })
    ]);
  });

  it("rejects discovery limits above the backend cap", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/users?limit=51",
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

    query.mockImplementation((sql: string) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({ rows: locationRows });
      }

      if (normalizedSql.includes("from encrypted_relationship_records") ||
          normalizedSql.includes("from encrypted_relationship_tokens") ||
          normalizedSql.includes("from encrypted_visibility_tokens") ||
          normalizedSql.includes("from encrypted_privacy_audit_events")) {
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
            profile_visibility_ciphertext: null,
            profile_visibility_nonce: null,
            profile_visibility_auth_tag: null,
            profile_visibility_key_version: "v1",
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
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[2]?.[0]).toContain("tribes as legacy_vibe_tags");

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
          user_id: userId
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
          photos: ["https://example.com/photo.jpg"]
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
    expect(response.json()).toEqual({
      data: [{
        id: "post-1",
        content: "Looking now",
        expiresIn: "6h",
        expiresAt: "2026-04-28T18:00:00.000Z",
        createdAt: "2026-04-28T12:00:00.000Z",
        distance: "Nearby",
        user: {
          id: userId,
          name: "Cruusher",
          pronouns: "they/them",
          photo: "https://example.com/photo.jpg"
        }
      }]
    });
  });

  it("filters blocked relationships from GET /api/posts at the query boundary", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          user_id: userId
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
    expect(query.mock.calls[1]?.[1]).toEqual([userId]);
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

  it("requires cruush+ before posting to the local feed", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        cruush_plus_enabled: false,
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
        content: "Hosting tonight",
        expiresIn: "1h"
      }
    });

    expect(response.statusCode).toBe(402);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("from user_entitlements");
    expect(response.json()).toEqual({
      error: {
        code: "CRUUSH_PLUS_REQUIRED",
        message: "Upgrade to cruush+ to post on the local feed.",
        details: null
      }
    });
  });

  it("creates a post on POST /api/posts", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          cruush_plus_enabled: true,
          cruush_plus_expires_at: null
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "post-2",
          user_id: userId,
          content: "Hosting tonight",
          expires_in: "1h",
          expires_at: "2026-04-28T13:00:00.000Z",
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
        expiresIn: "1h"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("insert into posts");
    expect(query.mock.calls[1]?.[0]).toContain("content_ciphertext");
    expect(query.mock.calls[1]?.[1]).not.toContain("Hosting tonight");
    expect(response.json()).toEqual({
      data: {
        id: "post-2",
        content: "Hosting tonight",
        expiresIn: "1h",
        expiresAt: "2026-04-28T13:00:00.000Z",
        createdAt: "2026-04-28T12:10:00.000Z",
        distance: "Nearby",
        user: {
          id: userId,
          name: "Cruusher",
          pronouns: "they/them",
          photo: null
        }
      }
    });
  });

  it("deletes the current user's feed post on DELETE /api/posts/:postId", async () => {
    const postId = "7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2";
    query.mockResolvedValueOnce({
      rows: [{ id: postId }]
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/posts/${postId}`,
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("delete from posts");
    expect(query.mock.calls[0]?.[0]).toContain("user_id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([userId, postId]);
  });

  it("does not delete another user's feed post on DELETE /api/posts/:postId", async () => {
    const postId = "7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2";
    query.mockResolvedValueOnce({
      rows: []
    });

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
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("delete from posts");
    expect(query.mock.calls[0]?.[1]).toEqual([userId, postId]);
  });

  it("rejects prohibited feed content before storing a post", async () => {
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
        message: "This content violates cruush safety rules and cannot be saved.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into posts"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into trust_events"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into suspensions"))).toBe(true);
  });

  it("rejects public coded drug language before storing a feed post", async () => {
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
    expect(query).toHaveBeenCalledTimes(7);
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
            photo: "https://example.com/alex.jpg"
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
            photo: null
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
          ghost_mode_enabled: false
        }, {
          id: "8f707f0b-81aa-470d-b0e1-321d493d04d2",
          display_name: "Sam",
          pronouns: ["she/they"],
          photos: [],
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
          expiresAt: null
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
          user: {
            id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg"
          }
        }, {
          id: "incoming-2",
          createdAt: "2026-04-28T11:00:00.000Z",
          mutual: false,
          locked: true,
          user: null
        }],
        sent: [{
          id: "sent-1",
          createdAt: "2026-04-28T12:05:00.000Z",
          mutual: false,
          locked: false,
          user: {
            id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
            name: "Alex",
            pronouns: "they/them",
            photo: "https://example.com/alex.jpg"
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
            photo: "https://example.com/alex.jpg"
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

  it("returns tokenized mutual map pins when the viewer has Ghost Mode enabled", async () => {
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

    query.mockImplementation((sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("from encrypted_location_envelopes")) {
        return Promise.resolve({
          rows: params[0] === userId ? [viewerLocation] : [targetLocation]
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
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3]?.[0]).toContain("from user_blocks");
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
        message: "Upgrade to cruush+ to use stealth mode.",
        details: null
      }
    });
  });

  it("returns the authenticated profile on GET /api/profiles/me", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        display_name: "Cruusher",
        photos: [],
        bio: "Hello",
        pronouns: ["they/them"],
        custom_pronouns: "",
        year_of_birth: 1994,
        ethnicity: ["Latinx"],
        identities: ["Non-binary"],
        presentation: ["Femme"],
        sexuality: ["Queer"],
        body_type: ["Athletic"],
        height: "5'8\"",
        weight: "155 lbs",
        position: ["Vers"],
        role: ["Switch"],
        is_trans: null,
        trans_status_visibility: "mutual_cruushes",
        crowds: [],
        availability: ["Tonight"],
        hosting_travel: ["Hosting"],
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
        substance_boundaries: ["No alcohol involved", "Let's discuss"],
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
        bio: "Hello",
        pronouns: ["they/them"],
        custom_pronouns: "",
        year_of_birth: 1994,
        ethnicity: "Latinx",
        identities: ["Non-binary"],
        presentation: ["Femme"],
        sexuality: ["Queer"],
        body_type: ["Athletic"],
        height: "5'8\"",
        weight: "155 lbs",
        position: ["Vers"],
        role: ["Switch"],
        is_trans: null,
        trans_status_visibility: "mutual_cruushes",
        crowds: [],
        availability: ["Tonight"],
        hosting_travel: ["Hosting"],
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
        substance_boundaries: ["No alcohol involved", "Let's discuss"],
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
    expect(query.mock.calls[7]?.[0]).toContain("insert into encrypted_relationship_records");
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        kinks: ["Leather"],
        kink_interests: [{
          kink_id: "leather",
          label: "Leather",
          category: "Gear"
        }],
        kinks_visibility: "mutual_cruushes",
        viewer_relationship: {
          match_id: "match-1",
          mutual_cruush: true,
          outgoing_cruush: true,
          can_message: true,
          can_reveal_precise_location: false
        }
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

  it("upserts the authenticated profile on PUT /api/profiles/me", async () => {
    query
      .mockResolvedValue({ rows: [] })
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
          substance_boundaries: [],
          updated_at: "2026-04-28T12:05:00.000Z"
        }]
      });

    const payload = {
      display_name: "Cruusher",
      photos: [],
      bio: "Updated bio",
      pronouns: ["they/them"],
      custom_pronouns: "",
      year_of_birth: 1994,
      ethnicity: "Latinx",
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
      substance_boundaries: []
    };

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        ...payload,
        date_of_birth: "1994-06-15"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(4);
    const profileInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profiles"));
    expect(profileInsertCall?.[0]).toContain("insert into profiles");
    expect(profileInsertCall?.[1]?.[0]).toBe(userId);
    expect(profileInsertCall?.[1]?.[6]).toBe(1994);
    expect(profileInsertCall?.[1]?.[7]).toEqual(["Latinx"]);
    expect(profileInsertCall?.[0]).not.toContain("updated_at)");
    expect(response.json()).toEqual({
      data: {
        id: userId,
        ...payload,
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

  it("requires a complete date of birth when creating a profile", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "PUT",
      url: "/api/profiles/me",
      headers: {
        "x-user-id": userId
      },
      payload: {
        ...emptyProfile,
        display_name: "Cruusher",
        year_of_birth: 1994
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter your complete date of birth to verify that you are at least 18.",
        details: null
      }
    });
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
          substance_boundaries: [],
          updated_at: "2026-04-28T12:05:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const payload = {
      ...emptyProfile,
      display_name: "Cruusher",
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
        scenes: ["Bear"],
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
      scenes: ["Bear"],
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
        scenes: ["Bear"],
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
        vibes: ["Bear"],
        crowds: ["Dyke"],
        hobbies: [],
        positions: [],
        roles: [],
        kinks: ["leather"],
        body_types: [],
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
        visibility_rules: payload.visibility_rules
      })
    });
  });

  it("allows free users to save up to three visibility exclusion filters without checking entitlements", async () => {
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
        updated_at: "2026-04-28T12:05:00.000Z"
      }]
    });

    const visibilityRules = {
      ...emptyProfile.visibility_rules,
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
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        visibility_rules: visibilityRules
      })
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
      ...emptyProfile.visibility_rules,
      distance: 25,
      looking_for: ["hookup"],
      kinks: ["leather"]
    };
    const updatedRules = {
      ...emptyProfile.visibility_rules,
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
    const encryptedProfileVisibility = encryptProfileVisibility(app.config, savedRules);

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
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        visibility_rules: savedRules
      })
    });
  });

  it("rejects trans status and crowd selection changes within the 14 day lock window", async () => {
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
        is_trans: true,
        crowds: ["T4T", "Dyke"]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Trans status and crowd selection can only be changed once every 14 days.",
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
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

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
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0]?.[0]).toContain("insert into profiles");
    expect(query.mock.calls[0]?.[0]).toContain("location_updated_at");
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(userId);
    expect(query.mock.calls[1]?.[0]).toContain("insert into encrypted_location_envelopes");
    const persistedLocationParams = query.mock.calls[1]?.[1] ?? [];
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
});
