import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authEmailSchema } from "../auth-schema.js";
import { runTransaction } from "../db.js";
import { ApiError } from "../errors.js";
import { encryptMediaBytes } from "../media-encryption.js";
import { deleteEncryptedMediaObject, writeEncryptedMediaObject } from "../media-storage.js";
import { sendSupportRequestInboxEmail, sendSupportRequestReplyEmail } from "../mailer.js";
import { getModeratorUser } from "../moderator-auth.js";
import { getOptionalAuthenticatedUserId } from "../request-auth.js";

import {
  createSupportRequestPayloadSchema,
  generalSuspensionAppealPayloadSchema,
  replySupportRequestPayloadSchema
} from "../support-schema.js";

// Whole words only. Matched unanchored, "age" hits inside message, page, image,
// usage and manage, which filed effectively every support request as an urgent
// age suspension appeal. A survey response is never an appeal, whatever words
// it happens to contain.
const AGE_APPEAL_TERMS =
  /\b(?:underage|age|dob|birthday|birthdate|suspended|suspension|appeal|appeals|appealing|minor)\b|\b18\s*\+/i;

export function isAgeSuspensionAppeal(input: {
  category: string;
  message: string;
  pageUrl?: string;
  source: string;
  subject: string;
}) {
  if (input.source === "survey" || input.pageUrl?.startsWith("/content-removal")) {
    return false;
  }

  return input.category === "policy"
    || AGE_APPEAL_TERMS.test(`${input.subject} ${input.message}`);
}

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
  appeal_evidence_types: string[] | null;
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
  category: z.enum(["all", "suspension_appeal"]).optional().default("all"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  offset: z.coerce.number().int().min(0).optional().default(0)
}).strict();

const supportRequestReplyParamsSchema = z.object({
  requestId: z.uuid()
}).strict();

const appealEvidenceTypes = ["id", "selfie"] as const;
const MAX_APPEAL_IMAGE_BYTES = 5 * 1024 * 1024;

function getUserAgent(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join(" ");
  }

  return value ?? "";
}

async function resolveSupportContactEmail(
  app: FastifyInstance,
  requesterUserId: string | null,
  suppliedEmail: string | null | undefined
) {
  if (requesterUserId) {
    const account = (await app.db.query<{ email: string }>(
      "select email from app_users where id = $1 limit 1",
      [requesterUserId]
    )).rows[0];
    if (!account) throw new ApiError(401, "AUTH_REQUIRED", "Sign in again before sending this report.");
    return authEmailSchema.parse(account.email);
  }

  if (!suppliedEmail?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "Enter an email so support can reply.");
  }

  return authEmailSchema.parse(suppliedEmail.trim());
}

export async function registerSupportRoutes(app: FastifyInstance) {
  app.post("/api/support-requests/suspension-appeal", async (request, reply) => {
    const requesterUserId = await getOptionalAuthenticatedUserId(request);
    await app.rateLimiter.assert({
      key: requesterUserId ? `suspension-appeal:user:${requesterUserId}` : `suspension-appeal:ip:${request.ip}`,
      max: 2,
      windowMs: 24 * 60 * 60 * 1000,
      message: "Too many suspension appeals. Try again tomorrow."
    });

    let contactEmail = "";
    const uploads = new Map<typeof appealEvidenceTypes[number], {
      buffer: Buffer;
      mimetype: string;
      truncated: boolean;
    }>();

    try {
      for await (const part of request.parts({
        limits: {
          fileSize: MAX_APPEAL_IMAGE_BYTES,
          files: 2,
          fields: 1
        }
      })) {
        if (part.type === "field") {
          if (part.fieldname === "contactEmail") {
            contactEmail = String(part.value ?? "").trim();
          }
          continue;
        }

        if (part.fieldname !== "idDocument" && part.fieldname !== "selfie") {
          throw new ApiError(400, "VALIDATION_ERROR", "Upload only an ID photo and a selfie.");
        }
        if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(part.mimetype)) {
          throw new ApiError(400, "VALIDATION_ERROR", "Use a JPEG, PNG, or WebP image.");
        }
        const evidenceType = part.fieldname === "idDocument" ? "id" : "selfie";
        uploads.set(evidenceType, {
          buffer: await part.toBuffer(),
          mimetype: part.mimetype,
          truncated: part.file.truncated
        });
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "VALIDATION_ERROR", "Each appeal image must be 5 MB or smaller.");
    }

    const normalizedEmail = await resolveSupportContactEmail(app, requesterUserId, contactEmail);
    for (const type of appealEvidenceTypes) {
      const upload = uploads.get(type);
      if (!upload || upload.buffer.length === 0 || upload.truncated) {
        throw new ApiError(400, "VALIDATION_ERROR", "Include both the redacted ID photo and the selfie.");
      }
    }

    const metadata = {
      userAgent: getUserAgent(request.headers["user-agent"]),
      evidenceStoredPrivately: true,
      evidenceExpiresInHours: 24
    };
    const requestResult = await app.db.query<SupportRequestRow>(
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
       values ($1, $2, 'suspension_appeal', 'Suspension appeal', $3, 'auth', '/support?appeal=1', $4::jsonb)
       returning id::text as id, status, ai_triage_status, created_at`,
      [
        requesterUserId,
        normalizedEmail,
        "Please review my suspension appeal. I submitted a redacted ID showing only my date of birth and photo, plus a selfie holding a handwritten card with my account email and today’s date.",
        metadata
      ]
    );
    const created = requestResult.rows[0];
    if (!created) throw new ApiError(500, "INTERNAL_ERROR", "Failed to create suspension appeal.");

    const writtenKeys: string[] = [];
    try {
      for (const type of appealEvidenceTypes) {
        const upload = uploads.get(type);
        if (!upload) throw new ApiError(400, "VALIDATION_ERROR", "Include both appeal images.");
        const encrypted = encryptMediaBytes(app.config, upload.buffer);
        const objectKey = `suspension-appeals/${created.id}/${type}-${randomUUID()}.enc`;
        await writeEncryptedMediaObject(app.config, objectKey, encrypted.ciphertext);
        writtenKeys.push(objectKey);
        await app.db.query(
          `insert into suspension_appeal_evidence (
             support_request_id, evidence_type, object_key, mime_type, byte_size,
             encrypted_data_key, data_key_nonce, data_key_auth_tag,
             content_nonce, content_auth_tag, key_version
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            created.id,
            type,
            objectKey,
            upload.mimetype,
            upload.buffer.length,
            encrypted.encryptedDataKey,
            encrypted.dataKeyNonce,
            encrypted.dataKeyAuthTag,
            encrypted.nonce,
            encrypted.authTag,
            encrypted.keyVersion
          ]
        );
      }
    } catch (error) {
      await Promise.all(writtenKeys.map((key) => deleteEncryptedMediaObject(app.config, key).catch(() => undefined)));
      await app.db.query("delete from support_requests where id = $1", [created.id]);
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "INTERNAL_ERROR", "Failed to store suspension appeal evidence.");
    }

    if (app.config.RESEND_API_KEY && app.config.MAIL_FROM) {
      await sendSupportRequestInboxEmail({
        config: app.config,
        logger: app.log,
        request: {
          id: created.id,
          category: "suspension_appeal",
          contactEmail: normalizedEmail,
          createdAt: new Date(created.created_at).toISOString(),
          message: "A suspension appeal with private ID and selfie evidence is ready for human review.",
          pageUrl: "/support?appeal=1",
          requesterUserId,
          screenshot: null,
          source: "auth",
          subject: "Suspension appeal"
        }
      }).catch((error) => {
        app.log.error({ err: error, supportRequestId: created.id }, "suspension appeal inbox email delivery failed");
      });
    }

    return reply.code(201).send({
      data: {
        id: created.id,
        status: created.status,
        aiTriageStatus: created.ai_triage_status,
        createdAt: new Date(created.created_at).toISOString()
      }
    });
  });

  app.post("/api/support-requests/general-suspension-appeal", async (request, reply) => {
    const requesterUserId = await getOptionalAuthenticatedUserId(request);
    const payload = generalSuspensionAppealPayloadSchema.parse(request.body);
    const contactEmail = await resolveSupportContactEmail(app, requesterUserId, payload.contactEmail);

    await app.rateLimiter.assert({
      key: requesterUserId ? `general-suspension-appeal:user:${requesterUserId}` : `general-suspension-appeal:ip:${request.ip}`,
      max: 2,
      windowMs: 24 * 60 * 60 * 1000,
      message: "Too many suspension appeals. Try again tomorrow."
    });

    const metadata = {
      appealKind: "general",
      userAgent: getUserAgent(request.headers["user-agent"])
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
       values ($1, $2, 'suspension_appeal', 'Suspension appeal', $3, 'auth', '/support?appeal=general', $4::jsonb)
       returning id::text as id, status, ai_triage_status, created_at`,
      [requesterUserId, contactEmail, payload.message, metadata]
    );
    const created = result.rows[0];
    if (!created) throw new ApiError(500, "INTERNAL_ERROR", "Failed to create suspension appeal.");

    if (app.config.RESEND_API_KEY && app.config.MAIL_FROM) {
      await sendSupportRequestInboxEmail({
        config: app.config,
        logger: app.log,
        request: {
          id: created.id,
          category: "suspension_appeal",
          contactEmail,
          createdAt: new Date(created.created_at).toISOString(),
          message: payload.message,
          pageUrl: "/support?appeal=general",
          requesterUserId,
          screenshot: null,
          source: "auth",
          subject: "Suspension appeal"
        }
      }).catch((error) => {
        app.log.error({ err: error, supportRequestId: created.id }, "suspension appeal inbox email delivery failed");
      });
    }

    return reply.code(201).send({
      data: {
        id: created.id,
        status: created.status,
        aiTriageStatus: created.ai_triage_status,
        createdAt: new Date(created.created_at).toISOString()
      }
    });
  });

  app.get("/api/admin/support-requests", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    await app.rateLimiter.assert({
      key: `support-list:${moderator.userId}`,
      max: 60,
      windowMs: 60 * 1000,
      message: "Too many support request reads. Try again later."
    });
    const { category, limit, offset, status } = supportRequestListQuerySchema.parse(request.query);
    const statusFilter = status === "all" ? null : status;
    const categoryFilter = category === "all" ? null : category;

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
         reply_stats.last_reply_at,
         appeal_evidence.evidence_types as appeal_evidence_types
       from support_requests sr
       left join app_users requester on requester.id = sr.requester_user_id
       left join lateral (
         select count(*)::int as reply_count, max(created_at) as last_reply_at
         from support_request_replies replies
         where replies.support_request_id = sr.id
       ) reply_stats on true
       left join lateral (
         select array_agg(distinct evidence.evidence_type order by evidence.evidence_type) as evidence_types
         from suspension_appeal_evidence evidence
         where evidence.support_request_id = sr.id
           and evidence.deleted_at is null
           and evidence.expires_at > now()
       ) appeal_evidence on true
       where ($1::text is null or sr.status = $1)
         and ($2::text is null or sr.category = $2)
       order by sr.created_at desc
       limit $3
       offset $4
      `,
      [statusFilter, categoryFilter, limit, offset]
    );
    const countQuery = await app.db.query<{ total: string | number }>(
      `
       select count(*)::int as total
       from support_requests sr
       where ($1::text is null or sr.status = $1)
         and ($2::text is null or sr.category = $2)
      `,
      [statusFilter, categoryFilter]
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
          lastReplyAt: row.last_reply_at ? new Date(row.last_reply_at).toISOString() : null,
          appealEvidence: (row.appeal_evidence_types ?? [])
            .filter((type): type is "id" | "selfie" => type === "id" || type === "selfie")
            .map((type) => ({
              type,
              previewUrl: `/api/admin/moderation/support-requests/${encodeURIComponent(row.id)}/appeal-evidence/${type}`
            }))
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
    const recipientEmail = replyResult.request.recipient_email;

    if (!recipientEmail) {
      throw new ApiError(400, "VALIDATION_ERROR", "This bug report has no reply address on file.");
    }

    try {
      await sendSupportRequestReplyEmail({
        config: app.config,
        logger: app.log,
        replyToEmail: recipientEmail,
        request: {
          id: replyResult.request.id,
          category: replyResult.request.category,
          contactEmail: recipientEmail,
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
          recipientEmail
        }
      }
    });
  });

  app.post("/api/support-requests", async (request, reply) => {
    const requesterUserId = await getOptionalAuthenticatedUserId(request);
    const payload = createSupportRequestPayloadSchema.parse(request.body);

    if (!requesterUserId && payload.source === "survey") {
      throw new ApiError(401, "AUTH_REQUIRED", "Sign in before sending survey feedback.");
    }

    const resolvedContactEmail = await resolveSupportContactEmail(app, requesterUserId, payload.contactEmail);

    await app.rateLimiter.assert({
      key: requesterUserId ? `support-create:user:${requesterUserId}` : `support-create:ip:${request.ip}`,
      max: requesterUserId ? 5 : 3,
      windowMs: 10 * 60 * 1000,
      message: "Too many support requests. Try again later."
    });

    const isAgeAppeal = isAgeSuspensionAppeal({
      category: payload.category,
      message: payload.message,
      pageUrl: payload.pageUrl,
      source: payload.source,
      subject: payload.subject
    });

    const metadata = {
      userAgent: getUserAgent(request.headers["user-agent"]),
      device: payload.device ?? null,
      screenshotAttached: Boolean(payload.screenshot),
      isAgeSuspensionAppeal: isAgeAppeal,
      aiSupport: {
        status: isAgeAppeal ? "urgent_age_appeal" : "pending",
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
       ${payload.source === "survey" ? "on conflict do nothing" : ""}
       returning id::text as id, status, ai_triage_status, created_at`,
      [
        requesterUserId,
        resolvedContactEmail,
        payload.category,
        payload.subject,
        payload.message,
        payload.source,
        payload.pageUrl,
        metadata
      ]
    );
    let row = result.rows[0];
    const createdNewRequest = Boolean(row);

    if (!row && payload.source === "survey" && requesterUserId) {
      const existingResult = await app.db.query<SupportRequestRow>(
        `select id::text as id, status, ai_triage_status, created_at
         from support_requests
         where requester_user_id = $1
           and requester_account_deleted_at is null
           and source = 'survey'
           and status in ('open', 'in_progress')
         order by created_at desc, id desc
         limit 1`,
        [requesterUserId]
      );
      row = existingResult.rows[0];
    }

    if (!row) {
      throw new ApiError(500, "INTERNAL_ERROR", "Failed to create support request.");
    }

    if (createdNewRequest && app.config.RESEND_API_KEY && app.config.MAIL_FROM) {
      const emailSubject = isAgeAppeal
        ? `[AGE SUSPENSION APPEAL] ${payload.subject}`
        : payload.subject;

      await sendSupportRequestInboxEmail({
        config: app.config,
        logger: app.log,
        request: {
          id: row.id,
          category: payload.category,
          contactEmail: resolvedContactEmail,
          createdAt: new Date(row.created_at).toISOString(),
          message: payload.message,
          pageUrl: payload.pageUrl,
          device: payload.device ?? null,
          requesterUserId,
          screenshot: payload.screenshot
            ? {
                filename: payload.screenshot.filename,
                content: payload.screenshot.contentBase64
              }
            : null,
          source: payload.source,
          subject: emailSubject
        }
      }).catch((error) => {
        app.log.error({ err: error, supportRequestId: row.id }, "support inbox email delivery failed");
      });
    }

    return reply.code(createdNewRequest ? 201 : 200).send({
      data: {
        id: row.id,
        status: row.status,
        aiTriageStatus: row.ai_triage_status,
        createdAt: new Date(row.created_at).toISOString()
      }
    });
  });
}
