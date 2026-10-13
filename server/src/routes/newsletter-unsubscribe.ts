import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "../errors.js";
import {
  NEWSLETTER_UNSUBSCRIBE_PATH,
  newsletterUnsubscribeRateLimitKey,
  readNewsletterUnsubscribeToken,
  unsubscribeNewsletterContact
} from "../newsletter-unsubscribe.js";

function document(heading: string, form = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title></head><body><main><h1>${heading}</h1>${form}</main></body></html>`;
}

function sendDocument(reply: FastifyReply, status: number, heading: string, form = "") {
  return reply.code(status).type("text/html; charset=utf-8").send(document(heading, form));
}

function queryToken(request: FastifyRequest): unknown {
  const query = request.query as Record<string, unknown>;
  return query?.token;
}

async function formFields(request: FastifyRequest): Promise<Map<string, string> | null> {
  const fields = new Map<string, string>();
  const add = (name: string, value: unknown) => {
    if (!["token", "List-Unsubscribe"].includes(name) || fields.has(name) || typeof value !== "string") return false;
    fields.set(name, value);
    return true;
  };
  try {
    if (request.isMultipart()) {
      for await (const field of request.parts({ limits: { fields: 2, files: 0, parts: 2, fieldSize: 256 } })) {
        if (field.type !== "field" || field.valueTruncated || !add(field.fieldname, field.value)) return null;
      }
    } else {
      const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
      if (contentType !== "application/x-www-form-urlencoded" || typeof request.body !== "string") return null;
      for (const [name, value] of new URLSearchParams(request.body)) {
        if (!add(name, value)) return null;
      }
    }
    return fields.get("List-Unsubscribe") === "One-Click" ? fields : null;
  } catch {
    return null;
  }
}

export function registerNewsletterUnsubscribeRoutes(app: FastifyInstance) {
  void app.register(async (scope) => {
    // Form parsing is local to these routes, not the application's JSON APIs.
    scope.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 2_048 }, (_request, body, done) => {
      done(null, body);
    });
    scope.addHook("onRequest", async (_request, reply) => {
      reply.header("cache-control", "no-store");
      reply.header("x-robots-tag", "noindex, nofollow, noarchive");
      reply.header("content-security-policy", "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    });

    scope.get(NEWSLETTER_UNSUBSCRIBE_PATH, async (request, reply) => {
      const token = queryToken(request);
      if (!readNewsletterUnsubscribeToken(app.config, token)) {
        return sendDocument(reply, 400, "Unsubscribe link unavailable");
      }
      // Validation permits only UUID/base64url characters. GET/HEAD requests and
      // mail-scanner fetches never update the contact's preferences.
      return sendDocument(reply, 200, "Unsubscribe from cruush newsletters", `<form method="post" action="${NEWSLETTER_UNSUBSCRIBE_PATH}"><input type="hidden" name="token" value="${token}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">Unsubscribe</button></form>`);
    });

    scope.post(NEWSLETTER_UNSUBSCRIBE_PATH, { bodyLimit: 2_048 }, async (request, reply) => {
      const fields = await formFields(request);
      const suppliedQueryToken = queryToken(request);
      const suppliedFormToken = fields?.get("token");
      const token = suppliedQueryToken ?? suppliedFormToken;
      if (!fields || (suppliedQueryToken != null && suppliedFormToken != null && suppliedQueryToken !== suppliedFormToken)) {
        return sendDocument(reply, 400, "Unsubscribe link unavailable");
      }
      const contactId = readNewsletterUnsubscribeToken(app.config, token);
      if (!contactId || typeof token !== "string") return sendDocument(reply, 400, "Unsubscribe link unavailable");
      try {
        await app.rateLimiter.assert({
          key: newsletterUnsubscribeRateLimitKey(token),
          max: 10,
          windowMs: 60_000,
          message: "Please retry the unsubscribe request later."
        });
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 429) {
          reply.header("retry-after", "60");
          return sendDocument(reply, 429, "Please retry the unsubscribe request later");
        }
        return sendDocument(reply, 503, "Unsubscribe temporarily unavailable");
      }
      const updated = await unsubscribeNewsletterContact({ config: app.config, contactId, logger: request.log });
      if (!updated) {
        reply.header("retry-after", "60");
        return sendDocument(reply, 503, "Unsubscribe temporarily unavailable");
      }
      // RFC8058 requests need an immediate successful empty response, without a
      // redirect or further confirmation. A browser form receives a receipt.
      if (suppliedFormToken == null) return reply.code(200).type("text/plain; charset=utf-8").send("");
      return sendDocument(reply, 200, "You are unsubscribed from cruush newsletters");
    });
  });
}
