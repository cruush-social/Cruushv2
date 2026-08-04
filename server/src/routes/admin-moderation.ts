import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { normalizeAccountStatus, type AccountStatus } from "../account-status.js";
import { decryptTextContentOrFallback } from "../content-encryption.js";
import type { DbClient } from "../db.js";
import { ApiError } from "../errors.js";
import { multilineTextSchema, singleLineTextSchema, uuidSchema } from "../input-schema.js";
import { decryptMediaBytes } from "../media-encryption.js";
import { deleteEncryptedMediaObject, readEncryptedMediaObject } from "../media-storage.js";
import { recordModeratorAccess } from "../moderation-access-log.js";
import { getModeratorUser, type ModeratorRole } from "../moderator-auth.js";
import { isOwnerFullAccessEmail } from "../owner-access.js";
import {
  approvePendingProfilePhotoReview,
  getPendingProfilePhotoReviewImage,
  rejectPendingProfilePhotoReview
} from "../profile-photo-manual-reviews.js";

const reportParamsSchema = z.object({ reportId: uuidSchema }).strict();
const userParamsSchema = z.object({ userId: uuidSchema }).strict();
const mediaParamsSchema = z.object({ mediaObjectId: uuidSchema }).strict();
const queueItemParamsSchema = z.object({
  itemKind: z.enum(["report", "review"]),
  itemId: uuidSchema
}).strict();
const reviewPreviewParamsSchema = z.object({ reviewId: uuidSchema }).strict();

const reportListQuerySchema = z.object({
  status: z.enum(["open", "automod_processing", "resolved", "dismissed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
}).strict();

const queueListQuerySchema = z.object({
  source: z.enum(["all", "reports", "automod"]).optional().default("all"),
  state: z.enum(["open", "closed", "all"]).optional().default("open"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  offset: z.coerce.number().int().min(0).optional().default(0)
}).strict();

const reportResolutionSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  reasonCode: singleLineTextSchema({ min: 1, max: 120 }),
  notes: multilineTextSchema({ max: 2000 }).optional().default("")
}).strict();

const moderatedAccountStatuses = ["active", "under_review", "suspended", "banned"] as const;

type ModeratedAccountStatus = (typeof moderatedAccountStatuses)[number];

const accountStatusSchema = z.object({
  status: z.enum(moderatedAccountStatuses),
  reasonCode: singleLineTextSchema({ min: 1, max: 120 }),
  notes: multilineTextSchema({ max: 2000 }).optional().default(""),
  reportId: uuidSchema.optional()
}).strict();

const userSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(120).optional(),
  status: z.enum(moderatedAccountStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  offset: z.coerce.number().int().min(0).optional().default(0)
}).strict();

const reviewDecisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reasonCode: singleLineTextSchema({ min: 1, max: 120 }),
  notes: multilineTextSchema({ max: 2000 }).optional().default("")
}).strict();

const contentRemovalSchema = z.object({
  reasonCode: singleLineTextSchema({ min: 1, max: 120 }),
  notes: multilineTextSchema({ min: 1, max: 2000 })
}).strict();

type ReportAdminRow = {
  id: string;
  reporter_user_id: string;
  target_type: string;
  target_user_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  post_id: string | null;
  media_object_id: string | null;
  profile_photo_url: string | null;
  content_review_id: string | null;
  reason: string;
  details: string;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
  reporter_display_name: string | null;
  target_display_name: string | null;
  target_account_status: string | null;
};

type ReportStatusRow = {
  id: string;
  status: string;
  target_type: string;
  target_user_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  post_id: string | null;
  media_object_id: string | null;
  profile_photo_url: string | null;
  content_review_id: string | null;
};

type ContentReviewRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  account_status: string | null;
  surface: string;
  content_type: string;
  status: string;
  content_id: string | null;
  content_ref: Record<string, unknown> | string | null;
  provider: string | null;
  provider_request_id: string | null;
  normalized_labels: unknown[] | string | null;
  policy_decision: Record<string, unknown> | string | null;
  moderation_status: string;
  flagged_reason: string | null;
  moderation_provider: string | null;
  created_at: string | Date;
  completed_at: string | Date | null;
};

type QueueRow = {
  item_kind: "report" | "review";
  id: string;
  queue_status: string;
  reason: string | null;
  summary: string;
  created_at: string | Date;
  updated_at: string | Date;
  target_type: string;
  target_user_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  post_id: string | null;
  media_object_id: string | null;
  profile_photo_url: string | null;
  content_review_id: string | null;
  reporter_user_id: string | null;
  reporter_display_name: string | null;
  subject_display_name: string | null;
  account_status: string | null;
  surface: string | null;
  content_type: string | null;
  provider: string | null;
  normalized_labels: unknown[] | string | null;
  policy_decision: Record<string, unknown> | string | null;
  content_ref: Record<string, unknown> | string | null;
  total_count: string | number;
};

type AccountStatusRow = {
  id: string;
  email?: string | null;
  account_status: string | null;
  account_status_updated_at: string | Date;
};

type ModeratedUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  account_status: string | null;
  account_status_updated_at: string | Date;
  created_at: string | Date;
  moderator_role: string | null;
  open_report_count: string | number;
  total_report_count: string | number;
  total_count?: string | number;
};

type AuditRow = { id: string; created_at: string | Date };

type ModerationHistoryRow = {
  id: string;
  action: string;
  reason_code: string;
  notes: string;
  created_at: string | Date;
  actor_display_name: string | null;
};

type EncryptedMediaRow = {
  object_key: string;
  mime_type: string;
  encrypted_data_key: string;
  data_key_nonce: string;
  data_key_auth_tag: string;
  content_nonce: string;
  content_auth_tag: string;
  key_version: string;
};

function parseJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (typeof value !== "string") {
    return value ?? fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function withTransaction<T>(db: DbClient, operation: (client: DbClient) => Promise<T>) {
  return db.transaction ? db.transaction(operation) : operation(db);
}

function reportSelectSql(whereSql: string) {
  return `select
     reports.id::text as id,
     reports.reporter_user_id::text as reporter_user_id,
     reports.target_type,
     reports.target_user_id::text as target_user_id,
     reports.conversation_id::text as conversation_id,
     reports.message_id::text as message_id,
     reports.post_id::text as post_id,
     reports.media_object_id::text as media_object_id,
     reports.profile_photo_url,
     reports.content_review_id::text as content_review_id,
     reports.reason,
     reports.details,
     reports.status,
     reports.created_at,
     reports.updated_at,
     coalesce(reporter_profile.display_name, reporter.display_name, 'cruush user') as reporter_display_name,
     coalesce(target_profile.display_name, target_user.display_name, 'cruush user') as target_display_name,
     coalesce(target_user.account_status, 'active') as target_account_status
   from reports
   join app_users reporter on reporter.id = reports.reporter_user_id
   left join profiles reporter_profile on reporter_profile.id = reporter.id
   left join app_users target_user on target_user.id = reports.target_user_id
   left join profiles target_profile on target_profile.id = target_user.id
   ${whereSql}`;
}

function mapReportRow(row: ReportAdminRow) {
  return {
    id: row.id,
    reporter: {
      userId: row.reporter_user_id,
      displayName: row.reporter_display_name?.trim() || "cruush user"
    },
    target: {
      type: row.target_type,
      userId: row.target_user_id,
      displayName: row.target_display_name?.trim() || null,
      accountStatus: row.target_user_id ? normalizeAccountStatus(row.target_account_status) : null,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      postId: row.post_id,
      mediaObjectId: row.media_object_id,
      profilePhotoUrl: row.profile_photo_url
    },
    contentReviewId: row.content_review_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function mapContentReview(row: ContentReviewRow) {
  return {
    id: row.id,
    user: {
      id: row.user_id,
      displayName: row.display_name?.trim() || "cruush user",
      accountStatus: normalizeAccountStatus(row.account_status)
    },
    surface: row.surface,
    contentType: row.content_type,
    storageStatus: row.status,
    moderationStatus: row.moderation_status,
    reason: row.flagged_reason,
    contentId: row.content_id,
    contentRef: parseJson(row.content_ref, {} as Record<string, unknown>),
    provider: row.moderation_provider ?? row.provider,
    providerRequestId: row.provider_request_id,
    normalizedLabels: parseJson(row.normalized_labels, [] as unknown[]),
    policyDecision: parseJson(row.policy_decision, {} as Record<string, unknown>),
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null
  };
}

function mapQueueRow(row: QueueRow) {
  const isReport = row.item_kind === "report";

  return {
    key: `${row.item_kind}:${row.id}`,
    kind: row.item_kind,
    id: row.id,
    status: row.queue_status,
    reason: row.reason,
    summary: row.summary,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    subject: {
      userId: row.target_user_id,
      displayName: row.subject_display_name?.trim() || null,
      accountStatus: row.target_user_id ? normalizeAccountStatus(row.account_status) : null
    },
    target: {
      type: row.target_type,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      postId: row.post_id,
      mediaObjectId: row.media_object_id,
      profilePhotoUrl: row.profile_photo_url
    },
    reporter: isReport ? {
      userId: row.reporter_user_id,
      displayName: row.reporter_display_name?.trim() || "cruush user"
    } : null,
    moderation: row.content_review_id || !isReport ? {
      contentReviewId: row.content_review_id ?? row.id,
      surface: row.surface,
      contentType: row.content_type,
      provider: row.provider,
      normalizedLabels: parseJson(row.normalized_labels, [] as unknown[]),
      policyDecision: parseJson(row.policy_decision, {} as Record<string, unknown>),
      contentRef: parseJson(row.content_ref, {} as Record<string, unknown>)
    } : null
  };
}

function moderatedUserSelectSql(whereSql: string) {
  return `with base as (
     select
       users.id::text as id,
       users.email,
       coalesce(profile.display_name, users.display_name, 'cruush user') as display_name,
       coalesce(users.account_status, 'active') as account_status,
       users.account_status_updated_at,
       users.created_at,
       moderator.role as moderator_role,
       (select count(*) from reports open_report
        where open_report.target_user_id = users.id
          and open_report.status in ('open', 'automod_processing')) as open_report_count,
       (select count(*) from reports all_reports
        where all_reports.target_user_id = users.id) as total_report_count
     from app_users users
     left join profiles profile on profile.id = users.id
     left join moderator_users moderator on moderator.user_id = users.id
     ${whereSql}
   )
   select base.*,`;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");

  if (!domain) {
    return "hidden";
  }

  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

function mapModeratedUser(row: ModeratedUserRow, role: ModeratorRole) {
  return {
    id: row.id,
    displayName: row.display_name?.trim() || "cruush user",
    email: role === "admin" ? row.email : maskEmail(row.email),
    accountStatus: normalizeAccountStatus(row.account_status),
    accountStatusUpdatedAt: new Date(row.account_status_updated_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    moderatorRole: row.moderator_role,
    isOwner: isOwnerFullAccessEmail(row.email),
    openReportCount: Number(row.open_report_count ?? 0),
    totalReportCount: Number(row.total_report_count ?? 0)
  };
}

function actionForStatusChange(previousStatus: AccountStatus, nextStatus: ModeratedAccountStatus) {
  if (nextStatus === "banned") return "ban_user";
  if (nextStatus === "suspended") return "suspend_user";
  if (nextStatus === "under_review") return "mark_under_review";
  if (previousStatus === "banned") return "unban_user";
  return previousStatus === "suspended" ? "unsuspend_user" : "restore_user";
}

async function revokeAllSessions(db: DbClient, userId: string) {
  await db.query("delete from app_sessions where user_id = $1", [userId]);
}

async function createModerationAction(db: DbClient, input: {
  actorUserId: string;
  targetUserId: string | null;
  reportId?: string | null;
  contentReviewId?: string | null;
  action: string;
  reasonCode: string;
  notes: string;
  metadata: Record<string, unknown>;
}) {
  const result = await db.query<AuditRow>(
    `insert into moderation_actions (
       actor_user_id, target_user_id, report_id, content_review_id,
       action, reason_code, notes, metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     returning id::text as id, created_at`,
    [
      input.actorUserId,
      input.targetUserId,
      input.reportId ?? null,
      input.contentReviewId ?? null,
      input.action,
      input.reasonCode,
      input.notes,
      JSON.stringify(input.metadata)
    ]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(500, "INTERNAL_ERROR", "Failed to record moderation action.");
  return { id: row.id, createdAt: new Date(row.created_at).toISOString() };
}

async function getContentReview(app: FastifyInstance, reviewId: string) {
  const result = await app.db.query<ContentReviewRow>(
    `select
       review.id::text as id,
       review.user_id::text as user_id,
       coalesce(profile.display_name, users.display_name, 'cruush user') as display_name,
       coalesce(users.account_status, 'active') as account_status,
       review.surface,
       review.content_type,
       review.status,
       review.content_id,
       review.content_ref,
       review.provider,
       review.provider_request_id,
       review.normalized_labels,
       review.policy_decision,
       review.moderation_status,
       review.flagged_reason,
       review.moderation_provider,
       review.created_at,
       review.completed_at
     from content_reviews review
     join app_users users on users.id = review.user_id
     left join profiles profile on profile.id = users.id
     where review.id = $1
       and coalesce(review.flagged_reason, '') <> 'photodna_csam_match'
       and coalesce(review.policy_decision ->> 'category', '') <> 'csam'
     limit 1`,
    [reviewId]
  );
  return result.rows[0] ?? null;
}

async function loadTargetContext(app: FastifyInstance, target: {
  type: string;
  userId: string | null;
  conversationId: string | null;
  messageId: string | null;
  postId: string | null;
  mediaObjectId: string | null;
  profilePhotoUrl: string | null;
}) {
  if (target.type === "post" && target.postId) {
    const result = await app.db.query<{
      content: string;
      content_ciphertext: string | null;
      content_nonce: string | null;
      content_auth_tag: string | null;
      content_key_version: string | null;
      created_at: string | Date;
      display_name: string | null;
    }>(
      `select post.content, post.content_ciphertext, post.content_nonce,
              post.content_auth_tag, post.content_key_version, post.created_at,
              profile.display_name
       from posts post
       left join profiles profile on profile.id = post.user_id
       where post.id = $1
       limit 1`,
      [target.postId]
    );
    const row = result.rows[0];
    if (!row) return { kind: "unavailable", message: "The reported post is no longer available." };
    return {
      kind: "post",
      text: decryptTextContentOrFallback(app.config, "feed", {
        ciphertext: row.content_ciphertext ?? undefined,
        nonce: row.content_nonce ?? undefined,
        authTag: row.content_auth_tag ?? undefined,
        keyVersion: row.content_key_version ?? undefined
      }, row.content),
      author: row.display_name?.trim() || "cruush user",
      createdAt: new Date(row.created_at).toISOString()
    };
  }

  if (target.type === "message" && target.messageId) {
    const result = await app.db.query<{
      content: string;
      content_ciphertext: string | null;
      content_nonce: string | null;
      content_auth_tag: string | null;
      content_key_version: string | null;
      created_at: string | Date;
      display_name: string | null;
    }>(
      `select message.content, message.content_ciphertext, message.content_nonce,
              message.content_auth_tag, message.content_key_version, message.created_at,
              profile.display_name
       from messages message
       left join profiles profile on profile.id = message.user_id
       where message.id = $1
       limit 1`,
      [target.messageId]
    );
    const row = result.rows[0];
    if (!row) return { kind: "unavailable", message: "The reported message is no longer available." };
    return {
      kind: "message",
      text: decryptTextContentOrFallback(app.config, "message", {
        ciphertext: row.content_ciphertext ?? undefined,
        nonce: row.content_nonce ?? undefined,
        authTag: row.content_auth_tag ?? undefined,
        keyVersion: row.content_key_version ?? undefined
      }, row.content),
      author: row.display_name?.trim() || "cruush user",
      createdAt: new Date(row.created_at).toISOString()
    };
  }

  if (target.type === "conversation" && target.conversationId) {
    const result = await app.db.query<{
      id: string;
      content: string;
      content_ciphertext: string | null;
      content_nonce: string | null;
      content_auth_tag: string | null;
      content_key_version: string | null;
      created_at: string | Date;
      display_name: string | null;
    }>(
      `select message.id::text, message.content, message.content_ciphertext,
              message.content_nonce, message.content_auth_tag, message.content_key_version,
              message.created_at, profile.display_name
       from messages message
       left join profiles profile on profile.id = message.user_id
       where message.conversation_id = $1
       order by message.created_at desc
       limit 10`,
      [target.conversationId]
    );
    return {
      kind: "conversation",
      messages: result.rows.reverse().map((row) => ({
        id: row.id,
        text: decryptTextContentOrFallback(app.config, "message", {
          ciphertext: row.content_ciphertext ?? undefined,
          nonce: row.content_nonce ?? undefined,
          authTag: row.content_auth_tag ?? undefined,
          keyVersion: row.content_key_version ?? undefined
        }, row.content),
        author: row.display_name?.trim() || "cruush user",
        createdAt: new Date(row.created_at).toISOString()
      }))
    };
  }

  if ((target.type === "profile" || target.type === "user") && target.userId) {
    const result = await app.db.query<{
      display_name: string | null;
      bio: string | null;
      pronouns: string[] | null;
      photos: string[] | null;
      updated_at: string | Date;
    }>(
      `select display_name, bio, pronouns, photos, updated_at
       from profiles
       where id = $1
       limit 1`,
      [target.userId]
    );
    const row = result.rows[0];
    if (!row) return { kind: "unavailable", message: "The reported profile is no longer available." };
    return {
      kind: "profile",
      displayName: row.display_name?.trim() || "cruush user",
      bio: row.bio?.trim() || "",
      pronouns: row.pronouns ?? [],
      photos: row.photos ?? [],
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  if (target.type === "profile_photo") {
    return {
      kind: "media",
      mediaObjectId: target.mediaObjectId,
      previewUrl: target.mediaObjectId
        ? `/api/admin/moderation/media/${target.mediaObjectId}/preview`
        : target.profilePhotoUrl,
      message: target.mediaObjectId || target.profilePhotoUrl ? null : "The reported photo is no longer available."
    };
  }

  return { kind: "unavailable", message: "No retained content is available for this queue item." };
}

async function loadReviewContext(app: FastifyInstance, review: ContentReviewRow) {
  const contentRef = parseJson(review.content_ref, {} as Record<string, unknown>);
  const manualReviewId = typeof contentRef.manualReviewId === "string" ? contentRef.manualReviewId : null;
  if (review.content_type === "image") {
    const mediaResult = await app.db.query<{ id: string }>(
      `select id::text as id
       from media_objects
       where deleted_at is null
         and (content_review_id = $1 or id::text = $2)
       order by created_at desc
       limit 1`,
      [review.id, review.content_id]
    );
    const mediaObjectId = mediaResult.rows[0]?.id ?? null;
    return {
      kind: "media",
      mediaObjectId,
      previewUrl: mediaObjectId
        ? `/api/admin/moderation/media/${mediaObjectId}/preview`
        : manualReviewId
          ? `/api/admin/moderation/reviews/${review.id}/preview`
          : null,
      message: mediaObjectId || manualReviewId
        ? null
        : "The image was rejected before publication and no moderator-viewable copy is retained."
    };
  }

  const target = {
    type: review.surface === "feed"
      ? "post"
      : review.surface === "profile"
        ? "profile"
        : "message",
    userId: review.user_id,
    conversationId: typeof contentRef.conversationId === "string" ? contentRef.conversationId : null,
    messageId: typeof contentRef.messageId === "string" ? contentRef.messageId : review.content_id,
    postId: typeof contentRef.postId === "string" ? contentRef.postId : review.content_id,
    mediaObjectId: null,
    profilePhotoUrl: null
  };
  const context = await loadTargetContext(app, target);
  if (context.kind !== "unavailable") return context;
  return {
    kind: "moderation_metadata",
    message: "This text was rejected before storage. Provider labels and the policy decision remain available below."
  };
}

async function loadHistory(app: FastifyInstance, reportId: string | null, contentReviewId: string | null) {
  const result = await app.db.query<ModerationHistoryRow>(
    `select action.id::text as id, action.action, action.reason_code, action.notes,
            action.created_at,
            coalesce(profile.display_name, actor.display_name, 'former moderator') as actor_display_name
     from moderation_actions action
     left join app_users actor on actor.id = action.actor_user_id
     left join profiles profile on profile.id = actor.id
     where ($1::uuid is not null and action.report_id = $1)
        or ($2::uuid is not null and action.content_review_id = $2)
     order by action.created_at desc
     limit 100`,
    [reportId, contentReviewId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    reasonCode: row.reason_code,
    notes: row.notes,
    actorDisplayName: row.actor_display_name?.trim() || "former moderator",
    createdAt: new Date(row.created_at).toISOString()
  }));
}

async function sendEncryptedPreview(app: FastifyInstance, reply: FastifyReply, media: EncryptedMediaRow) {
  try {
    const encryptedBytes = await readEncryptedMediaObject(app.config, media.object_key);
    const bytes = decryptMediaBytes(app.config, {
      ciphertext: encryptedBytes,
      nonce: media.content_nonce,
      authTag: media.content_auth_tag,
      encryptedDataKey: media.encrypted_data_key,
      dataKeyNonce: media.data_key_nonce,
      dataKeyAuthTag: media.data_key_auth_tag,
      keyVersion: media.key_version
    });
    return reply
      .type(media.mime_type)
      .header("cache-control", "private, no-store, max-age=0")
      .header("pragma", "no-cache")
      .header("x-robots-tag", "noindex, nofollow, noarchive")
      .send(bytes);
  } catch {
    throw new ApiError(404, "NOT_FOUND", "Moderation preview is unavailable.");
  }
}

async function deleteStoredObjectsBestEffort(app: FastifyInstance, objectKeys: string[], itemId: string) {
  for (const objectKey of new Set(objectKeys.filter(Boolean))) {
    try {
      await deleteEncryptedMediaObject(app.config, objectKey);
    } catch (error) {
      app.log.error({ err: error, itemId, stage: "moderator_media_cleanup" }, "moderated media cleanup failed");
    }
  }
}

export async function registerAdminModerationRoutes(app: FastifyInstance) {
  app.get("/api/admin/moderation/queue", async (request, reply) => {
    await getModeratorUser(request);
    const query = queueListQuerySchema.parse(request.query);
    const result = await app.db.query<QueueRow>(
      `with queue_items as (
         select
           'report'::text as item_kind,
           report.id::text as id,
           report.status as queue_status,
           report.reason,
           report.details as summary,
           report.created_at,
           report.updated_at,
           report.target_type,
           report.target_user_id::text as target_user_id,
           report.conversation_id::text as conversation_id,
           report.message_id::text as message_id,
           report.post_id::text as post_id,
           report.media_object_id::text as media_object_id,
           report.profile_photo_url,
           report.content_review_id::text as content_review_id,
           report.reporter_user_id::text as reporter_user_id,
           coalesce(reporter_profile.display_name, reporter.display_name, 'cruush user') as reporter_display_name,
           coalesce(subject_profile.display_name, subject.display_name, 'cruush user') as subject_display_name,
           coalesce(subject.account_status, 'active') as account_status,
           linked_review.surface,
           linked_review.content_type,
           coalesce(linked_review.moderation_provider, linked_review.provider) as provider,
           linked_review.normalized_labels,
           linked_review.policy_decision,
           linked_review.content_ref
         from reports report
         join app_users reporter on reporter.id = report.reporter_user_id
         left join profiles reporter_profile on reporter_profile.id = reporter.id
         left join app_users subject on subject.id = report.target_user_id
         left join profiles subject_profile on subject_profile.id = subject.id
         left join content_reviews linked_review on linked_review.id = report.content_review_id

         union all

         select
           'review'::text as item_kind,
           review.id::text as id,
           review.moderation_status as queue_status,
           review.flagged_reason as reason,
           coalesce(review.policy_decision ->> 'reason_code', review.flagged_reason, 'Automated moderation review') as summary,
           review.created_at,
           coalesce(review.completed_at, review.created_at) as updated_at,
           case review.surface
             when 'feed' then 'post'
             when 'profile' then 'profile'
             when 'profile_photo' then 'profile_photo'
             when 'private_photo' then 'profile_photo'
             else 'message'
           end as target_type,
           review.user_id::text as target_user_id,
           nullif(review.content_ref ->> 'conversationId', '') as conversation_id,
           nullif(review.content_ref ->> 'messageId', '') as message_id,
           nullif(review.content_ref ->> 'postId', '') as post_id,
           case when review.content_type = 'image' then nullif(review.content_id, '') else null end as media_object_id,
           nullif(review.content_ref ->> 'profilePhotoUrl', '') as profile_photo_url,
           review.id::text as content_review_id,
           null::text as reporter_user_id,
           null::text as reporter_display_name,
           coalesce(subject_profile.display_name, subject.display_name, 'cruush user') as subject_display_name,
           coalesce(subject.account_status, 'active') as account_status,
           review.surface,
           review.content_type,
           coalesce(review.moderation_provider, review.provider) as provider,
           review.normalized_labels,
           review.policy_decision,
           review.content_ref
         from content_reviews review
         join app_users subject on subject.id = review.user_id
         left join profiles subject_profile on subject_profile.id = subject.id
          where coalesce(review.provider, '') <> 'user_report'
           and coalesce(review.flagged_reason, '') <> 'photodna_csam_match'
           and coalesce(review.policy_decision ->> 'category', '') <> 'csam'
           and (
             review.moderation_status <> 'allowed'
             or exists (
               select 1 from moderation_actions decided
               where decided.content_review_id = review.id
             )
           )
       ), filtered as (
         select *
         from queue_items item
         where ($1::text = 'all'
                or ($1 = 'reports' and item.item_kind = 'report')
                or ($1 = 'automod' and item.item_kind = 'review'))
           and ($2::text = 'all'
                or ($2 = 'open' and item.queue_status in ('open', 'automod_processing', 'pending_review', 'flagged'))
                or ($2 = 'closed' and item.queue_status in ('resolved', 'dismissed', 'allowed', 'blocked', 'removed')))
       )
       select filtered.*, count(*) over() as total_count
       from filtered
       order by created_at desc, id desc
       limit $3 offset $4`,
      [query.source, query.state, query.limit, query.offset]
    );
    const total = Number(result.rows[0]?.total_count ?? 0);
    return reply.send({
      data: {
        items: result.rows.map(mapQueueRow),
        page: {
          limit: query.limit,
          offset: query.offset,
          total,
          hasMore: query.offset + result.rows.length < total
        }
      }
    });
  });

  app.get("/api/admin/moderation/queue/:itemKind/:itemId", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { itemKind, itemId } = queueItemParamsSchema.parse(request.params);

    if (itemKind === "report") {
      const result = await app.db.query<ReportAdminRow>(`${reportSelectSql("where reports.id = $1")} limit 1`, [itemId]);
      const row = result.rows[0];
      if (!row) throw new ApiError(404, "NOT_FOUND", "Moderation queue item not found.");
      const report = mapReportRow(row);
      const [context, history] = await Promise.all([
        loadTargetContext(app, report.target),
        loadHistory(app, row.id, row.content_review_id)
      ]);
      await recordModeratorAccess(app.db, {
        actorUserId: moderator.userId,
        accessType: "queue_detail",
        reportId: row.id,
        contentReviewId: row.content_review_id,
        mediaObjectId: row.media_object_id,
        metadata: { itemKind: "report", targetType: row.target_type }
      });
      return reply.send({
        data: {
          item: { kind: "report", report },
          context,
          history,
          availableActions: {
            canResolve: ["open", "automod_processing"].includes(row.status),
            canRemoveContent: ["post", "message", "profile_photo"].includes(row.target_type),
            canModerateAccount: Boolean(row.target_user_id)
          }
        }
      });
    }

    const review = await getContentReview(app, itemId);
    if (!review) throw new ApiError(404, "NOT_FOUND", "Moderation queue item not found.");
    const [context, history] = await Promise.all([
      loadReviewContext(app, review),
      loadHistory(app, null, review.id)
    ]);
    await recordModeratorAccess(app.db, {
      actorUserId: moderator.userId,
      accessType: "queue_detail",
      contentReviewId: review.id,
      mediaObjectId: context.kind === "media" ? context.mediaObjectId : null,
      metadata: { itemKind: "review", surface: review.surface, contentType: review.content_type }
    });
    return reply.send({
      data: {
        item: { kind: "review", review: mapContentReview(review) },
        context,
        history,
        availableActions: {
          canDecideReview: ["pending_review", "flagged"].includes(review.moderation_status),
          canModerateAccount: true,
          canRemoveContent: false
        }
      }
    });
  });

  app.get("/api/admin/moderation/reports", async (request, reply) => {
    await getModeratorUser(request);
    const query = reportListQuerySchema.parse(request.query);
    const result = await app.db.query<ReportAdminRow>(
      `${reportSelectSql("where ($1::text is null or reports.status = $1)")}
       order by reports.created_at desc limit $2 offset $3`,
      [query.status ?? null, query.limit, query.offset]
    );
    return reply.send({ data: { reports: result.rows.map(mapReportRow) } });
  });

  app.get("/api/admin/moderation/reports/:reportId", async (request, reply) => {
    await getModeratorUser(request);
    const { reportId } = reportParamsSchema.parse(request.params);
    const result = await app.db.query<ReportAdminRow>(`${reportSelectSql("where reports.id = $1")} limit 1`, [reportId]);
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "Report not found.");
    return reply.send({ data: { report: mapReportRow(row) } });
  });

  app.patch("/api/admin/moderation/reports/:reportId", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { reportId } = reportParamsSchema.parse(request.params);
    const payload = reportResolutionSchema.parse(request.body);
    const result = await withTransaction(app.db, async (db) => {
      const currentResult = await db.query<ReportStatusRow>(
        `select id::text, status, target_type, target_user_id::text as target_user_id,
                conversation_id::text as conversation_id, message_id::text as message_id,
                post_id::text as post_id, media_object_id::text as media_object_id,
                profile_photo_url, content_review_id::text as content_review_id
         from reports where id = $1 limit 1`,
        [reportId]
      );
      const current = currentResult.rows[0];
      if (!current) throw new ApiError(404, "NOT_FOUND", "Report not found.");
      const updatedResult = await db.query<{ id: string; status: string; updated_at: string | Date }>(
        `update reports set status = $2, updated_at = now()
         where id = $1 returning id::text, status, updated_at`,
        [reportId, payload.status]
      );
      const updated = updatedResult.rows[0];
      if (current.content_review_id) {
        await db.query(
          `update content_reviews
           set status = 'closed',
               moderation_status = $2,
               completed_at = now()
           where id = $1`,
          [current.content_review_id, payload.status === "dismissed" ? "allowed" : "blocked"]
        );
      }
      const moderationAction = await createModerationAction(db, {
        actorUserId: moderator.userId,
        targetUserId: current.target_user_id,
        reportId,
        contentReviewId: current.content_review_id,
        action: payload.status === "resolved" ? "resolve_report" : "dismiss_report",
        reasonCode: payload.reasonCode,
        notes: payload.notes,
        metadata: {
          targetType: current.target_type,
          previousStatus: current.status,
          newStatus: payload.status,
          conversationId: current.conversation_id,
          messageId: current.message_id,
          postId: current.post_id,
          mediaObjectId: current.media_object_id,
          hasProfilePhotoUrl: Boolean(current.profile_photo_url)
        }
      });
      return { updated, moderationAction };
    });
    return reply.send({
      data: {
        report: {
          id: result.updated.id,
          status: result.updated.status,
          updatedAt: new Date(result.updated.updated_at).toISOString()
        },
        moderationAction: result.moderationAction
      }
    });
  });

  app.post("/api/admin/moderation/reports/:reportId/remove-content", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { reportId } = reportParamsSchema.parse(request.params);
    const payload = contentRemovalSchema.parse(request.body);
    const result = await withTransaction(app.db, async (db) => {
      const reportResult = await db.query<ReportStatusRow>(
        `select id::text, status, target_type, target_user_id::text as target_user_id,
                conversation_id::text as conversation_id, message_id::text as message_id,
                post_id::text as post_id, media_object_id::text as media_object_id,
                profile_photo_url, content_review_id::text as content_review_id
         from reports where id = $1 for update`,
        [reportId]
      );
      const report = reportResult.rows[0];
      if (!report) throw new ApiError(404, "NOT_FOUND", "Report not found.");

      let action: "remove_post" | "remove_message" | "remove_media";
      let objectKeys: string[] = [];
      if (report.target_type === "post" && report.post_id) {
        action = "remove_post";
        const removed = await db.query<{ id: string }>("delete from posts where id = $1 returning id::text", [report.post_id]);
        if (!removed.rows[0]) throw new ApiError(404, "NOT_FOUND", "Reported post is no longer available.");
      } else if (report.target_type === "message" && report.message_id) {
        action = "remove_message";
        const removed = await db.query<{ object_key: string | null }>(
          `with target_media as (
             select media.id, media.object_key
             from message_media_attachments attachment
             join media_objects media on media.id = attachment.media_object_id
             where attachment.message_id = $1 and media.deleted_at is null
           ), removed_variants as (
             update media_variants variant set deleted_at = now()
             from target_media where variant.media_object_id = target_media.id and variant.deleted_at is null
             returning variant.object_key
           ), removed_media as (
             update media_objects media set deleted_at = now()
             from target_media where media.id = target_media.id
             returning media.object_key
           ), removed_message as (
             delete from messages where id = $1 returning id
           )
           select object_key from removed_variants
           union all select object_key from removed_media
           union all select null::text from removed_message`,
          [report.message_id]
        );
        if (removed.rows.length === 0) throw new ApiError(404, "NOT_FOUND", "Reported message is no longer available.");
        objectKeys = removed.rows.flatMap((row) => row.object_key ? [row.object_key] : []);
      } else if (report.target_type === "profile_photo" && (report.media_object_id || report.profile_photo_url)) {
        action = "remove_media";
        const removed = await db.query<{ object_key: string }>(
          `with target_media as (
             select id, owner_user_id, public_url
             from media_objects
             where deleted_at is null
               and (($1::uuid is not null and id = $1) or ($2::text is not null and public_url = $2))
             limit 1
           ), removed_variants as (
             update media_variants variant set deleted_at = now()
             from target_media where variant.media_object_id = target_media.id and variant.deleted_at is null
             returning variant.object_key
           ), removed_media as (
             update media_objects media set deleted_at = now()
             from target_media where media.id = target_media.id
             returning media.object_key
           ), cleaned_profile as (
             update profiles profile
             set photos = array_remove(profile.photos, target_media.public_url), updated_at = now()
             from target_media where profile.id = target_media.owner_user_id
             returning profile.id
           )
           select object_key from removed_variants
           union all select object_key from removed_media`,
          [report.media_object_id, report.profile_photo_url]
        );
        if (removed.rows.length === 0) throw new ApiError(404, "NOT_FOUND", "Reported media is no longer available.");
        objectKeys = removed.rows.map((row) => row.object_key);
      } else {
        throw new ApiError(400, "VALIDATION_ERROR", "This report does not target removable content.");
      }

      await db.query("update reports set status = 'resolved', updated_at = now() where id = $1", [reportId]);
      if (report.content_review_id) {
        await db.query(
          `update content_reviews
           set status = 'closed', moderation_status = 'removed', completed_at = now()
           where id = $1`,
          [report.content_review_id]
        );
      }
      const moderationAction = await createModerationAction(db, {
        actorUserId: moderator.userId,
        targetUserId: report.target_user_id,
        reportId,
        contentReviewId: report.content_review_id,
        action,
        reasonCode: payload.reasonCode,
        notes: payload.notes,
        metadata: { targetType: report.target_type }
      });
      return { action, objectKeys, moderationAction };
    });
    await deleteStoredObjectsBestEffort(app, result.objectKeys, reportId);
    return reply.send({ data: { report: { id: reportId, status: "resolved" }, action: result.action, moderationAction: result.moderationAction } });
  });

  app.post("/api/admin/moderation/reviews/:itemId/decision", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const parsedParams = z.object({ itemId: uuidSchema }).strict().parse(request.params);
    const payload = reviewDecisionSchema.parse(request.body);
    const review = await getContentReview(app, parsedParams.itemId);
    if (!review) throw new ApiError(404, "NOT_FOUND", "Content review not found.");
    if (!["pending_review", "flagged"].includes(review.moderation_status)) {
      throw new ApiError(409, "VALIDATION_ERROR", "This content review has already been decided.");
    }
    const contentRef = parseJson(review.content_ref, {} as Record<string, unknown>);
    const manualReviewId = typeof contentRef.manualReviewId === "string" ? contentRef.manualReviewId : null;
    let moderationAction: Awaited<ReturnType<typeof createModerationAction>>;
    if (manualReviewId) {
      const options = {
        reviewerReference: `moderator:${moderator.userId}`,
        reason: payload.notes || payload.reasonCode
      };
      if (payload.action === "approve") {
        await approvePendingProfilePhotoReview(app.db, manualReviewId, options);
      } else {
        await rejectPendingProfilePhotoReview(app.db, app.config, manualReviewId, options);
      }
      moderationAction = await createModerationAction(app.db, {
        actorUserId: moderator.userId,
        targetUserId: review.user_id,
        contentReviewId: review.id,
        action: payload.action === "approve" ? "approve_content" : "reject_content",
        reasonCode: payload.reasonCode,
        notes: payload.notes,
        metadata: { surface: review.surface, provider: review.moderation_provider ?? review.provider }
      });
    } else {
      moderationAction = await withTransaction(app.db, async (db) => {
        await db.query(
          `update content_reviews
           set status = $2,
               moderation_status = $3,
               completed_at = now()
           where id = $1`,
          [review.id, payload.action === "approve" ? "closed" : "rejected", payload.action === "approve" ? "allowed" : "blocked"]
        );
        return createModerationAction(db, {
          actorUserId: moderator.userId,
          targetUserId: review.user_id,
          contentReviewId: review.id,
          action: payload.action === "approve" ? "approve_content" : "reject_content",
          reasonCode: payload.reasonCode,
          notes: payload.notes,
          metadata: { surface: review.surface, provider: review.moderation_provider ?? review.provider }
        });
      });
    }
    return reply.send({
      data: {
        review: { id: review.id, moderationStatus: payload.action === "approve" ? "allowed" : "blocked" },
        moderationAction
      }
    });
  });

  app.post("/api/admin/moderation/users/:userId/status", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { userId } = userParamsSchema.parse(request.params);
    const payload = accountStatusSchema.parse(request.body);
    if (moderator.userId === userId && payload.status !== "active") {
      throw new ApiError(400, "VALIDATION_ERROR", "Moderators cannot restrict their own account.");
    }
    const result = await withTransaction(app.db, async (db) => {
      const targetLookup = await db.query<AccountStatusRow>(
        `select id::text, email, coalesce(account_status, 'active') as account_status, account_status_updated_at
         from app_users where id = $1 and coalesce(account_status, 'active') <> 'deleted' limit 1`,
        [userId]
      );
      const target = targetLookup.rows[0];
      if (!target) throw new ApiError(404, "NOT_FOUND", "User not found.");
      if (isOwnerFullAccessEmail(target.email) && payload.status !== "active") {
        throw new ApiError(400, "VALIDATION_ERROR", "The owner account cannot be restricted.");
      }
      const previousStatus = normalizeAccountStatus(target.account_status);
      const updatedResult = await db.query<AccountStatusRow>(
        `update app_users set account_status = $2, account_status_updated_at = now()
         where id = $1 returning id::text, account_status, account_status_updated_at`,
        [userId, payload.status]
      );
      const updated = updatedResult.rows[0];
      const moderationAction = await createModerationAction(db, {
        actorUserId: moderator.userId,
        targetUserId: userId,
        reportId: payload.reportId ?? null,
        action: actionForStatusChange(previousStatus, payload.status),
        reasonCode: payload.reasonCode,
        notes: payload.notes,
        metadata: { previousStatus, newStatus: payload.status }
      });

      if (payload.status === "suspended" || payload.status === "banned") {
        await revokeAllSessions(db, userId);
      }

      return { updated, moderationAction };
    });
    return reply.send({
      data: {
        user: {
          id: result.updated.id,
          accountStatus: normalizeAccountStatus(result.updated.account_status),
          accountStatusUpdatedAt: new Date(result.updated.account_status_updated_at).toISOString()
        },
        moderationAction: result.moderationAction
      }
    });
  });

  app.get("/api/admin/moderation/users", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const query = userSearchQuerySchema.parse(request.query);
    const search = query.query?.toLowerCase() ?? null;
    const result = await app.db.query<ModeratedUserRow>(
      `${moderatedUserSelectSql(
        `where coalesce(users.account_status, 'active') <> 'deleted'
           and ($1::text is null
                or lower(users.email) like '%' || $1 || '%'
                or lower(coalesce(users.display_name, '')) like '%' || $1 || '%'
                or lower(coalesce(profile.display_name, '')) like '%' || $1 || '%'
                or users.id::text = $1)
           and ($2::text is null or coalesce(users.account_status, 'active') = $2)`
      )},
       count(*) over() as total_count
       from base
       order by
         case coalesce(account_status, 'active')
           when 'banned' then 0
           when 'suspended' then 1
           when 'under_review' then 2
           else 3
         end,
         account_status_updated_at desc
       limit $3 offset $4`,
      [search, query.status ?? null, query.limit, query.offset]
    );
    const total = Number(result.rows[0]?.total_count ?? 0);
    return reply.send({
      data: {
        users: result.rows.map((row) => mapModeratedUser(row, moderator.role)),
        page: {
          limit: query.limit,
          offset: query.offset,
          total,
          hasMore: query.offset + result.rows.length < total
        }
      }
    });
  });

  app.get("/api/admin/moderation/users/:userId", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { userId } = userParamsSchema.parse(request.params);
    const result = await app.db.query<ModeratedUserRow>(
      `${moderatedUserSelectSql("where users.id = $1")}
       0 as total_count
       from base
       limit 1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "User not found.");

    const [history, reports] = await Promise.all([
      app.db.query<ModerationHistoryRow>(
        `select action.id::text as id, action.action, action.reason_code, action.notes,
                action.created_at,
                coalesce(profile.display_name, actor.display_name, 'former moderator') as actor_display_name
         from moderation_actions action
         left join app_users actor on actor.id = action.actor_user_id
         left join profiles profile on profile.id = actor.id
         where action.target_user_id = $1
         order by action.created_at desc
         limit 50`,
        [userId]
      ),
      app.db.query<ReportAdminRow>(
        `${reportSelectSql("where reports.target_user_id = $1")}
         order by reports.created_at desc limit 25`,
        [userId]
      )
    ]);

    await recordModeratorAccess(app.db, {
      actorUserId: moderator.userId,
      accessType: "queue_detail",
      metadata: { itemKind: "user", targetUserId: userId }
    });

    return reply.send({
      data: {
        user: mapModeratedUser(row, moderator.role),
        history: history.rows.map((historyRow) => ({
          id: historyRow.id,
          action: historyRow.action,
          reasonCode: historyRow.reason_code,
          notes: historyRow.notes,
          actorDisplayName: historyRow.actor_display_name?.trim() || "former moderator",
          createdAt: new Date(historyRow.created_at).toISOString()
        })),
        reports: reports.rows.map(mapReportRow)
      }
    });
  });

  app.get("/api/admin/moderation/media/:mediaObjectId/preview", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { mediaObjectId } = mediaParamsSchema.parse(request.params);
    const result = await app.db.query<EncryptedMediaRow>(
      `select coalesce(display.object_key, media.object_key) as object_key,
              coalesce(display.mime_type, media.mime_type) as mime_type,
              coalesce(display.encrypted_data_key, media.encrypted_data_key) as encrypted_data_key,
              coalesce(display.data_key_nonce, media.data_key_nonce) as data_key_nonce,
              coalesce(display.data_key_auth_tag, media.data_key_auth_tag) as data_key_auth_tag,
              coalesce(display.content_nonce, media.content_nonce) as content_nonce,
              coalesce(display.content_auth_tag, media.content_auth_tag) as content_auth_tag,
              coalesce(display.key_version, media.key_version) as key_version
       from media_objects media
       left join media_variants display
         on display.media_object_id = media.id
        and display.variant_type = 'display'
        and display.deleted_at is null
       where media.id = $1 and media.deleted_at is null limit 1`,
      [mediaObjectId]
    );
    const media = result.rows[0];
    if (!media) throw new ApiError(404, "NOT_FOUND", "Moderation preview is unavailable.");
    await recordModeratorAccess(app.db, {
      actorUserId: moderator.userId,
      accessType: "media_preview",
      mediaObjectId,
      metadata: { endpoint: "media_preview" }
    });
    return sendEncryptedPreview(app, reply, media);
  });

  app.get("/api/admin/moderation/reviews/:reviewId/preview", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { reviewId } = reviewPreviewParamsSchema.parse(request.params);
    const review = await getContentReview(app, reviewId);
    if (!review || review.content_type !== "image") throw new ApiError(404, "NOT_FOUND", "Moderation preview is unavailable.");
    const contentRef = parseJson(review.content_ref, {} as Record<string, unknown>);
    const manualReviewId = typeof contentRef.manualReviewId === "string" ? contentRef.manualReviewId : null;
    if (!manualReviewId) throw new ApiError(404, "NOT_FOUND", "Moderation preview is unavailable.");
    const media = await getPendingProfilePhotoReviewImage(app.db, manualReviewId);
    if (!media) throw new ApiError(404, "NOT_FOUND", "Moderation preview is unavailable.");
    await recordModeratorAccess(app.db, {
      actorUserId: moderator.userId,
      accessType: "review_preview",
      contentReviewId: review.id,
      metadata: { endpoint: "review_preview", manualReviewId }
    });
    return sendEncryptedPreview(app, reply, media);
  });
}
