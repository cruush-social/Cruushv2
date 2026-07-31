import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireCruushPlus } from "../billing.js";
import { decryptTextContentOrFallback, encryptTextContent } from "../content-encryption.js";
import { ApiError } from "../errors.js";
import { approvedContentReviewCte, moderateTextOrReject } from "../moderation-service.js";
import { createPostPayloadSchema, updateFeedSettingsPayloadSchema, type FeedLocationPinVisibility } from "../post-schema.js";
import { createCrowdTokens } from "../profile-sensitive.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { recordMeaningfulActivitySafely } from "../rewards-service.js";
import { getRelationshipPermissions } from "../match-relationships.js";
import { userHasOwnerFullAccess } from "../owner-access.js";

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
  badges?: string[] | null;
  crowd_targets?: string[] | null;
  feed_location_pin_visibility?: FeedLocationPinVisibility | null;
  has_live_location?: boolean | null;
  has_shared_crowd?: boolean | null;
  party_status?: {
    eventSlug?: string;
    label?: string;
  } | string | null;
};

type FeedSettingsRow = {
  feed_location_pin_visibility: FeedLocationPinVisibility | null;
};

function normalizePartyStatus(value: PostRow["party_status"]) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as PostRow["party_status"];
      return normalizePartyStatus(parsed);
    } catch {
      return null;
    }
  }

  if (typeof value.eventSlug !== "string" || typeof value.label !== "string") {
    return null;
  }

  return {
    eventSlug: value.eventSlug,
    label: value.label
  };
}

async function canViewLocationPin(app: FastifyInstance, viewerUserId: string, row: PostRow) {
  const visibility = row.feed_location_pin_visibility ?? "mutuals";

  if (visibility === "off" || row.has_live_location !== true) {
    return false;
  }

  if (viewerUserId === row.user_id || visibility === "public") {
    return true;
  }

  if (visibility === "same_crowd") {
    return row.has_shared_crowd === true;
  }

  try {
    const relationship = await getRelationshipPermissions(app, viewerUserId, row.user_id);
    return relationship.isMutualCruush === true;
  } catch (error) {
    app.log.warn({ err: error, viewerUserId, authorUserId: row.user_id }, "feed post location pin relationship check failed");
    return false;
  }
}

async function mapPostRow(app: FastifyInstance, row: PostRow, viewerUserId: string) {
  const partyStatus = normalizePartyStatus(row.party_status);
  const crowdTargets = row.crowd_targets ?? [];
  const locationPinVisible = await canViewLocationPin(app, viewerUserId, row);

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
    ...(crowdTargets.length > 0 ? { crowdTargets } : {}),
    ...(locationPinVisible ? {
      locationPin: {
        userId: row.user_id,
        visibility: row.feed_location_pin_visibility ?? "mutuals"
      }
    } : {}),
    ...(partyStatus ? { partyStatus } : {}),
    user: {
      id: row.user_id,
      name: row.display_name?.trim() || "cruush user",
      pronouns: row.pronouns?.join(", ") ?? "",
      photo: row.photos?.[0] ?? null,
      ...((row.badges?.length ?? 0) > 0 ? { badges: row.badges } : {})
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
  pr.photos,
  coalesce(pin_settings.feed_location_pin_visibility, 'mutuals') as feed_location_pin_visibility,
  exists (
    select 1
    from encrypted_location_envelopes location_envelopes
    where location_envelopes.subject_user_id = p.user_id
      and location_envelopes.expires_at_ms > (extract(epoch from now()) * 1000)::bigint
  ) as has_live_location,
  exists (
    select 1
    from profile_sensitive_tokens viewer_crowd_token
    join profile_sensitive_tokens author_crowd_token
      on author_crowd_token.token_hash = viewer_crowd_token.token_hash
     and author_crowd_token.token_key_version = viewer_crowd_token.token_key_version
    where viewer_crowd_token.user_id = $1
      and author_crowd_token.user_id = p.user_id
  ) as has_shared_crowd,
  coalesce((
    select array_agg(user_badges.badge_key order by user_badges.awarded_at asc)
    from user_badges
    where user_badges.user_id = p.user_id
  ), '{}'::text[]) as badges,
  coalesce((
    select array_agg(distinct target.crowd order by target.crowd)
    from feed_post_crowd_targets target
    where target.post_id = p.id
  ), '{}'::text[]) as crowd_targets,
  (
    select jsonb_build_object(
      'eventSlug', event.slug,
      'label', 'at ' || event.venue_name
    )
    from event_memberships membership
    join launch_events event on event.id = membership.event_id
    where membership.user_id = p.user_id
      and event.slug = 'the-chocolate-factory-launch'
      and event.active = true
      and now() >= event.starts_at
      and now() < event.chat_expires_at
    order by membership.last_seen_at desc
    limit 1
  ) as party_status
`;

const postParamsSchema = z.object({
  postId: z.uuid()
});

export async function registerPostRoutes(app: FastifyInstance) {
  app.get("/api/posts", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    const result = await app.db.query<PostRow>(
      `select ${POST_COLUMNS}
       from posts p
       left join profiles pr on pr.id = p.user_id
       left join user_privacy_settings pin_settings on pin_settings.user_id = p.user_id
       where p.expires_at > now()
         and not exists (
           select 1
           from user_blocks block
         where (block.blocker_user_id = $1 and block.blocked_user_id = p.user_id)
             or (block.blocker_user_id = p.user_id and block.blocked_user_id = $1)
         )
         and (
           not exists (
             select 1
             from feed_post_crowd_targets target
             where target.post_id = p.id
           )
           or exists (
             select 1
             from feed_post_crowd_targets target
             join profile_sensitive_tokens viewer_crowd_token
               on viewer_crowd_token.user_id = $1
              and viewer_crowd_token.token_hash = target.token_hash
              and viewer_crowd_token.token_key_version = target.token_key_version
             where target.post_id = p.id
           )
         )
       order by p.created_at desc
       limit 100`,
      [userId]
    );

    return reply.send({
      data: await Promise.all(result.rows.map((row) => mapPostRow(app, row, userId)))
    });
  });

  app.get("/api/feed/settings", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const row = (await app.db.query<FeedSettingsRow>(
      `select feed_location_pin_visibility
       from user_privacy_settings
       where user_id = $1
       limit 1`,
      [userId]
    )).rows[0];

    return reply.send({
      data: {
        locationPinVisibility: row?.feed_location_pin_visibility ?? "mutuals"
      }
    });
  });

  app.put("/api/feed/settings", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = updateFeedSettingsPayloadSchema.parse(request.body);
    const row = (await app.db.query<FeedSettingsRow>(
      `insert into user_privacy_settings (
         user_id,
         feed_location_pin_visibility
       )
       values ($1, $2)
       on conflict (user_id) do update
       set feed_location_pin_visibility = excluded.feed_location_pin_visibility,
           updated_at = now()
       returning feed_location_pin_visibility`,
      [userId, payload.locationPinVisibility]
    )).rows[0];

    return reply.send({
      data: {
        locationPinVisibility: row?.feed_location_pin_visibility ?? "mutuals"
      }
    });
  });

  app.post("/api/posts", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = createPostPayloadSchema.parse(request.body);
    await requireCruushPlus(app, userId, "Upgrade to cruush+ to post on the local feed.");
    const ownerFullAccess = await userHasOwnerFullAccess(app, userId);
    const moderation = await moderateTextOrReject(app, {
      userId,
      surface: "feed",
      text: payload.content
    });
    const encryptedContent = encryptTextContent(app.config, "feed", payload.content);
    const crowdTargetTokenRows = payload.crowdTargets.flatMap((crowd) => createCrowdTokens(app.config, [crowd]).map((token) => ({
      crowd,
      token_hash: token.token_hash,
      token_key_version: token.token_key_version
    })));

    const result = await app.db.query<PostRow>(
      `with eligible_user as (
         select u.id
         from app_users u
         left join user_trust_profiles trust on trust.user_id = u.id
         where u.id = $1
           and (
             $16::boolean
             or (
               coalesce(trust.is_suspended, false) = false
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
             )
           )
           and not exists (
             select requested.crowd
             from unnest($14::text[]) as requested(crowd)
             where not exists (
               select 1
               from jsonb_to_recordset($15::jsonb) as token(crowd text, token_hash text, token_key_version text)
               join profile_sensitive_tokens author_crowd_token
                 on author_crowd_token.user_id = $1
                and author_crowd_token.token_hash = token.token_hash
                and author_crowd_token.token_key_version = token.token_key_version
               where token.crowd = requested.crowd
             )
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
       , inserted_targets as (
         insert into feed_post_crowd_targets (
           post_id,
           crowd,
           token_hash,
           token_key_version
         )
         select
           inserted.id,
           target.crowd,
           target.token_hash,
           target.token_key_version
         from inserted
         join jsonb_to_recordset($15::jsonb) as target(crowd text, token_hash text, token_key_version text) on true
         on conflict do nothing
         returning post_id, crowd
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
         pr.photos,
         coalesce(pin_settings.feed_location_pin_visibility, 'mutuals') as feed_location_pin_visibility,
         exists (
           select 1
           from encrypted_location_envelopes location_envelopes
           where location_envelopes.subject_user_id = i.user_id
             and location_envelopes.expires_at_ms > (extract(epoch from now()) * 1000)::bigint
         ) as has_live_location,
         true as has_shared_crowd,
         coalesce((
           select array_agg(distinct target.crowd order by target.crowd)
           from feed_post_crowd_targets target
           where target.post_id = i.id
         ), '{}'::text[]) as crowd_targets
       from inserted i
       left join profiles pr on pr.id = i.user_id
       left join user_privacy_settings pin_settings on pin_settings.user_id = i.user_id`,
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
        JSON.stringify(moderation.providerResult.raw_result ?? {}),
        payload.crowdTargets,
        JSON.stringify(crowdTargetTokenRows),
        ownerFullAccess
      ]
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Feed posting is unavailable for this account.");
    }

    await recordMeaningfulActivitySafely(app, {
      userId,
      activityType: "post",
      sourceEventId: row.id
    });

    return reply.code(201).send({
      data: await mapPostRow(app, row, userId)
    });
  });

  app.delete("/api/posts/:postId", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { postId } = postParamsSchema.parse(request.params);
    const result = await app.db.query<{ id: string }>(
      `delete from posts
       where user_id = $1
         and id = $2
       returning id`,
      [userId, postId]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Feed post not found.");
    }

    return reply.code(204).send();
  });
}
