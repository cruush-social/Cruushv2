import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { accountCanAuthenticate, normalizeAccountStatus } from "../account-status.js";
import { ApiError } from "../errors.js";
import {
  createClearedSessionCookie,
  createSessionCookie,
  generateSessionToken,
  getSessionExpiryDate,
  getSessionTokenFromRequest,
  hashPassword,
  hashSessionToken,
  shouldUseSecureCookies,
  verifyPassword
} from "../auth.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../mailer.js";
import {
  changePasswordPayloadSchema,
  deleteAccountPayloadSchema,
  forgotPasswordPayloadSchema,
  resetPasswordPayloadSchema,
  resendVerificationPayloadSchema,
  signInPayloadSchema,
  signUpPayloadSchema,
  verifyEmailPayloadSchema
} from "../auth-schema.js";
import { runTransaction } from "../db.js";
import { ensureDevelopmentAdminUser, isDevelopmentAdminLogin } from "../development-admin.js";
import { deleteEncryptedMediaObject } from "../media-storage.js";
import { verifyTurnstileToken } from "../turnstile.js";
import {
  assertRequestNotSeverelyBanned,
  ensureDeviceCookie
} from "../severe-access-bans.js";

type SessionLookupRow = {
  user_id: string;
  account_status?: string | null;
};

type AuthUserRow = {
  id: string;
  email: string;
  app_display_name: string | null;
  email_verified_at: string | Date | null;
  created_at: string | Date;
  profile_display_name: string | null;
  year_of_birth: number | null;
  code_of_conduct_accepted_version: string | null;
  code_of_conduct_accepted_at: string | Date | null;
  account_status?: string | null;
};

type CreatedUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  email_verified_at: string | Date | null;
  created_at: string | Date;
};

type PasswordUserRow = CreatedUserRow & {
  password_hash: string;
  account_status?: string | null;
};

type VerificationUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  email_verified_at: string | Date | null;
};

type VerificationTokenRow = {
  expires_at: string | Date;
};

type VerificationLookupRow = {
  user_id: string;
};

type PasswordResetUserRow = {
  id: string;
  email: string;
  account_status?: string | null;
};

type PasswordResetLookupRow = {
  user_id: string;
  account_status?: string | null;
};

type PasswordCredentialRow = {
  id: string;
  password_hash: string;
};

type MediaObjectKeyRow = {
  object_key: string;
};

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const AUTH_ATTEMPT_MAX = 5;
const AUTH_ATTEMPT_WINDOW_MS = FIFTEEN_MINUTES_MS;
const CURRENT_CODE_OF_CONDUCT_VERSION = "2026-07-07";

const acceptCodeOfConductPayloadSchema = z.object({
  version: z.string().min(1)
}).strict();

function mapSessionRow(row: AuthUserRow) {
  const displayName = row.app_display_name?.trim() || row.profile_display_name?.trim() || row.email;
  const profileDisplayName = row.profile_display_name?.trim() || null;
  const needsOnboarding = !profileDisplayName || !row.year_of_birth;
  const acceptedCodeOfConductVersion = row.code_of_conduct_accepted_version?.trim() || null;

  return {
    user: {
      id: row.id,
      email: row.email,
      displayName,
      emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      accountStatus: normalizeAccountStatus(row.account_status),
    },
    profile: profileDisplayName || row.year_of_birth
      ? {
          displayName: profileDisplayName,
          yearOfBirth: row.year_of_birth,
        }
      : null,
    needsOnboarding,
    needsCodeOfConduct: acceptedCodeOfConductVersion !== CURRENT_CODE_OF_CONDUCT_VERSION,
    codeOfConductVersion: CURRENT_CODE_OF_CONDUCT_VERSION,
    acceptedCodeOfConductVersion,
    codeOfConductAcceptedAt: row.code_of_conduct_accepted_at
      ? new Date(row.code_of_conduct_accepted_at).toISOString()
      : null,
  };
}

async function createSession(app: FastifyInstance, userId: string) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = getSessionExpiryDate();

  await app.db.query(
    `insert into app_sessions (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return {
    token,
    expiresAt,
  };
}

async function createVerificationToken(app: FastifyInstance, userId: string) {
  await app.db.query(
    "delete from email_verification_tokens where user_id = $1",
    [userId]
  );

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  const result = await app.db.query<VerificationTokenRow>(
    `insert into email_verification_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)
     returning expires_at`,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return {
    token,
    expiresAt: new Date(result.rows[0].expires_at)
  };
}

async function createPasswordResetToken(app: FastifyInstance, userId: string) {
  await app.db.query(
    "delete from password_reset_tokens where user_id = $1",
    [userId]
  );

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
  const result = await app.db.query<VerificationTokenRow>(
    `insert into password_reset_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)
     returning expires_at`,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return {
    token,
    expiresAt: new Date(result.rows[0].expires_at)
  };
}

async function loadAuthSession(app: FastifyInstance, userId: string) {
  const result = await app.db.query<AuthUserRow>(
    `select
       u.id,
       u.email,
       u.display_name as app_display_name,
       u.email_verified_at,
       u.created_at,
       p.display_name as profile_display_name,
       p.year_of_birth,
       u.code_of_conduct_accepted_version,
       u.code_of_conduct_accepted_at,
       coalesce(u.account_status, 'active') as account_status
     from app_users u
     left join profiles p on p.id = u.id
     where u.id = $1`,
    [userId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  if (!accountCanAuthenticate(row.account_status)) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  return mapSessionRow(row);
}

async function resolveCurrentSession(request: FastifyRequest) {
  const token = getSessionTokenFromRequest(request);

  if (!token) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const tokenHash = hashSessionToken(token);
  const result = await request.server.db.query<SessionLookupRow>(
    `select
       s.user_id,
       coalesce(u.account_status, 'active') as account_status
     from app_sessions s
     join app_users u on u.id = s.user_id
     where s.token_hash = $1
       and s.expires_at > now()
     limit 1`,
    [tokenHash]
  );

  const session = result.rows[0];

  if (!session) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  if (!accountCanAuthenticate(session.account_status)) {
    await request.server.db.query(
      "delete from app_sessions where token_hash = $1",
      [tokenHash]
    );
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  return {
    userId: session.user_id,
    tokenHash
  };
}

async function resolveSessionUserId(request: FastifyRequest) {
  const session = await resolveCurrentSession(request);
  return session.userId;
}

function setSessionCookie(reply: FastifyReply, request: FastifyRequest, token: string, expiresAt: Date) {
  reply.header("set-cookie", createSessionCookie(token, {
    secure: shouldUseSecureCookies(request),
    expiresAt,
  }));
}

function clearSessionCookie(reply: FastifyReply, request: FastifyRequest) {
  reply.header("set-cookie", createClearedSessionCookie(shouldUseSecureCookies(request)));
}

function buildVerificationUrl(request: FastifyRequest, token: string) {
  return buildRootTokenUrl(request, "verifyEmailToken", token);
}

function buildPasswordResetUrl(request: FastifyRequest, token: string) {
  return buildRootTokenUrl(request, "resetPasswordToken", token);
}

function buildRootTokenUrl(request: FastifyRequest, tokenParam: string, token: string) {
  const url = new URL("/", getPublicAppUrl(request));
  url.searchParams.set(tokenParam, token);
  return url.toString();
}

function getPublicAppUrl(request: FastifyRequest) {
  const allowedOrigins = getAllowedCorsOrigins(request);
  const requestOrigin = typeof request.headers.origin === "string" ? request.headers.origin : "";

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  const appUrl = request.server.config.APP_URL;

  if (allowedOrigins.length > 0 && !allowedOrigins.includes(appUrl) && hasSameHostAsRequest(appUrl, request)) {
    return allowedOrigins[0];
  }

  return appUrl;
}

function getAllowedCorsOrigins(request: FastifyRequest) {
  return request.server.config.CORS_ORIGIN
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getFirstHeaderValue(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue?.split(",")[0]?.trim() ?? "";
}

function hasSameHostAsRequest(url: string, request: FastifyRequest) {
  const requestHost = getFirstHeaderValue(request.headers["x-forwarded-host"]) || getFirstHeaderValue(request.headers.host);
  return requestHost ? new URL(url).host === requestHost : false;
}

function getTokenQueryParam(request: FastifyRequest) {
  const query = request.query;

  if (!query || typeof query !== "object" || !("token" in query)) {
    return "";
  }

  const token = (query as { token?: unknown }).token;
  return typeof token === "string" ? token : "";
}

function getRequestIp(request: FastifyRequest) {
  return request.ip || "unknown";
}

async function applyRateLimits(app: FastifyInstance, limits: Array<{
  key: string;
  max: number;
  windowMs: number;
  message: string;
}>) {
  for (const limit of limits) {
    await app.rateLimiter.assert(limit);
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/verify-email", async (request, reply) => {
    return reply
      .code(302)
      .header("location", buildRootTokenUrl(request, "verifyEmailToken", getTokenQueryParam(request)))
      .send();
  });

  app.get("/reset-password", async (request, reply) => {
    return reply
      .code(302)
      .header("location", buildRootTokenUrl(request, "resetPasswordToken", getTokenQueryParam(request)))
      .send();
  });

  app.post("/api/auth/signup", async (request, reply) => {
    await assertRequestNotSeverelyBanned(app, request);
    const payload = signUpPayloadSchema.parse(request.body);
    await applyRateLimits(app, [
      {
        key: `signup:ip:${getRequestIp(request)}`,
        max: AUTH_ATTEMPT_MAX,
        windowMs: AUTH_ATTEMPT_WINDOW_MS,
        message: "Too many sign-up attempts. Try again later."
      },
      {
        key: `signup:email:${payload.email}`,
        max: AUTH_ATTEMPT_MAX,
        windowMs: AUTH_ATTEMPT_WINDOW_MS,
        message: "Too many sign-up attempts. Try again later."
      }
    ]);
    await verifyTurnstileToken(request, payload.captchaToken);
    const passwordHash = await hashPassword(payload.password);

    let createdUser: CreatedUserRow;

    try {
      const result = await app.db.query<CreatedUserRow>(
        `with created_user as (
           insert into app_users (email, password_hash, display_name)
           values ($1, $2, $3)
           returning id, email, display_name, email_verified_at, created_at
         ),
         created_trust_profile as (
           insert into user_trust_profiles (user_id)
           select id
           from created_user
           on conflict (user_id) do nothing
         )
         select id, email, display_name, email_verified_at, created_at
         from created_user`,
        [payload.email, passwordHash, payload.displayName]
      );

      createdUser = result.rows[0];
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";

      if (code === "23505") {
        throw new ApiError(409, "VALIDATION_ERROR", "An account with that email already exists.");
      }

      throw error;
    }

    const verification = await createVerificationToken(app, createdUser.id);
    const preview = await sendVerificationEmail({
      config: request.server.config,
      email: createdUser.email,
      logger: request.log,
      verificationUrl: buildVerificationUrl(request, verification.token)
    });
    return reply.code(201).send({
      data: {
        alreadyVerified: false,
        email: createdUser.email,
        expiresAt: verification.expiresAt.toISOString(),
        previewUrl: preview.previewUrl
      }
    });
  });

  app.post("/api/auth/login", async (request, reply) => {
    await assertRequestNotSeverelyBanned(app, request);
    const payload = signInPayloadSchema.parse(request.body);

    await applyRateLimits(app, [
      {
        key: `login:ip:${getRequestIp(request)}`,
        max: AUTH_ATTEMPT_MAX,
        windowMs: AUTH_ATTEMPT_WINDOW_MS,
        message: "Too many sign-in attempts. Try again later."
      },
      {
        key: `login:email:${payload.email}`,
        max: AUTH_ATTEMPT_MAX,
        windowMs: AUTH_ATTEMPT_WINDOW_MS,
        message: "Too many sign-in attempts. Try again later."
      }
    ]);

    if (isDevelopmentAdminLogin(app, payload.email, payload.password)) {
      const userId = await ensureDevelopmentAdminUser(app);
      const session = await createSession(app, userId);
      setSessionCookie(reply, request, session.token, session.expiresAt);
      ensureDeviceCookie(reply, request);

      return reply.send({
        data: await loadAuthSession(app, userId)
      });
    }

    await verifyTurnstileToken(request, payload.captchaToken);
    const result = await app.db.query<PasswordUserRow>(
      `select
         id,
         email,
         password_hash,
         display_name,
         email_verified_at,
         created_at,
         coalesce(account_status, 'active') as account_status
       from app_users
       where email = $1
       limit 1`,
      [payload.email]
    );

    const user = result.rows[0];

    if (!user || !(await verifyPassword(payload.password, user.password_hash))) {
      throw new ApiError(401, "AUTH_REQUIRED", "Invalid email or password.");
    }

    if (!accountCanAuthenticate(user.account_status)) {
      throw new ApiError(401, "AUTH_REQUIRED", "Invalid email or password.");
    }

    if (!user.email_verified_at) {
      throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before signing in.");
    }

    const session = await createSession(app, user.id);
    setSessionCookie(reply, request, session.token, session.expiresAt);
    ensureDeviceCookie(reply, request);

    return reply.send({
      data: await loadAuthSession(app, user.id)
    });
  });

  app.post("/api/auth/password/forgot", async (request, reply) => {
    const payload = forgotPasswordPayloadSchema.parse(request.body);
    await applyRateLimits(app, [
      {
        key: `password-forgot:ip:${getRequestIp(request)}`,
        max: AUTH_ATTEMPT_MAX,
        windowMs: AUTH_ATTEMPT_WINDOW_MS,
        message: "Too many password reset requests. Try again later."
      },
      {
        key: `password-forgot:email:${payload.email}`,
        max: AUTH_ATTEMPT_MAX,
        windowMs: AUTH_ATTEMPT_WINDOW_MS,
        message: "Too many password reset requests. Try again later."
      }
    ]);
    const result = await app.db.query<PasswordResetUserRow>(
      `select
         id,
         email,
         coalesce(account_status, 'active') as account_status
       from app_users
       where email = $1
       limit 1`,
      [payload.email]
    );

    const user = result.rows[0];

    if (!user || !accountCanAuthenticate(user.account_status)) {
      return reply.code(202).send({
        data: {
          accepted: true,
          previewUrl: null
        }
      });
    }

    let previewUrl: string | null = null;

    try {
      const reset = await createPasswordResetToken(app, user.id);
      const preview = await sendPasswordResetEmail({
        config: request.server.config,
        email: user.email,
        logger: request.log,
        resetUrl: buildPasswordResetUrl(request, reset.token)
      });
      previewUrl = preview.previewUrl;
    } catch (error) {
      request.log.error({ err: error }, "password reset email unavailable");
    }

    return reply.code(202).send({
      data: {
        accepted: true,
        previewUrl
      }
    });
  });

  app.post("/api/auth/password/reset", async (request, reply) => {
    const payload = resetPasswordPayloadSchema.parse(request.body);
    await applyRateLimits(app, [{
      key: `password-reset:ip:${getRequestIp(request)}`,
      max: AUTH_ATTEMPT_MAX,
      windowMs: AUTH_ATTEMPT_WINDOW_MS,
      message: "Too many password reset attempts. Try again later."
    }]);
    const tokenHash = hashSessionToken(payload.token);
    const resetLookup = await app.db.query<PasswordResetLookupRow>(
      `select
         tokens.user_id,
         coalesce(users.account_status, 'active') as account_status
       from password_reset_tokens tokens
       join app_users users on users.id = tokens.user_id
       where tokens.token_hash = $1
         and tokens.expires_at > now()
       limit 1`,
      [tokenHash]
    );

    const resetToken = resetLookup.rows[0];

    if (!resetToken || !accountCanAuthenticate(resetToken.account_status)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Password reset link is invalid or expired.");
    }

    const passwordHash = await hashPassword(payload.password);
    const updatedUser = await app.db.query<{ id: string }>(
      `update app_users
       set password_hash = $1
       where id = $2
       returning id`,
      [passwordHash, resetToken.user_id]
    );

    if (!updatedUser.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Account not found.");
    }

    await app.db.query(
      "delete from app_sessions where user_id = $1",
      [resetToken.user_id]
    );

    await app.db.query(
      "delete from password_reset_tokens where user_id = $1",
      [resetToken.user_id]
    );

    return reply.send({
      data: {
        reset: true
      }
    });
  });

  app.post("/api/auth/password/change", async (request, reply) => {
    const session = await resolveCurrentSession(request);
    const payload = changePasswordPayloadSchema.parse(request.body);
    await applyRateLimits(app, [{
      key: `password-change:user:${session.userId}`,
      max: AUTH_ATTEMPT_MAX,
      windowMs: AUTH_ATTEMPT_WINDOW_MS,
      message: "Too many password change attempts. Try again later."
    }]);

    const userResult = await app.db.query<PasswordCredentialRow>(
      `select id, password_hash
       from app_users
       where id = $1
       limit 1`,
      [session.userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
    }

    if (!(await verifyPassword(payload.currentPassword, user.password_hash))) {
      throw new ApiError(401, "AUTH_REQUIRED", "Current password is incorrect.");
    }

    const passwordHash = await hashPassword(payload.newPassword);

    await app.db.query(
      `update app_users
       set password_hash = $1
       where id = $2`,
      [passwordHash, session.userId]
    );

    await app.db.query(
      "delete from password_reset_tokens where user_id = $1",
      [session.userId]
    );

    await app.db.query(
      "delete from app_sessions where user_id = $1 and token_hash <> $2",
      [session.userId, session.tokenHash]
    );

    return reply.send({
      data: {
        changed: true
      }
    });
  });

  app.delete("/api/auth/me", async (request, reply) => {
    const session = await resolveCurrentSession(request);
    const payload = deleteAccountPayloadSchema.parse(request.body);
    await applyRateLimits(app, [{
      key: `account-delete:user:${session.userId}`,
      max: AUTH_ATTEMPT_MAX,
      windowMs: AUTH_ATTEMPT_WINDOW_MS,
      message: "Too many account deletion attempts. Try again later."
    }]);

    const userResult = await app.db.query<PasswordCredentialRow>(
      `select id, password_hash
       from app_users
       where id = $1
       limit 1`,
      [session.userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
    }

    if (!(await verifyPassword(payload.password, user.password_hash))) {
      throw new ApiError(401, "AUTH_REQUIRED", "Password is incorrect.");
    }

    const mediaObjects = await app.db.query<MediaObjectKeyRow>(
      `select object_key
       from media_objects
       where owner_user_id = $1`,
      [session.userId]
    );

    for (const mediaObject of mediaObjects.rows) {
      await deleteEncryptedMediaObject(request.server.config, mediaObject.object_key);
    }

    await runTransaction(app.db, async (db) => {
      await db.query(
        "delete from app_sessions where user_id = $1",
        [session.userId]
      );

      const deletedUser = await db.query<{ id: string }>(
        `delete from app_users
         where id = $1
         returning id`,
        [session.userId]
      );

      if (!deletedUser.rows[0]) {
        throw new ApiError(404, "NOT_FOUND", "Account not found.");
      }
    });

    clearSessionCookie(reply, request);

    return reply.code(204).send();
  });

  app.post("/api/auth/verification/resend", async (request, reply) => {
    const payload = resendVerificationPayloadSchema.parse(request.body);
    await applyRateLimits(app, [
      {
        key: `verification-resend:ip:${getRequestIp(request)}`,
        max: AUTH_ATTEMPT_MAX,
        windowMs: AUTH_ATTEMPT_WINDOW_MS,
        message: "Too many verification email requests. Try again later."
      },
      {
        key: `verification-resend:email:${payload.email}`,
        max: AUTH_ATTEMPT_MAX,
        windowMs: AUTH_ATTEMPT_WINDOW_MS,
        message: "Too many verification email requests. Try again later."
      }
    ]);
    const result = await app.db.query<PasswordUserRow>(
      `select
         id,
         email,
         password_hash,
         display_name,
         email_verified_at,
         created_at,
         coalesce(account_status, 'active') as account_status
       from app_users
       where email = $1
       limit 1`,
      [payload.email]
    );

    const user = result.rows[0];

    if (!user || !(await verifyPassword(payload.password, user.password_hash))) {
      throw new ApiError(401, "AUTH_REQUIRED", "Invalid email or password.");
    }

    if (!accountCanAuthenticate(user.account_status)) {
      throw new ApiError(401, "AUTH_REQUIRED", "Invalid email or password.");
    }

    if (user.email_verified_at) {
      return reply.code(202).send({
        data: {
          alreadyVerified: true,
          expiresAt: null,
          previewUrl: null
        }
      });
    }

    const verification = await createVerificationToken(app, user.id);
    const preview = await sendVerificationEmail({
      config: request.server.config,
      email: user.email,
      logger: request.log,
      verificationUrl: buildVerificationUrl(request, verification.token)
    });

    return reply.code(202).send({
      data: {
        alreadyVerified: false,
        expiresAt: verification.expiresAt.toISOString(),
        previewUrl: preview.previewUrl
      }
    });
  });

  app.get("/api/auth/me", async (request, reply) => {
    const userId = await resolveSessionUserId(request);

    return reply.send({
      data: await loadAuthSession(app, userId)
    });
  });

  app.post("/api/auth/code-of-conduct/accept", async (request, reply) => {
    const userId = await resolveSessionUserId(request);
    const payload = acceptCodeOfConductPayloadSchema.parse(request.body);

    if (payload.version !== CURRENT_CODE_OF_CONDUCT_VERSION) {
      throw new ApiError(400, "VALIDATION_ERROR", "Code of conduct version is out of date.");
    }

    const result = await app.db.query<{ id: string }>(
      `update app_users
       set code_of_conduct_accepted_version = $1,
           code_of_conduct_accepted_at = now()
       where id = $2
       returning id`,
      [CURRENT_CODE_OF_CONDUCT_VERSION, userId]
    );

    if (!result.rows[0]) {
      throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
    }

    return reply.send({
      data: await loadAuthSession(app, userId)
    });
  });

  app.post("/api/auth/verification/send", async (request, reply) => {
    const userId = await resolveSessionUserId(request);
    await applyRateLimits(app, [{
      key: `verification-send:user:${userId}`,
      max: AUTH_ATTEMPT_MAX,
      windowMs: AUTH_ATTEMPT_WINDOW_MS,
      message: "Too many verification email requests. Try again later."
    }]);
    const userResult = await app.db.query<VerificationUserRow>(
      `select id, email, display_name, email_verified_at
       from app_users
       where id = $1
       limit 1`,
      [userId]
    );

    const user = userResult.rows[0];

    if (!user) {
      throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
    }

    if (user.email_verified_at) {
      return reply.code(202).send({
        data: {
          alreadyVerified: true,
          expiresAt: null,
          previewUrl: null
        }
      });
    }

    const verification = await createVerificationToken(app, userId);
    const preview = await sendVerificationEmail({
      config: request.server.config,
      email: user.email,
      logger: request.log,
      verificationUrl: buildVerificationUrl(request, verification.token)
    });

    return reply.code(202).send({
      data: {
        alreadyVerified: false,
        expiresAt: verification.expiresAt.toISOString(),
        previewUrl: preview.previewUrl
      }
    });
  });

  app.post("/api/auth/verification/verify", async (request, reply) => {
    const payload = verifyEmailPayloadSchema.parse(request.body);
    await applyRateLimits(app, [{
      key: `verification-verify:ip:${getRequestIp(request)}`,
      max: AUTH_ATTEMPT_MAX,
      windowMs: AUTH_ATTEMPT_WINDOW_MS,
      message: "Too many verification attempts. Try again later."
    }]);
    const tokenHash = hashSessionToken(payload.token);
    const verificationLookup = await app.db.query<VerificationLookupRow>(
      `select user_id
       from email_verification_tokens
       where token_hash = $1
         and expires_at > now()
       limit 1`,
      [tokenHash]
    );

    const verificationToken = verificationLookup.rows[0];

    if (!verificationToken) {
      throw new ApiError(400, "VALIDATION_ERROR", "Verification link is invalid or expired.");
    }

    const updatedUser = await app.db.query<CreatedUserRow>(
      `update app_users
       set email_verified_at = coalesce(email_verified_at, now())
       where id = $1
       returning id, email, display_name, email_verified_at, created_at`,
      [verificationToken.user_id]
    );

    if (!updatedUser.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Account not found.");
    }

    await app.db.query(
      "delete from email_verification_tokens where user_id = $1",
      [verificationToken.user_id]
    );

    return reply.send({
      data: {
        verified: true,
        email: updatedUser.rows[0].email
      }
    });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = getSessionTokenFromRequest(request);

    if (token) {
      await app.db.query(
        "delete from app_sessions where token_hash = $1",
        [hashSessionToken(token)]
      );
    }

    clearSessionCookie(reply, request);

    return reply.code(204).send();
  });
}
