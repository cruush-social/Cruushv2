import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthenticatedUserId } from "../request-auth.js";

type UserNoticeRow = {
  dismissed_at: string | Date | null;
};

const noticeParamsSchema = z.object({
  noticeKey: z.string().min(3).max(120).regex(/^[a-z0-9:_-]+$/)
}).strict();

function publicNoticeState(row: UserNoticeRow | undefined) {
  return {
    dismissed: Boolean(row?.dismissed_at),
    dismissedAt: row?.dismissed_at ? new Date(row.dismissed_at).toISOString() : null
  };
}

export async function registerUserNoticeRoutes(app: FastifyInstance) {
  app.get("/api/users/me/notices/:noticeKey", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { noticeKey } = noticeParamsSchema.parse(request.params);
    const result = await app.db.query<UserNoticeRow>(
      `select dismissed_at
       from user_notice_dismissals
       where user_id = $1 and notice_key = $2
       limit 1`,
      [userId, noticeKey]
    );

    return reply.send({
      data: publicNoticeState(result.rows[0])
    });
  });

  app.put("/api/users/me/notices/:noticeKey", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { noticeKey } = noticeParamsSchema.parse(request.params);
    const result = await app.db.query<UserNoticeRow>(
      `insert into user_notice_dismissals (user_id, notice_key)
       values ($1, $2)
       on conflict (user_id, notice_key)
       do update set dismissed_at = now()
       returning dismissed_at`,
      [userId, noticeKey]
    );

    return reply.send({
      data: publicNoticeState(result.rows[0])
    });
  });
}
