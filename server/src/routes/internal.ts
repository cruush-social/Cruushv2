import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";

const internalUserParamsSchema = z.object({
  userId: z.uuid()
}).strict();

function assertInternalAccess(app: FastifyInstance, headerValue: string | string[] | undefined) {
  const configuredSecret = app.config.INTERNAL_API_SECRET ?? "";
  const providedSecret = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!configuredSecret || providedSecret !== configuredSecret) {
    throw new ApiError(403, "FORBIDDEN", "Internal moderation access is disabled.");
  }
}

export async function registerInternalRoutes(app: FastifyInstance) {
  app.get("/api/internal/users/:userId/trust", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);
    const { userId } = internalUserParamsSchema.parse(request.params);

    const [
      trustProfile,
      trustEvents,
      evidenceEvents,
      moderationHistory,
      featureRestrictions,
      suspensions
    ] = await Promise.all([
      app.db.query(
        `select
           user_id::text as user_id,
           trust_score,
           trust_level,
           report_weight,
           max_future_trust,
           is_suspended,
           created_at,
           updated_at
         from user_trust_profiles
         where user_id = $1`,
        [userId]
      ),
      app.db.query(
        `select
           id::text as id,
           event_type,
           value,
           decays,
           permanent,
           source,
           metadata,
           created_at
         from trust_events
         where user_id = $1
         order by created_at desc
         limit 100`,
        [userId]
      ),
      app.db.query(
        `select
           id::text as id,
           source_type,
           category,
           evidence_value,
           confidence,
           expires_at,
           metadata,
           created_at
         from evidence_events
         where target_user_id = $1
         order by created_at desc
         limit 100`,
        [userId]
      ),
      app.db.query(
        `select
           id::text as id,
           content_review_id::text as content_review_id,
           category,
           action,
           trust_impact,
           trust_cap_applied,
           source,
           reason_code,
           created_at
         from moderation_history
         where user_id = $1
         order by created_at desc
         limit 100`,
        [userId]
      ),
      app.db.query(
        `select
           id::text as id,
           feature,
           scope,
           reason_code,
           starts_at,
           ends_at,
           created_at
         from feature_restrictions
         where user_id = $1
         order by starts_at desc
         limit 100`,
        [userId]
      ),
      app.db.query(
        `select
           id::text as id,
           reason_code,
           starts_at,
           ends_at,
           permanent,
           created_at
         from suspensions
         where user_id = $1
         order by starts_at desc
         limit 100`,
        [userId]
      )
    ]);

    return reply.send({
      data: {
        trustProfile: trustProfile.rows[0] ?? null,
        trustEvents: trustEvents.rows,
        evidenceEvents: evidenceEvents.rows,
        moderationHistory: moderationHistory.rows,
        featureRestrictions: featureRestrictions.rows,
        suspensions: suspensions.rows
      }
    });
  });
}
