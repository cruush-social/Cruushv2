import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  accountCanAuthenticate,
  accountCanPerformUnsafeAction,
  normalizeAccountStatus,
  type AccountStatus
} from "./account-status.js";
import { isAlphaTestExpired } from "./alpha-test.js";
import { getSessionTokenFromRequest, hashSessionToken } from "./auth.js";
import { ApiError } from "./errors.js";
import { isOwnerFullAccessEmail, ownerFullAccessCanBypassAccountStatus } from "./owner-access.js";

const userIdHeaderSchema = z.object({
  "x-user-id": z.uuid()
});

type SessionLookupRow = {
  user_id: string;
  email?: string | null;
  account_status?: string | null;
};

type SessionLookup = {
  userId: string;
  accountStatus: AccountStatus;
  ownerFullAccess: boolean;
  tokenHash: string;
};

async function lookupSession(request: FastifyRequest, sessionToken: string) {
  const tokenHash = hashSessionToken(sessionToken);
  const sessionLookup = await request.server.db.query<SessionLookupRow>(
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
  const session = sessionLookup.rows[0];

  if (!session?.user_id) {
    return null;
  }

  if (isAlphaTestExpired(request.server.config)) {
    await revokeSession(request, tokenHash);
    return null;
  }

  return {
    userId: session.user_id,
    accountStatus: normalizeAccountStatus(session.account_status),
    ownerFullAccess: isOwnerFullAccessEmail(session.email),
    tokenHash
  } satisfies SessionLookup;
}

async function revokeSession(request: FastifyRequest, tokenHash: string) {
  await request.server.db.query(
    "delete from app_sessions where token_hash = $1",
    [tokenHash]
  );
}

function authRequiredError(sessionToken: string | null, parsedHeaders: ReturnType<typeof userIdHeaderSchema.safeParse>) {
  return new ApiError(
    401,
    "AUTH_REQUIRED",
    "Authentication required.",
    sessionToken || parsedHeaders.success ? null : parsedHeaders.error.flatten()
  );
}

export async function getAuthenticatedUserId(request: FastifyRequest) {
  const sessionToken = getSessionTokenFromRequest(request);
  const parsedHeaders = userIdHeaderSchema.safeParse(request.headers);

  if (sessionToken) {
    const session = await lookupSession(request, sessionToken);

    if (session) {
      if (
        accountCanAuthenticate(session.accountStatus) ||
        ownerFullAccessCanBypassAccountStatus(session.ownerFullAccess, session.accountStatus)
      ) {
        return session.userId;
      }

      await revokeSession(request, session.tokenHash);
    }
  }

  if (request.server.config.NODE_ENV === "test") {
    if (parsedHeaders.success) {
      return parsedHeaders.data["x-user-id"];
    }
  }

  throw authRequiredError(sessionToken, parsedHeaders);
}

export async function getActiveAccountUserId(request: FastifyRequest) {
  const sessionToken = getSessionTokenFromRequest(request);
  const parsedHeaders = userIdHeaderSchema.safeParse(request.headers);

  if (sessionToken) {
    const session = await lookupSession(request, sessionToken);

    if (session) {
      if (
        accountCanPerformUnsafeAction(session.accountStatus) ||
        ownerFullAccessCanBypassAccountStatus(session.ownerFullAccess, session.accountStatus)
      ) {
        return session.userId;
      }

      if (accountCanAuthenticate(session.accountStatus)) {
        throw new ApiError(
          403,
          "ACCOUNT_UNDER_REVIEW",
          "This account is under review. Unsafe actions are unavailable."
        );
      }

      await revokeSession(request, session.tokenHash);
    }
  }

  if (request.server.config.NODE_ENV === "test") {
    if (parsedHeaders.success) {
      return parsedHeaders.data["x-user-id"];
    }
  }

  throw authRequiredError(sessionToken, parsedHeaders);
}

export async function getOptionalAuthenticatedUserId(request: FastifyRequest) {
  const sessionToken = getSessionTokenFromRequest(request);
  const parsedHeaders = userIdHeaderSchema.safeParse(request.headers);

  if (sessionToken) {
    const session = await lookupSession(request, sessionToken);

    if (session) {
      if (
        accountCanAuthenticate(session.accountStatus) ||
        ownerFullAccessCanBypassAccountStatus(session.ownerFullAccess, session.accountStatus)
      ) {
        return session.userId;
      }

      await revokeSession(request, session.tokenHash);
    }
  }

  if (request.server.config.NODE_ENV === "test" && parsedHeaders.success) {
    return parsedHeaders.data["x-user-id"];
  }

  return null;
}
