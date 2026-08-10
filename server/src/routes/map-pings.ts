import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createMapPing, getMapPingStatus } from "../map-pings.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";

const mapPingPayloadSchema = z.object({
  radiusMiles: z.union([
    z.literal(1),
    z.literal(3),
    z.literal(5),
    z.literal(10),
    z.literal(15)
  ]),
  idempotencyKey: z.uuid()
}).strict();

export function registerMapPingRoutes(app: FastifyInstance) {
  app.get("/api/map-pings/status", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    return reply.send({
      data: await getMapPingStatus(app, userId)
    });
  });

  app.post("/api/map-pings", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);

    await app.rateLimiter.assert({
      key: `map-pings:create:${userId}`,
      max: 5,
      windowMs: 60_000,
      message: "Too many Ping attempts. Try again shortly."
    });

    const payload = mapPingPayloadSchema.parse(request.body);
    const status = await createMapPing(app, {
      userId,
      radiusMiles: payload.radiusMiles,
      idempotencyKey: payload.idempotencyKey
    });

    return reply.code(201).send({
      data: status
    });
  });
}
