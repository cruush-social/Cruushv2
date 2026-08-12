import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { hasPremiumDiscoveryFilters, requireCruushPlus } from "../billing.js";
import { decryptTextContentOrFallback } from "../content-encryption.js";
import {
  formatDistanceMiles,
  formatLastActiveFromDate,
  formatLastActiveFromMinutes,
  getDiscoveryCoordinates
} from "../discovery-users.js";
import {
  CROWD_OPTIONS,
  createCrowdTokens,
  createSensitiveProfileToken,
  decryptProfileVisibility,
  decryptSensitiveProfile,
  getSensitiveProfileTokenKeyVersion,
  normalizeCrowdOption
} from "../profile-sensitive.js";
import {
  canSubjectViewProfile,
  type VisibilityCoordinates,
  type VisibilitySubjectProfile
} from "../profile-visibility.js";
import { getAuthenticatedUserId } from "../request-auth.js";
import { normalizeSingleLineText } from "../input-schema.js";
import { getRelationshipPermissions } from "../match-relationships.js";
import { canStartDirectMessage } from "../cruush-match-settings.js";
import { loadBlockedRelationshipUserIds } from "../user-blocks.js";
import { DEFAULT_MAP_PRESENCE_DAYS } from "../map-presence.js";
import { DEVELOPMENT_ADMIN_EMAIL } from "../development-admin.js";
import { isWithinBetaLaunchArea } from "../beta-access.js";
import {
  DEFAULT_GHOST_RADIUS_METERS,
  createCoarseIndexTokens,
  buildDefaultVisibilityPolicy,
  formatDistanceLabel,
  loadLocationEnvelopes,
  loadVisibilityPolicy,
  locationPayloadToCoordinates,
  makeDisplayLocationToken,
  type DisplayMode,
  type LocationPayload
} from "../location-privacy.js";

type DiscoveryProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  signal: string | null;
  year_of_birth: number | null;
  pronouns: string[] | null;
  looking_for: string[] | null;
  vibes: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  position: string[] | null;
  role: string[] | null;
  hosting_travel: string[] | null;
  photos: string[] | null;
  primary_photo_explicit?: boolean | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  body_type: string[] | null;
  availability: string[] | null;
  hobbies: string[] | null;
  substance_boundaries: string[] | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
  profile_visibility_ciphertext: string | null;
  profile_visibility_nonce: string | null;
  profile_visibility_auth_tag: string | null;
  profile_visibility_key_version: string | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  location_updated_at?: string | Date | null;
  updated_at: string | Date;
  badges?: string[] | null;
  latest_feed_post_content: string | null;
  latest_feed_post_content_ciphertext: string | null;
  latest_feed_post_content_nonce: string | null;
  latest_feed_post_content_auth_tag: string | null;
  latest_feed_post_content_key_version: string | null;
  latest_feed_location_pin_visibility: "off" | "mutuals" | "same_crowd" | "public" | null;
  latest_feed_has_shared_crowd: boolean | null;
  has_shared_crowd: boolean | null;
};

const CODEVELOPER_NYC_EMAIL = "codeveloper-nyc@cruush.local";
const NPC_GHOST_DEMO_EMAILS = new Set([
  DEVELOPMENT_ADMIN_EMAIL,
  CODEVELOPER_NYC_EMAIL
]);

type DiscoveryViewerRow = Omit<DiscoveryProfileRow, "id" | "email" | "display_name" | "photos" | "updated_at">;

type DiscoveryToolUserRow = {
  email: string | null;
};

type LegacyDiscoveryProfileRow = {
  id: string;
  display_name: string | null;
  age: number | null;
  pronouns: string | null;
  looking_for: unknown;
  legacy_vibe_tags: unknown;
  primary_photo_url: string | null;
  last_active: string | Date | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
};

const queryArrayField = z.preprocess((value) => {
  if (value === undefined) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];

  return values.flatMap((item) => typeof item === "string"
    ? item.split(",").map(normalizeSingleLineText).filter(Boolean)
    : []);
}, z.array(z.string().min(1).max(120)).max(50).default([]));

const crowdQueryArrayField = z.preprocess((value) => {
  if (value === undefined) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];

  return values.flatMap((item) => typeof item === "string"
    ? item.split(",").map((part) => {
      const crowd = part.trim();
      return normalizeCrowdOption(crowd) ?? crowd;
    }).filter(Boolean)
    : []);
}, z.array(z.enum(CROWD_OPTIONS)).max(3).default([]));

const booleanQueryFlag = z.preprocess((value) => {
  if (value === undefined) {
    return false;
  }

  const normalizedValue = Array.isArray(value) ? value[0] : value;

  if (typeof normalizedValue === "string") {
    return ["1", "true", "yes", "on"].includes(normalizedValue.trim().toLowerCase());
  }

  return normalizedValue === true;
}, z.boolean().default(false));

const discoveryQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  npcGhostDemo: booleanQueryFlag,
  identities: queryArrayField,
  presentations: queryArrayField,
  lookingFor: queryArrayField,
  timing: queryArrayField,
  hosting: queryArrayField,
  vibes: queryArrayField,
  scenes: queryArrayField,
  archetypes: queryArrayField,
  crowds: crowdQueryArrayField,
  hobbies: queryArrayField,
  positions: queryArrayField,
  roles: queryArrayField,
  kinks: queryArrayField,
  bodyTypes: queryArrayField,
  sexuality: queryArrayField,
  substanceBoundaries: queryArrayField
}).strict();

type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;

const DEFAULT_CENTER = {
  lat: 40.6782,
  lng: -73.9442
};

// Each profile controls how long it keeps showing on the map after its last
// location update. `pin_settings` is the user_privacy_settings row for the
// profile being scanned, so the window is per-subject, not per-viewer.
const MAP_PRESENCE_DAYS_SQL = `coalesce(pin_settings.map_presence_days, ${DEFAULT_MAP_PRESENCE_DAYS})`;

function isSchemaCompatibilityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "";

  if (["42703", "42P01", "42883", "22P02"].includes(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("relation") ||
    message.includes("operator does not exist") ||
    message.includes("does not exist")
  );
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith("[")) {
      try {
        return coerceStringArray(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }

    return trimmed.includes(",")
      ? trimmed.split(",").map((item) => item.trim()).filter(Boolean)
      : [trimmed];
  }

  return [];
}

function coerceDisplayName(value: string | null) {
  return value?.trim() || "cruush user";
}

function normalizeFilterTokenValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addTextArrayFilter(where: string[], values: unknown[], column: string, selectedValues: string[]) {
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

function addVibeFilter(where: string[], values: unknown[], selectedValues: string[]) {
  if (selectedValues.length === 0) {
    return;
  }

  values.push(selectedValues);
  where.push(`(
           exists (
             select 1
             from (
               select unnest(coalesce(vibes, '{}'::text[])) as value
               union all
               select unnest(coalesce(scenes, '{}'::text[])) as value
               union all
               select unnest(coalesce(archetypes, '{}'::text[])) as value
             ) as candidate
             join unnest($${values.length}::text[]) as selected(value)
               on lower(btrim(candidate.value)) = lower(btrim(selected.value))
           )
         )`);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function addSensitiveTokenFilter(
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
    ? uniqueStrings(selectedValues.flatMap((value) => createCrowdTokens(app.config, [value]).map((token) => token.token_hash)))
    : selectedValues
      .map((value) => normalizeFilterTokenValue(value))
      .filter(Boolean)
      .map((value) => createSensitiveProfileToken(app.config, `${tokenKind}:${value}`, tokenKeyVersion).token_hash);

  if (tokenHashes.length === 0) {
    return;
  }

  values.push(tokenHashes);
  const tokenHashesPlaceholder = `$${values.length}`;
  values.push(tokenKeyVersion);
  const tokenKeyVersionPlaceholder = `$${values.length}`;
  where.push(`exists (
           select 1
           from profile_sensitive_tokens pst
           where pst.user_id = profiles.id
             and pst.token_hash = any(${tokenHashesPlaceholder}::text[])
             and pst.token_key_version = ${tokenKeyVersionPlaceholder}
         )`);
}

function getLegacyCoordinates(
  row: LegacyDiscoveryProfileRow,
  centerLat: number,
  centerLng: number,
  index: number
) {
  const fallbackCoordinates = getDiscoveryCoordinates(centerLat, centerLng, index);

  return {
    lat: row.fuzzy_lat ?? row.lat ?? fallbackCoordinates.lat,
    lng: row.fuzzy_lng ?? row.lng ?? fallbackCoordinates.lng
  };
}

function getCoordinates(row: Pick<DiscoveryProfileRow | DiscoveryViewerRow, "lat" | "lng" | "fuzzy_lat" | "fuzzy_lng">): VisibilityCoordinates {
  return {
    lat: row.fuzzy_lat ?? row.lat ?? null,
    lng: row.fuzzy_lng ?? row.lng ?? null
  };
}

function sensitiveKinksForVisibility(
  sensitiveProfile: ReturnType<typeof decryptSensitiveProfile>,
  fallbackKinks: string[] | null | undefined
) {
  if (!sensitiveProfile) {
    return fallbackKinks ?? [];
  }

  if (sensitiveProfile.kink_interests.length > 0) {
    return sensitiveProfile.kink_interests.map((interest) => interest.label ?? interest.kink_id);
  }

  return sensitiveProfile.kinks;
}

function toVisibilitySubject(app: FastifyInstance, row: DiscoveryProfileRow | DiscoveryViewerRow): VisibilitySubjectProfile {
  const sensitiveProfile = decryptSensitiveProfile(app.config, row);

  return {
    year_of_birth: row.year_of_birth,
    identities: row.identities ?? [],
    presentations: row.presentation ?? [],
    looking_for: row.looking_for ?? [],
    timing: row.availability ?? [],
    hosting: row.hosting_travel ?? [],
    vibes: row.vibes ?? [],
    scenes: row.scenes ?? [],
    archetypes: row.archetypes ?? [],
    crowds: sensitiveProfile?.crowds ?? [],
    hobbies: row.hobbies ?? [],
    positions: row.position ?? [],
    roles: row.role ?? [],
    kinks: sensitiveKinksForVisibility(sensitiveProfile, null),
    body_types: row.body_type ?? [],
    sexuality: row.sexuality ?? [],
    substance_boundaries: row.substance_boundaries ?? [],
    coordinates: getCoordinates(row)
  };
}

async function loadDiscoveryViewer(app: FastifyInstance, currentUserId: string) {
  try {
    const result = await app.db.query<DiscoveryViewerRow>(
      `select
         year_of_birth,
         pronouns,
         looking_for,
         vibes,
         scenes,
         archetypes,
         position,
         role,
         hosting_travel,
         identities,
         presentation,
         sexuality,
         body_type,
         availability,
         hobbies,
         substance_boundaries,
         profile_sensitive_ciphertext,
         profile_sensitive_nonce,
         profile_sensitive_auth_tag,
         profile_sensitive_key_version,
         profile_visibility_ciphertext,
         profile_visibility_nonce,
         profile_visibility_auth_tag,
         profile_visibility_key_version,
         null::double precision as lat,
         null::double precision as lng,
         null::double precision as fuzzy_lat,
         null::double precision as fuzzy_lng
       from profiles
       where id = $1`,
      [currentUserId]
    );
    const row = result.rows[0];

    if (!row) {
      return {
        subject: null,
        activeCrowdModes: [] as string[]
      };
    }

    return {
      subject: toVisibilitySubject(app, row),
      activeCrowdModes: decryptProfileVisibility(app.config, row)?.active_crowd_modes ?? []
    };
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return {
        subject: null,
        activeCrowdModes: [] as string[]
      };
    }

    throw error;
  }
}

function hasAnyCrowd(requiredCrowds: string[], subject: VisibilitySubjectProfile) {
  if (requiredCrowds.length === 0) {
    return true;
  }

  const subjectCrowds = new Set((subject.crowds ?? []).map((crowd) => crowd.toLowerCase()));

  return requiredCrowds.some((crowd) => subjectCrowds.has(crowd.toLowerCase()));
}

function discoveryRowIsVisibleToViewer(
  app: FastifyInstance,
  row: DiscoveryProfileRow,
  viewer: { subject: VisibilitySubjectProfile | null; activeCrowdModes: string[] }
) {
  if (!viewer.subject) {
    return true;
  }

  const targetSubject = toVisibilitySubject(app, row);

  if (!hasAnyCrowd(viewer.activeCrowdModes, targetSubject)) {
    return false;
  }

  const targetVisibilityRules = decryptProfileVisibility(app.config, row);

  return canSubjectViewProfile(targetVisibilityRules, viewer.subject, getCoordinates(row));
}

function canViewLatestFeedPreview(
  row: DiscoveryProfileRow,
  viewerUserId: string,
  relationship: Awaited<ReturnType<typeof getRelationshipPermissions>> | null
) {
  const visibility = row.latest_feed_location_pin_visibility ?? "mutuals";

  if (!row.latest_feed_post_content && !row.latest_feed_post_content_ciphertext) {
    return false;
  }

  if (visibility === "off") {
    return false;
  }

  if (viewerUserId === row.id || visibility === "public") {
    return true;
  }

  if (visibility === "same_crowd") {
    return row.latest_feed_has_shared_crowd === true;
  }

  return relationship?.isMutualCruush === true;
}

async function loadDiscoveryRows(app: FastifyInstance, currentUserId: string, filters: DiscoveryQuery) {
  try {
    const centerLat = filters.lat ?? DEFAULT_CENTER.lat;
    const centerLng = filters.lng ?? DEFAULT_CENTER.lng;
    const values: unknown[] = [
      currentUserId,
      createCoarseIndexTokens(app.config, centerLat, centerLng)
    ];
    const activeLocationWindow = "(extract(epoch from now()) * 1000)::bigint";
    const discoveryLocationWindow = "(extract(epoch from now() - interval '4 days') * 1000)::bigint";
    const where = [
      "profiles.id <> $1",
      `(
        profiles.location_updated_at >= now() - interval '4 days'
        or location_envelopes.expires_at_ms > ${activeLocationWindow}
        or location_envelopes.collected_at_ms >= ${discoveryLocationWindow}
      )`,
      `not exists (
        select 1
        from user_blocks block
        where (block.blocker_user_id = $1 and block.blocked_user_id = profiles.id)
           or (block.blocker_user_id = profiles.id and block.blocked_user_id = $1)
      )`,
      `(
        (
          location_envelopes.expires_at_ms > ${activeLocationWindow}
          and location_envelopes.coarse_index_tokens && $2::text[]
        )
        or location_envelopes.collected_at_ms >= ${discoveryLocationWindow}
        or (
          (profiles.fuzzy_lat is not null and profiles.fuzzy_lng is not null)
          or (profiles.lat is not null and profiles.lng is not null)
        )
      )`
    ];

    addTextArrayFilter(where, values, "identities", filters.identities);
    addTextArrayFilter(where, values, "presentation", filters.presentations);
    addTextArrayFilter(where, values, "looking_for", filters.lookingFor);
    addTextArrayFilter(where, values, "availability", filters.timing);
    addTextArrayFilter(where, values, "hosting_travel", filters.hosting);
    addVibeFilter(where, values, filters.vibes);
    addTextArrayFilter(where, values, "scenes", filters.scenes);
    addTextArrayFilter(where, values, "archetypes", filters.archetypes);
    addTextArrayFilter(where, values, "hobbies", filters.hobbies);
    addTextArrayFilter(where, values, "position", filters.positions);
    addTextArrayFilter(where, values, "role", filters.roles);
    addTextArrayFilter(where, values, "body_type", filters.bodyTypes);
    addTextArrayFilter(where, values, "sexuality", filters.sexuality);
    addTextArrayFilter(where, values, "substance_boundaries", filters.substanceBoundaries);
    addSensitiveTokenFilter(app, where, values, "crowd", filters.crowds);
    addSensitiveTokenFilter(app, where, values, "kink", filters.kinks);
    values.push(filters.limit);
    const limitPlaceholder = `$${values.length}`;

    const modernRows = await app.db.query<DiscoveryProfileRow>(
      `select
         profiles.id::text as id,
         app_users.email,
         profiles.display_name as display_name,
         profiles.signal,
         year_of_birth,
         pronouns,
         looking_for,
         vibes,
         scenes,
         archetypes,
         position,
         role,
         hosting_travel,
         photos,
         coalesce((
           select media.explicit_classification is distinct from 'non_explicit'
           from unnest(coalesce(profiles.photos, '{}'::text[])) with ordinality as photo(photo_url, ordinality)
           left join media_objects media
             on media.owner_user_id = profiles.id
            and media.public_url = photo.photo_url
            and media.surface = 'profile_photo'
            and media.deleted_at is null
           order by photo.ordinality
           limit 1
        ), true) as primary_photo_explicit,
         identities,
         presentation,
         sexuality,
         body_type,
         availability,
         hobbies,
         substance_boundaries,
         profile_sensitive_ciphertext,
         profile_sensitive_nonce,
         profile_sensitive_auth_tag,
         profile_sensitive_key_version,
         profile_visibility_ciphertext,
         profile_visibility_nonce,
         profile_visibility_auth_tag,
         profile_visibility_key_version,
         profiles.lat,
         profiles.lng,
         profiles.fuzzy_lat,
         profiles.fuzzy_lng,
         profiles.location_updated_at,
         latest_feed.content as latest_feed_post_content,
         latest_feed.content_ciphertext as latest_feed_post_content_ciphertext,
         latest_feed.content_nonce as latest_feed_post_content_nonce,
         latest_feed.content_auth_tag as latest_feed_post_content_auth_tag,
         latest_feed.content_key_version as latest_feed_post_content_key_version,
         coalesce(pin_settings.feed_location_pin_visibility, 'mutuals') as latest_feed_location_pin_visibility,
         latest_feed.has_shared_crowd as latest_feed_has_shared_crowd,
         exists (
           select 1
           from profile_sensitive_tokens viewer_crowd_token
           join profile_sensitive_tokens author_crowd_token
             on author_crowd_token.token_hash = viewer_crowd_token.token_hash
            and author_crowd_token.token_key_version = viewer_crowd_token.token_key_version
           where viewer_crowd_token.user_id = $1
             and author_crowd_token.user_id = profiles.id
         ) as has_shared_crowd,
         coalesce((
           select array_agg(user_badges.badge_key order by user_badges.awarded_at asc)
           from user_badges
           where user_badges.user_id = profiles.id
         ), '{}'::text[]) as badges,
         profiles.updated_at
       from profiles
       join app_users
         on app_users.id = profiles.id
       left join encrypted_location_envelopes location_envelopes
         on location_envelopes.subject_user_id = profiles.id
       left join user_privacy_settings pin_settings
         on pin_settings.user_id = profiles.id
       left join lateral (
         select
           posts.content,
           posts.content_ciphertext,
           posts.content_nonce,
           posts.content_auth_tag,
           posts.content_key_version,
           exists (
             select 1
             from profile_sensitive_tokens viewer_crowd_token
             join profile_sensitive_tokens author_crowd_token
               on author_crowd_token.token_hash = viewer_crowd_token.token_hash
              and author_crowd_token.token_key_version = viewer_crowd_token.token_key_version
             where viewer_crowd_token.user_id = $1
               and author_crowd_token.user_id = profiles.id
           ) as has_shared_crowd
         from posts
         where posts.user_id = profiles.id
           and posts.expires_at > now()
           and (
             not exists (
               select 1
               from feed_post_crowd_targets target
               where target.post_id = posts.id
             )
             or exists (
               select 1
               from feed_post_crowd_targets target
               join profile_sensitive_tokens viewer_crowd_token
                 on viewer_crowd_token.user_id = $1
                and viewer_crowd_token.token_hash = target.token_hash
                and viewer_crowd_token.token_key_version = target.token_key_version
               where target.post_id = posts.id
             )
           )
         order by posts.created_at desc
         limit 1
       ) latest_feed on true
       where ${where.join("\n         and ")}
       order by coalesce(profiles.location_updated_at, profiles.updated_at) desc
       limit ${limitPlaceholder}`,
      values
    );

    return {
      mode: "modern" as const,
      rows: modernRows.rows
    };
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }

    const legacyRows = await app.db.query<LegacyDiscoveryProfileRow>(
      `select
         id::text as id,
         display_name,
         age,
         pronouns,
         looking_for,
         tribes as legacy_vibe_tags,
         primary_photo_url,
         last_active,
         lat,
         lng,
         fuzzy_lat,
         fuzzy_lng
       from profiles
       where last_active >= now() - interval '4 days'
       order by last_active desc nulls last
       limit $1`,
      [filters.limit]
    );

    const blockedUserIds = await loadBlockedRelationshipUserIds(app, currentUserId);

    return {
      mode: "legacy" as const,
      rows: legacyRows.rows.filter((row) => !blockedUserIds.has(row.id))
    };
  }
}

function locationPayloadFromCoordinates(input: {
  subjectUserId: string;
  lat: number;
  lng: number;
  updatedAt: string | Date;
}): LocationPayload {
  const updatedAtMs = new Date(input.updatedAt).getTime();

  return {
    version: 1,
    subjectUserId: input.subjectUserId,
    locationVersion: updatedAtMs,
    latE7: Math.round(input.lat * 10_000_000),
    lonE7: Math.round(input.lng * 10_000_000),
    accuracyM: 0,
    source: "SYSTEM",
    deviceReportedAtMs: updatedAtMs,
    collectedAtMs: updatedAtMs,
    expiresAtMs: Date.now() + 180_000,
    keyVersion: "legacy"
  };
}

async function loadPolicyOrDefault(app: FastifyInstance, subjectUserId: string) {
  try {
    return await loadVisibilityPolicy(app, subjectUserId);
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return buildDefaultVisibilityPolicy(app.config, subjectUserId);
    }

    throw error;
  }
}

async function mapModernDiscoveryRow(
  app: FastifyInstance,
  request: FastifyRequest,
  viewerUserId: string,
  row: DiscoveryProfileRow,
  centerLat: number,
  centerLng: number,
  relationship: Awaited<ReturnType<typeof getRelationshipPermissions>> | null = null,
  encryptedLocation: LocationPayload | null = null,
  options: {
    npcGhostDemoRadiusMeters?: number | null;
  } = {}
) {
  const fallbackLat = row.fuzzy_lat ?? row.lat;
  const fallbackLng = row.fuzzy_lng ?? row.lng;
  const location = encryptedLocation ?? (fallbackLat != null && fallbackLng != null
    ? locationPayloadFromCoordinates({
        subjectUserId: row.id,
        lat: fallbackLat,
        lng: fallbackLng,
        updatedAt: row.location_updated_at ?? row.updated_at
      })
    : null);

  if (!location) {
    return null;
  }

  const preciseCoordinates = locationPayloadToCoordinates(location);

  if (!isWithinBetaLaunchArea(preciseCoordinates)) {
    return null;
  }

  const storedPolicy = await loadPolicyOrDefault(app, row.id);

  if (storedPolicy.baseMode === "STEALTH") {
    return null;
  }

  const npcGhostDemoActive = options.npcGhostDemoRadiusMeters != null;
  const policy = npcGhostDemoActive
    ? {
        ...storedPolicy,
        baseMode: "GHOST" as const,
        ghostRadiusMeters: options.npcGhostDemoRadiusMeters ?? DEFAULT_GHOST_RADIUS_METERS
      }
    : storedPolicy;

  const displayMode: DisplayMode = npcGhostDemoActive
    ? "GHOST"
    : relationship?.canRevealPreciseLocation
    ? "PRECISE"
    : policy.baseMode === "GHOST"
      ? "GHOST"
      : "PRECISE";
  const displayLocationToken = await makeDisplayLocationToken(app, request, {
    subjectUserId: row.id,
    viewerUserId,
    policy,
    location,
    displayMode,
    relationshipGrantVersion: relationship?.isMutualCruush ? 1 : 0
  });
  const latestFeedPostPreview = canViewLatestFeedPreview(row, viewerUserId, relationship)
    ? decryptTextContentOrFallback(app.config, "feed", {
        ciphertext: row.latest_feed_post_content_ciphertext ?? undefined,
        nonce: row.latest_feed_post_content_nonce ?? undefined,
        authTag: row.latest_feed_post_content_auth_tag ?? undefined,
        keyVersion: row.latest_feed_post_content_key_version ?? undefined
      }, row.latest_feed_post_content ?? "")
    : "";

  return {
    profileToken: row.id,
    name: coerceDisplayName(row.display_name),
    display_name: coerceDisplayName(row.display_name),
    signal: row.signal ?? "",
    latestFeedPostPreview,
    age: row.year_of_birth ? new Date().getFullYear() - row.year_of_birth : null,
    pronouns: coerceStringArray(row.pronouns).join(", "),
    lastActive: formatLastActiveFromDate(row.location_updated_at ?? row.updated_at),
    distanceLabel: formatDistanceLabel({
      displayMode,
      viewerLat: centerLat,
      viewerLng: centerLng,
      targetLat: preciseCoordinates.lat,
      targetLng: preciseCoordinates.lng
    }),
    displayLocationToken,
    displayExpiresAtMs: displayLocationToken.expiresAtMs,
    animationHint: "NONE" as const,
    ...(npcGhostDemoActive ? { demoDisplayMode: "NPC_GHOST_TEST" as const } : {}),
    relationshipContext: relationship?.isMutualCruush
      ? "MUTUAL_CRUUSH"
      : row.has_shared_crowd === true
        ? "MUTUAL_CROWD"
        : "PUBLIC",
    identities: coerceStringArray(row.identities),
    presentation: coerceStringArray(row.presentation),
    lookingFor: coerceStringArray(row.looking_for),
    vibes: uniqueStrings([
      ...coerceStringArray(row.vibes),
      ...coerceStringArray(row.scenes),
      ...coerceStringArray(row.archetypes)
    ]),
    scenes: coerceStringArray(row.scenes),
    archetypes: coerceStringArray(row.archetypes),
    position: coerceStringArray(row.position),
    role: coerceStringArray(row.role),
    hostingTravel: coerceStringArray(row.hosting_travel),
    photo: row.photos?.[0] ?? null,
    photoExplicit: row.primary_photo_explicit === true,
    hasSharedCrowd: row.has_shared_crowd === true,
    ...((row.badges?.length ?? 0) > 0 ? { badges: row.badges } : {}),
    relationship: relationship
      ? {
          mutualCruush: relationship.isMutualCruush,
          canMessage: await canStartDirectMessage(app, viewerUserId, row.id, relationship ?? undefined),
          ...(relationship.isMutualCruush
            ? { precision: displayMode === "PRECISE" ? "precise" as const : "fuzzy" as const }
            : {})
        }
      : null
  };
}

function mapLegacyDiscoveryRow(
  row: LegacyDiscoveryProfileRow,
  centerLat: number,
  centerLng: number,
  index: number
) {
  const legacyCoordinates = getLegacyCoordinates(row, centerLat, centerLng, index);

  return {
    id: row.id,
    name: coerceDisplayName(row.display_name),
    display_name: coerceDisplayName(row.display_name),
    age: row.age ?? null,
    pronouns: typeof row.pronouns === "string" ? row.pronouns.trim() : "",
    lat: legacyCoordinates.lat,
    lng: legacyCoordinates.lng,
    lastActive: row.last_active
      ? formatLastActiveFromDate(row.last_active)
      : formatLastActiveFromMinutes(5 + index * 7),
    distance: formatDistanceMiles(centerLat, centerLng, legacyCoordinates.lat, legacyCoordinates.lng),
    lookingFor: coerceStringArray(row.looking_for),
    vibes: coerceStringArray(row.legacy_vibe_tags),
    scenes: [],
    archetypes: [],
    position: [],
    role: [],
    hostingTravel: [],
    photo: row.primary_photo_url?.trim() || null
  };
}

function getSeededNpcNumber(row: Pick<DiscoveryProfileRow, "email">) {
  const match = row.email?.match(/^test-cruush-(\d{2})@cruush\.local$/);
  return match ? Number(match[1]) : null;
}

function shouldApplyNpcGhostDemo(app: FastifyInstance, row: DiscoveryProfileRow, enabled: boolean) {
  if (!enabled || app.config.NODE_ENV === "production") {
    return false;
  }

  const seedNumber = getSeededNpcNumber(row);
  return seedNumber !== null && seedNumber % 2 === 0;
}

async function canUseNpcGhostDemo(app: FastifyInstance, currentUserId: string, requested: boolean) {
  if (!requested || app.config.NODE_ENV === "production") {
    return false;
  }

  const result = await app.db.query<DiscoveryToolUserRow>(
    `select email
     from app_users
     where id = $1
     limit 1`,
    [currentUserId]
  );
  const email = result.rows[0]?.email ?? "";

  return NPC_GHOST_DEMO_EMAILS.has(email.trim().toLowerCase());
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/api/users", async (request, reply) => {
    const currentUserId = await getAuthenticatedUserId(request);
    const parsedQuery = discoveryQuerySchema.parse(request.query);
    if (hasPremiumDiscoveryFilters(parsedQuery)) {
      await requireCruushPlus(app, currentUserId, "Upgrade to cruush+ to use all seeking filters.");
    }

    await app.rateLimiter.assert({
      key: `discovery-read:${currentUserId}`,
      max: 30,
      windowMs: 60 * 1000,
      message: "Too many discovery refreshes. Try again later."
    });
    const centerLat = parsedQuery.lat ?? DEFAULT_CENTER.lat;
    const centerLng = parsedQuery.lng ?? DEFAULT_CENTER.lng;
    const npcGhostDemoEnabled = await canUseNpcGhostDemo(app, currentUserId, parsedQuery.npcGhostDemo);

    const usedIds = new Set<string>();
    const discoveryViewer = await loadDiscoveryViewer(app, currentUserId);
    const discoveryRows = await loadDiscoveryRows(app, currentUserId, parsedQuery);
    const viewerGhostRadiusMeters = npcGhostDemoEnabled
      ? (await loadPolicyOrDefault(app, currentUserId)).ghostRadiusMeters ?? DEFAULT_GHOST_RADIUS_METERS
      : DEFAULT_GHOST_RADIUS_METERS;
    const encryptedLocations = discoveryRows.mode === "modern"
      ? await loadLocationEnvelopes(app, discoveryRows.rows.map((row) => row.id)).catch((error) => {
          if (isSchemaCompatibilityError(error)) {
            return new Map<string, LocationPayload>();
          }

          throw error;
        })
      : new Map<string, LocationPayload>();
    const realUsers = discoveryRows.mode === "modern"
      ? (await Promise.all(discoveryRows.rows
          .filter((row) => discoveryRowIsVisibleToViewer(app, row, discoveryViewer))
          .map(async (row) => {
            usedIds.add(row.id);
            const relationship = await getRelationshipPermissions(app, currentUserId, row.id);
            return mapModernDiscoveryRow(
              app,
              request,
              currentUserId,
              row,
              centerLat,
              centerLng,
              relationship,
              encryptedLocations.get(row.id) ?? null,
              {
                npcGhostDemoRadiusMeters: shouldApplyNpcGhostDemo(app, row, npcGhostDemoEnabled)
                  ? viewerGhostRadiusMeters
                  : null
              }
            );
          })))
          .filter((row): row is NonNullable<typeof row> => row !== null)
      : await Promise.all(discoveryRows.rows.map(async (row, index) => {
          usedIds.add(row.id);
          const storedLatitude = row.fuzzy_lat ?? row.lat;
          const storedLongitude = row.fuzzy_lng ?? row.lng;
          if (storedLatitude == null || storedLongitude == null) {
            return null;
          }
          const legacy = mapLegacyDiscoveryRow(row, centerLat, centerLng, index);
          if (!isWithinBetaLaunchArea({ lat: legacy.lat, lng: legacy.lng })) {
            return null;
          }
          const location = locationPayloadFromCoordinates({
            subjectUserId: legacy.id,
            lat: legacy.lat,
            lng: legacy.lng,
            updatedAt: row.last_active ?? new Date()
          });
          const policy = await loadPolicyOrDefault(app, legacy.id);
          if (policy.baseMode === "STEALTH") {
            return null;
          }
          const displayMode: DisplayMode = policy.baseMode === "GHOST" ? "GHOST" : "PRECISE";
          const displayLocationToken = await makeDisplayLocationToken(app, request, {
            subjectUserId: legacy.id,
            viewerUserId: currentUserId,
            policy,
            location,
            displayMode
          });

          return {
            profileToken: legacy.id,
            name: legacy.name,
            display_name: legacy.display_name,
            age: legacy.age,
            pronouns: legacy.pronouns,
            lastActive: legacy.lastActive,
            distanceLabel: formatDistanceLabel({
              displayMode,
              viewerLat: centerLat,
              viewerLng: centerLng,
              targetLat: legacy.lat,
              targetLng: legacy.lng
            }),
            displayLocationToken,
            displayExpiresAtMs: displayLocationToken.expiresAtMs,
            animationHint: "NONE",
            relationshipContext: "PUBLIC",
            lookingFor: legacy.lookingFor,
            vibes: legacy.vibes,
            scenes: legacy.scenes,
            archetypes: legacy.archetypes,
            position: legacy.position,
            role: legacy.role,
            hostingTravel: legacy.hostingTravel,
            photo: legacy.photo,
            relationship: null
          };
        })).then((rows) => rows.filter((row): row is NonNullable<typeof row> => row !== null));

    return reply.send({
      data: {
        mapEpochMs: Date.now(),
        profiles: realUsers.slice(0, parsedQuery.limit)
      }
    });
  });
}
