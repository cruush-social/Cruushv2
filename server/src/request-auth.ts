import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { accountCanAuthenticate } from "./account-status.js";
import { getSessionTokenFromRequest, hashSessionToken } from "./auth.js";
import { ApiError } from "./errors.js";

const userIdHeaderSchema = z.object({
  "x-user-id": z.uuid()
});

type SessionLookupRow = {
  user_id: string;
  account_status?: string | null;
};

export async function getAuthenticatedUserId(request: FastifyRequest) {
  const sessionToken = getSessionTokenFromRequest(request);
  const parsedHeaders = userIdHeaderSchema.safeParse(request.headers);

  if (sessionToken) {
    const tokenHash = hashSessionToken(sessionToken);
    const sessionLookup = await request.server.db.query<SessionLookupRow>(
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

    const session = sessionLookup.rows[0];

    if (session?.user_id) {
      if (accountCanAuthenticate(session.account_status)) {
        return session.user_id;
      }

      await request.server.db.query(
        "delete from app_sessions where token_hash = $1",
        [tokenHash]
      );
    }
  }

  if (request.server.config.NODE_ENV === "test") {
    if (parsedHeaders.success) {
      return parsedHeaders.data["x-user-id"];
    }
  }

  throw new ApiError(
    401,
    "AUTH_REQUIRED",
    "Authentication required.",
    sessionToken || parsedHeaders.success ? null : parsedHeaders.error.flatten()
  );
}

export async function getOptionalAuthenticatedUserId(request: FastifyRequest) {
  const sessionToken = getSessionTokenFromRequest(request);
  const parsedHeaders = userIdHeaderSchema.safeParse(request.headers);

  if (sessionToken) {
    const tokenHash = hashSessionToken(sessionToken);
    const sessionLookup = await request.server.db.query<SessionLookupRow>(
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

    const session = sessionLookup.rows[0];

    if (session?.user_id) {
      if (accountCanAuthenticate(session.account_status)) {
        return session.user_id;
      }

      await request.server.db.query(
        "delete from app_sessions where token_hash = $1",
        [tokenHash]
      );
    }
  }

  if (request.server.config.NODE_ENV === "test" && parsedHeaders.success) {
    return parsedHeaders.data["x-user-id"];
  }

  return null;
}
