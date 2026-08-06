import type { FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";
import { OWNER_FULL_ACCESS_EMAIL } from "./owner-access.js";
import { getActiveAccountUserId } from "./request-auth.js";

export type ModeratorRole = "admin" | "moderator";

type ModeratorLookupRow = {
  role: ModeratorRole | null;
  email: string;
};

export async function getModeratorUser(request: FastifyRequest) {
  const userId = await getActiveAccountUserId(request);
  const result = await request.server.db.query<ModeratorLookupRow>(
    `select moderator.role, users.email
     from app_users users
     left join moderator_users moderator on moderator.user_id = users.id
     where users.id = $1
       and (
         coalesce(users.account_status, 'active') = 'active'
         or (lower(users.email) = $2 and coalesce(users.account_status, 'active') <> 'deleted')
       )
       and (moderator.role is not null or lower(users.email) = $2)
     limit 1`,
    [userId, OWNER_FULL_ACCESS_EMAIL]
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(403, "FORBIDDEN", "Moderator access required.");
  }

  return {
    userId,
    role: row.role ?? "admin"
  };
}
