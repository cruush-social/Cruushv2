import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runTransaction } from "../db.js";
import { ApiError } from "../errors.js";
import { sendSupportRequestInboxEmail, sendSupportRequestReplyEmail } from "../mailer.js";
import { getModeratorUser } from "../moderator-auth.js";
import { getOptionalAuthenticatedUserId } from "../request-auth.js";
import {
  createSupportRequestPayloadSchema,
  replySupportRequestPayloadSchema
} from "../support-schema.js";

type SupportRequestRow = {
  id: string;
  status: string;
  ai_triage_status: string;
  created_at: string | Date;
};

type SupportRequestListRow = {
  id: string;
  requester_user_id: string | null;
  contact_email: string | null;
  category: string;
  subject: string;
  message: string;
  source: string;
  page_url: string;
  ai_triage_status: string;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
  recipient_email: string | null;
  reply_count: number | string;
  last_reply_at: string | Date | null;
};

type SupportRequestReplyTargetRow = {
  id: string;
  category: string;
  subject: string;
  message: string;
  page_url: string;
  source: string;
  created_at: string | Date;
  recipient_email: string | null;
  requester_user_id: string | null;
};

type SupportRequestReplyRow = {
  id: string;
  created_at: string | Date;
};

const supportRequestListQuerySchema = z.object({
  status: z.enum(["open", "in_progress", "closed", "dismissed", "all"]).optional().default("open"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  offset: z.coerce.number().int().min(0).optional().default(0)
}).strict();

const supportRequestReplyParamsSchema = z.object({
  requestId: z.uuid()
}).strict();

function getUserAgent(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join(" ");
  }

  return value ?? "";
}

export async function registerSupportRoutes(app: FastifyInstance) {
  app.get("/api/admin/support-requests", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    await app.rateLimiter.assert({
      key: `support-list:${moderator.userId}`,
      max: 60,
      windowMs: 60 * 1000,
      message: "Too many support request reads. Try again later."
    });
    const { limit, offset, status } = supportRequestListQuerySchema.parse(request.query);
    const hasStatusFilter = status !== "all";
    const statusParams = hasStatusFilter ? [status] : [];

    const listQuery = await app.db.query<SupportRequestListRow>(
      `
       select
         sr.id::text as id,
         sr.requester_user_id::text as requester_user_id,
         sr.contact_email,
         sr.category,
         sr.subject,
         sr.message,
         sr.source,
         sr.page_url,
         sr.ai_triage_status,
         sr.status,
         sr.created_at,
         sr.updated_at,
         coalesce(nullif(sr.contact_email, ''), requester.email) as recipient_email,
         coalesce(reply_stats.reply_count, 0)::int as reply_count,
         reply_stats.last_reply_at
       from support_requests sr
       left join app_users requester on requester.id = sr.requester_user_id
       left join lateral (
         select count(*)::int as reply_count, max(created_at) as last_reply_at
         from support_request_replies replies
         where replies.support_request_id = sr.id
       ) reply_stats on true
       ${hasStatusFilter ? "where sr.status = $1" : ""}
       order by sr.created_at desc
       limit ${hasStatusFilter ? "$2" : "$1"}
       offset ${hasStatusFilter ? "$3" : "$2"}
      `,
      hasStatusFilter ? [...statusParams, limit, offset] : [limit, offset]
    );
    const countQuery = await app.db.query<{ total: string | number }>(
      `
       select count(*)::int as total
       from support_requests sr
       ${hasStatusFilter ? "where sr.status = $1" : ""}
      `,
      hasStatusFilter ? statusParams : []
    );

    const total = Number(countQuery.rows[0]?.total ?? 0);

    return reply.send({
      data: {
        requests: listQuery.rows.map((row) => ({
          id: row.id,
          requesterUserId: row.requester_user_id,
          contactEmail: row.contact_email,
          category: row.category,
          subject: row.subject,
          message: row.message,
          source: row.source,
          pageUrl: row.page_url,
          aiTriageStatus: row.ai_triage_status,
          status: row.status,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
          recipientEmail: row.recipient_email,
          replyCount: Number(row.reply_count ?? 0),
          lastReplyAt: row.last_reply_at ? new Date(row.last_reply_at).toISOString() : null
        })),
        page: {
          limit,
          offset,
          total,
          hasMore: offset + listQuery.rows.length < total
        }
      }
    });
  });

  app.post("/api/admin/support-requests/:requestId/replies", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { requestId } = supportRequestReplyParamsSchema.parse(request.params);
    const payload = replySupportRequestPayloadSchema.parse(request.body);

    await app.rateLimiter.assert({
      key: `support-reply:${moderator.userId}`,
      max: 20,
      windowMs: 10 * 60 * 1000,
      message: "Too many support replies. Try again later."
    });

    const replyResult = await runTransaction(app.db, async (client) => {
      const requestResult = await client.query<SupportRequestReplyTargetRow>(
        `
         select
           sr.id::text as id,
           sr.category,
           sr.subject,
           sr.message,
           sr.page_url,
           sr.source,
           sr.created_at,
           coalesce(nullif(sr.contact_email, ''), requester.email) as recipient_email,
           sr.requester_user_id::text as requester_user_id
         from support_requests sr
         left join app_users requester on requester.id = sr.requester_user_id
         where sr.id = $1
         limit 1
        `,
        [requestId]
      );
      const supportRequest = requestResult.rows[0];

      if (!supportRequest) {
        throw new ApiError(404, "NOT_FOUND", "Support request not found.");
      }

      if (!supportRequest.recipient_email) {
        throw new ApiError(400, "VALIDATION_ERROR", "This bug report has no reply address on file.");
      }

      const insertResult = await client.query<SupportRequestReplyRow>(
        `
         insert into support_request_replies (
           support_request_id,
           sender_user_id,
           recipient_email,
           subject,
           message
         )
         values ($1, $2, $3, $4, $5)
         returning id::text as id, created_at
        `,
        [
          supportRequest.id,
          moderator.userId,
          supportRequest.recipient_email,
          supportRequest.subject,
          payload.message
        ]
      );
      const insertedReply = insertResult.rows[0];

      if (!insertedReply) {
        throw new ApiError(500, "INTERNAL_ERROR", "Failed to save support reply.");
      }

      await client.query(
        `
         update support_requests
         set status = case when status = 'open' then 'in_progress' else status end,
             updated_at = now()
         where id = $1
        `,
        [supportRequest.id]
      );

      return {
        reply: insertedReply,
        request: supportRequest
      };
    });

    let deliveryStatus: "sent" | "failed" = "sent";

    try {
      await sendSupportRequestReplyEmail({
        config: app.config,
        logger: app.log,
          replyToEmail: replyResult.request.recipient_email,
          request: {
            id: replyResult.request.id,
            category: replyResult.request.category,
            contactEmail: replyResult.request.recipient_email,
            createdAt: new Date(replyResult.request.created_at).toISOString(),
            message: replyResult.request.message,
            pageUrl: replyResult.request.page_url,
            requesterUserId: replyResult.request.requester_user_id,
            source: replyResult.request.source,
            subject: replyResult.request.subject
          },
          replyMessage: payload.message
        });
      await app.db.query(
        `update support_request_replies
         set delivery_status = 'sent'
         where id = $1`,
        [replyResult.reply.id]
      );
    } catch (error) {
      deliveryStatus = "failed";
      await app.db.query(
        `update support_request_replies
         set delivery_status = 'failed'
         where id = $1`,
        [replyResult.reply.id]
      );
      app.log.error({ err: error, supportRequestId: replyResult.request.id, replyId: replyResult.reply.id }, "support reply email delivery failed");
    }

    return reply.send({
      data: {
        reply: {
          id: replyResult.reply.id,
          createdAt: new Date(replyResult.reply.created_at).toISOString(),
          deliveryStatus,
          recipientEmail: replyResult.request.recipient_email
        }
      }
    });
  });

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
      screenshotAttached: Boolean(payload.screenshot),
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
          screenshot: payload.screenshot
            ? {
                filename: payload.screenshot.filename,
                content: payload.screenshot.contentBase64
              }
            : null,
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
