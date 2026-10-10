import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  TEST_CHECKOUT_WARNING,
  completeFakeCheckoutSession,
  createFakeCheckoutSession,
  getPublicCruushPlusPlans,
  getUserBillingStatus,
  loadCheckoutSession
} from "../billing.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { PING_PACKS } from "../ping-packs.js";
import { getActiveCruushPlusSale } from "../cruush-plus-sale.js";

const checkoutSessionPayloadSchema = z.object({
  planId: z.string().min(1),
  couponCode: z.string().trim().min(1).max(120).optional()
}).strict();

const checkoutSessionParamsSchema = z.object({
  sessionId: z.uuid()
}).strict();

export async function registerBillingRoutes(app: FastifyInstance) {
  app.get("/api/billing/ping-packs", async (request, reply) => {
    await getAuthenticatedUserId(request);

    return reply.send({
      data: {
        currency: "USD",
        packs: PING_PACKS
      }
    });
  });

  app.get("/api/billing/plans", async (request, reply) => {
    await getAuthenticatedUserId(request);

    return reply.send({
      data: {
        processor: "fake",
        testCheckout: true,
        testWarning: TEST_CHECKOUT_WARNING,
        currency: "USD",
        sale: getActiveCruushPlusSale(),
        plans: await getPublicCruushPlusPlans(app)
      }
    });
  });

  app.get("/api/billing/me", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    return reply.send({
      data: await getUserBillingStatus(app, userId)
    });
  });

  app.post("/api/billing/checkout-sessions", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = checkoutSessionPayloadSchema.parse(request.body);

    return reply.code(201).send({
      data: await createFakeCheckoutSession(app, userId, payload.planId, payload.couponCode)
    });
  });

  app.get("/api/billing/checkout-sessions/:sessionId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { sessionId } = checkoutSessionParamsSchema.parse(request.params);

    return reply.send({
      data: await loadCheckoutSession(app, userId, sessionId)
    });
  });

  app.post("/api/billing/checkout-sessions/:sessionId/complete-test", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { sessionId } = checkoutSessionParamsSchema.parse(request.params);

    return reply.send({
      data: await completeFakeCheckoutSession(app, userId, sessionId)
    });
  });
}
