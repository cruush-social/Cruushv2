import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hasPremiumDiscoveryFilters, requireCruushPlus } from "../billing.js";
import { decryptTextContentOrFallback, encryptTextContent } from "../content-encryption.js";
import { ApiError } from "../errors.js";
import { approvedContentReviewCte, moderateTextOrReject } from "../moderation-service.js";
import {
  createPostPayloadSchema,
  updateFeedSettingsPayloadSchema,
  type FeedLocationPinVisibility,
  type FeedPostAudience
} from "../post-schema.js";
import {
  CROWD_OPTIONS,
  createCrowdTokens,
  createSensitiveProfileToken,
  getSensitiveProfileTokenKeyVersion,
  normalizeCrowdOption
} from "../profile-sensitive.js";
import { normalizeSingleLineText } from "../input-schema.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { recordMeaningfulActivitySafely } from "../rewards-service.js";
import { getCruushEntitlement, getRelationshipPermissions } from "../match-relationships.js";
import { canStartDirectMessage } from "../cruush-match-settings.js";
import { handleFeedPhotoUpload } from "../feed-photo-upload.js";
import { removeOwnedNonPublicMediaAsset } from "../media-assets.js";

type PostRow = {
  id: string;
  user_id: string;
  content: string;
  expires_in: "1h" | "6h" | "24h" | "7d" | "never";
  expires_at: string | Date;
  created_at: string | Date;
  content_ciphertext?: string | null;
  content_nonce?: string | null;
  content_auth_tag?: string | null;
  content_key_version?: string | null;
  audience?: FeedPostAudience | null;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
  feed_photos?: Array<{
    id?: string;
    explicit?: boolean;
  }> | string | null;
  vibes?: string[] | null;
  scenes?: string[] | null;
  archetypes?: string[] | null;
  photo_explicit?: boolean | null;
  badges?: string[] | null;
  side_badges?: unknown;
  crowd_targets?: string[] | null;
  feed_location_pin_visibility?: FeedLocationPinVisibility | null;
  has_live_location?: boolean | null;
  has_shared_crowd?: boolean | null;
  distance_miles?: number | null;
  attending_launch_party?: boolean | null;
  travelling?: boolean | null;
  party_status?: {
    eventSlug?: string;
    label?: string;
  } | string | null;
  map_ping_id?: string | null;
  feed_tags?: string[] | null;
};

type FeedSettingsRow = {
  feed_location_pin_visibility: FeedLocationPinVisibility | null;
  feed_show_distance_labels: boolean | null;
  feed_post_expiry_default: PostRow["expires_in"] | null;
  feed_window_default: "1h" | "3h" | "6h" | "24h" | "7d" | null;
};

function formatCoarseDistance(miles: number) {
  if (!Number.isFinite(miles)) {
    return "Nearby";
  }

  if (miles < 1) {
    return "<1 mi";
  }

  if (miles < 3) {
    return "1-3 mi";
  }

  if (miles < 5) {
    return "3-5 mi";
  }

  if (miles < 10) {
    return "5-10 mi";
  }

  return "10-15 mi";
}

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

function topVibeTags(row: Pick<PostRow, "vibes" | "scenes" | "archetypes">) {
  return [...new Set([
    ...(row.vibes ?? []),
    ...(row.scenes ?? []),
    ...(row.archetypes ?? [])
  ].map((value) => value.trim()).filter(Boolean))].slice(0, 3);
}

function normalizeFeedPhotos(value: PostRow["feed_photos"]) {
  let photos = value;
  if (typeof photos === "string") {
    try {
      photos = JSON.parse(photos) as Exclude<PostRow["feed_photos"], string>;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(photos)) {
    return [];
  }

  return photos.flatMap((photo) => {
    if (!photo || typeof photo.id !== "string") {
      return [];
    }
    return [{
      id: photo.id,
      url: `/api/media/assets/${photo.id}/display`,
      thumbnailUrl: `/api/media/assets/${photo.id}/thumbnail`,
      explicit: photo.explicit === true
    }];
  });
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
  const vibeTags = topVibeTags(row);
  const [locationPinVisible, canMessage] = await Promise.all([
    canViewLocationPin(app, viewerUserId, row),
    viewerUserId === row.user_id
      ? false
      : canStartDirectMessage(app, viewerUserId, row.user_id).catch((error) => {
          app.log.warn({ err: error, viewerUserId, authorUserId: row.user_id }, "feed message permission check failed");
          return false;
        })
  ]);
  const photos = normalizeFeedPhotos(row.feed_photos);

  return {
    id: row.id,
    content: decryptTextContentOrFallback(app.config, "feed", {
      ciphertext: row.content_ciphertext ?? undefined,
      nonce: row.content_nonce ?? undefined,
      authTag: row.content_auth_tag ?? undefined,
      keyVersion: row.content_key_version ?? undefined
    }, row.content),
    expiresIn: row.expires_in,
    expiresAt: row.expires_in === "never" ? null : new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    audience: row.audience ?? (crowdTargets.length > 0 ? "crowd" : "public"),
    tags: row.feed_tags ?? [],
    distance: typeof row.distance_miles === "number"
      ? formatCoarseDistance(row.distance_miles)
      : "Nearby",
    ...(crowdTargets.length > 0 ? { crowdTargets } : {}),
    ...(locationPinVisible ? {
      locationPin: {
        userId: row.user_id,
        visibility: row.feed_location_pin_visibility ?? "mutuals"
      }
    } : {}),
    ...(partyStatus ? { partyStatus } : {}),
    ...(photos.length > 0 ? { photos } : {}),
    user: {
      id: row.user_id,
      name: row.display_name?.trim() || "cruush user",
      pronouns: row.pronouns?.join(", ") ?? "",
      photo: row.photos?.[0] ?? null,
      photoExplicit: row.photo_explicit === true,
      canMessage,
      ...(vibeTags.length > 0 ? { vibes: vibeTags } : {}),
      ...(row.attending_launch_party === true ? { attendingLaunchParty: true } : {}),
      ...(row.travelling === true ? { travelling: true } : {}),
      ...((row.badges?.length ?? 0) > 0 ? { badges: row.badges } : {}),
      ...(row.side_badges ? { sideBadges: row.side_badges } : {})
    }
  };
}

async function canViewPostAudience(app: FastifyInstance, viewerUserId: string, row: PostRow) {
  if (viewerUserId === row.user_id || row.audience !== "mutuals") {
    return true;
  }

  try {
    const relationship = await getRelationshipPermissions(app, viewerUserId, row.user_id);
    return relationship.isMutualCruush === true;
  } catch (error) {
    app.log.warn(
      { err: error, viewerUserId, authorUserId: row.user_id },
      "feed mutual audience relationship check failed"
    );
    return false;
  }
}

// DL Mode masks explicit avatars everywhere they render, so the feed needs the
// same explicit_classification the profile endpoints expose for the first photo.
function feedAuthorPhotoExplicitSelect(postAlias: string, profileAlias: string) {
  return `coalesce((
    select media.explicit_classification is distinct from 'non_explicit'
    from media_objects media
    where media.owner_user_id = ${postAlias}.user_id
      and media.public_url = ${profileAlias}.photos[1]
      and media.surface = 'profile_photo'
      and media.deleted_at is null
    limit 1
  ), true) as photo_explicit`;
}

function feedPhotoAttachmentSelect(postAlias: string) {
  return `coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', media.id::text,
        'explicit', media.explicit_classification = 'explicit'
      )
      order by attachment.position
    )
    from feed_post_attachments attachment
    join media_objects media on media.id = attachment.media_object_id
    where attachment.post_id = ${postAlias}.id
      and media.surface = 'feed_photo'
      and media.moderation_status = 'approved'
      and media.deleted_at is null
  ), '[]'::jsonb) as feed_photos`;
}

const POST_COLUMNS = `
  p.id,
  p.user_id,
  p.content,
  p.content_ciphertext,
  p.content_nonce,
  p.content_auth_tag,
  p.content_key_version,
  p.map_ping_id,
  p.audience,
  p.expires_in,
  p.expires_at,
  p.created_at,
  ${feedPhotoAttachmentSelect("p")},
  coalesce((
    select array_agg(post_tag.tag order by post_tag.position)
    from feed_post_tags post_tag
    where post_tag.post_id = p.id
  ), '{}'::text[]) as feed_tags,
  pr.display_name,
  pr.pronouns,
  pr.photos,
  pr.vibes,
  pr.scenes,
  pr.archetypes,
  (to_jsonb(pr)->'side_badges') as side_badges,
  ${feedAuthorPhotoExplicitSelect("p", "pr")},
  coalesce(pin_settings.feed_location_pin_visibility, 'mutuals') as feed_location_pin_visibility,
  case
    when $3::double precision is null or $4::double precision is null then null
    when coalesce(pr.fuzzy_lat, pr.lat) is null or coalesce(pr.fuzzy_lng, pr.lng) is null then null
    else 3958.8 * 2 * asin(sqrt(
      power(sin(radians((coalesce(pr.fuzzy_lat, pr.lat) - $3::double precision) / 2)), 2)
      + cos(radians($3::double precision)) * cos(radians(coalesce(pr.fuzzy_lat, pr.lat)))
        * power(sin(radians((coalesce(pr.fuzzy_lng, pr.lng) - $4::double precision) / 2)), 2)
    ))
  end as distance_miles,
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
  exists (
    select 1
    from event_memberships membership
    join launch_events event on event.id = membership.event_id
    where membership.user_id = p.user_id
      and event.slug = 'the-chocolate-factory-launch'
      and event.active = true
      and now() < event.chat_expires_at
  ) as attending_launch_party,
  exists (
    select 1
    from user_travel_pins active_travel_pin
    where active_travel_pin.user_id = p.user_id
      and active_travel_pin.set_at > now() - interval '24 hours'
  ) as travelling,
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

const feedQueryArrayField = z.preprocess((value) => {
  if (value === undefined) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => typeof item === "string"
    ? item.split(",").map(normalizeSingleLineText).filter(Boolean)
    : []);
}, z.array(z.string().min(1).max(120)).max(50).default([]));

const feedCrowdQueryArrayField = z.preprocess((value) => {
  if (value === undefined) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => typeof item === "string"
    ? item.split(",").map((part) => normalizeCrowdOption(part.trim()) ?? part.trim()).filter(Boolean)
    : []);
}, z.array(z.enum(CROWD_OPTIONS)).max(3).default([]));

const feedBooleanQueryFlag = z.preprocess((value) => {
  if (value === undefined) {
    return false;
  }

  const normalizedValue = Array.isArray(value) ? value[0] : value;
  return typeof normalizedValue === "string"
    ? ["1", "true", "yes", "on"].includes(normalizedValue.trim().toLowerCase())
    : normalizedValue === true;
}, z.boolean().default(false));

const feedPostQuerySchema = z.object({
  within: z.enum(["1h", "3h", "6h", "24h", "7d"]).default("7d"),
  // The open beta covers fifty miles around NYC, so the feed reaches that far too.
  distanceMiles: z.coerce.number().min(1).max(50).default(50),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  before: z.string().datetime().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  q: z.string().trim().min(1).max(320).optional(),
  mileHighClub: feedBooleanQueryFlag,
  minAge: z.coerce.number().int().min(18).max(99).optional(),
  maxAge: z.coerce.number().int().min(18).max(99).optional(),
  identities: feedQueryArrayField,
  presentations: feedQueryArrayField,
  lookingFor: feedQueryArrayField,
  timing: feedQueryArrayField,
  hosting: feedQueryArrayField,
  preferredSpots: feedQueryArrayField,
  vibes: feedQueryArrayField,
  crowds: feedCrowdQueryArrayField,
  hobbies: feedQueryArrayField,
  positions: feedQueryArrayField,
  roles: feedQueryArrayField,
  kinks: feedQueryArrayField,
  bodyTypes: feedQueryArrayField,
  sexuality: feedQueryArrayField,
  zodiac: feedQueryArrayField,
  substanceBoundaries: feedQueryArrayField,
  protectionBoundaries: feedQueryArrayField
}).strict().superRefine((query, context) => {
  if (query.minAge != null && query.maxAge != null && query.minAge > query.maxAge) {
    context.addIssue({
      code: "custom",
      message: "Minimum age cannot exceed maximum age.",
      path: ["minAge"]
    });
  }
});

function normalizeFilterTokenValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addFeedTextArrayFilter(where: string[], values: unknown[], column: string, selectedValues: string[]) {
  if (selectedValues.length === 0) {
    return;
  }

  values.push(selectedValues);
  where.push(`exists (
    select 1
    from unnest(coalesce(${column}, '{}'::text[])) as candidate(value)
    join unnest($${values.length}::text[]) as selected(value)
      on lower(btrim(candidate.value)) = lower(btrim(selected.value))
  )`);
}

function addFeedVibeFilter(where: string[], values: unknown[], selectedValues: string[]) {
  if (selectedValues.length === 0) {
    return;
  }

  values.push(selectedValues);
  where.push(`exists (
    select 1
    from (
      select unnest(coalesce(pr.vibes, '{}'::text[])) as value
      union all
      select unnest(coalesce(pr.scenes, '{}'::text[])) as value
      union all
      select unnest(coalesce(pr.archetypes, '{}'::text[])) as value
    ) as candidate
    join unnest($${values.length}::text[]) as selected(value)
      on lower(btrim(candidate.value)) = lower(btrim(selected.value))
  )`);
}

function addFeedSensitiveTokenFilter(
  app: FastifyInstance,
  where: string[],
  values: unknown[],
  tokenKind: "crowd" | "kink",
  selectedValues: string[]
) {
  if (selectedValues.length === 0) {
    return;
  }

  const tokenKeyVersion = getSensitiveProfileTokenKeyVersion(app.config);
  const tokenHashes = tokenKind === "crowd"
    ? [...new Set(selectedValues.flatMap((value) => createCrowdTokens(app.config, [value]).map((token) => token.token_hash)))]
    : selectedValues
      .map((value) => normalizeFilterTokenValue(value))
      .filter(Boolean)
      .map((value) => createSensitiveProfileToken(app.config, `${tokenKind}:${value}`, tokenKeyVersion).token_hash);

  if (tokenHashes.length === 0) {
    return;
  }

  values.push(tokenHashes);
  const hashesPlaceholder = `$${values.length}`;
  values.push(tokenKeyVersion);
  const versionPlaceholder = `$${values.length}`;
  where.push(`exists (
    select 1
    from profile_sensitive_tokens token
    where token.user_id = pr.id
      and token.token_hash = any(${hashesPlaceholder}::text[])
      and token.token_key_version = ${versionPlaceholder}
  )`);
}

/** A search can name up to ten tags at once; a post matching any of them counts. */
export const MAX_FEED_TAG_SEARCH_TERMS = 10;

export function parseFeedTagSearchTerms(searchQuery: string | undefined) {
  return [...new Set((searchQuery ?? '')
    .toLowerCase()
    .split(/[\s,]+/)
    .map((term) => term.replace(/^#+/, "").trim())
    .filter(Boolean))]
    .slice(0, MAX_FEED_TAG_SEARCH_TERMS);
}

function addFeedTagSearchFilter(
  where: string[],
  values: unknown[],
  searchQuery: string | undefined
) {
  const terms = parseFeedTagSearchTerms(searchQuery);
  if (terms.length === 0) {
    return;
  }

  const placeholders = terms.map((term) => {
    values.push(`%${term}%`);
    return `lower(search_tag.tag) like $${values.length}`;
  });

  where.push(`exists (
    select 1
    from feed_post_tags search_tag
    where search_tag.post_id = p.id
      and (${placeholders.join(" or ")})
  )`);
}

export async function registerPostRoutes(app: FastifyInstance) {
  app.post("/api/feed/photos", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    return handleFeedPhotoUpload(app, request, reply, userId);
  });

  app.get("/api/posts", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const query = feedPostQuerySchema.parse(request.query);
    if (hasPremiumDiscoveryFilters(query)) {
      await requireCruushPlus(app, userId, "Upgrade to cruush+ to use all seeking filters.");
    }

    const values: unknown[] = [
      userId,
      query.within,
      query.lat ?? null,
      query.lng ?? null,
      query.distanceMiles,
      query.before ?? null
    ];
    const where = [
      "p.expires_at > now()",
      "coalesce(author.account_status, 'active') <> 'deleted'",
      "lower(trim(coalesce(pr.display_name, ''))) <> 'user deleted profile'",
      `p.created_at >= now() - case
        when $2 = '1h' then interval '1 hour'
        when $2 = '3h' then interval '3 hours'
        when $2 = '6h' then interval '6 hours'
        when $2 = '7d' then interval '7 days'
        else interval '24 hours'
      end`,
      `(
        $3::double precision is null
        or $4::double precision is null
        or (
          coalesce(pr.fuzzy_lat, pr.lat) is not null
          and coalesce(pr.fuzzy_lng, pr.lng) is not null
          and 3958.8 * 2 * asin(sqrt(
            power(sin(radians((coalesce(pr.fuzzy_lat, pr.lat) - $3::double precision) / 2)), 2)
            + cos(radians($3::double precision)) * cos(radians(coalesce(pr.fuzzy_lat, pr.lat)))
              * power(sin(radians((coalesce(pr.fuzzy_lng, pr.lng) - $4::double precision) / 2)), 2)
          )) <= $5::double precision
        )
      )`,
      "($6::timestamptz is null or p.created_at < $6::timestamptz)",
      `not exists (
        select 1
        from user_blocks block
        where (block.blocker_user_id = $1 and block.blocked_user_id = p.user_id)
          or (block.blocker_user_id = p.user_id and block.blocked_user_id = $1)
      )`,
      `(
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
      )`
    ];

    if (query.mileHighClub) {
      where.push(`exists (
        select 1
        from user_travel_pins active_travel_pin
        where active_travel_pin.user_id = pr.id
          and active_travel_pin.set_at > now() - interval '24 hours'
      )`);
    }

    if (query.minAge != null) {
      values.push(query.minAge);
      where.push(`extract(year from current_date)::integer - pr.year_of_birth >= $${values.length}::integer`);
    }
    if (query.maxAge != null) {
      values.push(query.maxAge);
      where.push(`extract(year from current_date)::integer - pr.year_of_birth <= $${values.length}::integer`);
    }
    addFeedTagSearchFilter(where, values, query.q);
    addFeedTextArrayFilter(where, values, "pr.identities", query.identities);
    addFeedTextArrayFilter(where, values, "pr.presentation", query.presentations);
    addFeedTextArrayFilter(where, values, "pr.looking_for", query.lookingFor);
    addFeedTextArrayFilter(where, values, "pr.availability", query.timing);
    addFeedTextArrayFilter(where, values, "pr.hosting_travel", query.hosting);
    addFeedTextArrayFilter(where, values, "pr.preferred_spots", query.preferredSpots);
    addFeedVibeFilter(where, values, query.vibes);
    addFeedTextArrayFilter(where, values, "pr.hobbies", query.hobbies);
    addFeedTextArrayFilter(where, values, "pr.position", query.positions);
    addFeedTextArrayFilter(where, values, "pr.role", query.roles);
    addFeedTextArrayFilter(where, values, "pr.body_type", query.bodyTypes);
    addFeedTextArrayFilter(where, values, "pr.sexuality", query.sexuality);
    addFeedTextArrayFilter(where, values, "pr.zodiac", query.zodiac);
    addFeedTextArrayFilter(where, values, "pr.substance_boundaries", query.substanceBoundaries);
    addFeedTextArrayFilter(where, values, "pr.protection_boundaries", query.protectionBoundaries);
    addFeedSensitiveTokenFilter(app, where, values, "crowd", query.crowds);
    addFeedSensitiveTokenFilter(app, where, values, "kink", query.kinks);
    values.push(query.limit);
    const limitPlaceholder = `$${values.length}`;

    const result = await app.db.query<PostRow>(
      `select ${POST_COLUMNS}
       from posts p
       join app_users author on author.id = p.user_id
       join profiles pr on pr.id = p.user_id
       left join user_privacy_settings pin_settings on pin_settings.user_id = p.user_id
       where ${where.join("\n         and ")}
       order by p.created_at desc
       limit ${limitPlaceholder}`,
      values
    );

    const audienceVisibility = await Promise.all(
      result.rows.map(async (row) => ({ row, visible: await canViewPostAudience(app, userId, row) }))
    );
    const visibleRows = audienceVisibility.filter(({ visible }) => visible).map(({ row }) => row);

    return reply.send({
      data: await Promise.all(visibleRows.slice(0, query.limit).map((row) => mapPostRow(app, row, userId)))
    });
  });

  app.get("/api/feed/settings", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const row = (await app.db.query<FeedSettingsRow>(
      `select
         feed_location_pin_visibility,
         feed_show_distance_labels,
         feed_post_expiry_default,
         feed_window_default
       from user_privacy_settings
       where user_id = $1
       limit 1`,
      [userId]
    )).rows[0];

    return reply.send({
      data: {
        locationPinVisibility: row?.feed_location_pin_visibility ?? "mutuals",
        showDistanceLabels: row?.feed_show_distance_labels ?? true,
        postExpiryDefault: row?.feed_post_expiry_default ?? "never",
        feedWindow: row?.feed_window_default ?? "7d"
      }
    });
  });

  app.put("/api/feed/settings", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = updateFeedSettingsPayloadSchema.parse(request.body);
    if (payload.postExpiryDefault && payload.postExpiryDefault !== "never") {
      const entitlement = await getCruushEntitlement(app, userId);
      if (!entitlement.cruushPlus) {
        throw new ApiError(402, "CRUUSH_PLUS_REQUIRED", "Choosing a Feed timer is part of cruush+.");
      }
    }
    const row = (await app.db.query<FeedSettingsRow>(
      `insert into user_privacy_settings (
         user_id,
         feed_location_pin_visibility,
         feed_show_distance_labels,
         feed_post_expiry_default,
         feed_window_default
       )
       values ($1, $2, $3, coalesce($4::text, 'never'), coalesce($5::text, '7d'))
       on conflict (user_id) do update
       set feed_location_pin_visibility = excluded.feed_location_pin_visibility,
           feed_show_distance_labels = excluded.feed_show_distance_labels,
           feed_post_expiry_default = coalesce($4::text, user_privacy_settings.feed_post_expiry_default),
           feed_window_default = coalesce($5::text, user_privacy_settings.feed_window_default),
           updated_at = now()
       returning
         feed_location_pin_visibility,
         feed_show_distance_labels,
         feed_post_expiry_default,
         feed_window_default`,
      [
        userId,
        payload.locationPinVisibility,
        payload.showDistanceLabels,
        payload.postExpiryDefault ?? null,
        payload.feedWindow ?? null
      ]
    )).rows[0];

    return reply.send({
      data: {
        locationPinVisibility: row?.feed_location_pin_visibility ?? "mutuals",
        showDistanceLabels: row?.feed_show_distance_labels ?? true,
        postExpiryDefault: row?.feed_post_expiry_default ?? "never",
        feedWindow: row?.feed_window_default ?? "7d"
      }
    });
  });

  app.post("/api/posts", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = createPostPayloadSchema.parse(request.body);
    const entitlement = await getCruushEntitlement(app, userId);
    if (payload.audience === "crowd" && !entitlement.cruushPlus) {
      throw new ApiError(402, "CRUUSH_PLUS_REQUIRED", "Posting to a specific Crowd is part of cruush+.");
    }
    if (payload.expiresIn !== "never" && !entitlement.cruushPlus) {
      throw new ApiError(402, "CRUUSH_PLUS_REQUIRED", "Choosing a Feed timer is part of cruush+.");
    }
    if (payload.photoMediaIds.length > 0 && !entitlement.cruushPlus) {
      throw new ApiError(402, "CRUUSH_PLUS_REQUIRED", "Photo posts are part of cruush+.");
    }
    if (payload.tags.length > 0 && !entitlement.cruushPlus) {
      throw new ApiError(402, "CRUUSH_PLUS_REQUIRED", "Tagging a Feed post is part of cruush+.");
    }
    if (payload.photoMediaIds.length > 0) {
      const photoCount = (await app.db.query<{ count: number }>(
        `select count(*)::integer as count
         from media_objects media
         where media.id = any($2::uuid[])
           and media.owner_user_id = $1
           and media.surface = 'feed_photo'
           and media.moderation_status = 'approved'
           and media.deleted_at is null
           and not exists (
             select 1
             from feed_post_attachments attachment
             where attachment.media_object_id = media.id
           )`,
        [userId, payload.photoMediaIds]
      )).rows[0]?.count ?? 0;
      if (photoCount !== payload.photoMediaIds.length) {
        throw new ApiError(400, "VALIDATION_ERROR", "Choose up to three approved Feed photos that you uploaded.");
      }
    }
    const ownerFullAccess = entitlement.ownerFullAccess === true;
    const moderation = await moderateTextOrReject(app, {
      userId,
      surface: "feed",
      text: [payload.content, ...payload.tags.map((tag) => `#${tag}`)].join("\n"),
      persistAllowedReview: false
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
           and (
             select count(*)
             from media_objects media
             where media.id = any($18::uuid[])
               and media.owner_user_id = $1
               and media.surface = 'feed_photo'
               and media.moderation_status = 'approved'
               and media.deleted_at is null
               and not exists (
                 select 1
                 from feed_post_attachments attachment
                 where attachment.media_object_id = media.id
               )
           ) = cardinality($18::uuid[])
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
           audience,
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
           $17,
           $2,
           case
             when $2 = 'never' then 'infinity'::timestamptz
             else now() + case
               when $2 = '1h' then interval '1 hour'
               when $2 = '6h' then interval '6 hours'
               when $2 = '7d' then interval '7 days'
               else interval '24 hours'
             end
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
           audience,
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
       ), inserted_attachments as (
         insert into feed_post_attachments (post_id, media_object_id, position)
         select
           inserted.id,
           media.id,
           (requested.ordinality - 1)::smallint
         from inserted
         cross join unnest($18::uuid[]) with ordinality as requested(media_object_id, ordinality)
         join media_objects media
           on media.id = requested.media_object_id
          and media.owner_user_id = inserted.user_id
          and media.surface = 'feed_photo'
          and media.moderation_status = 'approved'
          and media.deleted_at is null
         returning post_id, media_object_id
       ), inserted_tags as (
         insert into feed_post_tags (post_id, tag, position)
         select
           inserted.id,
           requested.tag,
           (requested.ordinality - 1)::smallint
         from inserted
         cross join unnest($19::text[]) with ordinality as requested(tag, ordinality)
         returning post_id, tag
       )
       select
         i.id,
         i.user_id,
         i.content,
         i.content_ciphertext,
         i.content_nonce,
         i.content_auth_tag,
         i.content_key_version,
         i.audience,
         i.expires_in,
         i.expires_at,
         i.created_at,
         coalesce((
           select jsonb_agg(
             jsonb_build_object(
               'id', media.id::text,
               'explicit', media.explicit_classification = 'explicit'
             )
             order by requested.ordinality
           )
           from unnest($18::uuid[]) with ordinality as requested(media_object_id, ordinality)
           join media_objects media on media.id = requested.media_object_id
         ), '[]'::jsonb) as feed_photos,
         coalesce((
           select array_agg(inserted_tag.tag order by inserted_tag.position)
           from feed_post_tags inserted_tag
           where inserted_tag.post_id = i.id
         ), '{}'::text[]) as feed_tags,
         pr.display_name,
         pr.pronouns,
         pr.photos,
         pr.vibes,
         pr.scenes,
         pr.archetypes,
         ${feedAuthorPhotoExplicitSelect("i", "pr")},
         coalesce(pin_settings.feed_location_pin_visibility, 'mutuals') as feed_location_pin_visibility,
         exists (
           select 1
           from encrypted_location_envelopes location_envelopes
           where location_envelopes.subject_user_id = i.user_id
             and location_envelopes.expires_at_ms > (extract(epoch from now()) * 1000)::bigint
         ) as has_live_location,
         true as has_shared_crowd,
         coalesce((
           select array_agg(user_badges.badge_key order by user_badges.awarded_at asc)
           from user_badges
           where user_badges.user_id = i.user_id
         ), '{}'::text[]) as badges,
         exists (
           select 1
           from event_memberships membership
           join launch_events event on event.id = membership.event_id
           where membership.user_id = i.user_id
             and event.slug = 'the-chocolate-factory-launch'
             and event.active = true
             and now() < event.chat_expires_at
         ) as attending_launch_party,
         exists (
           select 1
           from user_travel_pins active_travel_pin
           where active_travel_pin.user_id = i.user_id
             and active_travel_pin.set_at > now() - interval '24 hours'
         ) as travelling,
         coalesce((
           select array_agg(distinct target.crowd order by target.crowd)
           from feed_post_crowd_targets target
           where target.post_id = i.id
         ), '{}'::text[]) as crowd_targets,
         (
           select jsonb_build_object(
             'eventSlug', event.slug,
             'label', 'at ' || event.venue_name
           )
           from event_memberships membership
           join launch_events event on event.id = membership.event_id
           where membership.user_id = i.user_id
             and event.slug = 'the-chocolate-factory-launch'
             and event.active = true
             and now() >= event.starts_at
             and now() < event.chat_expires_at
           order by membership.last_seen_at desc
           limit 1
         ) as party_status
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
        moderation.moderationStatus ?? "allowed",
        moderation.flaggedReason ?? null,
        JSON.stringify(moderation.providerResult.raw_result ?? {}),
        payload.crowdTargets,
        JSON.stringify(crowdTargetTokenRows),
        ownerFullAccess,
        payload.audience,
        payload.photoMediaIds,
        payload.tags
      ]
    );
    const row = result.rows[0];

    if (!row) {
      const eligibility = await app.db.query<{
        trust_suspended: boolean;
        account_suspended: boolean;
        low_trust: boolean;
        feature_restricted: boolean;
      }>(
        `select
           coalesce(trust.is_suspended, false) as trust_suspended,
           exists (
             select 1
             from suspensions suspension
             where suspension.user_id = $1
               and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())
           ) as account_suspended,
           coalesce(trust.trust_score, 50) <= 20 as low_trust,
           exists (
             select 1
             from feature_restrictions restriction
             where restriction.user_id = $1
               and restriction.feature = 'feed_posting'
               and (restriction.ends_at is null or restriction.ends_at > now())
           ) as feature_restricted
         from app_users user_row
         left join user_trust_profiles trust on trust.user_id = user_row.id
         where user_row.id = $1
         limit 1`,
        [userId]
      );
      const reason = eligibility.rows[0];

      if (reason?.trust_suspended || reason?.account_suspended) {
        throw new ApiError(403, "FEED_POSTING_SUSPENDED", "Feed posting is unavailable while this account is suspended.");
      }
      if (reason?.low_trust) {
        throw new ApiError(403, "FEED_POSTING_LOW_TRUST", "Feed posting is unavailable while this account is under trust review.");
      }
      if (reason?.feature_restricted) {
        throw new ApiError(403, "FEED_POSTING_RESTRICTED", "Feed posting is unavailable for this account.");
      }
      throw new ApiError(403, "FEED_POSTING_UNAVAILABLE", "Feed posting is unavailable for this account.");
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
    const attachmentIds = (await app.db.query<{ media_object_id: string }>(
      `select attachment.media_object_id::text
       from feed_post_attachments attachment
       join posts post on post.id = attachment.post_id
       where attachment.post_id = $2
         and post.user_id = $1`,
      [userId, postId]
    )).rows.map((row) => row.media_object_id);
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

    for (const assetId of attachmentIds) {
      try {
        await removeOwnedNonPublicMediaAsset(app, request, assetId, userId);
      } catch (error) {
        request.log.warn({ err: error, assetId, postId }, "deleted Feed post media cleanup failed");
      }
    }

    return reply.code(204).send();
  });
}
