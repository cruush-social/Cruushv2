import type { FastifyInstance } from "fastify";
import { handleVerotelPostback } from "../verotel-webhook.js";
import { getChargebackRatio, getUnverifiedPostbackCount } from "../payment-monitoring.js";
import { assertInternalAccess } from "./internal.js";

/**
 * Verotel FlexPay postback endpoint.
 *
 * Unauthenticated by design: Verotel calls it server to server, and the FlexPay
 * signature is the authentication. It is never called by a browser, so there is
 * no session to check and nothing here may trust anything but the signature.
 *
 * Status codes are chosen for Verotel's retry behaviour. A 200 stops retries; a
 * 403 tells us in their logs that signing is misconfigured; a 500 asks them to
 * try again later.
 */
export async function registerVerotelRoutes(app: FastifyInstance) {
  app.get("/api/billing/verotel/postback", async (request, reply) => {
    const signatureKey = app.config.VEROTEL_SIGNATURE_KEY;

    if (!signatureKey) {
      request.log.error("Verotel postback received while VEROTEL_SIGNATURE_KEY is unset.");
      return reply.code(503).send({ error: "PROCESSOR_NOT_CONFIGURED" });
    }

    const result = await handleVerotelPostback(app, {
      query: request.query,
      signatureKey,
      clientIp: request.ip
    });

    if (result.outcome === "rejected") {
      request.log.warn(
        { saleId: result.saleId, eventType: result.eventType },
        "Rejected a Verotel postback with an invalid signature."
      );
      return reply.code(403).send({ error: "INVALID_SIGNATURE" });
    }

    if (result.outcome === "unknown_session") {
      request.log.warn(
        { saleId: result.saleId, eventType: result.eventType },
        "Verotel postback referenced a checkout session cruush does not have. Withholding OK so Verotel refunds rather than leaving a buyer charged with no access."
      );
      // Deliberately not "OK". Verotel auto-refunds a postback we do not
      // acknowledge, which is the right outcome when we cannot grant access for
      // a payment. Julien may prefer to acknowledge and reconcile by hand
      // instead; that is a policy call, not a technical one.
      return reply.code(200).type("text/plain").send("UNKNOWN_SESSION");
    }

    request.log.info(
      { saleId: result.saleId, eventType: result.eventType, outcome: result.outcome },
      "Processed a Verotel postback."
    );

    // Verotel requires the literal body "OK" within 30 seconds. Anything else,
    // including a JSON envelope, triggers an automatic refund of the sale.
    return reply.code(200).type("text/plain").send("OK");
  });

  /**
   * The transaction monitoring Visa requires of MCC 7273 merchants under the
   * Integrity Risk Program, read back on demand.
   *
   * Internal only. Guarded by the same shared secret as the other internal
   * routes, because it exposes dispute performance.
   */
  app.get("/api/internal/payments/monitoring", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);

    const [chargebacks, unverifiedPostbacks] = await Promise.all([
      getChargebackRatio(app),
      getUnverifiedPostbackCount(app)
    ]);

    return reply.send({
      data: {
        chargebacks,
        // A rising count here means someone is posting unsigned callbacks at
        // the webhook. None of them granted anything, but it is worth seeing.
        unverifiedPostbacks
      }
    });
  });
}
