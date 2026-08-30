import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CRUUSH_PLUS_PLANS,
  TEST_CHECKOUT_WARNING,
  completeFakeCheckoutSession,
  createFakeCheckoutSession,
  getPlanAvailability,
  getUserBillingStatus,
  loadCheckoutSession
} from "../billing.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { createVerotelCheckoutSession, isVerotelConfigured } from "../verotel-checkout.js";

const checkoutSessionPayloadSchema = z.object({
  planId: z.string().min(1)
}).strict();

const checkoutSessionParamsSchema = z.object({
  sessionId: z.uuid()
}).strict();

export async function registerBillingRoutes(app: FastifyInstance) {
  app.get("/api/billing/plans", async (request, reply) => {
    await getAuthenticatedUserId(request);
    const availability = await getPlanAvailability(app);
    const live = isVerotelConfigured(app);

    return reply.send({
      data: {
        processor: live ? "verotel" : "fake",
        testCheckout: !live,
        testWarning: live ? null : TEST_CHECKOUT_WARNING,
        currency: "USD",
        plans: CRUUSH_PLUS_PLANS.map((plan) => ({
          ...plan,
          supplyRemaining: availability.get(plan.id) ?? null
        }))
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

    // Live credentials switch cruush off the test processor. Until Verotel is
    // configured this keeps returning the fake session local development uses.
    const data = isVerotelConfigured(app)
      ? await createVerotelCheckoutSession(app, userId, payload.planId)
      : await createFakeCheckoutSession(app, userId, payload.planId);

    return reply.code(201).send({ data });
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
