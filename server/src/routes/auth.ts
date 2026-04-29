import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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
import { signInPayloadSchema, signUpPayloadSchema } from "../auth-schema.js";

type SessionLookupRow = {
  user_id: string;
};

type AuthUserRow = {
  id: string;
  email: string;
  app_display_name: string | null;
  email_verified_at: string | Date | null;
  created_at: string | Date;
  profile_display_name: string | null;
  year_of_birth: number | null;
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
};

function mapSessionRow(row: AuthUserRow) {
  const displayName = row.app_display_name?.trim() || row.profile_display_name?.trim() || row.email;
  const profileDisplayName = row.profile_display_name?.trim() || null;
  const needsOnboarding = !profileDisplayName || !row.year_of_birth;

  return {
    user: {
      id: row.id,
      email: row.email,
      displayName,
      emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    },
    profile: profileDisplayName || row.year_of_birth
      ? {
          displayName: profileDisplayName,
          yearOfBirth: row.year_of_birth,
        }
      : null,
    needsOnboarding,
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

async function loadAuthSession(app: FastifyInstance, userId: string) {
  const result = await app.db.query<AuthUserRow>(
    `select
       u.id,
       u.email,
       u.display_name as app_display_name,
       u.email_verified_at,
       u.created_at,
       p.display_name as profile_display_name,
       p.year_of_birth
     from app_users u
     left join profiles p on p.id = u.id
     where u.id = $1`,
    [userId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  return mapSessionRow(row);
}

async function resolveSessionUserId(request: FastifyRequest) {
  const token = getSessionTokenFromRequest(request);

  if (!token) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const tokenHash = hashSessionToken(token);
  const result = await request.server.db.query<SessionLookupRow>(
    `select user_id
     from app_sessions s
     where s.token_hash = $1
       and s.expires_at > now()
     limit 1`,
    [tokenHash]
  );

  const session = result.rows[0];

  if (!session) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  return session.user_id;
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

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/signup", async (request, reply) => {
    const payload = signUpPayloadSchema.parse(request.body);
    const passwordHash = await hashPassword(payload.password);

    let createdUser: CreatedUserRow;

    try {
      const result = await app.db.query<CreatedUserRow>(
        `insert into app_users (email, password_hash, display_name)
         values ($1, $2, $3)
         returning id, email, display_name, email_verified_at, created_at`,
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

    const session = await createSession(app, createdUser.id);
    setSessionCookie(reply, request, session.token, session.expiresAt);

    return reply.code(201).send({
      data: {
        user: {
          id: createdUser.id,
          email: createdUser.email,
          displayName: createdUser.display_name?.trim() || createdUser.email,
          emailVerifiedAt: createdUser.email_verified_at ? new Date(createdUser.email_verified_at).toISOString() : null,
          createdAt: new Date(createdUser.created_at).toISOString(),
        },
        profile: null,
        needsOnboarding: true,
      }
    });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const payload = signInPayloadSchema.parse(request.body);
    const result = await app.db.query<PasswordUserRow>(
      `select id, email, password_hash, display_name, email_verified_at, created_at
       from app_users
       where email = $1
       limit 1`,
      [payload.email]
    );

    const user = result.rows[0];

    if (!user || !(await verifyPassword(payload.password, user.password_hash))) {
      throw new ApiError(401, "AUTH_REQUIRED", "Invalid email or password.");
    }

    const session = await createSession(app, user.id);
    setSessionCookie(reply, request, session.token, session.expiresAt);

    return reply.send({
      data: await loadAuthSession(app, user.id)
    });
  });

  app.get("/api/auth/me", async (request, reply) => {
    const userId = await resolveSessionUserId(request);

    return reply.send({
      data: await loadAuthSession(app, userId)
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
