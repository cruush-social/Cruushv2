import type { FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";
import { getActiveAccountUserId } from "./request-auth.js";

export type ModeratorRole = "admin" | "moderator";

type ModeratorLookupRow = {
  role: ModeratorRole;
};

export async function getModeratorUser(request: FastifyRequest) {
  const userId = await getActiveAccountUserId(request);
  const result = await request.server.db.query<ModeratorLookupRow>(
    `select moderator.role
     from moderator_users moderator
     join app_users users on users.id = moderator.user_id
     where moderator.user_id = $1
       and coalesce(users.account_status, 'active') = 'active'
     limit 1`,
    [userId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(403, "FORBIDDEN", "Moderator access required.");
  }

  return {
    userId,
    role: row.role
  };
}
