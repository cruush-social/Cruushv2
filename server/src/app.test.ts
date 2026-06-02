import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import { hashPassword, hashSessionToken } from "./auth.js";
import { DEVELOPMENT_ADMIN_LOCATION } from "./development-admin.js";
import { emptyProfile } from "./profile-schema.js";
import { encryptProfileVisibility, encryptSensitiveProfile } from "./profile-sensitive.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

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
    query
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "admin@cruush.local",
          display_name: "Admin",
          email_verified_at: "2026-04-28T12:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: "admin@cruush.local",
          app_display_name: "Admin",
          email_verified_at: "2026-04-28T12:00:00.000Z",
          created_at: "2026-04-28T12:00:00.000Z",
          profile_display_name: "Admin",
          year_of_birth: 1990
        }]
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
    expect(query.mock.calls[1]?.[0]).toContain("insert into profiles");
    expect(query.mock.calls[1]?.[0]).toContain("location_updated_at");
    expect(query.mock.calls[1]?.[1]).toEqual([
      userId,
      "Admin",
      1990,
      DEVELOPMENT_ADMIN_LOCATION.lat,
      DEVELOPMENT_ADMIN_LOCATION.lng,
      DEVELOPMENT_ADMIN_LOCATION.fuzzyLat,
      DEVELOPMENT_ADMIN_LOCATION.fuzzyLng,
      DEVELOPMENT_ADMIN_LOCATION.fuzzRadiusMeters
    ]);
    expect(query.mock.calls[2]?.[0]).toContain("insert into app_sessions");
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
    query
      .mockResolvedValueOnce({
        rows: [{
          match_id: "match-1",
          has_active_match_token: true,
          viewer_ghost_mode_enabled: false,
          target_ghost_mode_enabled: false,
          target_precise_location_visibility: "none"
        }]
      })
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
    expect(query.mock.calls[0]?.[0]).toContain("cruush_matches");
    expect(query.mock.calls[2]?.[0]).toContain("insert into conversations");
    expect(query.mock.calls[3]?.[0]).toContain("insert into conversation_members");
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
    query.mockResolvedValueOnce({
      rows: [{
        match_id: null,
        has_active_match_token: false,
        viewer_ghost_mode_enabled: false,
        target_ghost_mode_enabled: false,
        target_precise_location_visibility: "none"
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
        rows: [{
          match_id: "match-1",
          has_active_match_token: true,
          viewer_ghost_mode_enabled: false,
          target_ghost_mode_enabled: false,
          target_precise_location_visibility: "none"
        }]
      })
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
    expect(query.mock.calls[1]?.[0]).toContain("cruush_matches");
    expect(query.mock.calls[2]?.[0]).toContain("insert into messages");
    expect(response.json()).toEqual({
      data: {
        id: "msg-3",
        userId: userId,
        content: "on my way",
        timestamp: "2026-04-29T12:10:00.000Z"
      }
    });
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
      .mockResolvedValueOnce({
        rows: [{
          match_id: "match-1",
          has_active_match_token: false,
          viewer_ghost_mode_enabled: false,
          target_ghost_mode_enabled: false,
          target_precise_location_visibility: "none"
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

  it("returns nearby users from GET /api/users", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
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
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("from profiles");
    expect(query.mock.calls[1]?.[0]).toContain("where profiles.id <> $1");
    expect(query.mock.calls[1]?.[0]).toContain("and lat is not null");
    expect(query.mock.calls[1]?.[0]).toContain("profiles.updated_at");
    expect(query.mock.calls[1]?.[0]).toContain("discovery_match");
    expect(query.mock.calls[1]?.[0]).toContain("limit $3");
    expect(query.mock.calls[1]?.[1]).toEqual([userId, "permissions", 50]);

    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({
      id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
      name: "Alex",
      display_name: "Alex",
      pronouns: "they/them",
      lat: 40.7115,
      lng: -74.0025,
      lookingFor: ["Fun"],
      vibes: ["Chill"],
      position: ["Top"],
      hostingTravel: ["Can Host"],
      photo: "https://example.com/alex.jpg",
      relationship: null
    });
    expect(body.data[0].distance).toMatch(/ mi$/);
    expect(body.data[0].lastActive).toMatch(/ago$/);
  });

  it("honors a bounded discovery limit on GET /api/users", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 25 }, (_, index) => ({
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
        }))
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
    expect(query.mock.calls[1]?.[1]).toEqual([userId, "permissions", 20]);
    expect(response.json().data).toHaveLength(20);
  });

  it("marks active mutual cruushes in discovery results", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
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
          updated_at: "2026-04-28T12:00:00.000Z",
          mutual_match_id: "match-1",
          can_message: true
        }, {
          id: "8f707f0b-81aa-470d-b0e1-321d493d04d2",
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
          updated_at: "2026-04-28T11:00:00.000Z",
          mutual_match_id: null,
          can_message: false
        }]
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      expect.objectContaining({
        id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        relationship: {
          mutualCruush: true,
          canMessage: true
        }
      }),
      expect.objectContaining({
        id: "8f707f0b-81aa-470d-b0e1-321d493d04d2",
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

    query.mockImplementation((sql: string) => {
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
    expect(response.json().data.map((user: { id: string }) => user.id)).toEqual(["t4t-user"]);
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
      data: []
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
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?lat=40.7128&lng=-74.006",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2]?.[0]).toContain("tribes as legacy_vibe_tags");

    expect(response.json()).toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: "27",
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
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "cruush-1",
          from_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          to_user_id: userId,
          created_at: "2026-04-28T12:00:00.000Z",
          mutual: true,
          display_name: "Alex",
          pronouns: ["they/them"],
          photos: ["https://example.com/alex.jpg"]
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "cruush-2",
          from_user_id: userId,
          to_user_id: "user1",
          created_at: "2026-04-28T12:05:00.000Z",
          mutual: false,
          profile_user_id: null,
          display_name: null,
          pronouns: null,
          photos: null,
          to_user_name: "Jordan",
          to_user_pronouns: "they/them",
          to_user_photo: null
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
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("from cruushes c");
    expect(query.mock.calls[1]?.[0]).toContain("left join profiles target");
    expect(response.json()).toEqual({
      data: {
        received: [{
          id: "cruush-1",
          fromUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          toUserId: userId,
          createdAt: "2026-04-28T12:00:00.000Z",
          mutual: true,
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
          toUserId: "user1",
          createdAt: "2026-04-28T12:05:00.000Z",
          mutual: false,
          user: {
            id: "user1",
            name: "Jordan",
            pronouns: "they/them",
            photo: null
          }
        }]
      }
    });
  });

  it("returns locked free activity from GET /api/cruush/me", async () => {
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
      .mockResolvedValueOnce({
        rows: [{
          id: "incoming-1",
          from_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          to_user_id: userId,
          created_at: "2026-04-28T12:00:00.000Z",
          mutual: false,
          display_name: "Alex",
          pronouns: ["they/them"],
          photos: ["https://example.com/alex.jpg"]
        }, {
          id: "incoming-2",
          from_user_id: "8f707f0b-81aa-470d-b0e1-321d493d04d2",
          to_user_id: userId,
          created_at: "2026-04-28T11:00:00.000Z",
          mutual: false,
          display_name: "Sam",
          pronouns: ["she/they"],
          photos: []
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "sent-1",
          from_user_id: userId,
          to_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          created_at: "2026-04-28T12:05:00.000Z",
          mutual: false,
          profile_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          display_name: "Alex",
          pronouns: ["they/them"],
          photos: ["https://example.com/alex.jpg"],
          to_user_name: null,
          to_user_pronouns: null,
          to_user_photo: null
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "view-1",
          viewed_at: "2026-04-28T12:10:00.000Z",
          viewer_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          display_name: "Alex",
          pronouns: ["they/them"],
          photos: ["https://example.com/alex.jpg"]
        }, {
          id: "view-2",
          viewed_at: "2026-04-28T11:10:00.000Z",
          viewer_user_id: "8f707f0b-81aa-470d-b0e1-321d493d04d2",
          display_name: "Sam",
          pronouns: ["she/they"],
          photos: []
        }]
      });

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

  it("returns no mutual map pins while the viewer has Ghost Mode enabled", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        ghost_mode_enabled: true,
        precise_location_visibility: "mutual_cruushes"
      }]
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/cruush/mutual-map",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(response.json()).toEqual({
      data: []
    });
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
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("from cruush_matches");
    expect(query.mock.calls[1]?.[0]).toContain("insert into cruushes");
    expect(query.mock.calls[1]?.[1]).toEqual([userId, "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97", "Jordan", "they/them", null]);
    expect(response.json()).toEqual({
      data: {
        id: "cruush-3",
        fromUserId: userId,
        toUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        createdAt: "2026-04-28T12:10:00.000Z",
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
      .mockResolvedValueOnce({
        rows: [{
          id: "match-1",
          user_one_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          user_two_id: userId
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          match_id: "match-1",
          has_active_match_token: true,
          viewer_ghost_mode_enabled: false,
          target_ghost_mode_enabled: false,
          target_precise_location_visibility: "none"
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
    expect(query.mock.calls[2]?.[0]).toContain("insert into cruush_matches");
    expect(query.mock.calls[3]?.[0]).toContain("insert into cruush_match_tokens");
    expect(query.mock.calls[4]?.[0]).toContain("cruush_match_tokens");
    expect(response.json()).toEqual({
      data: {
        id: "cruush-4",
        fromUserId: userId,
        toUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        createdAt: "2026-04-28T12:15:00.000Z",
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
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "cruush-existing",
          from_user_id: userId,
          to_user_id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
          created_at: "2026-04-28T12:15:00.000Z",
          mutual: true,
          match_id: "match-existing"
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          match_id: "match-existing",
          has_active_match_token: true,
          viewer_ghost_mode_enabled: false,
          target_ghost_mode_enabled: false,
          target_precise_location_visibility: "none"
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

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("from cruush_matches");
    expect(query.mock.calls[0]?.[0]).not.toContain("insert into cruushes");
    expect(query.mock.calls[1]?.[0]).toContain("cruush_match_tokens");
    expect(query.mock.calls.map((call) => call[0]).join("\n")).not.toContain("insert into cruush_match_tokens");
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
        location: {
          id: userId,
          lat: 40.7128,
          lng: -74.006,
          fuzzy_lat: 40.713,
          fuzzy_lng: -74.005,
          fuzz_radius_meters: 250,
          location_updated_at: "2026-06-02T12:00:00.000Z"
        },
        updated_at: "2026-04-28T12:00:00.000Z"
      }
    });
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
        updated_at: "2026-04-28T12:00:00.000Z"
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
    expect(query).toHaveBeenCalledWith(expect.stringContaining("from profiles"), ["53fd68d7-24fc-4cff-8cd7-a97ec0cadf97"]);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
        display_name: "Alex",
        bio: "Nearby now",
        pronouns: ["they/them"],
        looking_for: ["Dates"]
      })
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
          match_id: "match-1",
          has_active_match_token: true,
          viewer_ghost_mode_enabled: false,
          target_ghost_mode_enabled: false,
          target_precise_location_visibility: "none"
        }]
      })
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
    expect(query.mock.calls[2]?.[0]).toContain("insert into profile_view_events");
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
    query.mockResolvedValue({
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
        updated_at: "2026-04-28T12:00:00.000Z"
      }]
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
    query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        lat: 40.711,
        lng: -74.002,
        fuzzy_lat: 40.7114,
        fuzzy_lng: -74.0016,
        location_fuzz_radius_meters: 50,
        location_updated_at: "2026-04-29T12:05:00.000Z"
      }]
    });

    const randomSpy = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.125)
      .mockReturnValueOnce(0.75);

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

    randomSpy.mockRestore();
    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("insert into profiles");
    expect(query.mock.calls[0]?.[0]).toContain("location_updated_at");
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(userId);
    expect(query.mock.calls[0]?.[1]?.[1]).toBe(40.711);
    expect(query.mock.calls[0]?.[1]?.[2]).toBe(-74.002);
    expect(query.mock.calls[0]?.[1]?.[5]).toBe(50);
    expect(query.mock.calls[0]?.[1]?.[3]).not.toBe(40.711);
    expect(query.mock.calls[0]?.[1]?.[4]).not.toBe(-74.002);
    expect(response.json()).toEqual({
      data: {
        id: userId,
        lat: 40.711,
        lng: -74.002,
        fuzzy_lat: 40.7114,
        fuzzy_lng: -74.0016,
        fuzz_radius_meters: 50,
        location_updated_at: "2026-04-29T12:05:00.000Z"
      }
    });
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
