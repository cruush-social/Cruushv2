import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { hasPremiumDiscoveryFilters, requireCruushPlus } from "../billing.js";
import { decryptTextContentOrFallback } from "../content-encryption.js";
import { GhostLandUnavailableError } from "../ghost-land.js";
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
import { getEffectiveVisibilityPolicy, getRelationshipPermissions } from "../match-relationships.js";
import { canStartDirectMessage } from "../cruush-match-settings.js";
import { loadBlockedRelationshipUserIds } from "../user-blocks.js";
import { DEFAULT_MAP_PRESENCE_HOURS } from "../map-presence.js";
import { DEVELOPMENT_ADMIN_EMAIL } from "../development-admin.js";
import { distanceMiles, isWithinBetaLaunchArea } from "../beta-access.js";
import { isWithinServiceArea, NYC_SERVICE_AREA } from "../service-area.js";

/**
 * How far from your own location you may look. Mile High Club moves that location,
 * so a member visiting another place browses from their pin instead.
 */
const DISCOVERY_BROWSE_RADIUS_MILES = 50;
import { type TravelPin, loadTravelPins, locationPayloadAtTravelPin } from "../travel-pins.js";
import { primaryPhotoExplicitSelect } from "../profile-photo-explicit.js";
import { notTombstonedSql } from "../profile-tombstone.js";
import {
  DEFAULT_GHOST_RADIUS_METERS,
  createCoarseIndexTokens,
  buildDefaultVisibilityPolicy,
  formatDistanceLabel,
  isPreciseLocationRevoked,
  loadLocationEnvelopes,
  locationPayloadToCoordinates,
  describeGhostRotation,
  makeDisplayLocationToken,
  resolveViewerGhostCoordinate,
  type DisplayMode,
  type LocationPayload
} from "../location-privacy.js";

type DiscoveryProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  bio: string | null;
  tags: string[] | null;
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
  preferred_spots: string[] | null;
  photos: string[] | null;
  primary_photo_explicit?: boolean | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  zodiac: string[] | null;
  body_type: string[] | null;
  availability: string[] | null;
  hobbies: string[] | null;
  substance_boundaries: string[] | null;
  protection_boundaries: string[] | null;
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
  side_badges?: unknown;
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

type DiscoveryViewerRow = Omit<DiscoveryProfileRow, "id" | "email" | "updated_at">;

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

type ActiveDiscoveryMapPingRow = {
  id: string;
  user_id: string;
  expires_at: string | Date;
  radius_miles: number;
};

type DiscoveryPulseCoordinates = { lat: number; lng: number };

export function isDiscoveryMapPingVisible(input: {
  viewerCoordinates: DiscoveryPulseCoordinates | null;
  shownCoordinates: DiscoveryPulseCoordinates | null;
  radiusMiles: number;
}) {
  return input.viewerCoordinates !== null &&
    input.shownCoordinates !== null &&
    Number.isFinite(input.radiusMiles) &&
    input.radiusMiles > 0 &&
    distanceMiles(input.viewerCoordinates, input.shownCoordinates) <= input.radiusMiles;
}

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
  q: z.preprocess(
    (value) => typeof value === "string" ? normalizeSingleLineText(value) : value,
    z.string().max(120).optional()
  ),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  npcGhostDemo: booleanQueryFlag,
  mileHighClub: booleanQueryFlag,
  hasPhoto: booleanQueryFlag,
  identities: queryArrayField,
  presentations: queryArrayField,
  lookingFor: queryArrayField,
  timing: queryArrayField,
  hosting: queryArrayField,
  preferredSpots: queryArrayField,
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
  zodiac: queryArrayField,
  substanceBoundaries: queryArrayField,
  protectionBoundaries: queryArrayField
}).strict();

type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;

const DEFAULT_CENTER = NYC_SERVICE_AREA.center;

// Each profile controls how long it keeps showing on the map after its last
// location update. `pin_settings` is the user_privacy_settings row for the
// profile being scanned, so the window is per-subject, not per-viewer.
const MAP_PRESENCE_HOURS_SQL = `coalesce(pin_settings.map_presence_hours, pin_settings.map_presence_days * 24, ${DEFAULT_MAP_PRESENCE_HOURS})`;
const MAP_PRESENCE_START_MS_SQL = `(extract(epoch from now() - make_interval(hours => ${MAP_PRESENCE_HOURS_SQL})) * 1000)::bigint`;

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

function addProfileSearchFilter(
  app: FastifyInstance,
  where: string[],
  values: unknown[],
  searchQuery: string | undefined
) {
  const normalizedQuery = searchQuery?.trim().toLowerCase();
  if (!normalizedQuery) {
    return;
  }

  values.push(`%${normalizedQuery}%`);
  const searchPlaceholder = `$${values.length}`;
  values.push(`%${normalizedQuery.replace(/^#+/, "")}%`);
  const tagSearchPlaceholder = `$${values.length}`;
  const normalizedKink = normalizeFilterTokenValue(normalizedQuery);
  const tokenKeyVersion = getSensitiveProfileTokenKeyVersion(app.config);
  const kinkTokenHash = normalizedKink
    ? createSensitiveProfileToken(app.config, `kink:${normalizedKink}`, tokenKeyVersion).token_hash
    : "";
  values.push(kinkTokenHash);
  const kinkTokenPlaceholder = `$${values.length}`;
  values.push(tokenKeyVersion);
  const tokenKeyVersionPlaceholder = `$${values.length}`;

  where.push(`(
           lower(coalesce(profiles.display_name, '')) like ${searchPlaceholder}
           or lower(coalesce(profiles.bio, '')) like ${searchPlaceholder}
           or exists (
             select 1
             from unnest(coalesce(profiles.tags, '{}'::text[])) as profile_tag(value)
             where lower(profile_tag.value) like ${tagSearchPlaceholder}
           )
           or exists (
             select 1
             from unnest(
               coalesce(profiles.identities, '{}'::text[])
               || coalesce(profiles.presentation, '{}'::text[])
               || coalesce(profiles.sexuality, '{}'::text[])
               || coalesce(profiles.body_type, '{}'::text[])
               || coalesce(profiles.availability, '{}'::text[])
               || coalesce(profiles.hosting_travel, '{}'::text[])
               || coalesce(profiles.preferred_spots, '{}'::text[])
               || coalesce(profiles.looking_for, '{}'::text[])
               || coalesce(profiles.vibes, '{}'::text[])
               || coalesce(profiles.scenes, '{}'::text[])
               || coalesce(profiles.archetypes, '{}'::text[])
               || coalesce(profiles.hobbies, '{}'::text[])
               || coalesce(profiles.position, '{}'::text[])
               || coalesce(profiles.role, '{}'::text[])
               || coalesce(profiles.substance_boundaries, '{}'::text[])
               || coalesce(profiles.protection_boundaries, '{}'::text[])
             ) as searchable(value)
             where lower(searchable.value) like ${searchPlaceholder}
           )
           or exists (
             select 1
             from profile_sensitive_tokens search_token
             where search_token.user_id = profiles.id
               and search_token.token_hash = ${kinkTokenPlaceholder}
               and search_token.token_key_version = ${tokenKeyVersionPlaceholder}
           )
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
    display_name: row.display_name,
    bio: row.bio,
    tags: row.tags ?? [],
    has_photo: (row.photos?.length ?? 0) > 0,
    year_of_birth: row.year_of_birth,
    identities: row.identities ?? [],
    presentations: row.presentation ?? [],
    looking_for: row.looking_for ?? [],
    timing: row.availability ?? [],
    hosting: row.hosting_travel ?? [],
    preferred_spots: row.preferred_spots ?? [],
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
    zodiac: row.zodiac ?? [],
    substance_boundaries: row.substance_boundaries ?? [],
    protection_boundaries: row.protection_boundaries ?? [],
    coordinates: getCoordinates(row)
  };
}

async function loadDiscoveryViewer(app: FastifyInstance, currentUserId: string) {
  try {
    const result = await app.db.query<DiscoveryViewerRow>(
      `select
         display_name,
         bio,
         tags,
         photos,
         year_of_birth,
         pronouns,
         looking_for,
         vibes,
         scenes,
         archetypes,
         position,
         role,
         hosting_travel,
         preferred_spots,
         identities,
         presentation,
         sexuality,
         zodiac,
         body_type,
         availability,
         hobbies,
         substance_boundaries,
         protection_boundaries,
         profile_sensitive_ciphertext,
         profile_sensitive_nonce,
         profile_sensitive_auth_tag,
         profile_sensitive_key_version,
         profile_visibility_ciphertext,
         profile_visibility_nonce,
         profile_visibility_auth_tag,
         profile_visibility_key_version,
         lat,
         lng,
         fuzzy_lat,
         fuzzy_lng
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

function hasActiveSameCrowdPrecisionGrant(
  policy: Awaited<ReturnType<typeof getEffectiveVisibilityPolicy>>,
  viewerCrowds: string[],
  targetCrowds: string[]
) {
  const normalizedViewerCrowds = new Set(viewerCrowds.map((crowd) => crowd.trim().toLowerCase()).filter(Boolean));
  const normalizedTargetCrowds = new Set(targetCrowds.map((crowd) => crowd.trim().toLowerCase()).filter(Boolean));

  return policy.preciseToMutualCrowds.some((crowdPolicy) => {
    const normalizedCrowd = crowdPolicy.crowdId.trim().toLowerCase();

    return crowdPolicy.precisionEnabled &&
      (crowdPolicy.revokedAtMs ?? null) === null &&
      crowdPolicy.minimumTrustLevel === "MEMBER" &&
      normalizedViewerCrowds.has(normalizedCrowd) &&
      normalizedTargetCrowds.has(normalizedCrowd);
  });
}

function discoveryRowIsVisibleToViewer(
  app: FastifyInstance,
  row: DiscoveryProfileRow,
  viewer: { subject: VisibilitySubjectProfile | null; activeCrowdModes: string[] },
  targetCoordinates: VisibilityCoordinates = getCoordinates(row)
) {
  if (!viewer.subject) {
    return true;
  }

  const targetSubject = toVisibilitySubject(app, row);
  targetSubject.coordinates = targetCoordinates;

  if (!hasAnyCrowd(viewer.activeCrowdModes, targetSubject)) {
    return false;
  }

  const targetVisibilityRules = decryptProfileVisibility(app.config, row);

  return canSubjectViewProfile(targetVisibilityRules, viewer.subject, targetCoordinates);
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
    const where = [
      "profiles.id <> $1",
      // A deleted, suspended or banned account keeps its row for audit, so it
      // must never surface in discovery.
      "coalesce(app_users.account_status, 'active') = 'active'",
      // Older removal flows only renamed the profile and left the account
      // active; one such phone still pinged its location today and turned up
      // in Recently Active as "User deleted profile, 42".
      notTombstonedSql("profiles"),
      `(
        profiles.location_updated_at >= now() - make_interval(hours => ${MAP_PRESENCE_HOURS_SQL})
        or location_envelopes.expires_at_ms > ${activeLocationWindow}
        or location_envelopes.collected_at_ms >= ${MAP_PRESENCE_START_MS_SQL}
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
        or location_envelopes.collected_at_ms >= ${MAP_PRESENCE_START_MS_SQL}
        or (
          (profiles.fuzzy_lat is not null and profiles.fuzzy_lng is not null)
          or (profiles.lat is not null and profiles.lng is not null)
        )
      )`
    ];

    // A profile with no photo has an empty photos array, so the check is on
    // the array itself rather than on any stored flag.
    if (filters.hasPhoto) {
      where.push("coalesce(array_length(profiles.photos, 1), 0) > 0");
    }

    if (filters.mileHighClub) {
      where.push(`exists (
        select 1
        from user_travel_pins active_travel_pin
        where active_travel_pin.user_id = profiles.id
          and active_travel_pin.set_at > now() - interval '24 hours'
      )`);
    }

    addTextArrayFilter(where, values, "identities", filters.identities);
    addTextArrayFilter(where, values, "presentation", filters.presentations);
    addTextArrayFilter(where, values, "looking_for", filters.lookingFor);
    addTextArrayFilter(where, values, "availability", filters.timing);
    addTextArrayFilter(where, values, "hosting_travel", filters.hosting);
    addTextArrayFilter(where, values, "preferred_spots", filters.preferredSpots);
    addVibeFilter(where, values, filters.vibes);
    addTextArrayFilter(where, values, "scenes", filters.scenes);
    addTextArrayFilter(where, values, "archetypes", filters.archetypes);
    addTextArrayFilter(where, values, "hobbies", filters.hobbies);
    addTextArrayFilter(where, values, "position", filters.positions);
    addTextArrayFilter(where, values, "role", filters.roles);
    addTextArrayFilter(where, values, "body_type", filters.bodyTypes);
    addTextArrayFilter(where, values, "sexuality", filters.sexuality);
    addTextArrayFilter(where, values, "zodiac", filters.zodiac);
    addTextArrayFilter(where, values, "substance_boundaries", filters.substanceBoundaries);
    addTextArrayFilter(where, values, "protection_boundaries", filters.protectionBoundaries);
    addSensitiveTokenFilter(app, where, values, "crowd", filters.crowds);
    addSensitiveTokenFilter(app, where, values, "kink", filters.kinks);
    addProfileSearchFilter(app, where, values, filters.q);
    values.push(filters.limit);
    const limitPlaceholder = `$${values.length}`;

    const modernRows = await app.db.query<DiscoveryProfileRow>(
      `select
         profiles.id::text as id,
         app_users.email,
         profiles.display_name as display_name,
         profiles.bio,
         profiles.tags,
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
         preferred_spots,
         photos,
         ${primaryPhotoExplicitSelect("profiles", "primary_photo_explicit")},
         identities,
         presentation,
         sexuality,
         zodiac,
         body_type,
         availability,
         hobbies,
         substance_boundaries,
         protection_boundaries,
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
         (to_jsonb(profiles)->'side_badges') as side_badges,
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
         and id <> $1
       order by last_active desc nulls last
       limit $2`,
      [currentUserId, filters.limit]
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
    return await getEffectiveVisibilityPolicy(app, subjectUserId);
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
    targetTravelling?: boolean;
    viewerCrowds?: string[];
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

  const targetCrowds = toVisibilitySubject(app, row).crowds ?? [];
  const sameCrowdPrecisionCandidate = !npcGhostDemoActive && hasActiveSameCrowdPrecisionGrant(
    policy,
    options.viewerCrowds ?? [],
    targetCrowds
  );
  const sameCrowdPrecisionRevoked = sameCrowdPrecisionCandidate
    ? await isPreciseLocationRevoked(app, {
        subjectUserId: row.id,
        viewerUserId,
        permissionType: "mutual_crowd"
      }).catch((error) => {
        if (isSchemaCompatibilityError(error)) {
          return false;
        }

        throw error;
      })
    : false;
  const canRevealSameCrowdPreciseLocation = sameCrowdPrecisionCandidate && !sameCrowdPrecisionRevoked;

  const displayMode: DisplayMode = npcGhostDemoActive
    ? "GHOST"
    : relationship?.canRevealPreciseLocation || canRevealSameCrowdPreciseLocation
    ? "PRECISE"
    : policy.baseMode === "GHOST"
      ? "GHOST"
      : "PRECISE";
  const resolvedGhost = displayMode === "GHOST"
    ? await resolveViewerGhostCoordinate(app, {
        subjectUserId: row.id,
        viewerUserId,
        policy,
        location
      }).catch(error => {
        if (error instanceof GhostLandUnavailableError) return null;
        throw error;
      })
    : null;
  if (displayMode === "GHOST" && !resolvedGhost) return null;
  const displayLocationToken = await makeDisplayLocationToken(app, request, {
    subjectUserId: row.id,
    viewerUserId,
    policy,
    location,
    displayMode,
    ...(resolvedGhost ? { resolvedGhost } : {}),
    relationshipGrantVersion: relationship?.isMutualCruush || canRevealSameCrowdPreciseLocation ? 1 : 0
  });
  const ghostRotation = displayMode === "GHOST"
    ? await describeGhostRotation(app, row.id, policy, resolvedGhost!.resolvedAtMs)
    : null;
  const shownCoordinates = resolvedGhost?.coordinate ?? preciseCoordinates;
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
    distanceLabel: options.targetTravelling && relationship?.canRevealPreciseLocation !== true
      ? "Far far away"
      : formatDistanceLabel({
          displayMode,
          distanceLabelMode: relationship?.distanceLabelMode,
          viewerLat: centerLat,
          viewerLng: centerLng,
          targetLat: preciseCoordinates.lat,
          targetLng: preciseCoordinates.lng
        }),
    displayLocationToken,
    displayExpiresAtMs: displayLocationToken.expiresAtMs,
    __pulseLat: shownCoordinates.lat,
    __pulseLng: shownCoordinates.lng,
    // The hint has to come from this profile's own rotation window. Reporting
    // FADE_LAST_MINUTE for every ghost profile left them all permanently faded
    // instead of only during the last minute before their pin moves.
    animationHint: ghostRotation?.animationHint ?? "NONE",
    ...(ghostRotation?.rotationExpiresAtMs
      ? { ghostRotationExpiresAtMs: ghostRotation.rotationExpiresAtMs }
      : {}),
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
    ...(row.side_badges ? { sideBadges: row.side_badges } : {}),
    relationship: relationship
      ? {
          mutualCruush: relationship.isMutualCruush,
          canMessage: await canStartDirectMessage(app, viewerUserId, row.id, relationship ?? undefined),
          precision: displayMode === "PRECISE" ? "precise" as const : "fuzzy" as const
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

async function loadActiveDiscoveryMapPings(app: FastifyInstance, profileIds: string[]) {
  if (profileIds.length === 0) {
    return new Map<string, { id: string; expiresAt: string; radiusMiles: number }>();
  }

  const result = await app.db.query<ActiveDiscoveryMapPingRow>(
    `select distinct on (user_id)
       id::text as id,
       user_id::text as user_id,
       expires_at,
       radius_miles
     from map_pings
     where user_id = any($1::uuid[])
       and expires_at > now()
     order by user_id, created_at desc`,
    [profileIds]
  );

  return new Map(result.rows.map((ping) => [
    ping.user_id,
    {
      id: ping.id,
      expiresAt: new Date(ping.expires_at).toISOString(),
      radiusMiles: Number(ping.radius_miles)
    }
  ]));
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
      ? await loadLocationEnvelopes(app, [
          currentUserId,
          ...discoveryRows.rows.map((row) => row.id)
        ]).catch((error) => {
          if (isSchemaCompatibilityError(error)) {
            return new Map<string, LocationPayload>();
          }

          throw error;
        })
      : new Map<string, LocationPayload>();
    // The viewer's own position comes from the envelope too, the way the
    // profile route reads it. Measured from the profile row, which most
    // accounts leave empty, discovery and the profile route disagreed about
    // who was in range: the list offered people the profile then refused.
    const viewerEnvelope = encryptedLocations.get(currentUserId);
    if (discoveryViewer.subject && viewerEnvelope) {
      discoveryViewer.subject.coordinates = locationPayloadToCoordinates(viewerEnvelope);
    }
    // Mile High Club replaces the device location with the pin the member dropped,
    // for the viewer's own position as well as everyone they are shown.
    const travelPins = await loadTravelPins(app, [
      currentUserId,
      ...(discoveryRows.mode === "modern" ? discoveryRows.rows.map((row) => row.id) : [])
    ]).catch((error) => {
      if (isSchemaCompatibilityError(error)) {
        return new Map<string, TravelPin>();
      }

      throw error;
    });

    if (discoveryViewer.subject) {
      discoveryViewer.subject.mile_high_club_member = travelPins.has(currentUserId);
    }

    travelPins.forEach((pin, userId) => {
      const savedLocation = encryptedLocations.get(userId);
      if (savedLocation) {
        encryptedLocations.set(userId, locationPayloadAtTravelPin(savedLocation, pin));
      }
    });

    const viewerLocation = encryptedLocations.get(currentUserId);
    const viewerCoordinates = viewerLocation ? locationPayloadToCoordinates(viewerLocation) : null;
    if (viewerLocation && discoveryViewer.subject) {
      discoveryViewer.subject.coordinates = viewerCoordinates;
    }

    if (viewerCoordinates && !isWithinServiceArea(viewerCoordinates)) {
      return reply.send({
        data: {
          mapEpochMs: Date.now(),
          profiles: [],
          outsideServiceArea: true
        }
      });
    }

    const realUsers = discoveryRows.mode === "modern"
      ? (await Promise.all(discoveryRows.rows
          .filter((row) => {
            const targetLocation = encryptedLocations.get(row.id);
            return discoveryRowIsVisibleToViewer(
              app,
              row,
              discoveryViewer,
              targetLocation ? locationPayloadToCoordinates(targetLocation) : getCoordinates(row)
            );
          })
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
                  : null,
                targetTravelling: travelPins.has(row.id),
                viewerCrowds: discoveryViewer.subject?.crowds ?? []
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
          const resolvedGhost = displayMode === "GHOST"
            ? await resolveViewerGhostCoordinate(app, {
                subjectUserId: legacy.id,
                viewerUserId: currentUserId,
                policy,
                location
              }).catch(error => {
                if (error instanceof GhostLandUnavailableError) return null;
                throw error;
              })
            : null;
          if (displayMode === "GHOST" && !resolvedGhost) return null;
          const displayLocationToken = await makeDisplayLocationToken(app, request, {
            subjectUserId: legacy.id,
            viewerUserId: currentUserId,
            policy,
            location,
            displayMode,
            ...(resolvedGhost ? { resolvedGhost } : {})
          });
          const shownCoordinates = resolvedGhost?.coordinate ?? { lat: legacy.lat, lng: legacy.lng };

          return {
            profileToken: legacy.id,
            name: legacy.name,
            display_name: legacy.display_name,
            age: legacy.age,
            pronouns: legacy.pronouns,
            lastActive: legacy.lastActive,
            distanceLabel: travelPins.has(legacy.id)
              ? "Far far away"
              : formatDistanceLabel({
                  displayMode,
                  viewerLat: centerLat,
                  viewerLng: centerLng,
                  targetLat: legacy.lat,
                  targetLng: legacy.lng
                }),
            displayLocationToken,
            displayExpiresAtMs: displayLocationToken.expiresAtMs,
            __pulseLat: shownCoordinates.lat,
            __pulseLng: shownCoordinates.lng,
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

    const visibleProfiles = realUsers.slice(0, parsedQuery.limit);
    // The radius is measured from where this viewer actually is, never from the
    // map centre they asked for. Panning across the city must not put anyone
    // inside someone else's Pulse.
    // You browse the fifty miles around wherever you are. Looking further than
    // that is what Mile High Club is for, and Mile High Club works by moving where
    // you are, so this one rule covers both.
    if (
      viewerCoordinates &&
      distanceMiles(viewerCoordinates, { lat: centerLat, lng: centerLng }) > DISCOVERY_BROWSE_RADIUS_MILES
    ) {
      return reply.send({
        data: {
          mapEpochMs: Date.now(),
          profiles: [],
          browseRadiusMiles: DISCOVERY_BROWSE_RADIUS_MILES,
          outsideBrowseRadius: true
        }
      });
    }
    const activePings = await loadActiveDiscoveryMapPings(
      app,
      visibleProfiles.map((profile) => profile.profileToken)
    );

    return reply.send({
      data: {
        mapEpochMs: Date.now(),
        profiles: visibleProfiles.map((profile) => {
          const ping = activePings.get(profile.profileToken) ?? null;
          const { __pulseLat, __pulseLng, ...visibleProfile } = profile as typeof profile & {
            __pulseLat?: number;
            __pulseLng?: number;
          };
          const shownCoordinates = Number.isFinite(__pulseLat) && Number.isFinite(__pulseLng)
            ? { lat: __pulseLat as number, lng: __pulseLng as number }
            : null;
          const activePing = ping && isDiscoveryMapPingVisible({
            viewerCoordinates,
            shownCoordinates,
            radiusMiles: ping.radiusMiles
          })
            ? { id: ping.id, expiresAt: ping.expiresAt }
            : null;

          return {
            ...visibleProfile,
            travelling: travelPins.has(profile.profileToken),
            travelLabel: travelPins.get(profile.profileToken)?.label ?? "",
            activePing
          };
        })
      }
    });
  });
}
