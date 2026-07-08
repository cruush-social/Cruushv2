import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";

const blockPayloadSchema = z.object({
  userId: z.uuid()
}).strict();

const blockParamsSchema = z.object({
  userId: z.uuid()
}).strict();

type ExistingBlockTargetRow = {
  id: string;
};

type BlockedUserListRow = {
  id: string;
  display_name: string | null;
  photo: string | null;
  created_at: string | Date;
};

function assertNotSelfBlock(currentUserId: string, targetUserId: string) {
  if (currentUserId === targetUserId) {
    throw new ApiError(400, "VALIDATION_ERROR", "You cannot block yourself.");
  }
}

async function assertBlockTargetExists(app: FastifyInstance, targetUserId: string) {
  const result = await app.db.query<ExistingBlockTargetRow>(
    `select id::text as id
     from app_users
     where id = $1
       and coalesce(account_status, 'active') <> 'deleted'
     limit 1`,
    [targetUserId]
  );

  if (!result.rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "User not found.");
  }
}

export async function registerBlockRoutes(app: FastifyInstance) {
  app.post("/api/blocks", async (request, reply) => {
    const blockerUserId = await getActiveAccountUserId(request);
    const payload = blockPayloadSchema.parse(request.body);

    assertNotSelfBlock(blockerUserId, payload.userId);
    await assertBlockTargetExists(app, payload.userId);

    await app.db.query(
      `insert into user_blocks (blocker_user_id, blocked_user_id)
       values ($1, $2)
       on conflict (blocker_user_id, blocked_user_id) do nothing`,
      [blockerUserId, payload.userId]
    );

    return reply.send({
      data: {
        userId: payload.userId,
        blocked: true
      }
    });
  });

  app.delete("/api/blocks/:userId", async (request, reply) => {
    const blockerUserId = await getActiveAccountUserId(request);
    const { userId } = blockParamsSchema.parse(request.params);

    assertNotSelfBlock(blockerUserId, userId);

    await app.db.query(
      `delete from user_blocks
       where blocker_user_id = $1
         and blocked_user_id = $2`,
      [blockerUserId, userId]
    );

    return reply.code(204).send();
  });

  app.get("/api/blocks", async (request, reply) => {
    const blockerUserId = await getAuthenticatedUserId(request);
    const result = await app.db.query<BlockedUserListRow>(
      `select
         blocked.id::text as id,
         coalesce(profile.display_name, blocked.display_name, 'Cruush user') as display_name,
         profile.photos[1] as photo,
         block.created_at
       from user_blocks block
       join app_users blocked on blocked.id = block.blocked_user_id
       left join profiles profile on profile.id = blocked.id
       where block.blocker_user_id = $1
         and coalesce(blocked.account_status, 'active') <> 'deleted'
       order by block.created_at desc
       limit 200`,
      [blockerUserId]
    );

    return reply.send({
      data: {
        blockedUsers: result.rows.map((row) => ({
          userId: row.id,
          displayName: row.display_name?.trim() || "Cruush user",
          photo: row.photo ?? null,
          createdAt: new Date(row.created_at).toISOString()
        }))
      }
    });
  });
}
