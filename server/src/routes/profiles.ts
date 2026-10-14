import { nonBannedAccountSql } from "../banned-content.js";
import { getMhcLocationLabel } from "../mhc-location-label.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { loadPhotoViewerRelationships, type PhotoViewerRelationship } from "../nsfw-photo-audience.js";
import { requireCruushPlus } from "../billing.js";
import { canStartDirectMessage } from "../cruush-match-settings.js";
import { runTransaction, type DbClient } from "../db.js";
import { ApiError } from "../errors.js";
import {
  getCruushEntitlement,
  getRelationshipPermissions,
  getEffectiveVisibilityPolicy,
  getPrivacySettings,
  recordProfileView,
  savePrivacySettings,
  type RelationshipPermissions
} from "../match-relationships.js";
import {
  birthYearFromDateOfBirth,
  emptySideBadges,
  emptyProfile,
  profileLocationPayloadSchema,
  profilePayloadSchema,
  sideBadgesSchema,
  profileVisibilityRulesSchema,
  signalSchema,
  type ProfilePayload
} from "../profile-schema.js";
import { moderateProfileOrReject } from "../moderation-service.js";
import {
  lockMapPingSenderInTransaction,
  mapVisibilityNarrowed,
  profileVisibilityNarrowed,
  revokeActiveMapPingsInTransaction
} from "../map-ping-revocation.js";
import { notifyNearbyUsersForLocationUpdate } from "../nearby-notifications.js";
import {
  canSubjectViewProfile,
  countVisibilityExclusionFilters,
  visibilityRulesArePublic,
  type VisibilityCoordinates,
  type VisibilitySubjectProfile
} from "../profile-visibility.js";
import {
  CROWD_OPTIONS,
  createCrowdTokens,
  createProfileVisibilityTokens,
  createSensitiveProfileTokens,
  decryptProfileVisibility,
  decryptSensitiveProfile,
  encryptProfileVisibility,
  normalizeCrowdOption,
  type EncryptedProfileVisibility,
  encryptSensitiveProfile,
  type EncryptedSensitiveProfile,
  type ProfileVisibilityRules,
  type SensitiveProfileData,
  type SensitiveProfileToken
} from "../profile-sensitive.js";
import { resolveVisibilityLocation } from "../visibility-location.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { assertUsersNotBlocked } from "../user-blocks.js";
import { canShowOnlineStatus, formatPresenceLabel } from "../discovery-users.js";
import { getTravelPin, locationPayloadAtTravelPin } from "../travel-pins.js";
import { isTombstonedProfileName } from "../profile-tombstone.js";
import {
  classifyCurrentOutOfSightLocation,
  loadOutOfSightStatuses,
  resolveOutOfSightLocationLabel
} from "../out-of-sight-location.js";
import { deliverOutOfSightWelcomeEmail, loadStoredOutOfSightStatuses, queueOutOfSightWelcomeEmail } from "../oos-welcome-email.js";
import { deliverPendingSinnersWelcomeEmailsForUser } from "../sinners-welcome-email.js";
import { getViewerOutsideServiceArea, loadOosHiddenProfileIds } from "../profile-oos-visibility.js";
import { loadCurrentTownLabels } from "../current-town-labels.js";
import {
  DEFAULT_GHOST_RADIUS_METERS,
  GHOST_RADIUS_OPTIONS,
  GHOST_ROTATION_MINUTES,
  formatDistanceLabel,
  loadLocationEnvelope,
  loadLocationEnvelopes,
  locationPayloadToCoordinates,
  loadVisibilityPolicy,
  makeDisplayLocationToken,
  normalizeVisibilityPolicy,
  publicPrivacySettings,
  radiusMetersForLabel,
  saveVisibilityPolicy,
  storeLocationEnvelope,
  type CrowdPrecisionPolicy,
  type LocationPayload,
  type VisibilityBaseMode
} from "../location-privacy.js";

const profileParamsSchema = z.object({
  userId: z.uuid()
}).strict();

const visibilitySetParamsSchema = z.object({
  setId: z.uuid()
}).strict();

const FIXED_PRIVATE_HEALTH_VISIBILITY: ProfileVisibility = "mutual_cruushes";

const visibilitySetPayloadSchema = z.object({
  name: z.string().trim().min(1).max(48),
  visibility_rules: profileVisibilityRulesSchema
}).strict();
const visibilityRulesPayloadSchema = z.object({
  visibility_rules: profileVisibilityRulesSchema
}).strict();
const FREE_VISIBILITY_EXCLUSION_LIMIT = 3;
const VISIBILITY_EXCLUSION_LIMIT_MESSAGE = "Free accounts can use up to 3 visibility filters. Upgrade to cruush+ for more.";
export const IDENTITY_GATE_LOCK_DAYS = 3;

const crowdIdSchema = z.preprocess((value) => normalizeCrowdOption(value) ?? value, z.enum(CROWD_OPTIONS));

const crowdPrecisionPolicySchema = z.object({
  crowdId: crowdIdSchema,
  precisionEnabled: z.boolean(),
  mutualityRequired: z.boolean().optional().default(true),
  minimumTrustLevel: z.enum(["MEMBER", "VERIFIED", "MUTUAL_INTERACTION"]).optional().default("MEMBER"),
  createdAtMs: z.number().int().optional(),
  revokedAtMs: z.number().int().nullable().optional().default(null)
}).strip();

const privacySettingsPayloadSchema = z.object({
  baseMode: z.enum(["PUBLIC_PRECISE", "GHOST", "STEALTH"]).optional(),
  ghostModeEnabled: z.boolean().optional(),
  ghostRadiusMeters: z.number().int().optional(),
  ghostRotationMinutes: z.number().int().refine((value) => GHOST_ROTATION_MINUTES.includes(value), "Ghost rotation interval is unsupported.").optional(),
  ghostLeashVisible: z.boolean().optional(),
  ghostRadiusLabel: z.string().optional(),
  preciseToMutualCruushes: z.boolean().optional(),
  preciseToMutualCrowds: z.array(crowdPrecisionPolicySchema).max(3).optional(),
  preciseLocationVisibility: z.enum(["none", "mutual_cruushes"]).optional(),
  darkRoomDistanceLabel: z.boolean().optional(),
  updatedAtMs: z.number().int().optional()
}).strict().superRefine((payload, ctx) => {
  if (
    typeof payload.ghostRadiusMeters === "number" &&
    !GHOST_RADIUS_OPTIONS.some((option) => option.meters === payload.ghostRadiusMeters)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ghost radius must be one of the supported values.",
      path: ["ghostRadiusMeters"]
    });
  }
});

type ProfileRow = {
  id: string;
  display_name: string | null;
  photos: string[] | null;
  photo_metadata?: ProfilePhotoMetadata[] | null;
  bio: string | null;
  tags: string[] | null;
  signal: string | null;
  pronouns: string[] | null;
  custom_pronouns: string | null;
  year_of_birth: number | null;
  show_age: boolean | null;
  ethnicity: string[] | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  body_type: string[] | null;
  body_hair: string[] | null;
  pubic_hair: string[] | null;
  facial_hair: string[] | null;
  height: string | null;
  weight: string | null;
  position: string[] | null;
  role: string[] | null;
  side_badges: ProfilePayload["side_badges"] | null;
  trans_status_visibility: ProfileVisibility | null;
  availability: string[] | null;
  hosting_travel: string[] | null;
  preferred_spots: string[] | null;
  kinks: string[] | null;
  kinks_visibility: ProfileVisibility | null;
  vibes: string[] | null;
  zodiac: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  hobbies: string[] | null;
  custom_hobby: string | null;
  looking_for: string[] | null;
  hiv_status: string[] | null;
  hiv_status_visibility: ProfileVisibility | null;
  custom_hiv_status: string | null;
  condoms: string[] | null;
  custom_condoms: string | null;
  prep: string[] | null;
  custom_prep: string | null;
  doxypep: string[] | null;
  custom_doxypep: string | null;
  covid_vaccine: string[] | null;
  custom_covid_vaccine: string | null;
  mpox_vaccine: string[] | null;
  custom_mpox_vaccine: string | null;
  protections: string[] | null;
  substance_boundaries: string[] | null;
  protection_boundaries: string[] | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
  profile_sensitive_token_key_version: string | null;
  profile_visibility_ciphertext: string | null;
  profile_visibility_nonce: string | null;
  profile_visibility_auth_tag: string | null;
  profile_visibility_key_version: string | null;
  profile_visibility_token_key_version: string | null;
  trans_crowds_changed_at: string | Date | null;
  lat?: number | null;
  lng?: number | null;
  fuzzy_lat?: number | null;
  fuzzy_lng?: number | null;
  location_fuzz_radius_meters?: number | null;
  location_updated_at?: string | Date | null;
  last_seen_at?: string | Date | null;
  badges?: string[] | null;
  attending_launch_party?: boolean | null;
  updated_at: string | Date;
};

type ProfileVisibilitySetRow = EncryptedProfileVisibility & {
  id: string;
  user_id?: string | null;
  name: string;
  display_order?: number | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type VisibilitySubjectRow = {
  tags: string[] | null;
  year_of_birth: number | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  body_type: string[] | null;
  body_hair: string[] | null;
  pubic_hair: string[] | null;
  facial_hair: string[] | null;
  looking_for: string[] | null;
  availability: string[] | null;
  hosting_travel: string[] | null;
  preferred_spots: string[] | null;
  vibes: string[] | null;
  zodiac: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  hobbies: string[] | null;
  position: string[] | null;
  role: string[] | null;
  kinks: string[] | null;
  substance_boundaries: string[] | null;
  protection_boundaries: string[] | null;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  profile_sensitive_ciphertext: string | null;
  profile_sensitive_nonce: string | null;
  profile_sensitive_auth_tag: string | null;
  profile_sensitive_key_version: string | null;
};

type ProfileVisibility = "public" | "mutual_cruushes" | "mutual_crowds";

/**
 * Birth control and the Masks preference live inside the encrypted profile
 * blob, which the SQL backfill in 144 cannot read. Fold them in here so a
 * member who recorded either still sees it under Protections.
 */
function withCarriedProtections(
  stored: string[] | null,
  sensitive: { birth_control?: string[] | null; health_preferences?: string[] | null } | null | undefined
): ProfilePayload["protections"] {
  const carried = new Set(stored ?? []);

  if ((sensitive?.birth_control ?? []).some((value) => value && value !== "Prefer not to say")) {
    carried.add("Birth control");
  }

  if ((sensitive?.health_preferences ?? []).includes("Masks")) {
    carried.add("Masks");
  }

  return [...carried] as ProfilePayload["protections"];
}

function hasPremiumPrivacySettings(input: {
  baseMode: VisibilityBaseMode;
  preciseToMutualCruushes: boolean;
  preciseToMutualCrowds: CrowdPrecisionPolicy[];
}) {
  return input.baseMode === "STEALTH";
}

function premiumPrivacyMessage(input: {
  baseMode: VisibilityBaseMode;
  preciseToMutualCruushes: boolean;
  preciseToMutualCrowds: CrowdPrecisionPolicy[];
}) {
  return "Upgrade to cruush+ to use Dark Room.";
}

type ProfileKinkInterest = {
  kink_id: string;
  label?: string;
  category?: string;
};

type ProfileKinkInterestRow = {
  kink_id: string | null;
  label: string | null;
  category: string | null;
};

type ProfileLocationRow = {
  id: string;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  location_fuzz_radius_meters: number | null;
  location_updated_at: string | Date | null;
  badges?: string[] | null;
};

type ProfilePhotoMetadata = {
  url: string;
  explicit: boolean;
};

function profilePhotoMetadataSelect(profileAlias = "profiles") {
  return `coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'url', photo.photo_url,
                  'explicit', coalesce(media.explicit_classification is distinct from 'non_explicit', true)
                )
                order by photo.ordinality
              )
              from unnest(coalesce(${profileAlias}.photos, '{}'::text[])) with ordinality as photo(photo_url, ordinality)
              left join media_objects media
                on media.owner_user_id = ${profileAlias}.id
               and media.public_url = photo.photo_url
               and media.surface = 'profile_photo'
               and media.deleted_at is null
            ), '[]'::jsonb) as photo_metadata`;
}

const PROFILE_COLUMNS = [
  "id",
  "display_name",
  "photos",
  "bio",
  "tags",
  "signal",
  "pronouns",
  "custom_pronouns",
  "year_of_birth",
  "show_age",
  "ethnicity",
  "identities",
  "presentation",
  "sexuality",
  "body_type",
  "body_hair",
  "pubic_hair",
  "facial_hair",
  "height",
  "weight",
  "position",
  "role",
  "trans_status_visibility",
  "availability",
  "hosting_travel",
  "preferred_spots",
  "kinks",
  "kinks_visibility",
  "vibes",
  "zodiac",
  "scenes",
  "archetypes",
  "hobbies",
  "custom_hobby",
  "looking_for",
  "hiv_status",
  "hiv_status_visibility",
  "custom_hiv_status",
  "condoms",
  "custom_condoms",
  "prep",
  "custom_prep",
  "doxypep",
  "custom_doxypep",
  "covid_vaccine",
  "custom_covid_vaccine",
  "mpox_vaccine",
  "custom_mpox_vaccine",
  "protections",
  "substance_boundaries",
  "protection_boundaries",
  "profile_sensitive_ciphertext",
  "profile_sensitive_nonce",
  "profile_sensitive_auth_tag",
  "profile_sensitive_key_version",
  "profile_sensitive_token_key_version",
  "profile_visibility_ciphertext",
  "profile_visibility_nonce",
  "profile_visibility_auth_tag",
  "profile_visibility_key_version",
  "profile_visibility_token_key_version",
  "trans_crowds_changed_at"
] as const;

const SIDE_BADGES_SELECT = "(to_jsonb(profiles)->'side_badges') as side_badges";

const PROFILE_VISIBILITY_SET_COLUMNS = [
  "id::text as id",
  "user_id::text as user_id",
  "name",
  "profile_visibility_ciphertext",
  "profile_visibility_nonce",
  "profile_visibility_auth_tag",
  "profile_visibility_key_version",
  "profile_visibility_token_key_version",
  "display_order",
  "created_at",
  "updated_at"
] as const;

function toKinkId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function legacyKinkToInterest(kink: string): ProfileKinkInterest | null {
  const kinkId = toKinkId(kink);

  if (!kinkId) {
    return null;
  }

  return {
    kink_id: kinkId,
    label: kink
  };
}

function mapKinkInterestRow(row: ProfileKinkInterestRow): ProfileKinkInterest | null {
  if (!row.kink_id) {
    return null;
  }

  return {
    kink_id: row.kink_id,
    label: row.label ?? row.kink_id,
    category: row.category ?? undefined
  };
}

function normalizeKinkInterests(payload: ProfilePayload): ProfileKinkInterest[] {
  const sourceInterests = payload.kink_interests.length > 0
    ? payload.kink_interests
    : payload.kinks.map((kink) => legacyKinkToInterest(kink)).filter((interest): interest is ProfileKinkInterest => Boolean(interest));
  const seen = new Set<string>();
  const interests: ProfileKinkInterest[] = [];

  for (const interest of sourceInterests) {
    const kinkId = toKinkId(interest.kink_id);

    if (!kinkId || seen.has(kinkId)) {
      continue;
    }

    seen.add(kinkId);
    interests.push({
      kink_id: kinkId,
      label: interest.label?.trim() || interest.kink_id,
      category: interest.category?.trim() || undefined
    });
  }

  return interests;
}

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

function mapProfileRow(
  row: ProfileRow,
  kinkInterests: ProfileKinkInterest[] = [],
  options: {
    includePrivateSensitive?: boolean;
    relationship?: RelationshipPermissions | null;
    hasMutualCrowd?: boolean;
    hasMutualCruush?: boolean;
    sensitiveProfile?: SensitiveProfileData | null;
    visibilityRules?: ProfileVisibilityRules | null;
    showKinks?: boolean;
    visibleCrowds?: string[];
    canMessage?: boolean;
  } = {}
) {
  const includePrivateSensitive = options.includePrivateSensitive ?? true;
  const hasMutualCrowd = options.hasMutualCrowd ?? false;
  const hasMutualCruush = options.hasMutualCruush ?? false;
  const canShowByVisibility = (visibility: ProfileVisibility | null | undefined) => {
    if (includePrivateSensitive) {
      return true;
    }

    if ((visibility ?? "public") === "public") {
      return true;
    }

    if ((visibility ?? "public") === "mutual_crowds") {
      return hasMutualCrowd;
    }

    return hasMutualCruush;
  };
  const sensitiveProfile = options.sensitiveProfile ?? null;
  const visibilityRules = options.visibilityRules ?? null;
  const showKinks = options.showKinks ?? canShowByVisibility(row.kinks_visibility);
  const visibleCrowds = options.visibleCrowds ?? (includePrivateSensitive ? sensitiveProfile?.crowds ?? [] : []);
  const showTransStatus = includePrivateSensitive ||
    (sensitiveProfile?.is_trans === true && visibleCrowds.includes("T4T"));
  const showHivStatus = canShowByVisibility(FIXED_PRIVATE_HEALTH_VISIBILITY);
  const legacyKinks = showKinks ? row.kinks ?? [] : [];
  const sensitiveKinkInterests = showKinks ? sensitiveProfile?.kink_interests ?? [] : [];
  const sensitiveKinks = showKinks ? sensitiveProfile?.kinks ?? [] : [];
  const resolvedKinkInterests = sensitiveKinkInterests.length > 0
    ? sensitiveKinkInterests
    : kinkInterests.length > 0
      ? kinkInterests
      : legacyKinks
      .map((kink) => legacyKinkToInterest(kink))
      .filter((interest): interest is ProfileKinkInterest => Boolean(interest));
  const photos = row.photos ?? [];
  const metadataByUrl = new Map(
    (Array.isArray(row.photo_metadata) ? row.photo_metadata : [])
      .filter((metadata) => typeof metadata?.url === "string")
      .map((metadata) => [metadata.url, Boolean(metadata.explicit)])
  );
  const photoMetadata = photos.map((photo) => ({
    url: photo,
    explicit: metadataByUrl.get(photo) === true
  }));

  return {
    id: row.id,
    ...emptyProfile,
    display_name: row.display_name ?? "",
    photos,
    photo_metadata: photoMetadata,
    photo_relationship: undefined as PhotoViewerRelationship | undefined,
    bio: row.bio ?? "",
    tags: row.tags ?? [],
    signal: row.signal ?? "",
    ...(row.attending_launch_party === true ? { attendingLaunchParty: true } : {}),
    pronouns: row.pronouns ?? [],
    custom_pronouns: row.custom_pronouns ?? "",
    year_of_birth: includePrivateSensitive || row.show_age !== false ? row.year_of_birth : null,
    show_age: row.show_age !== false,
    ethnicity: row.ethnicity?.[0] ?? "",
    identities: row.identities ?? [],
    presentation: row.presentation ?? [],
    sexuality: row.sexuality ?? [],
    body_type: row.body_type ?? [],
    body_hair: row.body_hair ?? [],
    pubic_hair: row.pubic_hair ?? [],
    facial_hair: row.facial_hair ?? [],
    height: row.height ?? "",
    weight: row.weight ?? "",
    position: row.position ?? [],
    role: row.role ?? [],
    side_badges: row.side_badges ?? emptySideBadges,
    is_trans: showTransStatus ? sensitiveProfile?.is_trans ?? null : null,
    trans_status_visibility: row.trans_status_visibility ?? "mutual_cruushes",
    crowds: visibleCrowds,
    availability: row.availability ?? [],
    hosting_travel: row.hosting_travel ?? [],
    preferred_spots: row.preferred_spots ?? [],
    kinks: resolvedKinkInterests.length > 0
      ? resolvedKinkInterests.map((interest) => interest.label ?? interest.kink_id)
      : sensitiveKinks.length > 0
        ? sensitiveKinks
        : legacyKinks,
    kink_interests: resolvedKinkInterests,
    kinks_visibility: row.kinks_visibility ?? "public",
    vibes: row.vibes ?? [],
    zodiac: row.zodiac ?? [],
    scenes: row.scenes ?? [],
    archetypes: row.archetypes ?? [],
    hobbies: row.hobbies ?? [],
    custom_hobby: row.custom_hobby ?? "",
    looking_for: row.looking_for ?? [],
    hiv_status: showHivStatus ? sensitiveProfile?.hiv_status ?? row.hiv_status ?? [] : [],
    hiv_status_visibility: FIXED_PRIVATE_HEALTH_VISIBILITY,
    custom_hiv_status: showHivStatus ? sensitiveProfile?.custom_hiv_status ?? row.custom_hiv_status ?? "" : "",
    condoms: row.condoms ?? [],
    custom_condoms: row.custom_condoms ?? "",
    prep: row.prep ?? [],
    custom_prep: row.custom_prep ?? "",
    doxypep: row.doxypep ?? [],
    custom_doxypep: row.custom_doxypep ?? "",
    covid_vaccine: row.covid_vaccine ?? [],
    custom_covid_vaccine: row.custom_covid_vaccine ?? "",
    mpox_vaccine: row.mpox_vaccine ?? [],
    custom_mpox_vaccine: row.custom_mpox_vaccine ?? "",
    protections: withCarriedProtections(row.protections, sensitiveProfile),
    health_preferences: sensitiveProfile?.health_preferences ?? [],
    birth_control: sensitiveProfile?.birth_control ?? [],
    relationship_status: sensitiveProfile?.relationship_status ?? [],
    substance_boundaries: row.substance_boundaries ?? [],
    protection_boundaries: row.protection_boundaries ?? [],
    ...((row.badges?.length ?? 0) > 0 ? { badges: row.badges } : {}),
    visibility_rules: includePrivateSensitive ? visibilityRules ?? emptyProfile.visibility_rules : emptyProfile.visibility_rules,
    updated_at: new Date(row.updated_at).toISOString(),
    ...(options.relationship ? {
      viewer_relationship: {
        match_id: options.relationship.matchId,
        mutual_cruush: options.relationship.isMutualCruush,
        outgoing_cruush: options.relationship.hasOutgoingCruush,
        can_message: options.canMessage ?? options.relationship.canMessage,
        can_reveal_precise_location: options.relationship.canRevealPreciseLocation,
        location_mode: options.relationship.targetBaseMode,
        dark_room_distance_label: options.relationship.targetDarkRoomDistanceLabel
      }
    } : {})
  };
}

function mapVisibilitySetRow(
  app: FastifyInstance,
  row: ProfileVisibilitySetRow,
  visibilityRules?: ProfileVisibilityRules
) {
  const decryptedRules = visibilityRules ?? decryptProfileVisibility(app.config, row) ?? emptyProfile.visibility_rules;

  return {
    id: row.id,
    name: row.name,
    visibility_rules: decryptedRules,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString()
  };
}

function fallbackSensitiveProfile(): SensitiveProfileData {
  return {
    is_trans: null,
    crowds: [],
    kinks: [],
    kink_interests: [],
    hiv_status: [],
    custom_hiv_status: "",
    health_preferences: [],
    birth_control: [],
    relationship_status: []
  };
}

function profilePayloadFromRow(
  row: ProfileRow,
  sensitiveProfile: SensitiveProfileData,
  kinkInterests: ProfileKinkInterest[],
  visibilityRules: ProfileVisibilityRules
): ProfilePayload {
  return {
    ...emptyProfile,
    display_name: row.display_name ?? "",
    photos: row.photos ?? [],
    bio: row.bio ?? "",
    tags: row.tags ?? [],
    signal: row.signal ?? "",
    pronouns: row.pronouns ?? [],
    custom_pronouns: row.custom_pronouns ?? "",
    year_of_birth: row.year_of_birth,
    show_age: row.show_age !== false,
    ethnicity: row.ethnicity?.[0] ?? "",
    identities: row.identities ?? [],
    presentation: row.presentation ?? [],
    sexuality: row.sexuality ?? [],
    body_type: row.body_type ?? [],
    body_hair: row.body_hair ?? [],
    pubic_hair: row.pubic_hair ?? [],
    facial_hair: row.facial_hair ?? [],
    height: row.height ?? "",
    weight: row.weight ?? "",
    position: row.position ?? [],
    role: row.role ?? [],
    side_badges: row.side_badges ?? emptySideBadges,
    is_trans: sensitiveProfile.is_trans,
    trans_status_visibility: row.trans_status_visibility ?? "mutual_cruushes",
    crowds: sensitiveProfile.crowds,
    availability: row.availability ?? [],
    hosting_travel: row.hosting_travel ?? [],
    preferred_spots: row.preferred_spots ?? [],
    kinks: sensitiveProfile.kinks,
    kink_interests: kinkInterests.length > 0 ? kinkInterests : sensitiveProfile.kink_interests,
    kinks_visibility: row.kinks_visibility ?? "public",
    vibes: row.vibes ?? [],
    scenes: row.scenes ?? [],
    archetypes: row.archetypes ?? [],
    hobbies: row.hobbies ?? [],
    custom_hobby: row.custom_hobby ?? "",
    looking_for: row.looking_for ?? [],
    hiv_status: sensitiveProfile.hiv_status,
    hiv_status_visibility: FIXED_PRIVATE_HEALTH_VISIBILITY,
    custom_hiv_status: sensitiveProfile.custom_hiv_status,
    condoms: row.condoms ?? [],
    custom_condoms: row.custom_condoms ?? "",
    prep: row.prep ?? [],
    custom_prep: row.custom_prep ?? "",
    doxypep: row.doxypep ?? [],
    custom_doxypep: row.custom_doxypep ?? "",
    covid_vaccine: row.covid_vaccine ?? [],
    custom_covid_vaccine: row.custom_covid_vaccine ?? "",
    mpox_vaccine: row.mpox_vaccine ?? [],
    custom_mpox_vaccine: row.custom_mpox_vaccine ?? "",
    protections: withCarriedProtections(row.protections, sensitiveProfile),
    health_preferences: sensitiveProfile.health_preferences ?? [],
    birth_control: sensitiveProfile.birth_control ?? [],
    substance_boundaries: row.substance_boundaries ?? [],
    protection_boundaries: row.protection_boundaries ?? [],
    visibility_rules: visibilityRules
  };
}

function mapProfileLocationRow(row: ProfileLocationRow) {
  return {
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    fuzzy_lat: row.fuzzy_lat,
    fuzzy_lng: row.fuzzy_lng,
    fuzz_radius_meters: row.location_fuzz_radius_meters ?? 0,
    location_updated_at: row.location_updated_at
      ? new Date(row.location_updated_at).toISOString()
      : null
  };
}

function mapOwnProfileLocation(row: ProfileRow) {
  if (row.lat == null && row.lng == null && row.fuzzy_lat == null && row.fuzzy_lng == null) {
    return null;
  }

  return mapProfileLocationRow({
    id: row.id,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    fuzzy_lat: row.fuzzy_lat ?? null,
    fuzzy_lng: row.fuzzy_lng ?? null,
    location_fuzz_radius_meters: row.location_fuzz_radius_meters ?? null,
    location_updated_at: row.location_updated_at ?? null
  });
}

async function buildOwnerLocationDisplay(app: FastifyInstance, request: FastifyRequest, userId: string) {
  const location = await loadLocationEnvelope(app, userId).catch((error) => {
    if (isSchemaCompatibilityError(error)) {
      return null;
    }

    throw error;
  });

  if (!location) {
    return null;
  }

  const travelPin = await getTravelPin(app, userId).catch(() => null);
  const displayLocation = travelPin ? locationPayloadAtTravelPin(location, travelPin) : location;

  const policy = await loadVisibilityPolicy(app, userId).catch((error) => {
    if (isSchemaCompatibilityError(error)) {
      return null;
    }

    throw error;
  });
  const effectivePolicy = policy ?? {
    version: 1 as const,
    subjectUserId: userId,
    policyVersion: 1,
    baseMode: "PUBLIC_PRECISE" as const,
    ghostRadiusMeters: DEFAULT_GHOST_RADIUS_METERS,
    preciseToMutualCruushes: false,
    preciseToMutualCrowds: [],
    auditRequired: false,
    updatedAtMs: Date.now(),
    expiresAtMs: null,
    keyVersion: app.config.VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION || "v1"
  };
  const token = await makeDisplayLocationToken(app, request, {
    subjectUserId: userId,
    viewerUserId: userId,
    policy: effectivePolicy,
    location: displayLocation,
    displayMode: "PRECISE",
    forceSelfPrecise: true
  });
  const ghostToken = effectivePolicy.baseMode === "GHOST"
    ? await makeDisplayLocationToken(app, request, {
        subjectUserId: userId,
        viewerUserId: userId,
        policy: effectivePolicy,
        location: displayLocation,
        displayMode: "GHOST"
      })
    : null;

  return {
    display_location_token: token,
    display_expires_at_ms: token.expiresAtMs,
    display_mode: "PRECISE",
    animation_hint: "NONE",
    ...(ghostToken
      ? {
          ghost_display_location_token: ghostToken,
          ghost_display_expires_at_ms: ghostToken.expiresAtMs
        }
      : {}),
    location_updated_at: new Date(displayLocation.collectedAtMs).toISOString()
  };
}

function getProfileCoordinates(row: Pick<ProfileRow | VisibilitySubjectRow, "lat" | "lng" | "fuzzy_lat" | "fuzzy_lng">): VisibilityCoordinates {
  return {
    lat: row.fuzzy_lat ?? row.lat ?? null,
    lng: row.fuzzy_lng ?? row.lng ?? null
  };
}

function sensitiveKinksForVisibility(sensitiveProfile: SensitiveProfileData | null, fallbackKinks: string[] | null | undefined) {
  if (!sensitiveProfile) {
    return fallbackKinks ?? [];
  }

  if (sensitiveProfile.kink_interests.length > 0) {
    return sensitiveProfile.kink_interests.map((interest) => interest.label ?? interest.kink_id);
  }

  return sensitiveProfile.kinks;
}

async function loadVisibilitySubjectProfile(app: FastifyInstance, userId: string): Promise<VisibilitySubjectProfile | null> {
  try {
    const result = await app.db.query<VisibilitySubjectRow>(
      `select
         tags,
         year_of_birth,
         identities,
         presentation,
         sexuality,
         body_type,
         body_hair,
         pubic_hair,
         facial_hair,
         looking_for,
         availability,
         hosting_travel,
         preferred_spots,
         vibes,
         scenes,
         archetypes,
         hobbies,
         position,
         role,
         kinks,
         substance_boundaries,
         protection_boundaries,
         lat,
         lng,
         fuzzy_lat,
         fuzzy_lng,
         profile_sensitive_ciphertext,
         profile_sensitive_nonce,
         profile_sensitive_auth_tag,
         profile_sensitive_key_version
       from profiles
       where id = $1`,
      [userId]
    );
    const row = result?.rows?.[0];

    if (!row) {
      return null;
    }

    const sensitiveProfile = decryptSensitiveProfile(app.config, row);

    return {
      tags: row.tags ?? [],
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
      kinks: sensitiveKinksForVisibility(sensitiveProfile, row.kinks),
      body_types: row.body_type ?? [],
      body_hair: row.body_hair ?? [],
      pubic_hair: row.pubic_hair ?? [],
      facial_hair: row.facial_hair ?? [],
      sexuality: row.sexuality ?? [],
      substance_boundaries: row.substance_boundaries ?? [],
      protection_boundaries: row.protection_boundaries ?? [],
      coordinates: getProfileCoordinates(row)
    };
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return null;
    }

    throw error;
  }
}

function clampCoordinate(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createFuzzyCoordinates(lat: number, lng: number, radiusMeters: number) {
  if (radiusMeters <= 0) {
    return {
      fuzzyLat: lat,
      fuzzyLng: lng
    };
  }

  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * radiusMeters;
  const latOffset = (distance * Math.cos(angle)) / 111_320;
  const lngScale = Math.cos((lat * Math.PI) / 180);
  const lngOffset = lngScale === 0
    ? 0
    : (distance * Math.sin(angle)) / (111_320 * lngScale);

  return {
    fuzzyLat: clampCoordinate(lat + latOffset, -90, 90),
    fuzzyLng: clampCoordinate(lng + lngOffset, -180, 180)
  };
}

async function loadProfile(app: FastifyInstance, request: FastifyRequest, userId: string, reply: FastifyReply) {
  return reply.send({
    data: await loadProfileData(app, userId, { includePrivateSensitive: true, request })
  });
}

async function loadProfileKinkInterests(app: FastifyInstance, userId: string) {
  try {
    const result = await app.db.query<ProfileKinkInterestRow>(
      `select
         pki.kink_id,
         kc.label,
         kc.category
       from profile_kink_interests pki
       join kink_catalog kc on kc.id = pki.kink_id
       where pki.user_id = $1
       order by kc.sort_order, kc.label`,
      [userId]
    );

    return (result?.rows ?? [])
      .map((row) => mapKinkInterestRow(row))
      .filter((interest): interest is ProfileKinkInterest => Boolean(interest));
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return [];
    }

    throw error;
  }
}

async function syncProfileKinkInterests(app: FastifyInstance, userId: string, kinkInterests: ProfileKinkInterest[]) {
  try {
    await app.db.query(
      "delete from profile_kink_interests where user_id = $1",
      [userId]
    );

    if (kinkInterests.length === 0) {
      return;
    }
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return;
    }

    throw error;
  }
}

async function syncSensitiveProfileTokens(app: FastifyInstance, userId: string, tokens: SensitiveProfileToken[]) {
  try {
    await app.db.query(
      "delete from profile_sensitive_tokens where user_id = $1",
      [userId]
    );

    if (tokens.length === 0) {
      return;
    }

    await app.db.query(
      `insert into profile_sensitive_tokens (
         user_id,
         token_hash,
         token_key_version
       )
       select
         $1,
         token.payload ->> 'token_hash',
         token.payload ->> 'token_key_version'
       from jsonb_array_elements($2::jsonb) as token(payload)
       where token.payload ? 'token_hash'
       on conflict (user_id, token_hash, token_key_version) do update
       set updated_at = now()`,
      [userId, JSON.stringify(tokens)]
    );
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return;
    }

    throw error;
  }
}

async function loadOwnerProfileRow(app: FastifyInstance, userId: string) {
  const result = await app.db.query<ProfileRow>(
    `select ${PROFILE_COLUMNS.join(", ")}, ${SIDE_BADGES_SELECT}, updated_at
     from profiles
     where id = $1`,
    [userId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }

  return row;
}

function appWithDatabase(app: FastifyInstance, db: DbClient) {
  return {
    config: app.config,
    db,
    log: app.log
  } as FastifyInstance;
}

async function applyProfileVisibilityRules(
  app: FastifyInstance,
  userId: string,
  visibilityRules: ProfileVisibilityRules
) {
  return runTransaction(app.db, async (db) => {
    await lockMapPingSenderInTransaction(db, userId);
    const transactionApp = appWithDatabase(app, db);
    const existingRow = await loadOwnerProfileRow(transactionApp, userId);
    const sensitiveProfile = decryptSensitiveProfile(app.config, existingRow) ?? fallbackSensitiveProfile();
    const kinkInterests = await loadProfileKinkInterests(transactionApp, userId);
    profilePayloadSchema.parse(profilePayloadFromRow(existingRow, sensitiveProfile, kinkInterests, visibilityRules));
    const existingVisibilityRules = decryptProfileVisibility(app.config, existingRow) ?? emptyProfile.visibility_rules;
    const encryptedProfileVisibility = encryptProfileVisibility(app.config, visibilityRules);
    const result = await db.query<ProfileRow>(
      `update profiles
       set profile_visibility_ciphertext = $2,
           profile_visibility_nonce = $3,
           profile_visibility_auth_tag = $4,
           profile_visibility_key_version = $5,
           profile_visibility_token_key_version = $6,
           updated_at = now()
       where id = $1
       returning ${PROFILE_COLUMNS.join(", ")}, ${SIDE_BADGES_SELECT}, updated_at`,
      [
        userId,
        encryptedProfileVisibility.profile_visibility_ciphertext,
        encryptedProfileVisibility.profile_visibility_nonce,
        encryptedProfileVisibility.profile_visibility_auth_tag,
        encryptedProfileVisibility.profile_visibility_key_version,
        encryptedProfileVisibility.profile_visibility_token_key_version
      ]
    );

    await syncSensitiveProfileTokens(transactionApp, userId, combineSensitiveTokens(
      createSensitiveProfileTokens(app.config, sensitiveProfile),
      createProfileVisibilityTokens(app.config, visibilityRules)
    ));

    if (profileVisibilityNarrowed(existingVisibilityRules, visibilityRules)) {
      await revokeActiveMapPingsInTransaction(db, userId);
    }

    return mapProfileRow(result.rows[0], kinkInterests, {
      includePrivateSensitive: true,
      sensitiveProfile,
      visibilityRules
    });
  });
}

async function loadSensitiveProfileTokenHashes(app: FastifyInstance, userId: string) {
  try {
    const result = await app.db.query<{ token_hash: string | null }>(
      "select token_hash from profile_sensitive_tokens where user_id = $1",
      [userId]
    );

    return new Set(result.rows.map((row) => row.token_hash).filter((tokenHash): tokenHash is string => Boolean(tokenHash)));
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return new Set<string>();
    }

    throw error;
  }
}

async function loadSharedCrowds(app: FastifyInstance, viewerUserId: string, targetCrowds: string[]) {
  if (targetCrowds.length === 0) {
    return [];
  }

  const viewerTokens = await loadSensitiveProfileTokenHashes(app, viewerUserId);

  return targetCrowds.filter((crowd) => {
    const tokenHashes = createCrowdTokens(app.config, [crowd]).map((token) => token.token_hash);
    return tokenHashes.some((tokenHash) => viewerTokens.has(tokenHash));
  });
}

function buildSensitiveProfile(payload: ProfilePayload, kinkInterests: ProfileKinkInterest[]): SensitiveProfileData {
  return {
    is_trans: payload.is_trans,
    crowds: payload.crowds,
    kinks: kinkInterests.map((interest) => interest.label ?? interest.kink_id),
    kink_interests: kinkInterests,
    hiv_status: payload.hiv_status,
    custom_hiv_status: payload.custom_hiv_status,
    health_preferences: payload.health_preferences,
    birth_control: payload.birth_control,
    relationship_status: payload.relationship_status
  };
}

function buildProfileModerationFields(payload: ProfilePayload, kinkInterests: ProfileKinkInterest[]) {
  return {
    display_name: payload.display_name,
    bio: payload.bio,
    tags: payload.tags,
    signal: payload.signal,
    custom_pronouns: payload.custom_pronouns,
    custom_hobby: payload.custom_hobby,
    kinks: kinkInterests.map((interest) => interest.label ?? interest.kink_id),
    vibes: payload.vibes,
    scenes: payload.scenes,
    archetypes: payload.archetypes,
    looking_for: payload.looking_for,
    availability: payload.availability,
    hosting_travel: payload.hosting_travel,
    position: payload.position,
    role: payload.role
  };
}

function combineSensitiveTokens(...tokenGroups: SensitiveProfileToken[][]) {
  const tokensByKey = new Map<string, SensitiveProfileToken>();

  for (const tokens of tokenGroups) {
    for (const token of tokens) {
      tokensByKey.set(`${token.token_key_version}:${token.token_hash}`, token);
    }
  }

  return [...tokensByKey.values()];
}

function sortedStrings(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function stringArraysEqual(first: string[], second: string[]) {
  const sortedFirst = sortedStrings(first);
  const sortedSecond = sortedStrings(second);

  return sortedFirst.length === sortedSecond.length && sortedFirst.every((value, index) => value === sortedSecond[index]);
}

type ExistingIdentityState = {
  exists: boolean;
  yearOfBirth: number | null;
  identities: string[];
  signal: string;
  sensitiveProfile: SensitiveProfileData | null;
  visibilityRules: ProfileVisibilityRules | null;
  changedAt: Date | null;
};

async function loadExistingIdentityState(app: FastifyInstance, userId: string): Promise<ExistingIdentityState> {
  try {
    const result = await app.db.query<{
      profile_sensitive_ciphertext: string | null;
      profile_sensitive_nonce: string | null;
      profile_sensitive_auth_tag: string | null;
      profile_sensitive_key_version: string | null;
      profile_visibility_ciphertext: string | null;
      profile_visibility_nonce: string | null;
      profile_visibility_auth_tag: string | null;
      profile_visibility_key_version: string | null;
      trans_crowds_changed_at: string | Date | null;
      identities: string[] | null;
      year_of_birth: number | null;
      signal: string | null;
    }>(
      `select
         profile_sensitive_ciphertext,
         profile_sensitive_nonce,
         profile_sensitive_auth_tag,
         profile_sensitive_key_version,
         profile_visibility_ciphertext,
         profile_visibility_nonce,
         profile_visibility_auth_tag,
         profile_visibility_key_version,
         trans_crowds_changed_at,
         identities,
         year_of_birth,
         signal
       from profiles
       where id = $1`,
      [userId]
    );
    const row = result.rows[0];

    if (!row) {
      return {
        exists: false,
        yearOfBirth: null,
        identities: [],
        signal: "",
        sensitiveProfile: null,
        visibilityRules: null,
        changedAt: null
      };
    }

    let sensitiveProfile: SensitiveProfileData | null = null;
    let visibilityRules: ProfileVisibilityRules | null = null;

    try {
      sensitiveProfile = decryptSensitiveProfile(app.config, row);
    } catch {
      sensitiveProfile = null;
    }

    try {
      visibilityRules = decryptProfileVisibility(app.config, row);
    } catch {
      visibilityRules = null;
    }

    return {
      exists: true,
      yearOfBirth: row.year_of_birth,
      identities: row.identities ?? [],
      signal: row.signal ?? "",
      sensitiveProfile,
      visibilityRules,
      changedAt: row.trans_crowds_changed_at ? new Date(row.trans_crowds_changed_at) : null
    };
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return {
        exists: false,
        yearOfBirth: null,
        identities: [],
        signal: "",
        sensitiveProfile: null,
        visibilityRules: null,
        changedAt: null
      };
    }

    throw error;
  }
}

async function loadSignupBirthYear(app: FastifyInstance, userId: string) {
  try {
    const result = await app.db.query<{ signup_birth_year: number | null }>(
      "select signup_birth_year from app_users where id = $1",
      [userId]
    );
    return result.rows[0]?.signup_birth_year ?? null;
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return null;
    }

    throw error;
  }
}

function hasIdentityGateChange(
  existingState: ExistingIdentityState,
  payload: ProfilePayload,
  sensitiveProfile: SensitiveProfileData
) {
  if (!existingState.exists) {
    return payload.identities.length > 0 || sensitiveProfile.is_trans !== null || sensitiveProfile.crowds.length > 0;
  }

  if (!existingState.sensitiveProfile) {
    return payload.identities.length > 0 || sensitiveProfile.is_trans !== null || sensitiveProfile.crowds.length > 0;
  }

  return existingState.sensitiveProfile.is_trans !== sensitiveProfile.is_trans ||
    !stringArraysEqual(existingState.identities, payload.identities) ||
    !stringArraysEqual(existingState.sensitiveProfile.crowds, sensitiveProfile.crowds);
}

export function isIdentityGateChangeLocked(changedAt: Date, now = new Date()) {
  const lockWindowMs = IDENTITY_GATE_LOCK_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() < changedAt.getTime() + lockWindowMs;
}

function assertIdentityGateChangeAllowed(existingState: ExistingIdentityState, hasChange: boolean) {
  if (!hasChange || !existingState.changedAt) {
    return;
  }

  if (isIdentityGateChangeLocked(existingState.changedAt)) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Gender identity, trans status, and crowd selection can only be changed once every 3 days."
    );
  }
}

async function loadProfileData(
  app: FastifyInstance,
  userId: string,
  options: { includePrivateSensitive: boolean; viewerUserId?: string; request?: FastifyRequest }
) {
  const result = await app.db.query<ProfileRow>(
    `select ${PROFILE_COLUMNS.join(", ")},
            ${SIDE_BADGES_SELECT},
            ${profilePhotoMetadataSelect("profiles")},
            lat,
            lng,
            fuzzy_lat,
            fuzzy_lng,
            location_fuzz_radius_meters,
            location_updated_at,
            last_seen_at,
            coalesce((
              select array_agg(user_badges.badge_key order by user_badges.awarded_at asc)
              from user_badges
              where user_badges.user_id = profiles.id
            ), '{}'::text[]) as badges,
            exists (
              select 1
              from event_memberships membership
              join launch_events event on event.id = membership.event_id
              where membership.user_id = profiles.id
                and event.slug = 'the-chocolate-factory-launch'
                and event.active = true
                and now() < event.chat_expires_at
            ) as attending_launch_party,
            updated_at
     from profiles
     where id = $1 and ${nonBannedAccountSql("profiles.id")}`,
    [userId]
  );

  if (!result.rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }

  // A profile an older removal flow renamed and left behind never opens.
  if (isTombstonedProfileName(result.rows[0].display_name)) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }

  const row = result.rows[0];
  const relationship = !options.includePrivateSensitive && options.viewerUserId
    ? await getRelationshipPermissions(app, options.viewerUserId, userId)
    : null;
  if (relationship?.isBlocked) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }
  const needsMutualCrowd =
    row.kinks_visibility === "mutual_crowds";
  const needsMutualCruush =
    row.kinks_visibility === "mutual_cruushes" ||
    FIXED_PRIVATE_HEALTH_VISIBILITY === "mutual_cruushes";
  const sensitiveProfile = decryptSensitiveProfile(app.config, row);
  const visibleCrowds = !options.includePrivateSensitive && options.viewerUserId
    ? await loadSharedCrowds(app, options.viewerUserId, sensitiveProfile?.crowds ?? [])
    : undefined;
  const hasMutualCrowd = options.includePrivateSensitive
    ? true
    : needsMutualCrowd
      ? (visibleCrowds?.length ?? 0) > 0
      : false;
  const hasMutualCruush = options.viewerUserId && needsMutualCruush
    ? relationship?.isMutualCruush === true
    : false;
  const visibilityRules = decryptProfileVisibility(app.config, row);
  const viewerOutsideServiceArea = !options.includePrivateSensitive && options.viewerUserId && options.viewerUserId !== userId
    ? await getViewerOutsideServiceArea(app, options.viewerUserId)
    : false;

  if (!options.includePrivateSensitive) {
    await assertProfileRowVisibleToViewer(app, row, options.viewerUserId, visibilityRules, viewerOutsideServiceArea);
  }

  if (relationship && options.viewerUserId) {
    await recordProfileView(app, options.viewerUserId, userId, relationship);
  }

  const canMessage = relationship && options.viewerUserId
    ? await canStartDirectMessage(app, options.viewerUserId, userId, relationship)
    : undefined;

  const showKinks =
    options.includePrivateSensitive ||
    (row.kinks_visibility ?? "public") === "public" ||
    ((row.kinks_visibility ?? "public") === "mutual_crowds" && hasMutualCrowd) ||
    ((row.kinks_visibility ?? "public") === "mutual_cruushes" && hasMutualCruush);
  const kinkInterests = showKinks
    ? await loadProfileKinkInterests(app, userId)
    : [];

  const mappedProfile = mapProfileRow(row, kinkInterests, {
    includePrivateSensitive: options.includePrivateSensitive,
    relationship,
    hasMutualCrowd,
    hasMutualCruush,
    sensitiveProfile,
    visibilityRules,
    showKinks,
    visibleCrowds,
    canMessage
  });
  if (viewerOutsideServiceArea && mappedProfile.viewer_relationship) {
    mappedProfile.viewer_relationship.can_reveal_precise_location = false;
  }

  if (!options.includePrivateSensitive && options.viewerUserId) {
    mappedProfile.photo_relationship = (await loadPhotoViewerRelationships(app, options.viewerUserId, [userId])).get(userId);
    if (mappedProfile.photo_relationship?.nsfwPhotoRestriction) {
      // Retain the gallery slot for its restriction cover. The media route still
      // denies bytes, including unclassified photos, for an excluded viewer.
      mappedProfile.photo_metadata = mappedProfile.photo_metadata.map((photo) => ({
        ...photo,
        explicit: !(row.photo_metadata ?? []).some((metadata) => metadata.url === photo.url && metadata.explicit === false)
      }));
    }
  }

  // Mile High Club is worth reading before you cross a city for someone, so it is
  // stated on the profile itself.
  const travelPin = await getTravelPin(app, userId).catch(() => null);
  const savedStatus = (await loadStoredOutOfSightStatuses(app, [userId])).get(userId);
  const membership = savedStatus === "out_of_sight" ? { outOfSight: true }
    : savedStatus === "in_area" ? { outOfSight: false } : {};
  const withTravel = travelPin
    ? { ...mappedProfile, travelling: true, travelLabel: travelPin.label, ...membership }
    : { ...mappedProfile, ...membership };

  // Discovery carried these two lines and the profile did not, so a profile
  // opened from anywhere other than the map showed neither. They are read from
  // the same fuzzed coordinates and the same clock discovery already uses, so
  // nothing new is revealed.
  const withPresence = !options.includePrivateSensitive && options.viewerUserId && options.viewerUserId !== userId
    ? {
        ...withTravel,
        last_active: formatPresenceLabel({
          lastSeenAt: row.last_seen_at,
          fallback: row.location_updated_at ?? row.updated_at,
          // Profile access is already authorized; Dark Room still hides map presence and location.
          allowOnline: canShowOnlineStatus(relationship?.targetBaseMode) || relationship?.targetBaseMode === "STEALTH"
        }),
        distance_label: await loadViewerDistanceLabel(app, options.viewerUserId, userId, row, relationship)
      }
    : withTravel;

  if (options.includePrivateSensitive && options.request) {
    const location = await buildOwnerLocationDisplay(app, options.request, userId);

    if (location) {
      return {
        ...withPresence,
        location
      };
    }
  }

  return withPresence;
}

/**
 * The distance the viewer should see for this profile, or null when either
 * side has no usable coordinates. Ghost Mode collapses it to Nearby exactly as
 * it does on the map, and Dark Room is left to the client, which already
 * substitutes its own label.
 */
async function loadViewerDistanceLabel(
  app: FastifyInstance,
  viewerUserId: string,
  targetUserId: string,
  row: ProfileRow,
  relationship: RelationshipPermissions | null
) {
  const viewerResult = await app.db.query<{ lat: number | null; lng: number | null; fuzzy_lat: number | null; fuzzy_lng: number | null }>(
    "select lat, lng, fuzzy_lat, fuzzy_lng from profiles where id = $1",
    [viewerUserId]
  );
  const viewer = viewerResult.rows[0];

  // Most people have no lat on their profile row at all: the map reads their
  // position out of the encrypted location envelope. Reading the envelope here
  // too is what makes the line appear for the same people it appears for on
  // the map, rather than only for the few with a stored column.
  const envelopes = await loadLocationEnvelopes(app, [viewerUserId, targetUserId]).catch((error: unknown) => {
    if (isSchemaCompatibilityError(error)) {
      return new Map<string, LocationPayload>();
    }

    throw error;
  });

  const targetEnvelope = envelopes.get(targetUserId);
  const viewerEnvelope = envelopes.get(viewerUserId);
  const targetCoordinates = targetEnvelope ? locationPayloadToCoordinates(targetEnvelope) : null;
  const viewerCoordinates = viewerEnvelope ? locationPayloadToCoordinates(viewerEnvelope) : null;

  const targetLat = targetCoordinates?.lat ?? row.fuzzy_lat ?? row.lat;
  const targetLng = targetCoordinates?.lng ?? row.fuzzy_lng ?? row.lng;
  const viewerLat = viewerCoordinates?.lat ?? viewer?.fuzzy_lat ?? viewer?.lat;
  const viewerLng = viewerCoordinates?.lng ?? viewer?.fuzzy_lng ?? viewer?.lng;

  const policy = await getEffectiveVisibilityPolicy(app, targetUserId).catch((error: unknown) => {
    if (isSchemaCompatibilityError(error)) {
      return null;
    }

    throw error;
  });

  if (policy?.baseMode === "STEALTH") {
    return null;
  }
  const mhcLabel = await getMhcLocationLabel(app, targetUserId, relationship?.distanceLabelMode ?? "approximate");
  if (mhcLabel) return mhcLabel;

  const displayMode = relationship?.canRevealPreciseLocation === true
    ? "PRECISE" as const
    : policy?.baseMode === "GHOST" ? "GHOST" as const : "PRECISE" as const;

  const viewerStatus = classifyCurrentOutOfSightLocation(viewerEnvelope);
  const savedStatuses = await loadOutOfSightStatuses(app, [viewerUserId, targetUserId]);
  const subjectCityLabel = savedStatuses.get(targetUserId) === "out_of_sight"
    && relationship?.distanceLabelMode === "precise"
    ? (await loadCurrentTownLabels(app, [targetUserId])).get(targetUserId)
    : undefined;
  const outOfSightLabel = resolveOutOfSightLocationLabel({
    viewerStatus: savedStatuses.get(viewerUserId) ?? "unknown",
    subjectStatus: savedStatuses.get(targetUserId) ?? "unknown",
    sharedMode: relationship?.distanceLabelMode ?? "approximate",
    subjectCityLabel
  });
  if (outOfSightLabel) return outOfSightLabel;
  if (targetLat == null || targetLng == null || viewerLat == null || viewerLng == null) {
    return null;
  }
  if (viewerStatus !== "in_area") return "Nearby";

  return formatDistanceLabel({
    displayMode,
    distanceLabelMode: relationship?.distanceLabelMode,
    viewerLat,
    viewerLng,
    targetLat,
    targetLng
  });
}

async function assertProfileRowVisibleToViewer(
  app: FastifyInstance,
  row: ProfileRow,
  viewerUserId: string | undefined,
  visibilityRules: ProfileVisibilityRules | null,
  viewerOutsideServiceArea?: boolean
) {
  if (viewerUserId === row.id) {
    return;
  }

  if (viewerUserId && (await loadOosHiddenProfileIds(app, viewerUserId, [row.id], viewerOutsideServiceArea)).has(row.id)) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }

  if (!visibilityRules && (row.profile_visibility_ciphertext || row.profile_visibility_nonce || row.profile_visibility_auth_tag)) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }

  if (visibilityRulesArePublic(visibilityRules)) {
    return;
  }

  const viewerProfile = viewerUserId
    ? await loadVisibilitySubjectProfile(app, viewerUserId)
    : null;

  // Both sides' positions live in the encrypted location envelope: only a
  // handful of accounts carry coordinates on the profile row at all. Reading
  // only the row meant a distance rule had nothing to measure, so people who
  // set one vanished from the profile route while still showing on the map.
  const coordinates = viewerUserId
    ? await loadVisibilityCoordinates(app, viewerUserId, row, visibilityRules?.distance != null)
    : { viewer: null, target: getProfileCoordinates(row), uncertaintyMiles: 0 };

  const viewerSubject = viewerProfile
    ? {
        ...viewerProfile,
        ...(coordinates.viewer ? { coordinates: coordinates.viewer } : {}),
        ...(visibilityRules?.outside_service_area_members ? {
          outside_service_area: viewerOutsideServiceArea
            ?? (viewerUserId ? await getViewerOutsideServiceArea(app, viewerUserId) : true)
        } : {})
      }
    : null;

  if (!viewerSubject || !canSubjectViewProfile(visibilityRules, viewerSubject, coordinates.target, coordinates.uncertaintyMiles)) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }
}

/**
 * Where the viewer and the profile actually are, read the way the map reads
 * them: the encrypted location envelope first, the profile row only as a
 * fallback for the few accounts that still carry one.
 */
async function loadVisibilityCoordinates(app: FastifyInstance, viewerUserId: string, row: ProfileRow, protectDistance = false) {
  const envelopes = await loadLocationEnvelopes(app, [viewerUserId, row.id]).catch((error: unknown) => {
    if (isSchemaCompatibilityError(error)) {
      return new Map<string, LocationPayload>();
    }

    throw error;
  });
  const viewerEnvelope = envelopes.get(viewerUserId);
  const targetEnvelope = envelopes.get(row.id);
  const viewerFromEnvelope = viewerEnvelope ? locationPayloadToCoordinates(viewerEnvelope) : null;
  const targetFromEnvelope = targetEnvelope ? locationPayloadToCoordinates(targetEnvelope) : null;
  const viewerRow = (await app.db.query<{ lat: number | null; lng: number | null; fuzzy_lat: number | null; fuzzy_lng: number | null }>(
    "select lat, lng, fuzzy_lat, fuzzy_lng from profiles where id = $1",
    [viewerUserId]
  )).rows[0];
  const rowTarget = getProfileCoordinates(row);

  const target = targetFromEnvelope ?? rowTarget;
  const location = targetEnvelope ?? (target.lat != null && target.lng != null ? {
    version: 1 as const, subjectUserId: row.id, locationVersion: 0,
    latE7: Math.round(target.lat * 1e7), lonE7: Math.round(target.lng * 1e7),
    accuracyM: 0, source: "SYSTEM" as const, deviceReportedAtMs: Date.now(),
    collectedAtMs: Date.now(), expiresAtMs: Date.now() + 180_000, keyVersion: "v1"
  } : null);
  const visibleLocation = protectDistance && location
    ? await resolveVisibilityLocation(app, { viewerUserId, subjectUserId: row.id, location })
    : null;
  return {
    viewer: viewerFromEnvelope ?? (viewerRow ? getProfileCoordinates(viewerRow as unknown as ProfileRow) : null),
    target: protectDistance ? visibleLocation?.coordinate ?? null : target,
    uncertaintyMiles: visibleLocation?.uncertaintyMiles ?? 0
  };
}

export async function assertProfileVisibleToViewer(app: FastifyInstance, viewerUserId: string, targetUserId: string) {
  const result = await app.db.query<ProfileRow>(
    `select ${PROFILE_COLUMNS.join(", ")},
            ${SIDE_BADGES_SELECT},
            lat,
            lng,
            fuzzy_lat,
            fuzzy_lng,
            updated_at
     from profiles
     where id = $1 and ${nonBannedAccountSql("profiles.id")}`,
    [targetUserId]
  );
  const row = result.rows[0];

  if (!row || isTombstonedProfileName(row.display_name)) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }

  await assertProfileRowVisibleToViewer(app, row, viewerUserId, decryptProfileVisibility(app.config, row));
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/api/profiles/me", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    return loadProfile(app, request, userId, reply);
  });

  app.put("/api/profiles/me/side-badges", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const sideBadges = sideBadgesSchema.parse(request.body);
    const result = await app.db.query<{ side_badges: ProfilePayload["side_badges"] }>(
      `update profiles
       set side_badges = $2::jsonb,
           updated_at = now()
       where id = $1
       returning side_badges`,
      [userId, JSON.stringify(sideBadges)]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Profile not found");
    }

    return reply.send({ data: result.rows[0].side_badges });
  });

  // Editing the signal from the Pulse sheet used to PUT the whole profile,
  // built by spreading a server ProfileRecord into the strict payload schema.
  // The extra server-only fields failed validation, so the save never landed.
  app.put("/api/profiles/me/signal", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { signal } = z.object({
      signal: signalSchema
    }).strict().parse(request.body);
    const result = await app.db.query<{ signal: string | null }>(
      `update profiles
       set signal = $2,
           updated_at = now()
       where id = $1
       returning signal`,
      [userId, signal ?? ""]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Profile not found");
    }

    return reply.send({ data: { signal: result.rows[0].signal ?? "" } });
  });

  app.get("/api/profiles/me/privacy-settings", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const policy = await getEffectiveVisibilityPolicy(app, userId).catch(async (error) => {
      if (isSchemaCompatibilityError(error)) {
        const legacy = await getPrivacySettings(app, userId);
        return {
          version: 1 as const,
          subjectUserId: userId,
          policyVersion: 1,
          baseMode: legacy.baseMode,
          ghostRadiusMeters: legacy.ghostRadiusMeters,
          preciseToMutualCruushes: legacy.preciseToMutualCruushes,
          preciseToMutualCrowds: [],
          darkRoomDistanceLabel: false,
          auditRequired: false,
          updatedAtMs: legacy.updatedAtMs,
          expiresAtMs: null,
          keyVersion: app.config.VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION || "v1"
        };
      }

      throw error;
    });

    return reply.send({
      data: publicPrivacySettings(policy)
    });
  });

  app.put("/api/profiles/me/privacy-settings", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = privacySettingsPayloadSchema.parse(request.body);
    const baseMode: VisibilityBaseMode = payload.baseMode ??
      (payload.ghostModeEnabled === true ? "GHOST" : payload.ghostModeEnabled === false ? "PUBLIC_PRECISE" : undefined) ??
      "PUBLIC_PRECISE";
    const preciseToMutualCruushes = typeof payload.preciseToMutualCruushes === "boolean"
      ? payload.preciseToMutualCruushes
      : payload.preciseLocationVisibility === "mutual_cruushes";
    const preciseToMutualCrowds = (payload.preciseToMutualCrowds ?? []).map((policy): CrowdPrecisionPolicy => ({
      crowdId: policy.crowdId,
      precisionEnabled: policy.precisionEnabled,
      mutualityRequired: policy.mutualityRequired,
      minimumTrustLevel: policy.minimumTrustLevel,
      createdAtMs: policy.createdAtMs ?? Date.now(),
      revokedAtMs: policy.revokedAtMs ?? null
    }));
    if (hasPremiumPrivacySettings({ baseMode, preciseToMutualCruushes, preciseToMutualCrowds })) {
      await requireCruushPlus(app, userId, premiumPrivacyMessage({ baseMode, preciseToMutualCruushes, preciseToMutualCrowds }));
    }

    const visibilityInput = {
      baseMode,
      ghostModeEnabled: baseMode === "GHOST",
      ghostRadiusMeters: payload.ghostRadiusMeters ?? radiusMetersForLabel(payload.ghostRadiusLabel),
      ghostRotationMinutes: payload.ghostRotationMinutes,
      ghostLeashVisible: payload.ghostLeashVisible,
      preciseToMutualCruushes,
      preciseToMutualCrowds,
      darkRoomDistanceLabel: payload.darkRoomDistanceLabel === true,
      preciseLocationVisibility: preciseToMutualCruushes ? "mutual_cruushes" as const : "none" as const
    };
    const savedPolicy = await runTransaction(app.db, async (db) => {
      await lockMapPingSenderInTransaction(db, userId);
      const context = { config: app.config, db };
      const currentPolicy = await loadVisibilityPolicy(context, userId);
      const nextPolicy = normalizeVisibilityPolicy(app.config, userId, visibilityInput, currentPolicy);
      const saved = await saveVisibilityPolicy(context, userId, visibilityInput);

      if (mapVisibilityNarrowed(currentPolicy, nextPolicy)) {
        await revokeActiveMapPingsInTransaction(db, userId);
      }

      return saved;
    });

    return reply.send({
      data: publicPrivacySettings(savedPolicy)
    });
  });

  app.put("/api/profiles/me/visibility-rules", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = visibilityRulesPayloadSchema.parse(request.body);

    if (countVisibilityExclusionFilters(payload.visibility_rules) > FREE_VISIBILITY_EXCLUSION_LIMIT) {
      await requireCruushPlus(app, userId, VISIBILITY_EXCLUSION_LIMIT_MESSAGE);
    }

    return reply.send({
      data: await applyProfileVisibilityRules(app, userId, payload.visibility_rules)
    });
  });

  app.get("/api/profiles/me/visibility-sets", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    try {
      const result = await app.db.query<ProfileVisibilitySetRow>(
        `select ${PROFILE_VISIBILITY_SET_COLUMNS.join(", ")}
         from profile_visibility_sets
         where user_id = $1
         order by display_order asc, updated_at desc`,
        [userId]
      );

      return reply.send({
        data: result.rows.map((row) => mapVisibilitySetRow(app, row))
      });
    } catch (error) {
      if (isSchemaCompatibilityError(error)) {
        return reply.send({ data: [] });
      }

      throw error;
    }
  });

  app.post("/api/profiles/me/visibility-sets", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    await requireCruushPlus(app, userId, "Upgrade to cruush+ to save visibility sets.");
    const payload = visibilitySetPayloadSchema.parse(request.body);
    const encryptedProfileVisibility = encryptProfileVisibility(app.config, payload.visibility_rules);
    const result = await app.db.query<ProfileVisibilitySetRow>(
      `insert into profile_visibility_sets (
         user_id,
         name,
         profile_visibility_ciphertext,
         profile_visibility_nonce,
         profile_visibility_auth_tag,
         profile_visibility_key_version,
         profile_visibility_token_key_version
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       returning ${PROFILE_VISIBILITY_SET_COLUMNS.join(", ")}`,
      [
        userId,
        payload.name,
        encryptedProfileVisibility.profile_visibility_ciphertext,
        encryptedProfileVisibility.profile_visibility_nonce,
        encryptedProfileVisibility.profile_visibility_auth_tag,
        encryptedProfileVisibility.profile_visibility_key_version,
        encryptedProfileVisibility.profile_visibility_token_key_version
      ]
    );

    return reply.code(201).send({
      data: mapVisibilitySetRow(app, result.rows[0], payload.visibility_rules)
    });
  });

  app.put("/api/profiles/me/visibility-sets/:setId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { setId } = visibilitySetParamsSchema.parse(request.params);
    await requireCruushPlus(app, userId, "Upgrade to cruush+ to save visibility sets.");
    const payload = visibilitySetPayloadSchema.parse(request.body);
    const encryptedProfileVisibility = encryptProfileVisibility(app.config, payload.visibility_rules);
    const result = await app.db.query<ProfileVisibilitySetRow>(
      `update profile_visibility_sets
       set name = $3,
           profile_visibility_ciphertext = $4,
           profile_visibility_nonce = $5,
           profile_visibility_auth_tag = $6,
           profile_visibility_key_version = $7,
           profile_visibility_token_key_version = $8,
           updated_at = now()
       where user_id = $1 and id = $2
       returning ${PROFILE_VISIBILITY_SET_COLUMNS.join(", ")}`,
      [
        userId,
        setId,
        payload.name,
        encryptedProfileVisibility.profile_visibility_ciphertext,
        encryptedProfileVisibility.profile_visibility_nonce,
        encryptedProfileVisibility.profile_visibility_auth_tag,
        encryptedProfileVisibility.profile_visibility_key_version,
        encryptedProfileVisibility.profile_visibility_token_key_version
      ]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Visibility set not found.");
    }

    return reply.send({
      data: mapVisibilitySetRow(app, result.rows[0], payload.visibility_rules)
    });
  });

  app.delete("/api/profiles/me/visibility-sets/:setId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { setId } = visibilitySetParamsSchema.parse(request.params);
    await requireCruushPlus(app, userId, "Upgrade to cruush+ to save visibility sets.");
    const result = await app.db.query<{ id: string }>(
      `delete from profile_visibility_sets
       where user_id = $1 and id = $2
       returning id::text as id`,
      [userId, setId]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Visibility set not found.");
    }

    return reply.send({
      data: {
        deleted: true,
        id: result.rows[0].id
      }
    });
  });

  app.post("/api/profiles/me/visibility-sets/:setId/apply", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { setId } = visibilitySetParamsSchema.parse(request.params);
    await requireCruushPlus(app, userId, "Upgrade to cruush+ to use saved visibility sets.");
    const result = await app.db.query<ProfileVisibilitySetRow>(
      `select ${PROFILE_VISIBILITY_SET_COLUMNS.join(", ")}
       from profile_visibility_sets
       where user_id = $1 and id = $2
       limit 1`,
      [userId, setId]
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Visibility set not found.");
    }

    const visibilityRules = decryptProfileVisibility(app.config, result.rows[0]) ?? emptyProfile.visibility_rules;

    return reply.send({
      data: await applyProfileVisibilityRules(app, userId, visibilityRules)
    });
  });

  app.get("/api/profiles/:userId", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const { userId } = profileParamsSchema.parse(request.params);
    await app.rateLimiter.assert({
      key: `profile-read:${authenticatedUserId}`,
      max: 30,
      windowMs: 60 * 1000,
      message: "Too many profile requests. Try again later."
    });
    if (authenticatedUserId !== userId) {
      await assertUsersNotBlocked(app, authenticatedUserId, userId, {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Profile not found"
      });
    }

    return reply.send({
      data: await loadProfileData(app, userId, { includePrivateSensitive: false, viewerUserId: authenticatedUserId })
    });
  });

  app.put("/api/profiles/me", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const parsedPayload = profilePayloadSchema.parse(request.body);
    const kinkInterests = normalizeKinkInterests(parsedPayload);
    const entitlement = parsedPayload.tags.length > 3 || kinkInterests.length > 3 || parsedPayload.hobbies.length > 3
      ? await getCruushEntitlement(app, userId)
      : null;

    if (parsedPayload.tags.length > 3) {
      if (!entitlement?.cruushPlus) {
        throw new ApiError(402, "CRUUSH_PLUS_REQUIRED", "Upgrade to cruush+ to add up to 10 profile tags.");
      }
    }

    if (kinkInterests.length > 3 && !entitlement?.cruushPlus) {
      throw new ApiError(402, "CRUUSH_PLUS_REQUIRED", "Upgrade to cruush+ to add more than 3 kinks.");
    }

    if (kinkInterests.length > 10) {
      throw new ApiError(400, "VALIDATION_ERROR", "Choose up to 10 profile kinks.");
    }

    if (parsedPayload.hobbies.length > 3 && !entitlement?.cruushPlus) {
      throw new ApiError(402, "CRUUSH_PLUS_REQUIRED", "Upgrade to cruush+ to add up to 10 hobbies.");
    }

    if (countVisibilityExclusionFilters(parsedPayload.visibility_rules) > FREE_VISIBILITY_EXCLUSION_LIMIT) {
      await requireCruushPlus(app, userId, VISIBILITY_EXCLUSION_LIMIT_MESSAGE);
    }

    const existingIdentityState = await loadExistingIdentityState(app, userId);

    // Signup creates a year-only profile shell after checking the complete date of
    // birth. Keep that server-owned year immutable. Older unfinished accounts may
    // have no year, so accept their profile without reintroducing the removed DOB rite.
    const signupBirthYear = existingIdentityState.yearOfBirth === null
      ? await loadSignupBirthYear(app, userId)
      : null;
    const verifiedBirthYear = existingIdentityState.yearOfBirth ?? signupBirthYear ?? (
      parsedPayload.date_of_birth
        ? birthYearFromDateOfBirth(parsedPayload.date_of_birth)
        : parsedPayload.year_of_birth
    );

    const { date_of_birth: _dateOfBirth, ...profileFields } = parsedPayload;
    const payload: ProfilePayload = {
      ...profileFields,
      year_of_birth: verifiedBirthYear,
      hiv_status_visibility: FIXED_PRIVATE_HEALTH_VISIBILITY
    };

    const sensitiveProfile = buildSensitiveProfile(payload, kinkInterests);
    assertIdentityGateChangeAllowed(
      existingIdentityState,
      hasIdentityGateChange(existingIdentityState, payload, sensitiveProfile)
    );
    await moderateProfileOrReject(app, {
      userId,
      fields: buildProfileModerationFields(payload, kinkInterests),
      contentId: userId
    });
    const encryptedSensitiveProfile = encryptSensitiveProfile(app.config, sensitiveProfile);
    const encryptedProfileVisibility = encryptProfileVisibility(app.config, payload.visibility_rules);
    const payloadForColumns: ProfilePayload = {
      ...payload,
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    };
    const placeholders = PROFILE_COLUMNS.map((_, index) => `$${index + 1}`);
    const updates = PROFILE_COLUMNS
      .filter((column) => column !== "id")
      .map((column) => column === "year_of_birth"
        ? `${column} = coalesce(profiles.${column}, excluded.${column})`
        : column === "trans_crowds_changed_at"
        ? `${column} = coalesce(excluded.${column}, profiles.${column})`
        : `${column} = excluded.${column}`);

    let result;

    try {
      result = await runTransaction(app.db, async (db) => {
        await lockMapPingSenderInTransaction(db, userId);
        const transactionApp = appWithDatabase(app, db);
        const currentIdentityState = await loadExistingIdentityState(transactionApp, userId);
        // A concurrent first save or age verification may have established the
        // year while this request was being moderated. Re-read under the account lock.
        const currentBirthYear = currentIdentityState.yearOfBirth
          ?? await loadSignupBirthYear(transactionApp, userId)
          ?? verifiedBirthYear;
        const hasIdentityChange = hasIdentityGateChange(currentIdentityState, payload, sensitiveProfile);
        assertIdentityGateChangeAllowed(currentIdentityState, hasIdentityChange);
        const values = PROFILE_COLUMNS.map((column) => {
          if (column === "id") {
            return userId;
          }

          if (column === "year_of_birth") {
            return currentBirthYear;
          }

          if (column === "ethnicity") {
            return payloadForColumns.ethnicity ? [payloadForColumns.ethnicity] : [];
          }

          if (column in encryptedSensitiveProfile) {
            return encryptedSensitiveProfile[column as keyof EncryptedSensitiveProfile];
          }

          if (column in encryptedProfileVisibility) {
            return encryptedProfileVisibility[column as keyof EncryptedProfileVisibility];
          }

          if (column === "trans_crowds_changed_at") {
            return hasIdentityChange ? new Date() : null;
          }

          return payloadForColumns[column as keyof ProfilePayload];
        });
        const saved = await db.query<ProfileRow>(
          `insert into profiles (${PROFILE_COLUMNS.join(", ")})
           values (${placeholders.join(", ")})
           on conflict (id) do update
           set ${updates.join(", ")}, updated_at = now()
           returning ${PROFILE_COLUMNS.join(", ")}, ${SIDE_BADGES_SELECT}, updated_at`,
          values
        );

        await db.query(
          `update app_users
           set display_name = $2
           where id = $1`,
          [userId, payload.display_name]
        );

        await syncProfileKinkInterests(transactionApp, userId, kinkInterests);
        await syncSensitiveProfileTokens(transactionApp, userId, combineSensitiveTokens(
          createSensitiveProfileTokens(app.config, sensitiveProfile),
          createProfileVisibilityTokens(app.config, payload.visibility_rules)
        ));

        if (currentIdentityState.exists && (
          currentIdentityState.signal !== payload.signal ||
          profileVisibilityNarrowed(
            currentIdentityState.visibilityRules ?? emptyProfile.visibility_rules,
            payload.visibility_rules
          )
        )) {
          await revokeActiveMapPingsInTransaction(db, userId);
        }

        return saved;
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";
      const message = error instanceof Error ? error.message : "";

      if (code === "23514" && message.includes("profile photo")) {
        throw new ApiError(400, "VALIDATION_ERROR", "Profile photos must be approved uploads owned by your account.");
      }

      throw error;
    }

    return reply.send({
      data: mapProfileRow(result.rows[0], kinkInterests, {
        includePrivateSensitive: true,
        sensitiveProfile,
        visibilityRules: payload.visibility_rules
      })
    });
  });

  app.put("/api/profiles/me/location", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = profileLocationPayloadSchema.parse(request.body);

    try {
      const { location, isNewMapAppearance } = await runTransaction(app.db, async (db) => {
        await lockMapPingSenderInTransaction(db, userId);
        const transactionApp = appWithDatabase(app, db);
        const previousLocation = await db.query<{ is_new_map_appearance: boolean }>(
          `select
             (location_updated_at is null or location_updated_at < now() - interval '4 days') as is_new_map_appearance
           from profiles
           where id = $1
           for update`,
          [userId]
        );
        const isNewMapAppearance = previousLocation.rows[0]?.is_new_map_appearance ?? true;
        await db.query(
          `insert into profiles (id, location_updated_at, updated_at)
           values ($1, now(), now())
           on conflict (id) do update
           set location_updated_at = now(),
               updated_at = now()`,
          [userId]
        );
        const savedLocation = await storeLocationEnvelope(transactionApp, {
          subjectUserId: userId,
          lat: payload.lat,
          lng: payload.lng,
          accuracyM: payload.fuzz_radius_meters,
          source: "GPS"
        });
        await queueOutOfSightWelcomeEmail(db, userId, { lat: payload.lat, lng: payload.lng }, app.config);
        await revokeActiveMapPingsInTransaction(db, userId);

        return {
          location: savedLocation,
          isNewMapAppearance
        };
      });
      // Start delivery after location commit; mail failures do not fail this save.
      // A pending row also survives provider outages and is retried by the sweep.
      void deliverOutOfSightWelcomeEmail(app, userId).catch(() => {
        app.log.warn("Out of Sight welcome email delivery deferred");
      });
      void deliverPendingSinnersWelcomeEmailsForUser(app, userId).catch(() => {
        app.log.warn("Sinners welcome email delivery deferred");
      });
      const policy = await getEffectiveVisibilityPolicy(app, userId);
      const travelPin = await getTravelPin(app, userId).catch(() => null);
      const displayLocation = travelPin ? locationPayloadAtTravelPin(location, travelPin) : location;
      const token = await makeDisplayLocationToken(app, request, {
        subjectUserId: userId,
        viewerUserId: userId,
        policy,
        location: displayLocation,
        displayMode: "PRECISE",
        forceSelfPrecise: true
      });
      const ghostToken = policy.baseMode === "GHOST"
        ? await makeDisplayLocationToken(app, request, {
            subjectUserId: userId,
            viewerUserId: userId,
            policy,
            location: displayLocation,
            displayMode: "GHOST"
          })
        : null;

      if (payload.sync_reason !== "PING" && isNewMapAppearance) {
        try {
          await notifyNearbyUsersForLocationUpdate(app, {
            sourceUserId: userId,
            location: displayLocation,
            visibilityPolicy: policy
          });
        } catch (error) {
          app.log.warn({ err: error, userId }, "nearby notification dispatch failed");
        }
      }

      return reply.send({
        data: {
          id: userId,
          display_location_token: token,
          display_expires_at_ms: token.expiresAtMs,
          display_mode: "PRECISE",
          animation_hint: "NONE",
          ...(ghostToken
            ? {
                ghost_display_location_token: ghostToken,
                ghost_display_expires_at_ms: ghostToken.expiresAtMs
              }
            : {}),
          location_updated_at: new Date(displayLocation.collectedAtMs).toISOString()
        }
      });
    } catch (error) {
      if (isSchemaCompatibilityError(error)) {
        throw new ApiError(
          503,
          "LOCATION_STORAGE_UNAVAILABLE",
          "Encrypted location storage is unavailable until the latest database migrations run."
        );
      }

      throw error;
    }
  });
}
