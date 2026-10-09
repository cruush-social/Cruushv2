import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authEmailSchema } from "../auth-schema.js";
import { checkBetaAccess } from "../beta-access.js";
import { saveBetaCityRequest } from "../beta-city-requests.js";
import { singleLineTextSchema } from "../input-schema.js";

const betaAccessLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().max(100_000).optional()
}).strict();

const betaCityRequestPayloadSchema = z.object({
  email: authEmailSchema,
  requestedCity: singleLineTextSchema({ min: 2, max: 120 })
}).strict();

export async function registerBetaAccessRoutes(app: FastifyInstance) {
  app.post("/api/beta/access/check", async (request) => {
    const payload = betaAccessLocationSchema.parse(request.body);
    const result = checkBetaAccess(app.config, payload);

    return {
      data: {
        enabled: result.enabled,
        allowed: result.allowed
      }
    };
  });

  app.post("/api/beta/city-requests", async (request, reply) => {
    const payload = betaCityRequestPayloadSchema.parse(request.body);
    const saved = await saveBetaCityRequest(app, payload);

    return reply.code(202).send({
      data: {
        accepted: true,
        requestId: saved?.id ?? null
      }
    });
  });
}
