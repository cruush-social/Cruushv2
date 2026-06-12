import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import { createReportPayloadSchema, type CreateReportPayload } from "../report-schema.js";
import { getAuthenticatedUserId } from "../request-auth.js";

type ReportTarget = {
  targetUserId: string | null;
  conversationId: string | null;
  messageId: string | null;
};

type ReportRow = {
  id: string;
  status: string;
  created_at: string | Date;
};

async function validateProfileReport(app: FastifyInstance, reporterUserId: string, payload: CreateReportPayload): Promise<ReportTarget> {
  const targetUserId = payload.targetUserId ?? null;

  if (!targetUserId || targetUserId === reporterUserId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Choose another profile to report.");
  }

  const result = await app.db.query<{ id: string }>(
    `select id::text as id
     from profiles
     where id = $1
     limit 1`,
    [targetUserId]
  );

  if (!result.rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found.");
  }

  return {
    targetUserId,
    conversationId: null,
    messageId: null
  };
}

async function validateConversationReport(app: FastifyInstance, reporterUserId: string, payload: CreateReportPayload): Promise<ReportTarget> {
  const conversationId = payload.conversationId ?? null;

  if (!conversationId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Conversation reports require conversationId.");
  }

  const result = await app.db.query<{ conversation_id: string; target_user_id: string | null }>(
    `select
       cm.conversation_id::text as conversation_id,
       other_member.user_id::text as target_user_id
     from conversation_members cm
     left join conversations c on c.id = cm.conversation_id
     left join conversation_members other_member
       on other_member.conversation_id = cm.conversation_id
      and other_member.user_id <> cm.user_id
      and c.kind = 'dm'
     where cm.user_id = $1
       and cm.conversation_id::text = $2
     limit 1`,
    [reporterUserId, conversationId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
  }

  return {
    targetUserId: payload.targetUserId ?? row.target_user_id ?? null,
    conversationId: row.conversation_id,
    messageId: null
  };
}

async function validateMessageReport(app: FastifyInstance, reporterUserId: string, payload: CreateReportPayload): Promise<ReportTarget> {
  const messageId = payload.messageId ?? null;

  if (!messageId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Message reports require messageId.");
  }

  const result = await app.db.query<{ message_id: string; conversation_id: string; target_user_id: string | null }>(
    `select
       m.id::text as message_id,
       m.conversation_id::text as conversation_id,
       case when m.user_id <> $1 then m.user_id::text else null end as target_user_id
     from messages m
     join conversation_members cm
       on cm.conversation_id = m.conversation_id
      and cm.user_id = $1
     where m.id::text = $2
     limit 1`,
    [reporterUserId, messageId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "Message not found.");
  }

  return {
    targetUserId: payload.targetUserId ?? row.target_user_id ?? null,
    conversationId: payload.conversationId ?? row.conversation_id,
    messageId: row.message_id
  };
}

async function validateReportTarget(app: FastifyInstance, reporterUserId: string, payload: CreateReportPayload) {
  if (payload.targetType === "profile") {
    return validateProfileReport(app, reporterUserId, payload);
  }

  if (payload.targetType === "conversation") {
    return validateConversationReport(app, reporterUserId, payload);
  }

  return validateMessageReport(app, reporterUserId, payload);
}

export async function registerReportRoutes(app: FastifyInstance) {
  app.post("/api/reports", async (request, reply) => {
    const reporterUserId = await getAuthenticatedUserId(request);
    const payload = createReportPayloadSchema.parse(request.body);

    await app.rateLimiter.assert({
      key: `report-create:${reporterUserId}`,
      max: 5,
      windowMs: 60 * 1000,
      message: "Too many reports. Try again later."
    });

    const target = await validateReportTarget(app, reporterUserId, payload);
    const result = await app.db.query<ReportRow>(
      `insert into reports (
         reporter_user_id,
         target_type,
         target_user_id,
         conversation_id,
         message_id,
         reason,
         details
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id::text as id, status, created_at`,
      [
        reporterUserId,
        payload.targetType,
        target.targetUserId,
        target.conversationId,
        target.messageId,
        payload.reason,
        payload.details
      ]
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(500, "INTERNAL_ERROR", "Failed to create report.");
    }

    return reply.code(201).send({
      data: {
        id: row.id,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString()
      }
    });
  });
}
