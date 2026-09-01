import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { decryptTextContentOrFallback, encryptTextContent } from "../content-encryption.js";
import { runTransaction } from "../db.js";
import { ApiError } from "../errors.js";
import { listEncryptedRelationshipRecordsByParticipant } from "../encrypted-relationships.js";
import { databaseUuidSchema, uuidSchema } from "../input-schema.js";
import { getModeratorUser } from "../moderator-auth.js";
import { moderateTextOrReject } from "../moderation-service.js";
import {
  decryptPlaceSuggestion,
  encryptPlaceSuggestion,
  placeSuggestionSupporterToken
} from "../place-suggestion-privacy.js";
import {
  listPlacesQuerySchema,
  placeBoardPostSchema,
  placeCheckinSchema,
  placeRatingSchema,
  slugifyPlaceName,
  storedPlaceSuggestionSchema,
  submitPlaceSchema
} from "../places.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { distanceMiles, isWithinServiceArea, NYC_SERVICE_AREA } from "../service-area.js";

const placeParamsSchema = z.object({ placeId: databaseUuidSchema });
const messageParamsSchema = z.object({ placeId: databaseUuidSchema, messageId: uuidSchema });
const boardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(5000).default(0)
}).strict();
const reviewSchema = z.object({ status: z.enum(["published", "rejected", "archived"]) }).strict();
const adminListSchema = z.object({
  status: z.enum(["pending", "published", "rejected", "archived"]).default("pending"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(5000).default(0)
}).strict();

type PlaceRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  facility_type: string;
  status: string;
  source_kind: string;
  source_url: string | null;
  source_attribution: string | null;
  verified_at: string | Date | null;
  created_at: string | Date;
  tags: string[] | null;
  vibes: string[] | null;
  amenities: string[] | null;
  distance_miles: number | null;
  active_checkins: number;
  recent_activity_at: string | Date | null;
  rating_average: number | null;
  rating_count: number;
  viewer_rating?: number | null;
  suggestion_count?: number;
  auto_shortlisted_at?: string | Date | null;
  suggestion_ciphertext?: string | null;
  suggestion_nonce?: string | null;
  suggestion_auth_tag?: string | null;
  suggestion_key_version?: string | null;
};

type BoardRow = {
  id: string;
  user_id: string;
  content: string;
  content_ciphertext: string;
  content_nonce: string;
  content_auth_tag: string;
  content_key_version: string;
  created_at: string | Date;
  expires_at: string | Date | null;
  display_name: string | null;
  photo: string | null;
  photo_explicit: boolean;
  pronouns: string[] | null;
  vibes: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  badges: string[] | null;
  side_badges: unknown;
  travelling: boolean;
};

async function loadActiveMutualUserIds(app: FastifyInstance, viewerUserId: string) {
  const records = await listEncryptedRelationshipRecordsByParticipant(app, {
    participantUserId: viewerUserId,
    type: "mutual_cruush"
  });

  return new Set(records.flatMap((record) => {
    if (record.payload.actorUserId === viewerUserId) return [record.payload.targetUserId];
    if (record.payload.targetUserId === viewerUserId) return [record.payload.actorUserId];
    return [];
  }));
}

function topVibeTags(row: Pick<BoardRow, "vibes" | "scenes" | "archetypes">) {
  return [...new Set([...(row.vibes ?? []), ...(row.scenes ?? []), ...(row.archetypes ?? [])]
    .map((value) => value.trim()).filter(Boolean))].slice(0, 3);
}

function numberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function optionalExpiryIso(value: string | Date | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function mapPlace(row: PlaceRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    address: row.address,
    facilityType: row.facility_type,
    status: row.status,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    sourceAttribution: row.source_attribution,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    tags: row.tags ?? [],
    vibes: row.vibes ?? [],
    amenities: row.amenities ?? [],
    distanceMiles: numberValue(row.distance_miles),
    activeCheckins: Number(row.active_checkins ?? 0),
    recentActivityAt: row.recent_activity_at ? new Date(row.recent_activity_at).toISOString() : null,
    ratingAverage: numberValue(row.rating_average),
    ratingCount: Number(row.rating_count ?? 0),
    viewerRating: numberValue(row.viewer_rating),
    suggestionCount: Number(row.suggestion_count ?? 0),
    autoShortlistedAt: row.auto_shortlisted_at ? new Date(row.auto_shortlisted_at).toISOString() : null
  };
}

function readEncryptedSuggestion(app: FastifyInstance, row: PlaceRow) {
  if (!row.suggestion_ciphertext || !row.suggestion_nonce || !row.suggestion_auth_tag || !row.suggestion_key_version) {
    throw new ApiError(500, "SUGGESTION_UNAVAILABLE", "Encrypted place suggestion is unavailable.");
  }
  return storedPlaceSuggestionSchema.parse(decryptPlaceSuggestion(app.config, {
    ciphertext: row.suggestion_ciphertext,
    nonce: row.suggestion_nonce,
    authTag: row.suggestion_auth_tag,
    keyVersion: row.suggestion_key_version
  }));
}

function mapPlaceForModerator(app: FastifyInstance, row: PlaceRow) {
  if (!row.suggestion_ciphertext) return mapPlace(row);
  const suggestion = readEncryptedSuggestion(app, row);
  return {
    ...mapPlace(row),
    name: suggestion.name,
    description: suggestion.description,
    latitude: suggestion.latitude,
    longitude: suggestion.longitude,
    address: suggestion.address || null,
    facilityType: suggestion.facilityType,
    tags: suggestion.tags,
    vibes: suggestion.vibes,
    amenities: suggestion.amenities,
    sourceUrl: suggestion.sourceUrl ?? null
  };
}

function basePlaceSelect(viewerParam: string, latParam: string, lngParam: string) {
  return `
    p.id::text, p.slug, p.name, p.description, p.latitude, p.longitude, p.address,
    p.facility_type, p.status, p.source_kind, p.source_url, p.source_attribution,
    p.verified_at, p.created_at, p.suggestion_count, p.auto_shortlisted_at,
    p.suggestion_ciphertext, p.suggestion_nonce, p.suggestion_auth_tag, p.suggestion_key_version,
    coalesce((select array_agg(t.tag order by t.tag) from place_tags t where t.place_id = p.id), '{}') as tags,
    coalesce(
      (select array_agg(ranked.vibe order by ranked.report_count desc, ranked.last_reported_at desc, ranked.vibe)
       from (
         select report.vibe, count(distinct report.user_id)::int as report_count,
                max(report.reported_at) as last_reported_at
         from place_vibe_reports report
         where report.place_id = p.id
         group by report.vibe
         order by report_count desc, last_reported_at desc, report.vibe
         limit 2
       ) ranked),
      (select (array_agg(v.vibe order by v.vibe))[1:2] from place_vibes v where v.place_id = p.id),
      '{}'
    ) as vibes,
    coalesce((select array_agg(a.amenity order by a.amenity) from place_amenities a where a.place_id = p.id), '{}') as amenities,
    case when ${latParam}::double precision is null or ${lngParam}::double precision is null then null else
      3958.7613 * 2 * asin(sqrt(
        power(sin(radians((p.latitude - ${latParam}::double precision) / 2)), 2)
        + cos(radians(${latParam}::double precision)) * cos(radians(p.latitude))
          * power(sin(radians((p.longitude - ${lngParam}::double precision) / 2)), 2)
      )) end as distance_miles,
    (select count(*)::int from place_checkins c where c.place_id = p.id and c.expires_at > now()) as active_checkins,
    (select max(m.created_at) from place_board_messages m where m.place_id = p.id and (m.expires_at is null or m.expires_at > now())) as recent_activity_at,
    (select avg(r.stars)::float from place_ratings r where r.place_id = p.id and r.category = 'overall') as rating_average,
    (select count(*)::int from place_ratings r where r.place_id = p.id and r.category = 'overall') as rating_count,
    (select r.stars::int from place_ratings r where r.place_id = p.id and r.user_id = ${viewerParam}::uuid and r.category = 'overall') as viewer_rating`;
}

function placeOrder(sort: string) {
  if (sort === "active") return "active_checkins desc, recent_activity_at desc nulls last, distance_miles asc nulls last, id asc";
  if (sort === "recent") return "recent_activity_at desc nulls last, active_checkins desc, distance_miles asc nulls last, id asc";
  if (sort === "top_rated") return "(rating_count >= 3) desc, rating_average desc nulls last, rating_count desc, distance_miles asc nulls last, id asc";
  if (sort === "az") return "lower(name) asc, distance_miles asc nulls last, id asc";
  return "distance_miles asc nulls last, lower(name) asc, id asc";
}

async function requirePublishedPlace(app: FastifyInstance, placeId: string) {
  const row = (await app.db.query<{ id: string; latitude: number; longitude: number }>(
    `select id::text, latitude, longitude from places where id = $1 and status = 'published' limit 1`,
    [placeId]
  )).rows[0];
  if (!row) throw new ApiError(404, "NOT_FOUND", "Spot not found.");
  return row;
}

async function requireActivePlaceCheckin(app: FastifyInstance, userId: string, placeId: string) {
  const checkin = (await app.db.query<{ user_id: string }>(
    `select user_id::text
     from place_checkins
     where user_id = $1 and place_id = $2 and expires_at > now()
     limit 1`,
    [userId, placeId]
  )).rows[0];
  if (!checkin) throw new ApiError(403, "PLACE_CHECKIN_REQUIRED", "Check in to view this Spot board.");
  return checkin;
}

async function requireBoardPostingAllowed(app: FastifyInstance, userId: string) {
  const allowed = (await app.db.query<{ allowed: boolean }>(
    `select exists (
       select 1 from app_users u
       left join user_trust_profiles trust on trust.user_id = u.id
       where u.id = $1
         and coalesce(u.account_status, 'active') = 'active'
         and coalesce(trust.is_suspended, false) = false
         and coalesce(trust.trust_score, 50) > 20
         and not exists (
           select 1 from feature_restrictions restriction
           where restriction.user_id = u.id and restriction.feature = 'feed_posting'
             and (restriction.ends_at is null or restriction.ends_at > now())
         )
     ) as allowed`,
    [userId]
  )).rows[0]?.allowed;
  if (!allowed) throw new ApiError(403, "FEATURE_RESTRICTED", "Spot board posting is unavailable for this account.");
}

let lastPlaceCleanupAt = 0;

async function cleanupExpiredPlaceData(app: FastifyInstance) {
  const now = Date.now();
  if (now - lastPlaceCleanupAt < 15 * 60 * 1000) return;
  await runTransaction(app.db, async (db) => {
    await db.query(`delete from place_checkin_events where expires_at <= now()`);
    await db.query(`delete from place_activity_hourly where bucket_start < now() - interval '90 days'`);
  });
  lastPlaceCleanupAt = now;
}

export async function registerPlaceRoutes(app: FastifyInstance) {
  app.get("/api/places", async (request, reply) => {
    await cleanupExpiredPlaceData(app);
    const userId = await getAuthenticatedUserId(request);
    const query = listPlacesQuerySchema.parse(request.query);
    const lat = query.lat ?? NYC_SERVICE_AREA.center.lat;
    const lng = query.lng ?? NYC_SERVICE_AREA.center.lng;
    if (!isWithinServiceArea({ lat, lng })) throw new ApiError(400, "OUTSIDE_SERVICE_AREA", "Search from within the NYC service area.");
    const facilityTypes = query.facilityTypes.split(",").map((value) => value.trim()).filter(Boolean);
    const tags = query.tags.split(",").map((value) => value.trim()).filter(Boolean);
    const vibes = query.vibes.split(",").map((value) => value.trim()).filter(Boolean);
    const amenities = query.amenities.split(",").map((value) => value.trim()).filter(Boolean);
    const result = await app.db.query<PlaceRow>(
      `select * from (
         select ${basePlaceSelect("$1", "$2", "$3")}
         from places p
         where p.status = 'published'
           and ($4::text = '' or p.name ilike '%' || $4 || '%' or p.description ilike '%' || $4 || '%')
           and (cardinality($5::text[]) = 0 or p.facility_type = any($5::text[]))
           and (cardinality($6::text[]) = 0 or exists (select 1 from place_tags filter_tag where filter_tag.place_id = p.id and filter_tag.tag = any($6::text[])))
           and (cardinality($8::text[]) = 0 or exists (select 1 from place_amenities filter_amenity where filter_amenity.place_id = p.id and filter_amenity.amenity = any($8::text[])))
           -- Follow the settled map center as the viewport changes.
           and 3958.7613 * 2 * asin(sqrt(
             power(sin(radians((p.latitude - $2::double precision) / 2)), 2)
             + cos(radians($2::double precision)) * cos(radians(p.latitude))
               * power(sin(radians((p.longitude - $3::double precision) / 2)), 2)
           )) <= $9
           -- Keep the independent NYC service-area boundary in force.
           and 3958.7613 * 2 * asin(sqrt(
             power(sin(radians((p.latitude - $12::double precision) / 2)), 2)
             + cos(radians($12::double precision)) * cos(radians(p.latitude))
               * power(sin(radians((p.longitude - $13::double precision) / 2)), 2)
           )) <= $14
       ) listed
       where (cardinality($7::text[]) = 0 or vibes && $7::text[])
         and ($15::text = 'any'
         or ($15::text = 'active' and active_checkins > 0)
         or ($15::text = 'recent' and recent_activity_at is not null))
       order by ${placeOrder(query.sort)}
       limit $10 offset $11`,
      [
        userId,
        lat,
        lng,
        query.query,
        facilityTypes,
        tags,
        vibes,
        amenities,
        query.radiusMiles,
        query.limit,
        query.offset,
        NYC_SERVICE_AREA.center.lat,
        NYC_SERVICE_AREA.center.lng,
        NYC_SERVICE_AREA.radiusMiles,
        query.activity
      ]
    );
    return reply.send({ data: result.rows.map(mapPlace), page: { limit: query.limit, offset: query.offset, hasMore: result.rows.length === query.limit } });
  });

  app.get("/api/places/:placeId", async (request, reply) => {
    await cleanupExpiredPlaceData(app);
    const userId = await getAuthenticatedUserId(request);
    const { placeId } = placeParamsSchema.parse(request.params);
    const placeResult = await app.db.query<PlaceRow>(
      `select ${basePlaceSelect("$1", "null", "null")} from places p where p.id = $2 and p.status = 'published' limit 1`,
      [userId, placeId]
    );
    const place = placeResult.rows[0];
    if (!place) throw new ApiError(404, "NOT_FOUND", "Spot not found.");
    const [popularTimes, visiblePeople, ratingBreakdown, viewerCheckin, mutualUserIds] = await Promise.all([
      app.db.query<{ weekday: number; hour: number; count: number }>(
        `select extract(isodow from bucket_start)::int as weekday,
                extract(hour from bucket_start)::int as hour,
                sum(checkin_count)::int as count
         from place_activity_hourly
         where place_id = $1 and bucket_start >= now() - interval '90 days'
         group by weekday, hour
         having sum(checkin_count) >= 3
         order by weekday, hour`,
        [placeId]
      ),
      app.db.query<{
        id: string;
        name: string;
        photo: string | null;
        photo_explicit: boolean;
        pronouns: string[] | null;
        side_badges: unknown;
        badges: string[] | null;
        travelling: boolean;
      }>(
        `select u.id::text, coalesce(nullif(trim(pr.display_name), ''), 'cruush user') as name,
                pr.photos[1] as photo, pr.pronouns,
                coalesce((
                  select media.explicit_classification is distinct from 'non_explicit'
                  from media_objects media
                  where media.owner_user_id = c.user_id
                    and media.public_url = pr.photos[1]
                    and media.surface = 'profile_photo'
                    and media.deleted_at is null
                  limit 1
                ), true) as photo_explicit,
                (to_jsonb(pr)->'side_badges') as side_badges,
                coalesce((select array_agg(b.badge_key order by b.awarded_at asc)
                  from user_badges b where b.user_id = c.user_id), '{}'::text[]) as badges,
                exists (
                  select 1 from user_travel_pins travel
                  where travel.user_id = c.user_id
                    and travel.set_at > now() - interval '24 hours'
                ) as travelling
         from place_checkins c
         join app_users u on u.id = c.user_id
         join profiles pr on pr.id = c.user_id
         where c.place_id = $1 and c.visible = true and c.expires_at > now()
           and not exists (
             select 1 from user_blocks b
             where (b.blocker_user_id = $2 and b.blocked_user_id = c.user_id)
                or (b.blocker_user_id = c.user_id and b.blocked_user_id = $2)
           )
         order by c.checked_in_at desc limit 100`,
        [placeId, userId]
      ),
      app.db.query<{ category: string; average: number; count: number; viewer_rating: number | null }>(
        `select categories.category,
                avg(r.stars)::float as average,
                count(r.stars)::int as count,
                (max(r.stars) filter (where r.user_id = $2))::int as viewer_rating
         from unnest(array['overall', 'gender_inclusivity', 'lgbtq_friendliness', 'safety', 'accessibility', 'cleanliness']) as categories(category)
         left join place_ratings r on r.place_id = $1 and r.category = categories.category
         group by categories.category
         order by array_position(array['overall', 'gender_inclusivity', 'lgbtq_friendliness', 'safety', 'accessibility', 'cleanliness'], categories.category)`,
        [placeId, userId]
      ),
      app.db.query<{ visible: boolean; checked_in_at: string | Date; expires_at: string | Date }>(
        `select visible, checked_in_at, expires_at from place_checkins
         where place_id = $1 and user_id = $2 and expires_at > now() limit 1`,
        [placeId, userId]
      ),
      loadActiveMutualUserIds(app, userId)
    ]);
    return reply.send({
      data: {
        ...mapPlace(place),
        popularTimes: popularTimes.rows.map((row) => ({ weekday: Number(row.weekday), hour: Number(row.hour), count: Number(row.count) })),
        visiblePeople: visiblePeople.rows.map((person) => ({
          id: person.id,
          name: person.name,
          photo: person.photo,
          photoExplicit: person.photo_explicit !== false,
          pronouns: person.pronouns?.join(", ") ?? "",
          badges: person.badges ?? [],
          ...(person.side_badges ? { sideBadges: person.side_badges } : {}),
          mutual: mutualUserIds.has(person.id),
          travelling: person.travelling
        })),
        viewerCheckin: viewerCheckin.rows[0] ? {
          visible: viewerCheckin.rows[0].visible,
          checkedInAt: new Date(viewerCheckin.rows[0].checked_in_at).toISOString(),
          expiresAt: new Date(viewerCheckin.rows[0].expires_at).toISOString()
        } : null,
        ratingBreakdown: ratingBreakdown.rows.map((row) => ({
          category: row.category,
          average: numberValue(row.average),
          count: Number(row.count),
          viewerRating: numberValue(row.viewer_rating)
        }))
      }
    });
  });

  app.post("/api/places", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = submitPlaceSchema.parse(request.body);
    await app.rateLimiter.assert({
      key: `place-submit:${userId}`,
      max: 5,
      windowMs: 60 * 60 * 1000,
      message: "Too many place submissions. Try again later."
    });
    if (!isWithinServiceArea({ lat: payload.latitude, lng: payload.longitude })) {
      throw new ApiError(400, "OUTSIDE_SERVICE_AREA", "Spots must be within 100 miles of NYC.");
    }
    await moderateTextOrReject(app, { userId, surface: "feed", text: `${payload.name}\n${payload.description}` });
    const publishedDuplicate = (await app.db.query<{ id: string }>(
      `select id::text, status from places
       where status = 'published'
         and 3958.7613 * 2 * asin(sqrt(
           power(sin(radians((latitude - $1::double precision) / 2)), 2)
           + cos(radians($1::double precision)) * cos(radians(latitude))
             * power(sin(radians((longitude - $2::double precision) / 2)), 2)
         )) <= 0.0621371
       limit 1`,
      [payload.latitude, payload.longitude]
    )).rows[0];
    if (publishedDuplicate) {
      throw new ApiError(409, "DUPLICATE_PLACE", "A place already exists at this location.");
    }
    const pendingSuggestions = await app.db.query<PlaceRow>(
      `select ${basePlaceSelect("null", "null", "null")}
       from places p where p.status = 'pending' and p.suggestion_ciphertext is not null`
    );
    const duplicate = pendingSuggestions.rows.find((row) => {
      const suggestion = readEncryptedSuggestion(app, row);
      return distanceMiles(
        { lat: payload.latitude, lng: payload.longitude },
        { lat: suggestion.latitude, lng: suggestion.longitude }
      ) <= 0.0621371;
    });
    if (duplicate) {
      const supporterToken = placeSuggestionSupporterToken(app.config, duplicate.id, userId);
      const support = await runTransaction(app.db, async (db) => {
        const inserted = await db.query(
          `insert into place_suggestions (place_id, supporter_token) values ($1, $2)
           on conflict do nothing returning place_id`,
          [duplicate.id, supporterToken]
        );
        return (await db.query<{ suggestion_count: number; auto_shortlisted_at: string | Date | null }>(
          `update places set
             suggestion_count = (select count(*)::int from place_suggestions where place_id = $1),
             auto_shortlisted_at = case
               when (select count(*) from place_suggestions where place_id = $1) >= 3
                 then coalesce(auto_shortlisted_at, now())
               else auto_shortlisted_at
             end,
             updated_at = now()
           where id = $1 returning suggestion_count, auto_shortlisted_at`,
          [duplicate.id]
        )).rows[0];
      });
      return reply.send({
        data: {
          id: duplicate.id,
          status: "pending",
          suggestionCount: Number(support.suggestion_count),
          autoShortlisted: Boolean(support.auto_shortlisted_at)
        }
      });
    }
    const id = randomUUID();
    const supporterToken = placeSuggestionSupporterToken(app.config, id, userId);
    const encrypted = encryptPlaceSuggestion(app.config, payload);
    await runTransaction(app.db, async (db) => {
      await db.query(
        `insert into places (
           id, slug, name, description, latitude, longitude, address, facility_type,
           status, source_kind, source_url, submitted_by, suggestion_ciphertext,
           suggestion_nonce, suggestion_auth_tag, suggestion_key_version
         ) values (
           $1, $2, '[encrypted suggestion]', '', 0, 0, null, 'other',
           'pending', 'community', null, null, $3, $4, $5, $6
         )`,
        [id, `suggestion-${id}`, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, encrypted.keyVersion]
      );
      await db.query(`insert into place_suggestions (place_id, supporter_token) values ($1, $2)`, [id, supporterToken]);
    });
    return reply.code(201).send({ data: { id, status: "pending", suggestionCount: 1, autoShortlisted: false } });
  });

  app.get("/api/places/:placeId/board", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { placeId } = placeParamsSchema.parse(request.params);
    const query = boardQuerySchema.parse(request.query);
    await requirePublishedPlace(app, placeId);
    await requireActivePlaceCheckin(app, userId, placeId);
    const [result, mutualUserIds] = await Promise.all([
      app.db.query<BoardRow>(
        `select m.id::text, m.user_id::text, m.content, m.content_ciphertext, m.content_nonce,
              m.content_auth_tag, m.content_key_version, m.created_at, m.expires_at,
              coalesce(nullif(trim(pr.display_name), ''), 'cruush user') as display_name,
              pr.photos[1] as photo, pr.pronouns, pr.vibes, pr.scenes, pr.archetypes,
              coalesce((
                select media.explicit_classification is distinct from 'non_explicit'
                from media_objects media
                where media.owner_user_id = m.user_id
                  and media.public_url = pr.photos[1]
                  and media.surface = 'profile_photo'
                  and media.deleted_at is null
                limit 1
              ), true) as photo_explicit,
              coalesce((select array_agg(b.badge_key order by b.awarded_at asc) from user_badges b where b.user_id = m.user_id), '{}'::text[]) as badges,
              (to_jsonb(pr)->'side_badges') as side_badges,
              exists (
                select 1 from user_travel_pins travel
                where travel.user_id = m.user_id
                  and travel.set_at > now() - interval '24 hours'
              ) as travelling
       from place_board_messages m
       join profiles pr on pr.id = m.user_id
       where m.place_id = $1
         and not exists (
           select 1 from user_blocks b
           where (b.blocker_user_id = $2 and b.blocked_user_id = m.user_id)
              or (b.blocker_user_id = m.user_id and b.blocked_user_id = $2)
         )
         order by m.created_at desc limit $3 offset $4`,
        [placeId, userId, query.limit, query.offset]
      ),
      loadActiveMutualUserIds(app, userId)
    ]);
    return reply.send({
      data: result.rows.map((row) => ({
        id: row.id,
        content: decryptTextContentOrFallback(app.config, "feed", {
          ciphertext: row.content_ciphertext, nonce: row.content_nonce,
          authTag: row.content_auth_tag, keyVersion: row.content_key_version
        }, row.content),
        createdAt: new Date(row.created_at).toISOString(),
        expiresAt: optionalExpiryIso(row.expires_at),
        canDelete: row.user_id === userId,
        user: {
          id: row.user_id,
          name: row.display_name ?? "cruush user",
          pronouns: row.pronouns?.join(", ") ?? "",
          photo: row.photo,
          photoExplicit: row.photo_explicit !== false,
          badges: row.badges ?? [],
          ...(row.side_badges ? { sideBadges: row.side_badges } : {}),
          vibes: topVibeTags(row),
          mutual: mutualUserIds.has(row.user_id),
          travelling: row.travelling
        }
      })),
      page: { limit: query.limit, offset: query.offset, hasMore: result.rows.length === query.limit }
    });
  });

  app.post("/api/places/:placeId/board", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { placeId } = placeParamsSchema.parse(request.params);
    const payload = placeBoardPostSchema.parse(request.body);
    await requirePublishedPlace(app, placeId);
    await requireActivePlaceCheckin(app, userId, placeId);
    await app.rateLimiter.assert({
      key: `place-board-post:${userId}`,
      max: 10,
      windowMs: 60 * 1000,
      message: "Too many board messages. Try again later."
    });
    await requireBoardPostingAllowed(app, userId);
    await moderateTextOrReject(app, { userId, surface: "feed", text: payload.content, contentRef: { placeId } });
    const encrypted = encryptTextContent(app.config, "feed", payload.content);
    const boardPost = await app.db.query<{ id: string }>(
      `insert into place_board_messages (
         place_id, user_id, content, content_ciphertext, content_nonce, content_auth_tag, content_key_version,
         expires_at
       ) values ($1, $2, '[encrypted]', $3, $4, $5, $6, null)
       returning id::text`,
      [placeId, userId, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, encrypted.keyVersion]
    );
    return reply.code(201).send({ data: { placeId, boardPostId: boardPost.rows[0].id } });
  });

  app.delete("/api/places/:placeId/board/:messageId", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { placeId, messageId } = messageParamsSchema.parse(request.params);
    await requireActivePlaceCheckin(app, userId, placeId);
    const result = await app.db.query(`delete from place_board_messages where id = $1 and place_id = $2 and user_id = $3`, [messageId, placeId, userId]);
    if (!result.rowCount) throw new ApiError(404, "NOT_FOUND", "Board message not found.");
    return reply.code(204).send();
  });

  app.post("/api/places/:placeId/check-ins", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { placeId } = placeParamsSchema.parse(request.params);
    const payload = placeCheckinSchema.parse(request.body);
    await app.rateLimiter.assert({
      key: `place-checkin:${userId}`,
      max: 12,
      windowMs: 60 * 60 * 1000,
      message: "Too many check-in updates. Try again later."
    });
    const observedAt = new Date(payload.observedAt);
    if (Math.abs(Date.now() - observedAt.getTime()) > 2 * 60 * 1000) throw new ApiError(400, "STALE_LOCATION", "Update your location before checking in.");
    if (payload.accuracyMeters > 402.336) throw new ApiError(400, "LOCATION_TOO_IMPRECISE", "A more precise location is required to check in.");
    const place = await requirePublishedPlace(app, placeId);
    const distance = distanceMiles({ lat: payload.latitude, lng: payload.longitude }, { lat: Number(place.latitude), lng: Number(place.longitude) });
    if (distance > 0.25) throw new ApiError(403, "CHECKIN_TOO_FAR", "Move within 0.25 miles of this place to check in.");
    let legacyBoardPost: ReturnType<typeof encryptTextContent> | null = null;
    if (payload.content) {
      await app.rateLimiter.assert({
        key: `place-board-post:${userId}`,
        max: 10,
        windowMs: 60 * 1000,
        message: "Too many board messages. Try again later."
      });
      await requireBoardPostingAllowed(app, userId);
      await moderateTextOrReject(app, { userId, surface: "feed", text: payload.content, contentRef: { placeId } });
      legacyBoardPost = encryptTextContent(app.config, "feed", payload.content);
    }
    const result = await runTransaction(app.db, async (db) => {
      const bucketStart = new Date();
      bucketStart.setUTCMinutes(0, 0, 0);
      const event = await db.query(
        `insert into place_checkin_events (place_id, user_id, bucket_start)
         values ($1, $2, $3) on conflict do nothing returning place_id`,
        [placeId, userId, bucketStart]
      );
      const checkin = await db.query<{ expires_at: Date }>(
        `insert into place_checkins (user_id, place_id, visible, checked_in_at, expires_at)
         values ($1, $2, $3, now(), now() + ($4::int * interval '1 hour'))
         on conflict (user_id) do update set place_id = excluded.place_id, visible = excluded.visible,
           checked_in_at = excluded.checked_in_at, expires_at = excluded.expires_at
         returning expires_at`,
        [userId, placeId, payload.visible, payload.durationHours]
      );
      if (payload.vibes.length > 0) {
        await db.query(`delete from place_vibe_reports where place_id = $1 and user_id = $2`, [placeId, userId]);
        for (const vibe of [...new Set(payload.vibes)]) {
          await db.query(
            `insert into place_vibe_reports (place_id, user_id, vibe, reported_at)
             values ($1, $2, $3, now())`,
            [placeId, userId, vibe]
          );
        }
      }
      let boardPostId: string | null = null;
      if (legacyBoardPost) {
        const boardPost = await db.query<{ id: string }>(
          `insert into place_board_messages (
             place_id, user_id, content, content_ciphertext, content_nonce, content_auth_tag, content_key_version,
             expires_at
           ) values ($1, $2, '[encrypted]', $3, $4, $5, $6, null)
           returning id::text`,
          [
            placeId,
            userId,
            legacyBoardPost.ciphertext,
            legacyBoardPost.nonce,
            legacyBoardPost.authTag,
            legacyBoardPost.keyVersion
          ]
        );
        boardPostId = boardPost.rows[0].id;
      }
      if (event.rowCount) {
        await db.query(
          `insert into place_activity_hourly (place_id, bucket_start, checkin_count)
           values ($1, $2, 1)
           on conflict (place_id, bucket_start) do update set checkin_count = place_activity_hourly.checkin_count + 1`,
          [placeId, bucketStart]
        );
      }
      await db.query(`delete from place_checkin_events where expires_at <= now()`);
      await db.query(`delete from place_activity_hourly where bucket_start < now() - interval '90 days'`);
      return {
        boardPostId,
        expiresAt: new Date(checkin.rows[0].expires_at).toISOString()
      };
    });
    return reply.code(201).send({ data: { placeId, visible: payload.visible, ...result } });
  });

  app.delete("/api/places/:placeId/check-ins/me", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { placeId } = placeParamsSchema.parse(request.params);
    await app.db.query(`delete from place_checkins where user_id = $1 and place_id = $2`, [userId, placeId]);
    return reply.code(204).send();
  });

  app.put("/api/places/:placeId/rating", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { placeId } = placeParamsSchema.parse(request.params);
    const payload = placeRatingSchema.parse(request.body);
    await app.rateLimiter.assert({
      key: `place-rating:${userId}`,
      max: 30,
      windowMs: 60 * 60 * 1000,
      message: "Too many rating updates. Try again later."
    });
    await requirePublishedPlace(app, placeId);
    await app.db.query(
      `insert into place_ratings (place_id, user_id, category, stars) values ($1, $2, $3, $4)
       on conflict (place_id, user_id, category) do update set stars = excluded.stars, updated_at = now()`,
      [placeId, userId, payload.category, payload.stars]
    );
    return reply.send({ data: { placeId, category: payload.category, stars: payload.stars } });
  });

  app.delete("/api/places/:placeId/rating", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { placeId } = placeParamsSchema.parse(request.params);
    await app.db.query(`delete from place_ratings where place_id = $1 and user_id = $2`, [placeId, userId]);
    return reply.code(204).send();
  });

  app.get("/api/admin/places", async (request, reply) => {
    await getModeratorUser(request);
    const query = adminListSchema.parse(request.query);
    const result = await app.db.query<PlaceRow>(
      `select ${basePlaceSelect("null", "null", "null")}
       from places p where p.status = $1
       order by p.auto_shortlisted_at desc nulls last, p.suggestion_count desc, p.created_at asc
       limit $2 offset $3`,
      [query.status, query.limit, query.offset]
    );
    return reply.send({
      data: result.rows.map((row) => mapPlaceForModerator(app, row)),
      page: { limit: query.limit, offset: query.offset, hasMore: result.rows.length === query.limit }
    });
  });

  app.patch("/api/admin/places/:placeId", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { placeId } = placeParamsSchema.parse(request.params);
    const payload = reviewSchema.parse(request.body);
    const place = (await app.db.query<PlaceRow>(
      `select ${basePlaceSelect("null", "null", "null")} from places p where p.id = $1 limit 1`,
      [placeId]
    )).rows[0];
    if (!place) throw new ApiError(404, "NOT_FOUND", "Spot not found.");
    if (payload.status === "published" && place.suggestion_ciphertext) {
      const suggestion = readEncryptedSuggestion(app, place);
      if (!isWithinServiceArea({ lat: suggestion.latitude, lng: suggestion.longitude })) {
        throw new ApiError(400, "OUTSIDE_SERVICE_AREA", "Spots must be within 100 miles of NYC.");
      }
      await runTransaction(app.db, async (db) => {
        await db.query(
          `update places set
             slug = $1, name = $2, description = $3, latitude = $4, longitude = $5,
             address = nullif($6, ''), facility_type = $7, source_url = $8,
             source_attribution = 'Anonymous community suggestion', submitted_by = null,
             status = 'published', reviewed_by = $9, reviewed_at = now(), verified_at = now(),
             suggestion_ciphertext = null, suggestion_nonce = null,
             suggestion_auth_tag = null, suggestion_key_version = null, updated_at = now()
           where id = $10`,
          [
            `${slugifyPlaceName(suggestion.name)}-${placeId.slice(0, 8)}`,
            suggestion.name,
            suggestion.description,
            suggestion.latitude,
            suggestion.longitude,
            suggestion.address,
            suggestion.facilityType,
            suggestion.sourceUrl ?? null,
            moderator.userId,
            placeId
          ]
        );
        await db.query(`delete from place_tags where place_id = $1`, [placeId]);
        for (const tag of [...new Set(suggestion.tags)]) {
          await db.query(`insert into place_tags (place_id, tag) values ($1, $2)`, [placeId, tag]);
        }
        await db.query(`delete from place_vibes where place_id = $1`, [placeId]);
        for (const vibe of [...new Set(suggestion.vibes)]) {
          await db.query(`insert into place_vibes (place_id, vibe) values ($1, $2)`, [placeId, vibe]);
        }
        await db.query(`delete from place_amenities where place_id = $1`, [placeId]);
        for (const amenity of [...new Set(suggestion.amenities)]) {
          await db.query(`insert into place_amenities (place_id, amenity) values ($1, $2)`, [placeId, amenity]);
        }
      });
    } else {
      await app.db.query(
        `update places set status = $1, reviewed_by = $2, reviewed_at = now(), updated_at = now()
         where id = $3`,
        [payload.status, moderator.userId, placeId]
      );
    }
    return reply.send({ data: { id: placeId, status: payload.status } });
  });
}
