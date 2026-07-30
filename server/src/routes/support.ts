import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import { sendSupportRequestInboxEmail } from "../mailer.js";
import { getOptionalAuthenticatedUserId } from "../request-auth.js";
import { createSupportRequestPayloadSchema } from "../support-schema.js";

type SupportRequestRow = {
  id: string;
  status: string;
  ai_triage_status: string;
  created_at: string | Date;
};

function getUserAgent(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join(" ");
  }

  return value ?? "";
}

export async function registerSupportRoutes(app: FastifyInstance) {
  app.post("/api/support-requests", async (request, reply) => {
    const requesterUserId = await getOptionalAuthenticatedUserId(request);
    const payload = createSupportRequestPayloadSchema.parse(request.body);

    if (!requesterUserId && !payload.contactEmail) {
      throw new ApiError(400, "VALIDATION_ERROR", "Enter an email so support can reply.");
    }

    await app.rateLimiter.assert({
      key: requesterUserId ? `support-create:user:${requesterUserId}` : `support-create:ip:${request.ip}`,
      max: requesterUserId ? 5 : 3,
      windowMs: 10 * 60 * 1000,
      message: "Too many support requests. Try again later."
    });

    const metadata = {
      userAgent: getUserAgent(request.headers["user-agent"]),
      aiSupport: {
        status: "pending",
        provider: null
      }
    };

    const result = await app.db.query<SupportRequestRow>(
      `insert into support_requests (
         requester_user_id,
         contact_email,
         category,
         subject,
         message,
         source,
         page_url,
         metadata
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       returning id::text as id, status, ai_triage_status, created_at`,
      [
        requesterUserId,
        payload.contactEmail ?? null,
        payload.category,
        payload.subject,
        payload.message,
        payload.source,
        payload.pageUrl,
        metadata
      ]
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(500, "INTERNAL_ERROR", "Failed to create support request.");
    }

    if (app.config.RESEND_API_KEY && app.config.MAIL_FROM) {
      await sendSupportRequestInboxEmail({
        config: app.config,
        logger: app.log,
        request: {
          id: row.id,
          category: payload.category,
          contactEmail: payload.contactEmail ?? null,
          createdAt: new Date(row.created_at).toISOString(),
          message: payload.message,
          pageUrl: payload.pageUrl,
          requesterUserId,
          source: payload.source,
          subject: payload.subject
        }
      }).catch((error) => {
        app.log.error({ err: error, supportRequestId: row.id }, "support inbox email delivery failed");
      });
    }

    return reply.code(201).send({
      data: {
        id: row.id,
        status: row.status,
        aiTriageStatus: row.ai_triage_status,
        createdAt: new Date(row.created_at).toISOString()
      }
    });
  });
}
