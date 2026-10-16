import type { FastifyInstance } from "fastify";
import { ApiError, type ErrorCode } from "./errors.js";
import { batchRequestRead } from "./request-read-scope.js";

type BlockLookupRow = {
  exists: boolean;
};

type BlockedUserRow = {
  user_id: string;
};

function isSchemaCompatibilityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "";

  if (["42703", "42P01", "42883", "22P02"].includes(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("relation") || message.includes("does not exist");
}

function canIgnoreSchemaCompatibility(app: FastifyInstance, error: unknown) {
  return app.config.NODE_ENV !== "production" && isSchemaCompatibilityError(error);
}

export async function hasUserBlockBetween(app: FastifyInstance, userAId: string, userBId: string) {
  if (userAId === userBId) {
    return false;
  }

  try {
    const pair = [userAId, userBId].sort();
    return await batchRequestRead(app.db, "block-pairs", JSON.stringify(pair), async (keys) => {
      const pairs = keys.map((key) => JSON.parse(key) as [string, string]);
      const result = await app.db.query<{ user_a: string; user_b: string; blocked: boolean }>(
        `select pairs.user_a, pairs.user_b, exists (
           select 1 from user_blocks
           where (blocker_user_id::text = pairs.user_a and blocked_user_id::text = pairs.user_b)
              or (blocker_user_id::text = pairs.user_b and blocked_user_id::text = pairs.user_a)
         ) as blocked
         from unnest($1::text[], $2::text[]) as pairs(user_a, user_b)`,
        [pairs.map(([a]) => a), pairs.map(([, b]) => b)]
      );
      return new Map(result.rows.map((row) => [JSON.stringify([row.user_a, row.user_b]), row.blocked]));
    }, async () => {
      const result = await app.db.query<BlockLookupRow>(
        `select true as exists
         from user_blocks
         where (blocker_user_id::text = $1::text and blocked_user_id::text = $2::text)
            or (blocker_user_id::text = $2::text and blocked_user_id::text = $1::text)
         limit 1`,
        [userAId, userBId]
      );

      return result?.rows?.some((row) => row.exists === true) ?? false;
    }) ?? false;
  } catch (error) {
    if (canIgnoreSchemaCompatibility(app, error)) {
      return false;
    }

    throw error;
  }
}

export async function assertUsersNotBlocked(
  app: FastifyInstance,
  userAId: string,
  userBId: string,
  options: {
    statusCode?: number;
    code?: ErrorCode;
    message?: string;
  } = {}
) {
  if (!await hasUserBlockBetween(app, userAId, userBId)) {
    return;
  }

  throw new ApiError(
    options.statusCode ?? 404,
    options.code ?? "NOT_FOUND",
    options.message ?? "Not found."
  );
}

export async function loadBlockedRelationshipUserIds(app: FastifyInstance, userId: string) {
  try {
    const result = await app.db.query<BlockedUserRow>(
      `select case
         when blocker_user_id = $1 then blocked_user_id::text
         else blocker_user_id::text
       end as user_id
       from user_blocks
       where blocker_user_id = $1
          or blocked_user_id = $1`,
      [userId]
    );

    return new Set(result.rows.map((row) => row.user_id));
  } catch (error) {
    if (canIgnoreSchemaCompatibility(app, error)) {
      return new Set<string>();
    }

    throw error;
  }
}
