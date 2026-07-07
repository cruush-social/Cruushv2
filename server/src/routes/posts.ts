import type { FastifyInstance } from "fastify";
import { decryptTextContentOrFallback, encryptTextContent } from "../content-encryption.js";
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
  content_ciphertext?: string | null;
  content_nonce?: string | null;
  content_auth_tag?: string | null;
  content_key_version?: string | null;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
};

function mapPostRow(app: FastifyInstance, row: PostRow) {
  return {
    id: row.id,
    content: decryptTextContentOrFallback(app.config, "feed", {
      ciphertext: row.content_ciphertext ?? undefined,
      nonce: row.content_nonce ?? undefined,
      authTag: row.content_auth_tag ?? undefined,
      keyVersion: row.content_key_version ?? undefined
    }, row.content),
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
  p.content_ciphertext,
  p.content_nonce,
  p.content_auth_tag,
  p.content_key_version,
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
      data: result.rows.map((row) => mapPostRow(app, row))
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
    const encryptedContent = encryptTextContent(app.config, "feed", payload.content);

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
         providerParam: "$7",
         providerRequestIdParam: "$8",
         normalizedLabelsParam: "$9",
         policyDecisionParam: "$10",
         moderationStatusParam: "$11",
         flaggedReasonParam: "$12",
         moderationRawResultParam: "$13"
       })},
       inserted as (
         insert into posts (
           user_id,
           content,
           content_ciphertext,
           content_nonce,
           content_auth_tag,
           content_key_version,
           expires_in,
           expires_at
         )
         select
           eligible_user.id,
           '[encrypted]',
           $3,
           $4,
           $5,
           $6,
           $2,
           now() + case
             when $2 = '1h' then interval '1 hour'
             when $2 = '6h' then interval '6 hours'
             else interval '24 hours'
           end
         from eligible_user
         join moderation_review on true
         returning
           id,
           user_id,
           content,
           content_ciphertext,
           content_nonce,
           content_auth_tag,
           content_key_version,
           expires_in,
           expires_at,
           created_at
       )
       select
         i.id,
         i.user_id,
         i.content,
         i.content_ciphertext,
         i.content_nonce,
         i.content_auth_tag,
         i.content_key_version,
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
        payload.expiresIn,
        encryptedContent.ciphertext,
        encryptedContent.nonce,
        encryptedContent.authTag,
        encryptedContent.keyVersion,
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
      data: mapPostRow(app, row)
    });
  });
}
