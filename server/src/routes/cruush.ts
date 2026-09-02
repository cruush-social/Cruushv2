import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import {
  cruushMatchSettingsPayloadSchema,
  getCruushMatchSettings,
  saveCruushMatchSettings
} from "../cruush-match-settings.js";
import { createCruushPayloadSchema } from "../cruush-schema.js";
import { hasPremiumDiscoveryFilters, requireCruushPlus } from "../billing.js";
import { normalizeSingleLineText } from "../input-schema.js";
import { recordMeaningfulActivitySafely } from "../rewards-service.js";
import { createAppNotificationAndPush } from "../notification-service.js";
import {
  ensureMutualCruushMatch,
  getCruushEntitlement,
  getEffectiveVisibilityPolicy,
  getPrivacySettings,
  getRelationshipPermissions,
  revokeOutgoingCruush,
  revokeMutualCruushMatch
} from "../match-relationships.js";
import {
  buildEncryptedRelationshipPayload,
  findEncryptedRelationshipRecord,
  listEncryptedRelationshipRecordsByActor,
  listEncryptedRelationshipRecordsByParticipant,
  listEncryptedRelationshipRecordsByTarget,
  upsertEncryptedRelationshipRecord,
  type EncryptedRelationshipRecord
} from "../encrypted-relationships.js";
import { formatDistanceMiles, formatLastActiveFromDate } from "../discovery-users.js";
import {
  CROWD_OPTIONS,
  decryptProfileVisibility,
  decryptSensitiveProfile,
  normalizeCrowdOption
} from "../profile-sensitive.js";
import {
  canSubjectViewProfile,
  type VisibilityCoordinates,
  type VisibilitySubjectProfile
} from "../profile-visibility.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { assertUsersNotBlocked, loadBlockedRelationshipUserIds } from "../user-blocks.js";
import {
  buildDefaultVisibilityPolicy,
  formatDistanceLabel,
  loadLocationEnvelope,
  locationPayloadToCoordinates,
  describeGhostRotation,
  makeDisplayLocationToken,
  type DisplayMode,
  type VisibilityBaseMode
} from "../location-privacy.js";
import { isWithinServiceArea } from "../service-area.js";
import { loadTravelPins, locationPayloadAtTravelPin } from "../travel-pins.js";

const cruushActivityParamsSchema = z.object({
  userId: z.uuid()
}).strict();

const revokeMatchParamsSchema = z.object({
  otherUserId: z.uuid()
}).strict();

const mutualMapQueryArrayField = z.preprocess((value) => {
  if (value === undefined) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => typeof item === "string"
    ? item.split(",").map(normalizeSingleLineText).filter(Boolean)
    : []);
}, z.array(z.string().min(1).max(120)).max(50).default([]));

const mutualMapBooleanQueryFlag = z.preprocess((value) => {
  if (value === undefined) {
    return false;
  }

  const normalizedValue = Array.isArray(value) ? value[0] : value;
  return typeof normalizedValue === "string"
    ? ["1", "true", "yes", "on"].includes(normalizedValue.trim().toLowerCase())
    : normalizedValue === true;
}, z.boolean().default(false));

const mutualMapCrowdQueryArrayField = z.preprocess((value) => {
  if (value === undefined) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => typeof item === "string"
    ? item.split(",").map((part) => normalizeCrowdOption(part.trim()) ?? part.trim()).filter(Boolean)
    : []);
}, z.array(z.enum(CROWD_OPTIONS)).max(3).default([]));

const mutualMapQuerySchema = z.object({
  q: z.preprocess(
    (value) => typeof value === "string" ? normalizeSingleLineText(value) : value,
    z.string().max(120).optional()
  ),
  mileHighClub: mutualMapBooleanQueryFlag,
  distance: z.coerce.number().min(1).max(100).optional(),
  minAge: z.coerce.number().int().min(18).max(99).optional(),
  maxAge: z.coerce.number().int().min(18).max(99).optional(),
  identities: mutualMapQueryArrayField,
  presentations: mutualMapQueryArrayField,
  lookingFor: mutualMapQueryArrayField,
  timing: mutualMapQueryArrayField,
  hosting: mutualMapQueryArrayField,
  vibes: mutualMapQueryArrayField,
  crowds: mutualMapCrowdQueryArrayField,
  hobbies: mutualMapQueryArrayField,
  positions: mutualMapQueryArrayField,
  roles: mutualMapQueryArrayField,
  kinks: mutualMapQueryArrayField,
  bodyTypes: mutualMapQueryArrayField,
  sexuality: mutualMapQueryArrayField,
  substanceBoundaries: mutualMapQueryArrayField
}).strict().superRefine((query, context) => {
  if (query.minAge != null && query.maxAge != null && query.minAge > query.maxAge) {
    context.addIssue({
      code: "custom",
      message: "Minimum age cannot exceed maximum age.",
      path: ["minAge"]
    });
  }
});

type MutualMapQuery = z.infer<typeof mutualMapQuerySchema>;

type ReceivedCruushRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string | Date;
  mutual: boolean;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
};

type SentCruushRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string | Date;
  mutual: boolean;
  profile_user_id: string | null;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
  to_user_name: string | null;
  to_user_pronouns: string | null;
  to_user_photo: string | null;
};

type CreatedCruushRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string | Date;
  mutual: boolean;
};

type ExistingMutualCruushRow = CreatedCruushRow & {
  match_id: string;
};

type ActivityPersonRow = {
  id: string;
  from_user_id?: string;
  to_user_id?: string;
  created_at: string | Date;
  mutual?: boolean;
  profile_user_id?: string | null;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
  to_user_name?: string | null;
  to_user_pronouns?: string | null;
  to_user_photo?: string | null;
};

type ProfileViewRow = {
  id: string;
  viewed_at: string | Date;
  viewer_user_id: string;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
};

type MutualCruushRow = {
  match_id: string;
  other_user_id: string;
  display_name: string | null;
  bio: string | null;
  tags: string[] | null;
  pronouns: string[] | null;
  photos: string[] | null;
  photo_explicit?: boolean | null;
  badges?: string[] | null;
  side_badges?: unknown;
  travelling: boolean;
  updated_at: string | Date;
  year_of_birth: number | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  looking_for: string[] | null;
  vibes: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  body_type: string[] | null;
  availability: string[] | null;
  hobbies: string[] | null;
  position: string[] | null;
  role: string[] | null;
  hosting_travel: string[] | null;
  substance_boundaries: string[] | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
  profile_visibility_ciphertext: string | null;
  profile_visibility_nonce: string | null;
  profile_visibility_auth_tag: string | null;
  profile_visibility_key_version: string | null;
  ghost_mode_enabled: boolean | null;
  precise_location_visibility: "none" | "mutual_cruushes" | null;
  can_message: boolean | null;
  can_reveal_precise_location: boolean | null;
  target_base_mode: VisibilityBaseMode;
  target_dark_room_distance_label: boolean;
};

type CurrentProfileLocationRow = {
  display_name: string | null;
  bio: string | null;
  tags: string[] | null;
  year_of_birth: number | null;
  looking_for: string[] | null;
  vibes: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  body_type: string[] | null;
  availability: string[] | null;
  hobbies: string[] | null;
  position: string[] | null;
  role: string[] | null;
  hosting_travel: string[] | null;
  substance_boundaries: string[] | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
  profile_visibility_ciphertext: string | null;
  profile_visibility_nonce: string | null;
  profile_visibility_auth_tag: string | null;
  profile_visibility_key_version: string | null;
};

type ActivityProfileRow = {
  id: string;
  display_name: string | null;
  bio: string | null;
  tags: string[] | null;
  pronouns: string[] | null;
  photos: string[] | null;
  photo_explicit?: boolean | null;
  badges?: string[] | null;
  side_badges?: unknown;
  travelling: boolean;
  updated_at: string | Date;
  year_of_birth: number | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  looking_for: string[] | null;
  vibes: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  body_type: string[] | null;
  availability: string[] | null;
  hobbies: string[] | null;
  position: string[] | null;
  role: string[] | null;
  hosting_travel: string[] | null;
  substance_boundaries: string[] | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
  profile_visibility_ciphertext: string | null;
  profile_visibility_nonce: string | null;
  profile_visibility_auth_tag: string | null;
  profile_visibility_key_version: string | null;
  ghost_mode_enabled: boolean | null;
  precise_location_visibility: "none" | "mutual_cruushes" | null;
};

function isSchemaCompatibilityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "";

  if (["42703", "42P01", "42883", "22P02"].includes(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("column") ||
    message.includes("relation") ||
    message.includes("operator does not exist") ||
    message.includes("does not exist")
  );
}

async function safeQueryRows<T>(app: FastifyInstance, sql: string, values: unknown[] = []) {
  try {
    const result = await app.db.query<T>(sql, values);
    return result?.rows ?? [];
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return [];
    }

    throw error;
  }
}

function mapReceivedCruushRow(row: ReceivedCruushRow) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    createdAt: new Date(row.created_at).toISOString(),
    mutual: row.mutual,
    user: {
      id: row.from_user_id,
      name: row.display_name?.trim() || "cruush user",
      pronouns: row.pronouns?.join(", ") ?? "",
      photo: row.photos?.[0] ?? null
    }
  };
}

function mapSentCruushRow(row: SentCruushRow) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    createdAt: new Date(row.created_at).toISOString(),
    mutual: row.mutual,
    user: {
      id: row.profile_user_id ?? row.to_user_id,
      name: row.display_name?.trim() || row.to_user_name?.trim() || "cruush user",
      pronouns: row.pronouns?.join(", ") ?? row.to_user_pronouns ?? "",
      photo: row.photos?.[0] ?? null
    }
  };
}

function mapActivityPerson(row: {
  userId: string;
  displayName: string | null;
  pronouns?: string[] | null;
  photos?: string[] | null;
  photoExplicit?: boolean | null;
  fallbackName?: string | null;
  fallbackPronouns?: string | null;
  fallbackPhoto?: string | null;
  badges?: string[] | null;
  sideBadges?: unknown;
  travelling?: boolean;
  vibes?: string[] | null;
}) {
  return {
    id: row.userId,
    name: row.displayName?.trim() || row.fallbackName?.trim() || "cruush user",
    pronouns: row.pronouns?.join(", ") ?? row.fallbackPronouns ?? "",
    photo: row.photos?.[0] ?? null,
    photoExplicit: row.photoExplicit === true,
    travelling: row.travelling === true,
    vibes: row.vibes ?? [],
    ...((row.badges?.length ?? 0) > 0 ? { badges: row.badges } : {}),
    ...(row.sideBadges ? { sideBadges: row.sideBadges } : {})
  };
}

function activityProfileVibes(profile: ActivityProfileRow | null | undefined) {
  return uniqueStrings([
    ...(profile?.vibes ?? []),
    ...(profile?.scenes ?? []),
    ...(profile?.archetypes ?? [])
  ]);
}

function lockable<T extends { locked?: boolean; user?: unknown }>(
  rows: T[],
  isCruushPlus: boolean,
  freeVisibleCount = 1
) {
  if (isCruushPlus) {
    return rows.map((row) => ({ ...row, locked: false }));
  }

  return rows.map((row, index) => index < freeVisibleCount
    ? { ...row, locked: false }
    : { ...row, locked: true, user: null });
}

function parseCoordinate(value: number | null | undefined) {
  return Number.isFinite(value) ? value as number : null;
}

async function notifyCruushEvent(app: FastifyInstance, input: {
  userId: string;
  actorUserId: string;
  type: "incoming_cruush" | "mutual_cruush";
  dedupeKey: string;
}) {
  try {
    await createAppNotificationAndPush(app, {
      userId: input.userId,
      actorUserId: input.actorUserId,
      type: input.type,
      title: input.type === "mutual_cruush" ? "It's mutual" : "You got a cruush",
      body: "Open cruush to check it.",
      linkUrl: "/cruush",
      dedupeKey: input.dedupeKey
    });
  } catch (error) {
    app.log.warn({ err: error, userId: input.userId, type: input.type }, "cruush notification dispatch failed");
  }
}

async function removeRevokedCruushNotifications(app: FastifyInstance, input: {
  userId: string;
  otherUserId: string;
  outgoingCruushId: string | null;
  matchId: string | null;
}) {
  const dedupeKeys = [
    input.outgoingCruushId
      ? `incoming-cruush:${input.outgoingCruushId}:${input.otherUserId}`
      : null,
    input.matchId
      ? `mutual-cruush:${input.matchId}:${input.userId}`
      : null,
    input.matchId
      ? `mutual-cruush:${input.matchId}:${input.otherUserId}`
      : null
  ].filter((value): value is string => Boolean(value));

  if (dedupeKeys.length === 0) {
    return;
  }

  try {
    await app.db.query(
      `delete from app_notifications
       where user_id = any($1::uuid[])
         and dedupe_key = any($2::text[])`,
      [[input.userId, input.otherUserId], dedupeKeys]
    );
  } catch (error) {
    app.log.warn({ err: error, userId: input.userId, otherUserId: input.otherUserId }, "revoked cruush notification cleanup failed");
  }
}

function getRowCoordinates(row: Pick<MutualCruushRow | CurrentProfileLocationRow, "lat" | "lng" | "fuzzy_lat" | "fuzzy_lng">, precise = false) {
  const lat = precise ? row.lat ?? row.fuzzy_lat : row.fuzzy_lat ?? row.lat;
  const lng = precise ? row.lng ?? row.fuzzy_lng : row.fuzzy_lng ?? row.lng;

  return {
    lat: parseCoordinate(lat),
    lng: parseCoordinate(lng)
  };
}

function formatMaybeDistance(
  center: { lat: number | null; lng: number | null } | null,
  target: { lat: number | null; lng: number | null }
) {
  if (center?.lat == null || center.lng == null || target.lat == null || target.lng == null) {
    return "Nearby";
  }

  return formatDistanceMiles(center.lat, center.lng, target.lat, target.lng);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hasAnyCrowd(requiredCrowds: string[], actualCrowds: string[]) {
  if (requiredCrowds.length === 0) {
    return true;
  }

  const actual = new Set(actualCrowds.map((crowd) => crowd.trim().toLowerCase()));
  return requiredCrowds.some((crowd) => actual.has(crowd.trim().toLowerCase()));
}

function matchesAnySelected(selected: string[], actual: string[] | null | undefined) {
  if (selected.length === 0) {
    return true;
  }

  const actualValues = new Set((actual ?? []).map((value) => value.trim().toLowerCase()));
  return selected.some((value) => actualValues.has(value.trim().toLowerCase()));
}

function mapDistanceMiles(first: VisibilityCoordinates, second: VisibilityCoordinates) {
  if (first.lat == null || first.lng == null || second.lat == null || second.lng == null) {
    return null;
  }

  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(second.lat - first.lat);
  const lngDelta = toRadians(second.lng - first.lng);
  const firstLat = toRadians(first.lat);
  const secondLat = toRadians(second.lat);
  const a = Math.sin(latDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

function matchesMutualMapSeeking(
  target: VisibilitySubjectProfile,
  targetCoordinates: VisibilityCoordinates,
  viewerCoordinates: VisibilityCoordinates | null,
  filters: MutualMapQuery
) {
  const searchQuery = filters.q?.trim().toLowerCase();
  const searchTagQuery = searchQuery?.replace(/^#+/, "");
  const textMatch = searchQuery ? [
    target.display_name ?? "",
    target.bio ?? "",
    ...(target.identities ?? []),
    ...(target.presentations ?? []),
    ...(target.looking_for ?? []),
    ...(target.timing ?? []),
    ...(target.hosting ?? []),
    ...(target.vibes ?? []),
    ...(target.scenes ?? []),
    ...(target.archetypes ?? []),
    ...(target.crowds ?? []),
    ...(target.hobbies ?? []),
    ...(target.positions ?? []),
    ...(target.roles ?? []),
    ...(target.kinks ?? []),
    ...(target.body_types ?? []),
    ...(target.sexuality ?? []),
    ...(target.substance_boundaries ?? []),
  ].some((value) => value.trim().toLowerCase().includes(searchQuery)) : true;
  const tagMatch = searchTagQuery
    ? (target.tags ?? []).some((value) => value.trim().toLowerCase().includes(searchTagQuery))
    : true;
  if (searchQuery && !textMatch && !tagMatch) {
    return false;
  }

  if (filters.minAge != null || filters.maxAge != null) {
    const age = target.year_of_birth ? new Date().getFullYear() - target.year_of_birth : null;
    if (age == null || (filters.minAge != null && age < filters.minAge) || (filters.maxAge != null && age > filters.maxAge)) {
      return false;
    }
  }

  if (filters.distance != null) {
    const distance = viewerCoordinates ? mapDistanceMiles(viewerCoordinates, targetCoordinates) : null;
    if (distance == null || distance > filters.distance) {
      return false;
    }
  }

  return matchesAnySelected(filters.identities, target.identities) &&
    matchesAnySelected(filters.presentations, target.presentations) &&
    matchesAnySelected(filters.lookingFor, target.looking_for) &&
    matchesAnySelected(filters.timing, target.timing) &&
    matchesAnySelected(filters.hosting, target.hosting) &&
    matchesAnySelected(filters.vibes, [
      ...(target.vibes ?? []),
      ...(target.scenes ?? []),
      ...(target.archetypes ?? [])
    ]) &&
    matchesAnySelected(filters.crowds, target.crowds) &&
    matchesAnySelected(filters.hobbies, target.hobbies) &&
    matchesAnySelected(filters.positions, target.positions) &&
    matchesAnySelected(filters.roles, target.roles) &&
    matchesAnySelected(filters.kinks, target.kinks) &&
    matchesAnySelected(filters.bodyTypes, target.body_types) &&
    matchesAnySelected(filters.sexuality, target.sexuality) &&
    matchesAnySelected(filters.substanceBoundaries, target.substance_boundaries);
}

function toMapVisibilitySubject(
  app: FastifyInstance,
  row: CurrentProfileLocationRow | MutualCruushRow,
  coordinates: VisibilityCoordinates | null
): VisibilitySubjectProfile {
  const sensitiveProfile = decryptSensitiveProfile(app.config, row);
  const kinks = sensitiveProfile?.kink_interests.length
    ? sensitiveProfile.kink_interests.map((interest) => interest.label ?? interest.kink_id)
    : sensitiveProfile?.kinks ?? [];

  return {
    display_name: row.display_name,
    bio: row.bio,
    tags: row.tags ?? [],
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
    kinks,
    body_types: row.body_type ?? [],
    sexuality: row.sexuality ?? [],
    substance_boundaries: row.substance_boundaries ?? [],
    coordinates
  };
}

async function loadCurrentProfileLocation(app: FastifyInstance, userId: string) {
  return (await safeQueryRows<CurrentProfileLocationRow>(
    app,
    `select
       display_name,
       bio,
       tags,
       year_of_birth,
       looking_for,
       vibes,
       scenes,
       archetypes,
       identities,
       presentation,
       sexuality,
       body_type,
       availability,
       hobbies,
       position,
       role,
       hosting_travel,
       substance_boundaries,
       null::double precision as lat,
       null::double precision as lng,
       null::double precision as fuzzy_lat,
       null::double precision as fuzzy_lng,
       profile_sensitive_ciphertext,
       profile_sensitive_nonce,
       profile_sensitive_auth_tag,
       profile_sensitive_key_version,
       profile_visibility_ciphertext,
       profile_visibility_nonce,
       profile_visibility_auth_tag,
       profile_visibility_key_version
     from profiles
     where id = $1
     limit 1`,
    [userId]
  ))[0] ?? null;
}

async function loadActivityProfiles(app: FastifyInstance, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

  if (uniqueUserIds.length === 0) {
    return new Map<string, ActivityProfileRow>();
  }

  const rows = await safeQueryRows<ActivityProfileRow>(
    app,
    `select
       profiles.id::text as id,
       profiles.display_name,
       profiles.bio,
       profiles.tags,
       profiles.pronouns,
       profiles.photos,
       coalesce((
         select media.explicit_classification is distinct from 'non_explicit'
         from media_objects media
         where media.owner_user_id = profiles.id
           and media.public_url = profiles.photos[1]
           and media.surface = 'profile_photo'
           and media.deleted_at is null
         limit 1
       ), true) as photo_explicit,
       profiles.updated_at,
       profiles.year_of_birth,
       null::double precision as lat,
       null::double precision as lng,
       null::double precision as fuzzy_lat,
       null::double precision as fuzzy_lng,
       profiles.looking_for,
       profiles.vibes,
       profiles.scenes,
       profiles.archetypes,
       (to_jsonb(profiles)->'side_badges') as side_badges,
       exists (
         select 1 from user_travel_pins travel
         where travel.user_id = profiles.id
           and travel.set_at > now() - interval '24 hours'
       ) as travelling,
       profiles.identities,
       profiles.presentation,
       profiles.sexuality,
       profiles.body_type,
       profiles.availability,
       profiles.hobbies,
       profiles.position,
       profiles.role,
       profiles.hosting_travel,
       profiles.substance_boundaries,
       profiles.profile_sensitive_ciphertext,
       profiles.profile_sensitive_nonce,
       profiles.profile_sensitive_auth_tag,
       profiles.profile_sensitive_key_version,
       profiles.profile_visibility_ciphertext,
       profiles.profile_visibility_nonce,
       profiles.profile_visibility_auth_tag,
       profiles.profile_visibility_key_version,
       null::boolean as ghost_mode_enabled,
       null::text as precise_location_visibility,
       coalesce((
         select array_agg(user_badges.badge_key order by user_badges.awarded_at asc)
         from user_badges
         where user_badges.user_id = profiles.id
       ), '{}'::text[]) as badges
     from profiles
     where profiles.id = any($1::uuid[])`,
    [uniqueUserIds]
  );

  return new Map(rows.map((row) => [row.id, row]));
}

function isGhostProfile(profile: Pick<ActivityProfileRow, "ghost_mode_enabled"> | null | undefined) {
  return profile?.ghost_mode_enabled === true;
}

function otherUserIdForRecord(record: EncryptedRelationshipRecord, currentUserId: string) {
  return record.payload.actorUserId === currentUserId
    ? record.payload.targetUserId
    : record.payload.actorUserId;
}

async function hasActiveMutualCruush(app: FastifyInstance, firstUserId: string, secondUserId: string) {
  return Boolean(await findEncryptedRelationshipRecord(app, {
    type: "mutual_cruush",
    actorUserId: firstUserId,
    targetUserId: secondUserId
  }));
}

async function loadMutualCruushRows(app: FastifyInstance, userId: string) {
  const records = await listEncryptedRelationshipRecordsByParticipant(app, {
    participantUserId: userId,
    type: "mutual_cruush"
  });
  const blockedUserIds = await loadBlockedRelationshipUserIds(app, userId);
  const visibleRecords = records.filter((record) => !blockedUserIds.has(otherUserIdForRecord(record, userId)));
  const otherUserIds = visibleRecords.map((record) => otherUserIdForRecord(record, userId));
  const profilesById = await loadActivityProfiles(app, otherUserIds);
  const rows = await Promise.all(visibleRecords.map(async (record): Promise<MutualCruushRow | null> => {
    const otherUserId = otherUserIdForRecord(record, userId);
    const profile = profilesById.get(otherUserId);

    if (!profile) {
      return null;
    }

    const relationship = await getRelationshipPermissions(app, userId, otherUserId);

    return {
      match_id: record.id,
      other_user_id: otherUserId,
      display_name: profile.display_name,
      bio: profile.bio,
      tags: profile.tags,
      pronouns: profile.pronouns,
      photos: profile.photos,
      photo_explicit: profile.photo_explicit,
      badges: profile.badges,
      side_badges: profile.side_badges,
      travelling: profile.travelling,
      updated_at: profile.updated_at,
      year_of_birth: profile.year_of_birth,
      lat: profile.lat,
      lng: profile.lng,
      fuzzy_lat: profile.fuzzy_lat,
      fuzzy_lng: profile.fuzzy_lng,
      looking_for: profile.looking_for,
      vibes: profile.vibes,
      scenes: profile.scenes,
      archetypes: profile.archetypes,
      identities: profile.identities,
      presentation: profile.presentation,
      sexuality: profile.sexuality,
      body_type: profile.body_type,
      availability: profile.availability,
      hobbies: profile.hobbies,
      position: profile.position,
      role: profile.role,
      hosting_travel: profile.hosting_travel,
      substance_boundaries: profile.substance_boundaries,
      profile_sensitive_ciphertext: profile.profile_sensitive_ciphertext,
      profile_sensitive_nonce: profile.profile_sensitive_nonce,
      profile_sensitive_auth_tag: profile.profile_sensitive_auth_tag,
      profile_sensitive_key_version: profile.profile_sensitive_key_version,
      profile_visibility_ciphertext: profile.profile_visibility_ciphertext,
      profile_visibility_nonce: profile.profile_visibility_nonce,
      profile_visibility_auth_tag: profile.profile_visibility_auth_tag,
      profile_visibility_key_version: profile.profile_visibility_key_version,
      ghost_mode_enabled: profile.ghost_mode_enabled,
      precise_location_visibility: profile.precise_location_visibility,
      can_message: relationship.canMessage,
      can_reveal_precise_location: relationship.canRevealPreciseLocation,
      target_base_mode: relationship.targetBaseMode ?? "GHOST",
      target_dark_room_distance_label: relationship.targetDarkRoomDistanceLabel === true
    };
  }));

  return rows.filter((row): row is MutualCruushRow => row !== null);
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

async function mapTokenizedMutualCruushRow(
  app: FastifyInstance,
  request: FastifyRequest,
  viewerUserId: string,
  row: MutualCruushRow,
  options: {
    currentCoordinates: { lat: number | null; lng: number | null } | null;
    currentCrowds: string[];
    activeCrowdModes: string[];
    viewerSubject: VisibilitySubjectProfile | null;
    activeTravelUserIds: Set<string>;
    filters: MutualMapQuery;
  }
) {
  const sensitiveProfile = decryptSensitiveProfile(app.config, row);
  const otherCrowds = sensitiveProfile?.crowds ?? [];

  if (!hasAnyCrowd(options.activeCrowdModes, otherCrowds)) {
    return null;
  }

  if (options.filters.mileHighClub && !options.activeTravelUserIds.has(row.other_user_id)) {
    return null;
  }

  const location = await loadLocationEnvelope(app, row.other_user_id).catch((error) => {
    if (isSchemaCompatibilityError(error)) {
      return null;
    }

    throw error;
  });

  if (!location) {
    return null;
  }

  const preciseCoordinates = locationPayloadToCoordinates(location);
  const targetSubject = toMapVisibilitySubject(app, row, preciseCoordinates);
  if (!matchesMutualMapSeeking(targetSubject, preciseCoordinates, options.currentCoordinates, options.filters)) {
    return null;
  }
  const targetVisibilityRules = decryptProfileVisibility(app.config, row);
  if (options.viewerSubject && !canSubjectViewProfile(targetVisibilityRules, options.viewerSubject, preciseCoordinates)) {
    return null;
  }

  const policy = await loadPolicyOrDefault(app, row.other_user_id);

  if (policy.baseMode === "STEALTH") {
    return null;
  }

  const relationship = await getRelationshipPermissions(app, viewerUserId, row.other_user_id);
  const displayMode: DisplayMode = relationship.canRevealPreciseLocation
    ? "PRECISE"
    : policy.baseMode === "GHOST"
      ? "GHOST"
      : "PRECISE";
  const token = await makeDisplayLocationToken(app, request, {
    subjectUserId: row.other_user_id,
    viewerUserId,
    policy,
    location,
    displayMode,
    relationshipGrantVersion: relationship.isMutualCruush ? 1 : 0
  });
  const ghostRotation = displayMode === "GHOST"
    ? await describeGhostRotation(app, row.other_user_id, policy)
    : null;
  const currentCrowds = new Set(options.currentCrowds.map((crowd) => crowd.toLowerCase()));
  const sharedCrowds = otherCrowds.filter((crowd) => currentCrowds.has(crowd.toLowerCase()));
  const vibes = uniqueStrings([
    ...(row.vibes ?? []),
    ...(row.scenes ?? []),
    ...(row.archetypes ?? [])
  ]);

  return {
    profileToken: row.other_user_id,
    matchId: row.match_id,
    createdAt: new Date(row.updated_at).toISOString(),
    locked: false,
    user: mapActivityPerson({
      userId: row.other_user_id,
      displayName: row.display_name,
      pronouns: row.pronouns,
      photos: row.photos,
      photoExplicit: row.photo_explicit,
      badges: row.badges ?? null,
      sideBadges: row.side_badges,
      travelling: row.travelling,
      vibes
    }),
    mutualCrowds: sharedCrowds,
    vibes,
    distanceLabel: options.activeTravelUserIds.has(row.other_user_id) && !relationship.canRevealPreciseLocation
      ? "Far far away"
      : options.currentCoordinates?.lat != null && options.currentCoordinates.lng != null
        ? formatDistanceLabel({
            displayMode,
            viewerLat: options.currentCoordinates.lat,
            viewerLng: options.currentCoordinates.lng,
            targetLat: preciseCoordinates.lat,
            targetLng: preciseCoordinates.lng
          })
        : "Nearby",
    lastActive: formatLastActiveFromDate(row.updated_at),
    canMessage: relationship.canMessage,
    canRevealPreciseLocation: relationship.canRevealPreciseLocation,
    displayLocationToken: token,
    displayExpiresAtMs: token.expiresAtMs,
    // Same reason as the discovery route: the hint belongs to this profile's own
    // rotation window, not to every ghost profile at once.
    animationHint: ghostRotation?.animationHint ?? "NONE",
    ...(ghostRotation?.rotationExpiresAtMs
      ? { ghostRotationExpiresAtMs: ghostRotation.rotationExpiresAtMs }
      : {}),
    relationshipContext: "MUTUAL_CRUUSH",
    relationship: {
      mutualCruush: true,
      canMessage: relationship.canMessage,
      precision: displayMode === "PRECISE" ? "precise" : "fuzzy"
    }
  };
}

function mapMutualCruushRow(
  app: FastifyInstance,
  row: MutualCruushRow,
  options: {
    currentCoordinates: { lat: number | null; lng: number | null } | null;
    currentCrowds: string[];
    viewerGhostMode: boolean;
  }
) {
  const preciseAllowed = row.can_reveal_precise_location === true
    && !options.viewerGhostMode
    && row.target_base_mode !== "STEALTH";
  const coordinates = getRowCoordinates(row, preciseAllowed);
  const sensitiveProfile = decryptSensitiveProfile(app.config, row);
  const otherCrowds = sensitiveProfile?.crowds ?? [];
  const currentCrowds = new Set(options.currentCrowds.map((crowd) => crowd.toLowerCase()));
  const sharedCrowds = otherCrowds.filter((crowd) => currentCrowds.has(crowd.toLowerCase()));
  const vibes = uniqueStrings([
    ...(row.vibes ?? []),
    ...(row.scenes ?? []),
    ...(row.archetypes ?? [])
  ]);

  return {
    id: row.match_id,
    matchId: row.match_id,
    createdAt: new Date(row.updated_at).toISOString(),
    locked: false,
    user: mapActivityPerson({
      userId: row.other_user_id,
      displayName: row.display_name,
      pronouns: row.pronouns,
      photos: row.photos,
      photoExplicit: row.photo_explicit,
      badges: row.badges ?? null,
      sideBadges: row.side_badges,
      travelling: row.travelling,
      vibes
    }),
    mutualCrowds: sharedCrowds,
    vibes,
    distance: row.target_base_mode === "STEALTH" && row.target_dark_room_distance_label
      ? "Dark Room"
      : row.travelling && !preciseAllowed
        ? "Far far away"
        : formatMaybeDistance(options.currentCoordinates, coordinates),
    lastActive: formatLastActiveFromDate(row.updated_at),
    canMessage: row.can_message === true,
    canRevealPreciseLocation: preciseAllowed,
    coordinates: coordinates.lat != null && coordinates.lng != null
      ? {
          lat: coordinates.lat,
          lng: coordinates.lng,
          precision: preciseAllowed ? "precise" : "fuzzy"
        }
      : null
  };
}

async function loadCruushActivityRecords(app: FastifyInstance, userId: string) {
  const [incomingRecords, sentRecords, viewRecords] = await Promise.all([
    listEncryptedRelationshipRecordsByTarget(app, {
      targetUserId: userId,
      type: "cruush"
    }),
    listEncryptedRelationshipRecordsByActor(app, {
      actorUserId: userId,
      type: "cruush"
    }),
    listEncryptedRelationshipRecordsByTarget(app, {
      targetUserId: userId,
      type: "profile_view"
    })
  ]);
  const blockedUserIds = await loadBlockedRelationshipUserIds(app, userId);
  const visibleIncomingRecords = incomingRecords.filter((record) => !blockedUserIds.has(record.payload.actorUserId));
  const visibleSentRecords = sentRecords.filter((record) => !blockedUserIds.has(record.payload.targetUserId));
  const visibleViewRecords = viewRecords.filter((record) => !blockedUserIds.has(record.payload.actorUserId));
  const profileIds = [
    ...visibleIncomingRecords.map((record) => record.payload.actorUserId),
    ...visibleSentRecords.map((record) => record.payload.targetUserId),
    ...visibleViewRecords.map((record) => record.payload.actorUserId)
  ];
  const profilesById = await loadActivityProfiles(app, profileIds);

  return {
    incomingRecords: visibleIncomingRecords,
    sentRecords: visibleSentRecords,
    viewRecords: visibleViewRecords,
    profilesById
  };
}

async function mapIncomingCruushRecords(
  app: FastifyInstance,
  userId: string,
  records: EncryptedRelationshipRecord[],
  profilesById: Map<string, ActivityProfileRow>
) {
  const rows = await Promise.all(records.map(async (record) => {
    const senderUserId = record.payload.actorUserId;
    const senderProfile = profilesById.get(senderUserId);

    if (isGhostProfile(senderProfile)) {
      return null;
    }

    const relationship = await getRelationshipPermissions(app, userId, senderUserId);

    return {
      id: record.id,
      createdAt: new Date(record.payload.createdAt).toISOString(),
      mutual: await hasActiveMutualCruush(app, userId, senderUserId),
      locked: false,
      permissions: {
        matchId: relationship.matchId,
        canMessage: relationship.canMessage,
        canRevealPreciseLocation: relationship.canRevealPreciseLocation
      },
      user: mapActivityPerson({
        userId: senderUserId,
        displayName: senderProfile?.display_name ?? null,
        pronouns: senderProfile?.pronouns ?? null,
        photos: senderProfile?.photos ?? null,
        photoExplicit: senderProfile?.photo_explicit,
        badges: senderProfile?.badges ?? null,
        sideBadges: senderProfile?.side_badges,
        travelling: senderProfile?.travelling,
        vibes: activityProfileVibes(senderProfile)
      })
    };
  }));

  return rows.filter((row): row is NonNullable<typeof row> => row !== null);
}

async function mapSentCruushRecords(
  app: FastifyInstance,
  userId: string,
  records: EncryptedRelationshipRecord[],
  profilesById: Map<string, ActivityProfileRow>
) {
  return Promise.all(records.map(async (record) => {
    const targetUserId = record.payload.targetUserId;
    const targetProfile = profilesById.get(targetUserId);
    const snapshot = record.payload.targetSnapshot;

    const relationship = await getRelationshipPermissions(app, userId, targetUserId);

    return {
      id: record.id,
      createdAt: new Date(record.payload.createdAt).toISOString(),
      mutual: await hasActiveMutualCruush(app, userId, targetUserId),
      locked: false,
      permissions: {
        matchId: relationship.matchId,
        canMessage: relationship.canMessage,
        canRevealPreciseLocation: relationship.canRevealPreciseLocation
      },
      user: mapActivityPerson({
        userId: targetUserId,
        displayName: targetProfile?.display_name ?? null,
        pronouns: targetProfile?.pronouns ?? null,
        photos: targetProfile?.photos ?? null,
        photoExplicit: targetProfile?.photo_explicit,
        fallbackName: snapshot?.name ?? null,
        fallbackPronouns: snapshot?.pronouns ?? null,
        badges: targetProfile?.badges ?? null,
        sideBadges: targetProfile?.side_badges,
        travelling: targetProfile?.travelling,
        vibes: activityProfileVibes(targetProfile)
      })
    };
  }));
}

function mapProfileViewRecords(
  records: EncryptedRelationshipRecord[],
  profilesById: Map<string, ActivityProfileRow>
) {
  return records
    .map((record) => {
      const viewerUserId = record.payload.actorUserId;
      const viewerProfile = profilesById.get(viewerUserId);

      if (isGhostProfile(viewerProfile)) {
        return null;
      }

      return {
        id: record.id,
        createdAt: new Date(record.payload.createdAt).toISOString(),
        viewedAt: new Date(record.payload.createdAt).toISOString(),
        locked: false,
        user: mapActivityPerson({
          userId: viewerUserId,
          displayName: viewerProfile?.display_name ?? null,
          pronouns: viewerProfile?.pronouns ?? null,
          photos: viewerProfile?.photos ?? null,
          photoExplicit: viewerProfile?.photo_explicit,
          badges: viewerProfile?.badges ?? null,
          sideBadges: viewerProfile?.side_badges,
          travelling: viewerProfile?.travelling,
          vibes: activityProfileVibes(viewerProfile)
        })
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

export async function registerCruushRoutes(app: FastifyInstance) {
  app.get("/api/cruush/settings", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);

    return reply.send({
      data: await getCruushMatchSettings(app, authenticatedUserId)
    });
  });

  app.put("/api/cruush/settings", async (request, reply) => {
    const authenticatedUserId = await getActiveAccountUserId(request);
    const payload = cruushMatchSettingsPayloadSchema.parse(request.body);

    return reply.send({
      data: await saveCruushMatchSettings(app, authenticatedUserId, payload)
    });
  });

  app.get("/api/cruush/me", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const entitlement = await getCruushEntitlement(app, authenticatedUserId);
    const isCruushPlus = entitlement.cruushPlus;
    const viewerPrivacy = await getPrivacySettings(app, authenticatedUserId);
    const currentProfile = await loadCurrentProfileLocation(app, authenticatedUserId);
    const currentSensitiveProfile = currentProfile
      ? decryptSensitiveProfile(app.config, currentProfile)
      : null;
    const currentCoordinates = currentProfile
      ? getRowCoordinates(currentProfile, false)
      : null;

    const [{ incomingRecords, sentRecords, viewRecords, profilesById }, mutualRows] = await Promise.all([
      loadCruushActivityRecords(app, authenticatedUserId),
      loadMutualCruushRows(app, authenticatedUserId)
    ]);
    const [incomingRows, sentRows] = await Promise.all([
      mapIncomingCruushRecords(app, authenticatedUserId, incomingRecords, profilesById),
      mapSentCruushRecords(app, authenticatedUserId, sentRecords, profilesById)
    ]);
    const viewRows = mapProfileViewRecords(viewRecords, profilesById);
    const incoming = lockable(incomingRows, isCruushPlus);
    const sent = sentRows;
    const mutual = mutualRows.map((row) => mapMutualCruushRow(app, row, {
      currentCoordinates,
      currentCrowds: currentSensitiveProfile?.crowds ?? [],
      viewerGhostMode: viewerPrivacy.ghostModeEnabled
    }));
    const views = lockable(viewRows, isCruushPlus);

    return reply.send({
      data: {
        entitlement,
        counts: {
          incoming: incomingRows.length,
          sent: sentRows.length,
          mutual: mutualRows.length,
          views: viewRows.length
        },
        incoming,
        sent,
        mutual,
        views
      }
    });
  });

  app.get("/api/cruush/mutual-map", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const filters = mutualMapQuerySchema.parse(request.query);
    if (hasPremiumDiscoveryFilters(filters)) {
      await requireCruushPlus(app, authenticatedUserId, "Upgrade to cruush+ to use all seeking filters.");
    }
    const currentLocation = await loadLocationEnvelope(app, authenticatedUserId).catch((error) => {
      if (isSchemaCompatibilityError(error)) {
        return null;
      }

      throw error;
    });
    let currentCoordinates = currentLocation
      ? locationPayloadToCoordinates(currentLocation)
      : null;
    const currentProfile = await loadCurrentProfileLocation(app, authenticatedUserId);
    const currentSensitiveProfile = currentProfile
      ? decryptSensitiveProfile(app.config, currentProfile)
      : null;
    const currentVisibilityRules = currentProfile
      ? decryptProfileVisibility(app.config, currentProfile)
      : null;
    const viewerSubject = currentProfile
      ? toMapVisibilitySubject(app, currentProfile, currentCoordinates)
      : null;
    const rows = await loadMutualCruushRows(app, authenticatedUserId);
    const travelPins = await loadTravelPins(app, [
      authenticatedUserId,
      ...rows.map((row) => row.other_user_id)
    ]).catch(() => new Map());
    const viewerTravelPin = travelPins.get(authenticatedUserId);
    if (currentLocation && viewerTravelPin) {
      currentCoordinates = locationPayloadToCoordinates(
        locationPayloadAtTravelPin(currentLocation, viewerTravelPin)
      );
    }
    if (viewerSubject) {
      viewerSubject.mile_high_club_member = travelPins.has(authenticatedUserId);
      viewerSubject.coordinates = currentCoordinates;
    }
    if (currentCoordinates && !isWithinServiceArea(currentCoordinates)) {
      return reply.send({
        data: {
          mapEpochMs: Date.now(),
          profiles: [],
          outsideServiceArea: true
        }
      });
    }
    const items = await Promise.all(rows.map((row) => mapTokenizedMutualCruushRow(app, request, authenticatedUserId, row, {
      currentCoordinates,
      currentCrowds: currentSensitiveProfile?.crowds ?? [],
      activeCrowdModes: currentVisibilityRules?.active_crowd_modes ?? [],
      viewerSubject,
      activeTravelUserIds: new Set(travelPins.keys()),
      filters
    })));

    return reply.send({
      data: {
        mapEpochMs: Date.now(),
        profiles: items.filter((item): item is NonNullable<typeof item> => item !== null)
      }
    });
  });

  app.delete("/api/cruush/matches/:otherUserId", async (request, reply) => {
    const authenticatedUserId = await getActiveAccountUserId(request);
    const { otherUserId } = revokeMatchParamsSchema.parse(request.params);

    const revoked = await revokeMutualCruushMatch(app, authenticatedUserId, otherUserId);
    await removeRevokedCruushNotifications(app, {
      userId: authenticatedUserId,
      otherUserId,
      ...revoked
    });

    return reply.send({
      data: {
        revoked: true
      }
    });
  });

  app.delete("/api/cruush/:otherUserId", async (request, reply) => {
    const authenticatedUserId = await getActiveAccountUserId(request);
    const { otherUserId } = revokeMatchParamsSchema.parse(request.params);

    if (otherUserId === authenticatedUserId) {
      throw new ApiError(400, "VALIDATION_ERROR", "You cannot revoke a cruush to yourself.");
    }

    const revoked = await revokeOutgoingCruush(app, authenticatedUserId, otherUserId);
    await removeRevokedCruushNotifications(app, {
      userId: authenticatedUserId,
      otherUserId,
      ...revoked
    });

    return reply.send({
      data: {
        revoked: true,
        mutualRevoked: Boolean(revoked.matchId)
      }
    });
  });

  app.get("/api/cruush/:userId", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const { userId: requestedUserId } = cruushActivityParamsSchema.parse(request.params);

    if (requestedUserId !== authenticatedUserId) {
      throw new ApiError(403, "FORBIDDEN", "You can only access your own cruush activity.");
    }

    const { incomingRecords, sentRecords, profilesById } = await loadCruushActivityRecords(app, authenticatedUserId);
    const [receivedRows, sentRows] = await Promise.all([
      mapIncomingCruushRecords(app, authenticatedUserId, incomingRecords, profilesById),
      mapSentCruushRecords(app, authenticatedUserId, sentRecords, profilesById)
    ]);

    return reply.send({
      data: {
        received: receivedRows.map((row) => ({
          id: row.id,
          fromUserId: row.user?.id ?? authenticatedUserId,
          toUserId: authenticatedUserId,
          createdAt: row.createdAt,
          mutual: row.mutual,
          user: row.user
        })),
        sent: sentRows.map((row) => ({
          id: row.id,
          fromUserId: authenticatedUserId,
          toUserId: row.user.id,
          createdAt: row.createdAt,
          mutual: row.mutual,
          user: row.user
        }))
      }
    });
  });

  app.post("/api/cruush", async (request, reply) => {
    const authenticatedUserId = await getActiveAccountUserId(request);
    const payload = createCruushPayloadSchema.parse(request.body);

    if (payload.toUserId === authenticatedUserId) {
      throw new ApiError(400, "VALIDATION_ERROR", "You cannot send a cruush to yourself.");
    }

    const existingMutual = await findEncryptedRelationshipRecord(app, {
      type: "mutual_cruush",
      actorUserId: authenticatedUserId,
      targetUserId: payload.toUserId
    });

    await assertUsersNotBlocked(app, authenticatedUserId, payload.toUserId, {
      statusCode: 404,
      code: "NOT_FOUND",
      message: "User not found."
    });

    if (existingMutual) {
      const existingCruush = await findEncryptedRelationshipRecord(app, {
        type: "cruush",
        actorUserId: authenticatedUserId,
        targetUserId: payload.toUserId
      });
      const relationship = await getRelationshipPermissions(app, authenticatedUserId, payload.toUserId);
      const createdAt = existingCruush?.payload.createdAt ?? existingMutual.payload.createdAt;

      return reply.code(200).send({
        data: {
          id: existingCruush?.id ?? existingMutual.id,
          fromUserId: authenticatedUserId,
          toUserId: payload.toUserId,
          createdAt: new Date(createdAt).toISOString(),
          mutual: true,
          permissions: {
            matchId: relationship.matchId ?? existingMutual.id,
            canMessage: relationship.canMessage,
            canRevealPreciseLocation: relationship.canRevealPreciseLocation
          }
        }
      });
    }

    const created = await upsertEncryptedRelationshipRecord(app, buildEncryptedRelationshipPayload({
      type: "cruush",
      actorUserId: authenticatedUserId,
      targetUserId: payload.toUserId,
      createdAt: new Date(),
      targetSnapshot: {
        name: payload.targetUser?.name ?? "",
        pronouns: payload.targetUser?.pronouns ?? "",
        // Client-supplied snapshot photo URLs are never persisted.
        photo: null
      }
    }));

    if (!created) {
      throw new ApiError(500, "INTERNAL_ERROR", "Failed to create cruush.");
    }

    const reciprocalCruush = await findEncryptedRelationshipRecord(app, {
      type: "cruush",
      actorUserId: payload.toUserId,
      targetUserId: authenticatedUserId
    });
    const isMutual = Boolean(reciprocalCruush);
    const match = isMutual
      ? await ensureMutualCruushMatch(app, authenticatedUserId, payload.toUserId)
      : null;
    const relationship = isMutual
      ? await getRelationshipPermissions(app, authenticatedUserId, payload.toUserId)
      : null;

    if (isMutual) {
      const matchKey = match?.id ?? reciprocalCruush?.id ?? created.id;
      await notifyCruushEvent(app, {
        userId: authenticatedUserId,
        actorUserId: payload.toUserId,
        type: "mutual_cruush",
        dedupeKey: `mutual-cruush:${matchKey}:${authenticatedUserId}`
      });
      await notifyCruushEvent(app, {
        userId: payload.toUserId,
        actorUserId: authenticatedUserId,
        type: "mutual_cruush",
        dedupeKey: `mutual-cruush:${matchKey}:${payload.toUserId}`
      });
    } else {
      await notifyCruushEvent(app, {
        userId: payload.toUserId,
        actorUserId: authenticatedUserId,
        type: "incoming_cruush",
        dedupeKey: `incoming-cruush:${created.id}:${payload.toUserId}`
      });
    }

    await recordMeaningfulActivitySafely(app, {
      userId: authenticatedUserId,
      activityType: "cruush",
      sourceEventId: created.id
    });

    return reply.code(201).send({
      data: {
        id: created.id,
        fromUserId: created.payload.actorUserId,
        toUserId: created.payload.targetUserId,
        createdAt: new Date(created.payload.createdAt).toISOString(),
        mutual: isMutual,
        ...(isMutual ? {
          permissions: {
            matchId: match?.id ?? relationship?.matchId ?? null,
            canMessage: relationship?.canMessage ?? Boolean(match),
            canRevealPreciseLocation: relationship?.canRevealPreciseLocation ?? false
          }
        } : {})
      }
    });
  });
}
