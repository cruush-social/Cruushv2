import type { FastifyInstance } from "fastify";
import { getAuthenticatedUserId } from "../request-auth.js";

/** An opaque invalidation token, never a list of moderated members. */
export async function registerContentVisibilityRoutes(app: FastifyInstance) {
  app.get("/api/content/visibility-revision", async (request, reply) => {
    await getAuthenticatedUserId(request);
    const result = await app.db.query<{ revision: string }>(`
      select md5(coalesce(max(account_status_updated_at)::text, '') || ':' || count(*)::text) as revision
      from app_users where account_status = 'banned'
    `);
    reply.header("Cache-Control", "private, no-store");
    return reply.send({ data: { revision: result.rows[0].revision } });
  });
}
