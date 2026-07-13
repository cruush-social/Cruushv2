import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { multilineTextSchema, singleLineTextSchema, uuidSchema } from "../input-schema.js";
import { getModeratorUser } from "../moderator-auth.js";
import { normalizeAccountStatus, type AccountStatus } from "../account-status.js";

const reportParamsSchema = z.object({
  reportId: uuidSchema
}).strict();

const userParamsSchema = z.object({
  userId: uuidSchema
}).strict();

const reportListQuerySchema = z.object({
  status: z.enum(["open", "automod_processing", "resolved", "dismissed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
}).strict();

const reportResolutionSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  reasonCode: singleLineTextSchema({ min: 1, max: 120 }),
  notes: multilineTextSchema({ max: 2000 }).optional().default("")
}).strict();

const accountStatusSchema = z.object({
  status: z.enum(["active", "under_review", "suspended"]),
  reasonCode: singleLineTextSchema({ min: 1, max: 120 }),
  notes: multilineTextSchema({ max: 2000 }).optional().default(""),
  reportId: uuidSchema.optional()
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
  reason: string;
  details: string;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
  reporter_display_name: string | null;
  target_display_name: string | null;
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
};

type AccountStatusRow = {
  id: string;
  account_status: string | null;
  account_status_updated_at: string | Date;
};

type AuditRow = {
  id: string;
  created_at: string | Date;
};

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
     reports.reason,
     reports.details,
     reports.status,
     reports.created_at,
     reports.updated_at,
     coalesce(reporter_profile.display_name, reporter.display_name, 'Cruush user') as reporter_display_name,
     coalesce(target_profile.display_name, target_user.display_name, 'Cruush user') as target_display_name
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
      displayName: row.reporter_display_name?.trim() || "Cruush user"
    },
    target: {
      type: row.target_type,
      userId: row.target_user_id,
      displayName: row.target_display_name?.trim() || null,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      postId: row.post_id,
      mediaObjectId: row.media_object_id,
      profilePhotoUrl: row.profile_photo_url
    },
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function actionForStatusChange(previousStatus: AccountStatus, nextStatus: "active" | "under_review" | "suspended") {
  if (nextStatus === "suspended") {
    return "suspend_user";
  }

  if (nextStatus === "under_review") {
    return "mark_under_review";
  }

  return previousStatus === "suspended" ? "unsuspend_user" : "restore_user";
}

async function createModerationAction(app: FastifyInstance, input: {
  actorUserId: string;
  targetUserId: string | null;
  reportId?: string | null;
  action: string;
  reasonCode: string;
  notes: string;
  metadata: Record<string, unknown>;
}) {
  const result = await app.db.query<AuditRow>(
    `insert into moderation_actions (
       actor_user_id,
       target_user_id,
       report_id,
       action,
       reason_code,
       notes,
       metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     returning id::text as id, created_at`,
    [
      input.actorUserId,
      input.targetUserId,
      input.reportId ?? null,
      input.action,
      input.reasonCode,
      input.notes,
      JSON.stringify(input.metadata)
    ]
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(500, "INTERNAL_ERROR", "Failed to record moderation action.");
  }

  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function registerAdminModerationRoutes(app: FastifyInstance) {
  app.get("/api/admin/moderation/reports", async (request, reply) => {
    await getModeratorUser(request);
    const query = reportListQuerySchema.parse(request.query);
    const result = await app.db.query<ReportAdminRow>(
      `${reportSelectSql("where ($1::text is null or reports.status = $1)")}
       order by reports.created_at desc
       limit $2 offset $3`,
      [query.status ?? null, query.limit, query.offset]
    );

    return reply.send({
      data: {
        reports: result.rows.map(mapReportRow)
      }
    });
  });

  app.get("/api/admin/moderation/reports/:reportId", async (request, reply) => {
    await getModeratorUser(request);
    const { reportId } = reportParamsSchema.parse(request.params);
    const result = await app.db.query<ReportAdminRow>(
      `${reportSelectSql("where reports.id = $1")}
       limit 1`,
      [reportId]
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(404, "NOT_FOUND", "Report not found.");
    }

    return reply.send({
      data: {
        report: mapReportRow(row)
      }
    });
  });

  app.patch("/api/admin/moderation/reports/:reportId", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { reportId } = reportParamsSchema.parse(request.params);
    const payload = reportResolutionSchema.parse(request.body);
    const currentReport = await app.db.query<ReportStatusRow>(
      `select
         id::text as id,
         status,
         target_type,
         target_user_id::text as target_user_id,
         conversation_id::text as conversation_id,
         message_id::text as message_id,
         post_id::text as post_id,
         media_object_id::text as media_object_id,
         profile_photo_url
       from reports
       where id = $1
       limit 1`,
      [reportId]
    );
    const current = currentReport.rows[0];

    if (!current) {
      throw new ApiError(404, "NOT_FOUND", "Report not found.");
    }

    const updatedReport = await app.db.query<{ id: string; status: string; updated_at: string | Date }>(
      `update reports
       set status = $2,
           updated_at = now()
       where id = $1
       returning id::text as id, status, updated_at`,
      [reportId, payload.status]
    );
    const updated = updatedReport.rows[0];

    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "Report not found.");
    }

    const audit = await createModerationAction(app, {
      actorUserId: moderator.userId,
      targetUserId: current.target_user_id,
      reportId,
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

    return reply.send({
      data: {
        report: {
          id: updated.id,
          status: updated.status,
          updatedAt: new Date(updated.updated_at).toISOString()
        },
        moderationAction: audit
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

    const targetLookup = await app.db.query<AccountStatusRow>(
      `select
         id::text as id,
         coalesce(account_status, 'active') as account_status,
         account_status_updated_at
       from app_users
       where id = $1
         and coalesce(account_status, 'active') <> 'deleted'
       limit 1`,
      [userId]
    );
    const target = targetLookup.rows[0];

    if (!target) {
      throw new ApiError(404, "NOT_FOUND", "User not found.");
    }

    const previousStatus = normalizeAccountStatus(target.account_status);
    const updatedAccount = await app.db.query<AccountStatusRow>(
      `update app_users
       set account_status = $2,
           account_status_updated_at = now()
       where id = $1
       returning
         id::text as id,
         account_status,
         account_status_updated_at`,
      [userId, payload.status]
    );
    const updated = updatedAccount.rows[0];

    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "User not found.");
    }

    const audit = await createModerationAction(app, {
      actorUserId: moderator.userId,
      targetUserId: userId,
      reportId: payload.reportId ?? null,
      action: actionForStatusChange(previousStatus, payload.status),
      reasonCode: payload.reasonCode,
      notes: payload.notes,
      metadata: {
        previousStatus,
        newStatus: payload.status
      }
    });

    return reply.send({
      data: {
        user: {
          id: updated.id,
          accountStatus: normalizeAccountStatus(updated.account_status),
          accountStatusUpdatedAt: new Date(updated.account_status_updated_at).toISOString()
        },
        moderationAction: audit
      }
    });
  });
}
