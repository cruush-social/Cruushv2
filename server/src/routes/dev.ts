import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { getCruushEntitlement, setCruushEntitlement } from "../match-relationships.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";

const debugCruushPlusPayloadSchema = z.object({
  enabled: z.boolean()
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
}
