import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { accountCanAuthenticate, normalizeAccountStatus } from "../account-status.js";
import {
  ensureAlphaTestActive,
  getAlphaSessionExpiry,
  getAlphaTestState,
  getSessionMaxAgeSeconds,
  isAlphaTestExpired,
  verifyAlphaTestPassword
} from "../alpha-test.js";
import { ApiError } from "../errors.js";
import { assertBetaAccessAllowed } from "../beta-access.js";
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
  ageVerificationPayloadSchema,
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
import { verifyClientSecurityCheck } from "../client-security-check.js";
import { ensureDevelopmentAdminUser, isDevelopmentAdminLogin } from "../development-admin.js";
import { verifyTurnstileToken } from "../turnstile.js";
import { storeLocationEnvelope } from "../location-privacy.js";
import {
  assertRequestNotSeverelyBanned,
  ensureDeviceCookie
} from "../severe-access-bans.js";
import { prepareSignupReferral } from "../referrals-service.js";
import { encryptReferralSignupPrivacy } from "../referral-privacy.js";
import { verifyLoginSecondFactor } from "../two-factor.js";
import { isOwnerFullAccessEmail, ownerCanBypassAccountStatus } from "../owner-access.js";
import { birthYearFromDateOfBirth } from "../profile-schema.js";
import { syncVerifiedMemberToResendAudience } from "../resend-audience.js";

type SessionLookupRow = {
  user_id: string;
  email?: string | null;
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
  signup_birth_year: number | null;
  age_verified_at: string | Date | null;
  code_of_conduct_accepted_version: string | null;
  code_of_conduct_accepted_at: string | Date | null;
  account_status?: string | null;
  moderator_role?: "admin" | "moderator" | null;
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
  two_factor_enabled?: boolean | null;
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
  email?: string | null;
  account_status?: string | null;
};

type PasswordCredentialRow = {
  id: string;
  password_hash: string;
};

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const AUTH_ATTEMPT_MAX = 5;
const AUTH_ATTEMPT_WINDOW_MS = FIFTEEN_MINUTES_MS;
const ACCOUNT_DELETION_TRANSACTION_ATTEMPTS = 2;
// Failed verification attempts against one emailed link. A real user retries a
// handful of times at most; anything past this is guessing at that token.
const VERIFICATION_FAILURE_MAX = 10;
// Ceiling for buckets keyed by address. TRUST_PROXY_HOPS defaults to 0, which
// leaves trustProxy off and reports the reverse proxy's address for every
// request, so this bucket can be shared by the whole user base. Keep it well
// above AUTH_ATTEMPT_MAX and only charge it for failures.
const SHARED_IP_FAILURE_MAX = 200;
const CURRENT_CODE_OF_CONDUCT_VERSION = "2026-07-07";

function isPostgresDeadlock(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "40P01";
}

const acceptCodeOfConductPayloadSchema = z.object({
  version: z.string().min(1)
}).strict();

function mapSessionRow(row: AuthUserRow) {
  const displayName = row.app_display_name?.trim() || row.profile_display_name?.trim() || row.email;
  const profileDisplayName = row.profile_display_name?.trim() || null;
  const needsAgeVerification = !row.age_verified_at;
  const needsOnboarding = !profileDisplayName || !row.year_of_birth;
  const acceptedCodeOfConductVersion = row.code_of_conduct_accepted_version?.trim() || null;
  const moderatorRole = row.moderator_role ?? (isOwnerFullAccessEmail(row.email) ? "admin" : null);

  return {
    user: {
      id: row.id,
      email: row.email,
      displayName,
      emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      accountStatus: normalizeAccountStatus(row.account_status),
      ...(moderatorRole ? { moderatorRole } : {}),
    },
    profile: profileDisplayName || row.year_of_birth
      ? {
          displayName: profileDisplayName,
          yearOfBirth: row.year_of_birth,
        }
      : null,
    needsOnboarding,
    needsAgeVerification,
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
  const expiresAt = getAlphaSessionExpiry(app.config, getSessionExpiryDate());

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
       u.signup_birth_year,
       u.age_verified_at,
       u.code_of_conduct_accepted_version,
       u.code_of_conduct_accepted_at,
       coalesce(u.account_status, 'active') as account_status,
       moderator.role as moderator_role
     from app_users u
     left join profiles p on p.id = u.id
     left join moderator_users moderator on moderator.user_id = u.id
     where u.id = $1`,
    [userId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const accountStatus = normalizeAccountStatus(row.account_status);

  if (!accountCanAuthenticate(accountStatus) && !ownerCanBypassAccountStatus(row.email, accountStatus)) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const session = mapSessionRow(row);

  if (app.config.ALPHA_TEST_ENABLED) {
    return {
      ...session,
      alphaTest: getAlphaTestState(app.config)
    };
  }

  return session;
}

async function resolveCurrentSession(
  request: FastifyRequest,
  options: { allowAccountDeletion?: boolean } = {}
) {
  const token = getSessionTokenFromRequest(request);

  if (!token) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const tokenHash = hashSessionToken(token);
  const result = await request.server.db.query<SessionLookupRow>(
    `select
       s.user_id,
       u.email,
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

  if (!options.allowAccountDeletion && isAlphaTestExpired(request.server.config)) {
    await request.server.db.query(
      "delete from app_sessions where token_hash = $1",
      [tokenHash]
    );
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const accountStatus = normalizeAccountStatus(session.account_status);

  if (
    !options.allowAccountDeletion &&
    !accountCanAuthenticate(accountStatus) &&
    !ownerCanBypassAccountStatus(session.email, accountStatus)
  ) {
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
    maxAgeSeconds: getSessionMaxAgeSeconds(expiresAt),
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
    return canonicalizePublicAppUrl(requestOrigin);
  }

  const appUrl = request.server.config.APP_URL;

  if (allowedOrigins.length > 0 && !allowedOrigins.includes(appUrl) && hasSameHostAsRequest(appUrl, request)) {
    return canonicalizePublicAppUrl(allowedOrigins[0]);
  }

  return canonicalizePublicAppUrl(appUrl);
}

function getAllowedCorsOrigins(request: FastifyRequest) {
  return request.server.config.CORS_ORIGIN
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function canonicalizePublicAppUrl(origin: string) {
  try {
    const url = new URL(origin);
    if (url.hostname === "www.cruush.app") {
      url.hostname = "cruush.app";
      return url.origin;
    }
  } catch {
    return origin;
  }

  return origin;
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
    const signupResult = signUpPayloadSchema.safeParse(request.body);

    if (!signupResult.success) {
      const dateOfBirthIssue = signupResult.error.issues.find((issue) => issue.path[0] === "dateOfBirth");

      if (dateOfBirthIssue) {
        throw new ApiError(400, "VALIDATION_ERROR", dateOfBirthIssue.message);
      }

      throw signupResult.error;
    }

    const payload = signupResult.data;
    ensureAlphaTestActive(app.config);
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
    if (app.config.BETA_ACCESS_GEOFENCE_ENABLED) {
      assertBetaAccessAllowed(app.config, payload.betaAccessLocation);
    } else {
      await verifyAlphaTestPassword(app.config, payload.alphaPassword);
      assertBetaAccessAllowed(app.config, payload.betaAccessLocation);
    }
    verifyClientSecurityCheck(payload.clientCheck);
    await verifyTurnstileToken(request, payload.captchaToken);
    const passwordHash = await hashPassword(payload.password);
    const referral = await prepareSignupReferral(app, request, payload.referralCode);
    const referralPrivacy = referral
      ? encryptReferralSignupPrivacy(app.config, referral)
      : null;

    let createdUser: CreatedUserRow;

    try {
      const result = await app.db.query<CreatedUserRow>(
        `with created_user as (
           insert into app_users (
             email,
             password_hash,
             display_name,
             signup_birth_year,
             age_verified_at,
             terms_accepted_at,
             privacy_accepted_at,
             terms_version,
             privacy_version,
             product_updates_opt_in
           )
           values ($1, $2, $3, $15, now(), now(), now(), '2026-07-10', '2026-07-21', $16)
           returning id, email, display_name, email_verified_at, created_at
         ),
         created_trust_profile as (
           insert into user_trust_profiles (user_id)
           select id
           from created_user
           on conflict (user_id) do nothing
         ),
         created_referral_identity as (
           insert into referral_identities (user_id, code)
           select id, encode(gen_random_bytes(16), 'hex')
           from created_user
           on conflict (user_id) do nothing
         ),
         created_referral as (
           insert into referrals (
             referrer_user_id,
             referred_user_id,
             referral_code,
             status,
             risk_score,
             review_flags,
             signup_ip_hash,
             signup_device_hash,
             signup_privacy_ciphertext,
             signup_privacy_nonce,
             signup_privacy_auth_tag,
             signup_privacy_key_version
           )
           select
             $4::uuid,
             created_user.id,
             $5,
             $6,
             $7,
             $8::jsonb,
             $9,
             $10,
             $11,
             $12,
             $13,
             coalesce($14, 'v1')
           from created_user
           where $4::uuid is not null
         )
         select id, email, display_name, email_verified_at, created_at
         from created_user`,
        [
          payload.email,
          passwordHash,
          payload.displayName ?? null,
          referral?.referrerUserId ?? null,
          referral?.code ?? null,
          referral?.status ?? null,
          referral?.riskScore ?? 0,
          JSON.stringify(referral?.reviewFlags ?? []),
          referral?.ipHash ?? null,
          referral?.deviceHash ?? null,
          referralPrivacy?.ciphertext ?? null,
          referralPrivacy?.nonce ?? null,
          referralPrivacy?.authTag ?? null,
          referralPrivacy?.keyVersion ?? null,
          birthYearFromDateOfBirth(payload.dateOfBirth),
          payload.productUpdatesOptIn
        ]
      );

      createdUser = result.rows[0];

      // Outside production, an @cruush.local signup is a throwaway test account,
      // so mark it verified and let onboarding be exercised end to end.
      if (app.config.NODE_ENV !== "production" && payload.email.toLowerCase().endsWith("@cruush.local")) {
        const verified = await app.db.query<{ email_verified_at: string | Date | null }>(
          `update app_users
           set email_verified_at = coalesce(email_verified_at, now())
           where id = $1
           returning email_verified_at`,
          [createdUser.id]
        );
        createdUser = {
          ...createdUser,
          email_verified_at: verified.rows[0]?.email_verified_at ?? createdUser.email_verified_at
        };
      }
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";

      if (code === "23505") {
        throw new ApiError(409, "VALIDATION_ERROR", "An account with that email already exists.");
      }

      throw error;
    }

    if (payload.betaAccessLocation) {
      await storeLocationEnvelope(app, {
        subjectUserId: createdUser.id,
        lat: payload.betaAccessLocation.lat,
        lng: payload.betaAccessLocation.lng,
        accuracyM: payload.betaAccessLocation.accuracyMeters,
        source: "GPS"
      }).catch((error) => {
        request.log.warn({ err: error, userId: createdUser.id }, "signup location storage unavailable");
      });
    }

    const verification = await createVerificationToken(app, createdUser.id);
    // The account row is already committed. If delivery fails we must not fail the whole
    // signup: that leaves the user with an account they cannot verify and cannot re-create.
    let previewUrl: string | null = null;
    let verificationEmailSent = false;

    try {
      const preview = await sendVerificationEmail({
        config: request.server.config,
        email: createdUser.email,
        logger: request.log,
        verificationUrl: buildVerificationUrl(request, verification.token)
      });
      previewUrl = preview.previewUrl;
      verificationEmailSent = preview.previewUrl === null;
    } catch (error) {
      verificationEmailSent = false;
      request.log.error(
        { err: error, userId: createdUser.id, email: createdUser.email },
        "signup verification email delivery failed"
      );
    }

    return reply.code(201).send({
      data: {
        alreadyVerified: false,
        email: createdUser.email,
        expiresAt: verification.expiresAt.toISOString(),
        previewUrl,
        verificationEmailSent
      }
    });
  });

  app.post("/api/auth/login", async (request, reply) => {
    await assertRequestNotSeverelyBanned(app, request);
    const payload = signInPayloadSchema.parse(request.body);
    ensureAlphaTestActive(app.config);

    if (isDevelopmentAdminLogin(app, payload.email, payload.password)) {
      const userId = await ensureDevelopmentAdminUser(app);
      const session = await createSession(app, userId);
      setSessionCookie(reply, request, session.token, session.expiresAt);
      ensureDeviceCookie(reply, request);

      return reply.send({
        data: await loadAuthSession(app, userId)
      });
    }

    verifyClientSecurityCheck(payload.clientCheck);
    await verifyTurnstileToken(request, payload.captchaToken);
    const result = await app.db.query<PasswordUserRow>(
      `select
         id,
         email,
         password_hash,
         display_name,
         email_verified_at,
         created_at,
         coalesce(account_status, 'active') as account_status,
         exists (
           select 1 from user_two_factor_auth two_factor
           where two_factor.user_id = app_users.id
             and two_factor.enabled_at is not null
         ) as two_factor_enabled
       from app_users
       where email = $1
       limit 1`,
      [payload.email]
    );

    const user = result.rows[0];

    if (!user || !(await verifyPassword(payload.password, user.password_hash))) {
      await applyRateLimits(app, [
        {
          key: `login:email:${payload.email}`,
          max: AUTH_ATTEMPT_MAX,
          windowMs: AUTH_ATTEMPT_WINDOW_MS,
          message: "Too many sign-in attempts. Try again later."
        },
        {
          key: `login:ip:${getRequestIp(request)}`,
          max: SHARED_IP_FAILURE_MAX,
          windowMs: AUTH_ATTEMPT_WINDOW_MS,
          message: "Too many sign-in attempts. Try again later."
        }
      ]);
      throw new ApiError(401, "AUTH_REQUIRED", "Invalid email or password.");
    }

    const accountStatus = normalizeAccountStatus(user.account_status);

    if (!accountCanAuthenticate(accountStatus) && !ownerCanBypassAccountStatus(user.email, accountStatus)) {
      throw new ApiError(401, "AUTH_REQUIRED", "Invalid email or password.");
    }

    if (!user.email_verified_at) {
      throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before signing in.");
    }

    if (user.two_factor_enabled) {
      try {
        await verifyLoginSecondFactor(app, user.id, payload.twoFactorCode);
      } catch (error) {
        if (error instanceof ApiError && error.code === "INVALID_TWO_FACTOR_CODE") {
          await applyRateLimits(app, [
            {
              key: `two-factor-login:user:${user.id}`,
              max: AUTH_ATTEMPT_MAX,
              windowMs: AUTH_ATTEMPT_WINDOW_MS,
              message: "Too many two-factor attempts. Try again later."
            },
            {
              key: `two-factor-login:ip:${getRequestIp(request)}`,
              max: SHARED_IP_FAILURE_MAX,
              windowMs: AUTH_ATTEMPT_WINDOW_MS,
              message: "Too many two-factor attempts. Try again later."
            }
          ]);
        }

        throw error;
      }
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

    const accountStatus = user ? normalizeAccountStatus(user.account_status) : null;

    if (!user || !accountStatus || (!accountCanAuthenticate(accountStatus) && !ownerCanBypassAccountStatus(user.email, accountStatus))) {
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
         users.email,
         coalesce(users.account_status, 'active') as account_status
       from password_reset_tokens tokens
       join app_users users on users.id = tokens.user_id
       where tokens.token_hash = $1
         and tokens.expires_at > now()
       limit 1`,
      [tokenHash]
    );

    const resetToken = resetLookup.rows[0];

    const accountStatus = resetToken ? normalizeAccountStatus(resetToken.account_status) : null;

    if (!resetToken || !accountStatus || (!accountCanAuthenticate(accountStatus) && !ownerCanBypassAccountStatus(resetToken.email, accountStatus))) {
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
    const session = await resolveCurrentSession(request, { allowAccountDeletion: true });
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

    for (let attempt = 1; attempt <= ACCOUNT_DELETION_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        await runTransaction(app.db, async (db) => {
          await db.query(
            `insert into account_deletion_media_cleanup (object_key)
             select object_key
             from media_objects
             where owner_user_id = $1
             union
             select variants.object_key
             from media_variants variants
             join media_objects media on media.id = variants.media_object_id
             where media.owner_user_id = $1
             on conflict (object_key) do nothing`,
            [session.userId]
          );

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
        break;
      } catch (error) {
        if (!isPostgresDeadlock(error) || attempt === ACCOUNT_DELETION_TRANSACTION_ATTEMPTS) {
          throw error;
        }
        app.log.warn({ attempt }, "retrying account deletion after database deadlock");
      }
    }

    clearSessionCookie(reply, request);

    return reply.code(204).send();
  });

  app.post("/api/auth/verification/resend", async (request, reply) => {
    const payload = resendVerificationPayloadSchema.parse(request.body);
    await applyRateLimits(app, [
      {
        // Per-account limit: the meaningful one, since it maps to a real mailbox.
        key: `verification-resend:email:${payload.email}`,
        max: AUTH_ATTEMPT_MAX,
        windowMs: AUTH_ATTEMPT_WINDOW_MS,
        message: "Too many verification email requests. Try again later."
      },
      {
        // Address-keyed backstop. Shared by every user behind the proxy while
        // TRUST_PROXY_HOPS is unset, so it must not sit at the per-account value.
        key: `verification-resend:ip:${getRequestIp(request)}`,
        max: SHARED_IP_FAILURE_MAX,
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

    const accountStatus = normalizeAccountStatus(user.account_status);

    if (!accountCanAuthenticate(accountStatus) && !ownerCanBypassAccountStatus(user.email, accountStatus)) {
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

  app.post("/api/auth/age-verification", async (request, reply) => {
    const userId = await resolveSessionUserId(request);
    const ageVerificationResult = ageVerificationPayloadSchema.safeParse(request.body);

    if (!ageVerificationResult.success) {
      const dateOfBirthIssue = ageVerificationResult.error.issues.find((issue) => issue.path[0] === "dateOfBirth");

      if (dateOfBirthIssue) {
        throw new ApiError(400, "VALIDATION_ERROR", dateOfBirthIssue.message);
      }

      throw ageVerificationResult.error;
    }

    const payload = ageVerificationResult.data;
    const birthYear = birthYearFromDateOfBirth(payload.dateOfBirth);

    if (birthYear === null) {
      throw new ApiError(400, "VALIDATION_ERROR", "Enter a valid date of birth.");
    }

    const result = await app.db.query<{ id: string }>(
      `update app_users
       set signup_birth_year = $2,
           age_verified_at = coalesce(age_verified_at, now())
       where id = $1
       returning id`,
      [userId, birthYear]
    );

    if (!result.rows[0]) {
      throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
    }

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
      // Charge the limiter only for failures. Asserting before the lookup made a
      // successful verification consume budget, and behind a proxy every request
      // carries the same address, so one shared bucket throttled all users at once.
      await applyRateLimits(app, [
        {
          key: `verification-verify:token:${tokenHash}`,
          max: VERIFICATION_FAILURE_MAX,
          windowMs: AUTH_ATTEMPT_WINDOW_MS,
          message: "Too many verification attempts. Try again later."
        },
        {
          key: `verification-verify:ip:${getRequestIp(request)}`,
          max: SHARED_IP_FAILURE_MAX,
          windowMs: AUTH_ATTEMPT_WINDOW_MS,
          message: "Too many verification attempts. Try again later."
        }
      ]);

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

    void syncVerifiedMemberToResendAudience({ config: request.server.config, email: updatedUser.rows[0].email, logger: request.log });

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
