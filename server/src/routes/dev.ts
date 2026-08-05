import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { getCruushEntitlement, setCruushEntitlement } from "../match-relationships.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";

const debugCruushPlusPayloadSchema = z.object({
  enabled: z.boolean()
}).strict();

const resetNoticesPayloadSchema = z.object({
  noticeKeys: z.array(z.string().min(3).max(120).regex(/^[a-z0-9:_-]+$/)).min(1).max(20)
}).strict();

function assertDevelopmentRoute(app: FastifyInstance) {
  if (app.config.NODE_ENV === "production") {
    throw new ApiError(404, "NOT_FOUND", "Not found.");
  }
}

// DEBUG ONLY: delete this route file and its app registration when the cruush+ test toggle is no longer needed.
export async function registerDevRoutes(app: FastifyInstance) {
  app.get("/api/dev/cruush-plus", async (request, reply) => {
    assertDevelopmentRoute(app);
    const userId = await getAuthenticatedUserId(request);

    return reply.send({
      data: await getCruushEntitlement(app, userId)
    });
  });

  app.put("/api/dev/cruush-plus", async (request, reply) => {
    assertDevelopmentRoute(app);
    const userId = await getActiveAccountUserId(request);
    const payload = debugCruushPlusPayloadSchema.parse(request.body);

    return reply.send({
      data: await setCruushEntitlement(app, userId, payload.enabled)
    });
  });

  // Lets the onboarding preview replay the one-time explainer dialogs without
  // deleting the account they are attached to.
  app.post("/api/dev/reset-notices", async (request, reply) => {
    assertDevelopmentRoute(app);
    const userId = await getActiveAccountUserId(request);
    const payload = resetNoticesPayloadSchema.parse(request.body);

    await app.db.query(
      `delete from user_notice_dismissals
       where user_id = $1 and notice_key = any($2::text[])`,
      [userId, payload.noticeKeys]
    );

    return reply.send({
      data: {
        reset: payload.noticeKeys
      }
    });
  });
}
