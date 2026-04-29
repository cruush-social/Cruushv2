import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { getSessionTokenFromRequest, hashSessionToken } from "./auth.js";
import { ApiError } from "./errors.js";

const userIdHeaderSchema = z.object({
  "x-user-id": z.uuid()
});

type SessionLookupRow = {
  user_id: string;
};

export async function getAuthenticatedUserId(request: FastifyRequest) {
  const sessionToken = getSessionTokenFromRequest(request);
  const parsedHeaders = userIdHeaderSchema.safeParse(request.headers);

  if (sessionToken) {
    const sessionLookup = await request.server.db.query<SessionLookupRow>(
      `select user_id
       from app_sessions s
       where s.token_hash = $1
         and s.expires_at > now()
       limit 1`,
      [hashSessionToken(sessionToken)]
    );

    if (sessionLookup.rows[0]?.user_id) {
      return sessionLookup.rows[0].user_id;
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
