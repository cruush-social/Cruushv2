import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import { createSessionCookie, generateSessionToken, hashPassword, hashSessionToken } from "./auth.js";
import type { DbClient } from "./db.js";
import { DEVELOPMENT_ADMIN_LOCATION } from "./development-admin.js";
import {
  buildEncryptedRelationshipPayload,
  issueEncryptedRelationshipToken,
  upsertEncryptedRelationshipRecord,
  type EncryptedRelationshipRecordRow
} from "./encrypted-relationships.js";
import { emptyProfile } from "./profile-schema.js";
import { createCrowdTokens, encryptProfileVisibility, encryptSensitiveProfile } from "./profile-sensitive.js";
import { createMemoryRateLimiter } from "./rate-limit.js";
import {
  decryptDisplayLocationTokenForTest,
  saveVisibilityPolicy,
  storeLocationEnvelope,
  type VisibilityBaseMode
} from "./location-privacy.js";

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
}) {
  const boundary = `----cruush-test-${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${input.fieldName}"; filename="${input.filename}"\r\n` +
    `Content-Type: ${input.contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    payload: Buffer.concat([head, input.content, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

describe("server", () => {
  const userId = "d271f6da-c51d-4d73-a322-d9c56f45d4fa";
  const conversationId = "7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2";

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
    expect(response.headers["set-cookie"]).toContain("cruush_session=");
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
          createdAt: "2026-04-28T12:00:00.000Z"
        },
        profile: {
          displayName: "Admin",
          yearOfBirth: 1990
        },
        needsOnboarding: false
      }
    });
  });

  it("does not allow the hardcoded admin login in production", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await productionApp.inject({
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
          year_of_birth: 1998
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
          createdAt: "2026-04-28T12:00:00.000Z"
        },
        profile: {
          displayName: "River",
          yearOfBirth: 1998
        },
        needsOnboarding: false
      }
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
    expect(query.mock.calls[5]?.[0]).toContain("insert into conversations");
    expect(query.mock.calls[6]?.[0]).toContain("insert into conversation_members");
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
      .mockResolvedValueOnce({
        rows: [{
          id: "msg-3",
          user_id: userId,
          content: "on my way",
          created_at: "2026-04-29T12:10:00.000Z"
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
        content: "on my way"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("from conversation_members cm");
    expect(query.mock.calls[1]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[4]?.[0]).toContain("encrypted_relationship_tokens");
    expect(query.mock.calls[5]?.[0]).toContain("insert into messages");
    expect(response.json()).toEqual({
      data: {
        id: "msg-3",
        userId: userId,
        content: "on my way",
        timestamp: "2026-04-29T12:10:00.000Z"
      }
    });
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
    });

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
        message: "This content violates Cruush safety rules and cannot be saved.",
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
      "privacy_location",
      ""
    ]);
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

  it("uploads a profile photo on POST /api/profile-photos", async () => {
    query.mockImplementation(async (_sql: string, params: unknown[] = []) => ({
      rows: String(_sql).includes("select photos from profiles")
        ? [{ photos: [] }]
        : [{ photos: [params[1]] }]
    }));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
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

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      data: {
        url: expect.stringMatching(/^\/media\/profile-photos\/d271f6da-c51d-4d73-a322-d9c56f45d4fa-[0-9a-f-]{36}\.png$/)
      }
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toBe("select photos from profiles where id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([userId]);
    expect(query.mock.calls[1]?.[0]).toContain("insert into profiles (id, photos, updated_at)");
    expect(query.mock.calls[1]?.[0]).toContain("array_append(profiles.photos, $2)");
    expect(query.mock.calls[1]?.[1]).toEqual([userId, body.data.url]);
  });

  it("rejects profile photo uploads when the profile already has 9 photos", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        photos: Array.from({ length: 9 }, (_, index) => `https://example.com/photo-${index}.jpg`)
      }]
    });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
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
        message: "You can add up to 9 photos.",
        details: null
      }
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects prohibited profile photos before storage", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
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
        message: "This content violates Cruush safety rules and cannot be saved.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("select photos from profiles"))).toBe(false);
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
        message: "Profile photo must be a JPEG, PNG, or WebP image.",
        details: null
      }
    });
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
    expect(query).toHaveBeenCalledTimes(7);
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

  it("ghosts exactly half of seeded NPC discovery profiles when the dev demo flag is enabled", async () => {
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
    const sapphicSensitive = encryptSensitiveProfile(app.config, {
      is_trans: false,
      crowds: ["Sapphic"],
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
        subjectUserId: "sapphic-user",
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
            id: "sapphic-user",
            display_name: "Sapphic River",
            year_of_birth: 1998,
            pronouns: ["she/her"],
            looking_for: ["Fun"],
            vibes: ["Chill"],
            scenes: [],
            archetypes: [],
            position: ["Top"],
            role: [],
            hosting_travel: ["Can Host"],
            photos: ["https://example.com/sapphic.jpg"],
            lat: 40.711,
            lng: -74.002,
            fuzzy_lat: 40.7115,
            fuzzy_lng: -74.0025,
            ...sapphicSensitive,
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
    expect(query).toHaveBeenCalledTimes(4);
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

  it("creates a post on POST /api/posts", async () => {
    query.mockResolvedValueOnce({
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
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("insert into posts");
    expect(query.mock.calls[0]?.[1]).toEqual([userId, "Hosting tonight", "1h"]);
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

  it("rejects prohibited feed content before storing a post", async () => {
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
        message: "This content violates Cruush safety rules and cannot be saved.",
        details: null
      }
    });
    expect(queries.some((sql) => sql.includes("insert into posts"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into trust_events"))).toBe(true);
    expect(queries.some((sql) => sql.includes("insert into suspensions"))).toBe(true);
  });

  it("normalizes post text before storing it", async () => {
    query.mockResolvedValueOnce({
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
    expect(query.mock.calls[0]?.[1]).toEqual([userId, "Hosting now", "6h"]);
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
    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls[0]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[1]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[3]?.[0]).toContain("from profiles");
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

  it("creates or updates a cruush on POST /api/cruush", async () => {
    query
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
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0]?.[0]).toContain("encrypted_relationship_records");
    expect(query.mock.calls[1]?.[0]).toContain("insert into encrypted_relationship_records");
    expect(JSON.stringify(query.mock.calls[1]?.[1])).not.toContain("Jordan");
    expect(JSON.stringify(query.mock.calls[1]?.[1])).not.toContain("53fd68d7-24fc-4cff-8cd7-a97ec0cadf97");
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
    expect(query.mock.calls[3]?.[0]).toContain("insert into encrypted_relationship_records");
    expect(query.mock.calls[4]?.[0]).toContain("insert into encrypted_relationship_tokens");
    expect(query.mock.calls[8]?.[0]).toContain("encrypted_relationship_tokens");
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
      .mockResolvedValueOnce({ rows: [existingCruush] })
      .mockResolvedValueOnce({ rows: [matchRecord] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [matchToken] });

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
    expect(query).toHaveBeenCalledTimes(6);
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
        trans_status_visibility: "public",
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
        trans_status_visibility: "public",
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
      crowds: ["T4T", "Sapphic"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });
    const viewerCrowdTokens = createCrowdTokens(app.config, ["T4T"]).map((token) => ({
      token_hash: token.token_hash
    }));

    query.mockResolvedValueOnce({
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
    expect(response.json().data.crowds).not.toContain("Sapphic");
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
      crowds: ["Sapphic"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });

    query
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
    expect(query.mock.calls[5]?.[0]).toContain("insert into encrypted_relationship_records");
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
          can_message: true,
          can_reveal_precise_location: false
        }
      })
    });
  });

  it("does not log profile views when the viewer has Ghost Mode enabled", async () => {
    query
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
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(4);
    const profileInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profiles"));
    expect(profileInsertCall?.[0]).toContain("insert into profiles");
    expect(profileInsertCall?.[1]?.[0]).toBe(userId);
    expect(profileInsertCall?.[1]?.[7]).toEqual(["Latinx"]);
    expect(profileInsertCall?.[0]).not.toContain("updated_at)");
    expect(response.json()).toEqual({
      data: {
        id: userId,
        ...payload,
        is_trans: null,
        trans_status_visibility: "public",
        crowds: [],
        scenes: [],
        archetypes: [],
        hiv_status_visibility: "mutual_cruushes",
        visibility_rules: emptyProfile.visibility_rules,
        updated_at: "2026-04-28T12:05:00.000Z"
      }
    });
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
      crowds: ["T4T", "Sapphic"],
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
    expect(profileInsertCall?.[1]).not.toContain("Sapphic");
    expect(profileInsertCall?.[1]).not.toContain(true);

    const tokenInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profile_sensitive_tokens"));
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("leather");
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("undetectable");
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("T4T");

    expect(response.json()).toEqual({
      data: expect.objectContaining({
        is_trans: true,
        trans_status_visibility: "mutual_crowds",
        crowds: ["T4T", "Sapphic"],
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
      crowds: ["T4T", "Sapphic"],
      visibility_rules: {
        active_crowd_modes: ["T4T", "Sapphic"],
        age_range: [25, 45],
        distance: 25,
        identities: ["nonbinary"],
        presentations: [],
        looking_for: [],
        timing: [],
        hosting: [],
        vibes: ["Bear"],
        crowds: ["Sapphic"],
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
    expect(profileInsertCall?.[1]).not.toContain("Sapphic");
    expect(profileInsertCall?.[1]).not.toContain("leather");

    const tokenInsertCall = query.mock.calls.find((call) => String(call[0]).includes("insert into profile_sensitive_tokens"));
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("T4T");
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("Sapphic");
    expect(tokenInsertCall?.[1]?.[1]).not.toContain("crowd-mode");

    expect(response.json()).toEqual({
      data: expect.objectContaining({
        visibility_rules: payload.visibility_rules
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
        crowds: ["T4T", "Sapphic"]
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
