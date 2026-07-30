import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db.js";
import { ApiError } from "../errors.js";
import { sendUserReportInboxEmail } from "../mailer.js";
import { createUserReport } from "../moderation-service.js";
import { createReportPayloadSchema, type CreateReportPayload, type ReportReason } from "../report-schema.js";
import { getAuthenticatedUserId } from "../request-auth.js";
import { assertProfileVisibleToViewer } from "./profiles.js";

type ReportTarget = {
  targetUserId: string | null;
  conversationId: string | null;
  messageId: string | null;
  postId: string | null;
  mediaObjectId: string | null;
  profilePhotoUrl: string | null;
};

type ReportRow = {
  id: string;
  status: string;
  created_at: string | Date;
};

const reportReasonCategory: Record<ReportReason, string> = {
  non_consensual_imagery: "revenge_porn",
  minor_safety: "underage_sexual",
  impersonation: "scam",
  coercion_trafficking: "commercial_sex",
  illegal_activity: "drug_sales",
  spam_scam: "spam",
  harassment: "harassment",
  fetishization: "chaser_fetishization",
  hate: "hate_speech",
  violence_threat: "threat",
  privacy_location: "location_privacy",
  other: "other"
};

async function validateUserReport(app: FastifyInstance, reporterUserId: string, payload: CreateReportPayload): Promise<ReportTarget> {
  const targetUserId = payload.targetUserId ?? payload.targetId ?? null;

  if (!targetUserId || targetUserId === reporterUserId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Choose another user to report.");
  }

  const result = await app.db.query<{ id: string }>(
    `select id::text as id
     from app_users
     where id = $1
       and coalesce(account_status, 'active') <> 'deleted'
     limit 1`,
    [targetUserId]
  );

  if (!result.rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "User not found.");
  }

  return {
    targetUserId,
    conversationId: null,
    messageId: null,
    postId: null,
    mediaObjectId: null,
    profilePhotoUrl: null
  };
}

async function validateProfileReport(app: FastifyInstance, reporterUserId: string, payload: CreateReportPayload): Promise<ReportTarget> {
  const targetUserId = payload.targetUserId ?? payload.targetId ?? null;

  if (!targetUserId || targetUserId === reporterUserId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Choose another profile to report.");
  }

  await assertProfileVisibleToViewer(app, reporterUserId, targetUserId);

  return {
    targetUserId,
    conversationId: null,
    messageId: null,
    postId: null,
    mediaObjectId: null,
    profilePhotoUrl: null
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
    messageId: null,
    postId: null,
    mediaObjectId: null,
    profilePhotoUrl: null
  };
}

async function validateMessageReport(app: FastifyInstance, reporterUserId: string, payload: CreateReportPayload): Promise<ReportTarget> {
  const messageId = payload.messageId ?? payload.targetId ?? null;

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

  if (!row.target_user_id) {
    throw new ApiError(400, "VALIDATION_ERROR", "Choose another message to report.");
  }

  return {
    targetUserId: row.target_user_id,
    conversationId: payload.conversationId ?? row.conversation_id,
    messageId: row.message_id,
    postId: null,
    mediaObjectId: null,
    profilePhotoUrl: null
  };
}

async function validatePostReport(app: FastifyInstance, reporterUserId: string, payload: CreateReportPayload): Promise<ReportTarget> {
  const postId = payload.postId ?? payload.targetId ?? null;

  if (!postId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Post reports require postId.");
  }

  const result = await app.db.query<{ post_id: string; target_user_id: string }>(
    `select
       posts.id::text as post_id,
       posts.user_id::text as target_user_id
     from posts
     join app_users users on users.id = posts.user_id
     where posts.id::text = $1
       and coalesce(users.account_status, 'active') <> 'deleted'
     limit 1`,
    [postId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "Post not found.");
  }

  if (row.target_user_id === reporterUserId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Choose another post to report.");
  }

  return {
    targetUserId: row.target_user_id,
    conversationId: null,
    messageId: null,
    postId: row.post_id,
    mediaObjectId: null,
    profilePhotoUrl: null
  };
}

async function validateProfilePhotoReport(app: FastifyInstance, reporterUserId: string, payload: CreateReportPayload): Promise<ReportTarget> {
  const targetUserId = payload.targetUserId ?? null;
  const requestedPhotoUrl = payload.profilePhotoUrl ?? payload.targetId ?? null;

  if (!targetUserId || targetUserId === reporterUserId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Choose another profile photo to report.");
  }

  await assertProfileVisibleToViewer(app, reporterUserId, targetUserId);
  const result = await app.db.query<{ media_object_id: string | null; profile_photo_url: string }>(
    `select
       media.id::text as media_object_id,
       photo.photo_url as profile_photo_url
     from profiles profile
     cross join lateral unnest(coalesce(profile.photos, '{}'::text[])) as photo(photo_url)
     left join media_objects media
       on media.owner_user_id = profile.id
      and media.public_url = photo.photo_url
      and media.deleted_at is null
     where profile.id = $1
       and (
         ($2::uuid is not null and media.id = $2)
         or ($3::text is not null and photo.photo_url = $3)
       )
     limit 1`,
    [targetUserId, payload.mediaObjectId ?? null, requestedPhotoUrl]
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "Profile photo not found.");
  }

  return {
    targetUserId,
    conversationId: null,
    messageId: null,
    postId: null,
    mediaObjectId: row.media_object_id,
    profilePhotoUrl: row.profile_photo_url
  };
}

async function validateReportTarget(app: FastifyInstance, reporterUserId: string, payload: CreateReportPayload) {
  if (payload.targetType === "user") {
    return validateUserReport(app, reporterUserId, payload);
  }

  if (payload.targetType === "profile") {
    return validateProfileReport(app, reporterUserId, payload);
  }

  if (payload.targetType === "conversation") {
    return validateConversationReport(app, reporterUserId, payload);
  }

  if (payload.targetType === "post") {
    return validatePostReport(app, reporterUserId, payload);
  }

  if (payload.targetType === "profile_photo") {
    return validateProfilePhotoReport(app, reporterUserId, payload);
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
    const createReport = async (db: DbClient) => {
      const result = await db.query<ReportRow>(
      `insert into reports (
         reporter_user_id,
         target_type,
         target_user_id,
         conversation_id,
         message_id,
         post_id,
         media_object_id,
         profile_photo_url,
         reason,
         details,
         report_weight
       )
       values (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         coalesce((select report_weight from user_trust_profiles where user_id = $1), 50)
       )
       returning id::text as id, status, created_at`,
      [
        reporterUserId,
        payload.targetType,
        target.targetUserId,
        target.conversationId,
        target.messageId,
        target.postId,
        target.mediaObjectId,
        target.profilePhotoUrl,
        payload.reason,
        payload.details
      ]
      );
      const row = result.rows[0];

      if (!row) {
        throw new ApiError(500, "INTERNAL_ERROR", "Failed to create report.");
      }

      const contentReviewId = await createUserReport(app, {
        reporterId: reporterUserId,
        targetUserId: target.targetUserId,
        contentType: payload.targetType,
        contentId: row.id,
        reason: payload.reason,
        details: payload.details,
        conversationId: target.conversationId,
        messageId: target.messageId,
        postId: target.postId,
        mediaObjectId: target.mediaObjectId,
        profilePhotoUrl: target.profilePhotoUrl
      }, db);

      await db.query(
        `update reports
         set content_review_id = $2,
             updated_at = now()
         where id = $1`,
        [row.id, contentReviewId]
      );

      if (target.targetUserId) {
        await db.query(
        `with reporter_weight as (
           select
             case
               when coalesce(trust.trust_score, 50) < 20 then 0
               when reporter.created_at > now() - interval '7 days'
                 then greatest(5, least(100, coalesce(trust.report_weight, 50))) * 0.25
               else greatest(5, least(100, coalesce(trust.report_weight, 50)))
             end as evidence_value
           from app_users reporter
           left join user_trust_profiles trust on trust.user_id = reporter.id
           where reporter.id = $2
         ),
         created_evidence as (
           insert into evidence_events (
             target_user_id,
             source_type,
             category,
             evidence_value,
             confidence,
             expires_at,
             metadata
           )
           select
             $1,
             'report',
             $3,
             coalesce((select evidence_value from reporter_weight), 50),
             null,
             now() + interval '90 days',
             jsonb_build_object(
               'reportId', $4::text,
               'reporterId', $2::text,
               'reason', $5::text,
               'targetType', $6::text
             )
           returning id
         )
         update reports
         set evidence_event_id = created_evidence.id,
             updated_at = now()
         from created_evidence
         where reports.id::text = $4`,
        [
          target.targetUserId,
          reporterUserId,
          reportReasonCategory[payload.reason],
          row.id,
          payload.reason,
          payload.targetType
        ]
        );
      }

      return row;
    };

    const row = app.db.transaction
      ? await app.db.transaction(createReport)
      : await createReport(app.db);
    const createdAt = new Date(row.created_at).toISOString();

    if (app.config.RESEND_API_KEY && app.config.MAIL_FROM) {
      await sendUserReportInboxEmail({
        config: app.config,
        logger: app.log,
        report: {
          id: row.id,
          createdAt,
          reporterUserId,
          targetType: payload.targetType,
          targetUserId: target.targetUserId,
          conversationId: target.conversationId,
          messageId: target.messageId,
          postId: target.postId,
          mediaObjectId: target.mediaObjectId,
          profilePhotoUrl: target.profilePhotoUrl,
          reason: payload.reason,
          details: payload.details
        }
      }).catch((error) => {
        app.log.error({ err: error, reportId: row.id }, "reports inbox email delivery failed");
      });
    }

    return reply.code(201).send({
      data: {
        id: row.id,
        status: row.status,
        createdAt
      }
    });
  });
}
