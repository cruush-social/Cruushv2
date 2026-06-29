import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import { approvedContentReviewCte, moderateTextOrReject } from "../moderation-service.js";
import { createPostPayloadSchema } from "../post-schema.js";
import { getAuthenticatedUserId } from "../request-auth.js";

type PostRow = {
  id: string;
  user_id: string;
  content: string;
  expires_in: "1h" | "6h" | "24h";
  expires_at: string | Date;
  created_at: string | Date;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
};

function mapPostRow(row: PostRow) {
  return {
    id: row.id,
    content: row.content,
    expiresIn: row.expires_in,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    distance: "Nearby",
    user: {
      id: row.user_id,
      name: row.display_name?.trim() || "Cruush user",
      pronouns: row.pronouns?.join(", ") ?? "",
      photo: row.photos?.[0] ?? null
    }
  };
}

const POST_COLUMNS = `
  p.id,
  p.user_id,
  p.content,
  p.expires_in,
  p.expires_at,
  p.created_at,
  pr.display_name,
  pr.pronouns,
  pr.photos
`;

export async function registerPostRoutes(app: FastifyInstance) {
  app.get("/api/posts", async (request, reply) => {
    await getAuthenticatedUserId(request);

    const result = await app.db.query<PostRow>(
      `select ${POST_COLUMNS}
       from posts p
       left join profiles pr on pr.id = p.user_id
       where p.expires_at > now()
       order by p.created_at desc
       limit 100`
    );

    return reply.send({
      data: result.rows.map(mapPostRow)
    });
  });

  app.post("/api/posts", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const payload = createPostPayloadSchema.parse(request.body);
    const moderation = await moderateTextOrReject(app, {
      userId,
      surface: "feed",
      text: payload.content
    });

    const result = await app.db.query<PostRow>(
      `with eligible_user as (
         select u.id
         from app_users u
         left join user_trust_profiles trust on trust.user_id = u.id
         where u.id = $1
           and coalesce(trust.is_suspended, false) = false
           and coalesce(trust.trust_score, 50) > 20
           and not exists (
             select 1
             from suspensions suspension
             where suspension.user_id = u.id
               and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())
           )
           and not exists (
             select 1
             from feature_restrictions restriction
             where restriction.user_id = u.id
               and restriction.feature = 'feed_posting'
               and (restriction.ends_at is null or restriction.ends_at > now())
           )
       ),
       ${approvedContentReviewCte({
         userIdParam: "$1",
         surface: "feed",
         contentType: "text",
         fromCte: "eligible_user",
         providerParam: "$4",
         providerRequestIdParam: "$5",
         normalizedLabelsParam: "$6",
         policyDecisionParam: "$7",
         moderationStatusParam: "$8",
         flaggedReasonParam: "$9",
         moderationRawResultParam: "$10"
       })},
       inserted as (
         insert into posts (user_id, content, expires_in, expires_at)
         select
           eligible_user.id,
           $2,
           $3,
           now() + case
             when $3 = '1h' then interval '1 hour'
             when $3 = '6h' then interval '6 hours'
             else interval '24 hours'
           end
         from eligible_user
         join moderation_review on true
         returning id, user_id, content, expires_in, expires_at, created_at
       )
       select
         i.id,
         i.user_id,
         i.content,
         i.expires_in,
         i.expires_at,
         i.created_at,
         pr.display_name,
         pr.pronouns,
         pr.photos
       from inserted i
       left join profiles pr on pr.id = i.user_id`,
      [
        userId,
        payload.content,
        payload.expiresIn,
        moderation.providerResult.provider,
        moderation.providerResult.provider_request_id,
        JSON.stringify(moderation.providerResult.labels),
        JSON.stringify(moderation.decision),
        "allowed",
        null,
        JSON.stringify(moderation.providerResult.raw_result ?? {})
      ]
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Feed posting is unavailable for this account.");
    }

    return reply.code(201).send({
      data: mapPostRow(row)
    });
  });
}
