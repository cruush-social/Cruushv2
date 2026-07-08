import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireCruushPlus } from "../billing.js";
import { ApiError } from "../errors.js";
import {
  getRelationshipPermissions,
  getPrivacySettings,
  recordProfileView,
  savePrivacySettings,
  type RelationshipPermissions
} from "../match-relationships.js";
import {
  emptyProfile,
  profileLocationPayloadSchema,
  profilePayloadSchema,
  profileVisibilityRulesSchema,
  type ProfilePayload
} from "../profile-schema.js";
import { moderateProfileOrReject } from "../moderation-service.js";
import {
  canSubjectViewProfile,
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
  type EncryptedProfileVisibility,
  encryptSensitiveProfile,
  type EncryptedSensitiveProfile,
  type ProfileVisibilityRules,
  type SensitiveProfileData,
  type SensitiveProfileToken
} from "../profile-sensitive.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import {
  DEFAULT_GHOST_RADIUS_METERS,
  GHOST_RADIUS_OPTIONS,
  loadLocationEnvelope,
  loadVisibilityPolicy,
  makeDisplayLocationToken,
  publicPrivacySettings,
  radiusMetersForLabel,
  saveVisibilityPolicy,
  storeLocationEnvelope,
  type CrowdPrecisionPolicy,
  type VisibilityBaseMode
} from "../location-privacy.js";

const profileParamsSchema = z.object({
  userId: z.uuid()
}).strict();

const visibilitySetParamsSchema = z.object({
  setId: z.uuid()
}).strict();

const FIXED_PRIVATE_PROFILE_VISIBILITY: ProfileVisibility = "mutual_cruushes";

const visibilitySetPayloadSchema = z.object({
  name: z.string().trim().min(1).max(48),
  visibility_rules: profileVisibilityRulesSchema
}).strict();

const crowdPrecisionPolicySchema = z.object({
  crowdId: z.enum(["T4T", "Gay", "Sapphic"]),
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
  ghostRadiusLabel: z.string().optional(),
  preciseToMutualCruushes: z.boolean().optional(),
  preciseToMutualCrowds: z.array(crowdPrecisionPolicySchema).max(3).optional(),
  preciseLocationVisibility: z.enum(["none", "mutual_cruushes"]).optional(),
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
  bio: string | null;
  pronouns: string[] | null;
  custom_pronouns: string | null;
  year_of_birth: number | null;
  ethnicity: string[] | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  body_type: string[] | null;
  height: string | null;
  weight: string | null;
  position: string[] | null;
  role: string[] | null;
  trans_status_visibility: ProfileVisibility | null;
  availability: string[] | null;
  hosting_travel: string[] | null;
  kinks: string[] | null;
  kinks_visibility: ProfileVisibility | null;
  vibes: string[] | null;
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
  substance_boundaries: string[] | null;
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
  badges?: string[] | null;
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
  year_of_birth: number | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  body_type: string[] | null;
  looking_for: string[] | null;
  availability: string[] | null;
  hosting_travel: string[] | null;
  vibes: string[] | null;
  scenes: string[] | null;
  archetypes: string[] | null;
  hobbies: string[] | null;
  position: string[] | null;
  role: string[] | null;
  kinks: string[] | null;
  substance_boundaries: string[] | null;
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

function hasPremiumPrivacySettings(input: {
  baseMode: VisibilityBaseMode;
  preciseToMutualCruushes: boolean;
  preciseToMutualCrowds: CrowdPrecisionPolicy[];
}) {
  return input.baseMode === "STEALTH" ||
    input.preciseToMutualCruushes ||
    input.preciseToMutualCrowds.some((policy) => policy.precisionEnabled);
}

function premiumPrivacyMessage(input: {
  baseMode: VisibilityBaseMode;
  preciseToMutualCruushes: boolean;
  preciseToMutualCrowds: CrowdPrecisionPolicy[];
}) {
  if (input.baseMode === "STEALTH") {
    return "Upgrade to cruush+ to use stealth mode.";
  }

  return "Upgrade to cruush+ to share precise location with mutuals.";
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

const PROFILE_COLUMNS = [
  "id",
  "display_name",
  "photos",
  "bio",
  "pronouns",
  "custom_pronouns",
  "year_of_birth",
  "ethnicity",
  "identities",
  "presentation",
  "sexuality",
  "body_type",
  "height",
  "weight",
  "position",
  "role",
  "trans_status_visibility",
  "availability",
  "hosting_travel",
  "kinks",
  "kinks_visibility",
  "vibes",
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
  "substance_boundaries",
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
  const showTransStatus = canShowByVisibility(FIXED_PRIVATE_PROFILE_VISIBILITY);
  const showHivStatus = canShowByVisibility(FIXED_PRIVATE_PROFILE_VISIBILITY);
  const visibleCrowds = options.visibleCrowds ?? (includePrivateSensitive ? sensitiveProfile?.crowds ?? [] : []);
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
  return {
    id: row.id,
    ...emptyProfile,
    display_name: row.display_name ?? "",
    photos: row.photos ?? [],
    bio: row.bio ?? "",
    pronouns: row.pronouns ?? [],
    custom_pronouns: row.custom_pronouns ?? "",
    year_of_birth: row.year_of_birth,
    ethnicity: row.ethnicity?.[0] ?? "",
    identities: row.identities ?? [],
    presentation: row.presentation ?? [],
    sexuality: row.sexuality ?? [],
    body_type: row.body_type ?? [],
    height: row.height ?? "",
    weight: row.weight ?? "",
    position: row.position ?? [],
    role: row.role ?? [],
    is_trans: showTransStatus ? sensitiveProfile?.is_trans ?? null : null,
    trans_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY,
    crowds: visibleCrowds,
    availability: row.availability ?? [],
    hosting_travel: row.hosting_travel ?? [],
    kinks: resolvedKinkInterests.length > 0
      ? resolvedKinkInterests.map((interest) => interest.label ?? interest.kink_id)
      : sensitiveKinks.length > 0
        ? sensitiveKinks
        : legacyKinks,
    kink_interests: resolvedKinkInterests,
    kinks_visibility: row.kinks_visibility ?? "public",
    vibes: row.vibes ?? [],
    scenes: row.scenes ?? [],
    archetypes: row.archetypes ?? [],
    hobbies: row.hobbies ?? [],
    custom_hobby: row.custom_hobby ?? "",
    looking_for: row.looking_for ?? [],
    hiv_status: showHivStatus ? sensitiveProfile?.hiv_status ?? row.hiv_status ?? [] : [],
    hiv_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY,
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
    substance_boundaries: row.substance_boundaries ?? [],
    ...((row.badges?.length ?? 0) > 0 ? { badges: row.badges } : {}),
    visibility_rules: includePrivateSensitive ? visibilityRules ?? emptyProfile.visibility_rules : emptyProfile.visibility_rules,
    updated_at: new Date(row.updated_at).toISOString(),
    ...(options.relationship ? {
      viewer_relationship: {
        match_id: options.relationship.matchId,
        mutual_cruush: options.relationship.isMutualCruush,
        outgoing_cruush: options.relationship.hasOutgoingCruush,
        can_message: options.relationship.canMessage,
        can_reveal_precise_location: options.relationship.canRevealPreciseLocation
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
    custom_hiv_status: ""
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
    pronouns: row.pronouns ?? [],
    custom_pronouns: row.custom_pronouns ?? "",
    year_of_birth: row.year_of_birth,
    ethnicity: row.ethnicity?.[0] ?? "",
    identities: row.identities ?? [],
    presentation: row.presentation ?? [],
    sexuality: row.sexuality ?? [],
    body_type: row.body_type ?? [],
    height: row.height ?? "",
    weight: row.weight ?? "",
    position: row.position ?? [],
    role: row.role ?? [],
    is_trans: sensitiveProfile.is_trans,
    trans_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY,
    crowds: sensitiveProfile.crowds,
    availability: row.availability ?? [],
    hosting_travel: row.hosting_travel ?? [],
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
    hiv_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY,
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
    substance_boundaries: row.substance_boundaries ?? [],
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
    location,
    displayMode: "PRECISE",
    forceSelfPrecise: true
  });

  return {
    display_location_token: token,
    display_expires_at_ms: token.expiresAtMs,
    display_mode: "PRECISE",
    animation_hint: "NONE",
    location_updated_at: new Date(location.collectedAtMs).toISOString()
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
         year_of_birth,
         identities,
         presentation,
         sexuality,
         body_type,
         looking_for,
         availability,
         hosting_travel,
         vibes,
         scenes,
         archetypes,
         hobbies,
         position,
         role,
         kinks,
         substance_boundaries,
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
      kinks: sensitiveKinksForVisibility(sensitiveProfile, row.kinks),
      body_types: row.body_type ?? [],
      sexuality: row.sexuality ?? [],
      substance_boundaries: row.substance_boundaries ?? [],
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
    `select ${PROFILE_COLUMNS.join(", ")}, updated_at
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

async function applyProfileVisibilityRules(
  app: FastifyInstance,
  userId: string,
  visibilityRules: ProfileVisibilityRules
) {
  const existingRow = await loadOwnerProfileRow(app, userId);
  const sensitiveProfile = decryptSensitiveProfile(app.config, existingRow) ?? fallbackSensitiveProfile();
  const kinkInterests = await loadProfileKinkInterests(app, userId);
  profilePayloadSchema.parse(profilePayloadFromRow(existingRow, sensitiveProfile, kinkInterests, visibilityRules));

  const encryptedProfileVisibility = encryptProfileVisibility(app.config, visibilityRules);
  const result = await app.db.query<ProfileRow>(
    `update profiles
     set profile_visibility_ciphertext = $2,
         profile_visibility_nonce = $3,
         profile_visibility_auth_tag = $4,
         profile_visibility_key_version = $5,
         profile_visibility_token_key_version = $6,
         updated_at = now()
     where id = $1
     returning ${PROFILE_COLUMNS.join(", ")}, updated_at`,
    [
      userId,
      encryptedProfileVisibility.profile_visibility_ciphertext,
      encryptedProfileVisibility.profile_visibility_nonce,
      encryptedProfileVisibility.profile_visibility_auth_tag,
      encryptedProfileVisibility.profile_visibility_key_version,
      encryptedProfileVisibility.profile_visibility_token_key_version
    ]
  );

  await syncSensitiveProfileTokens(app, userId, combineSensitiveTokens(
    createSensitiveProfileTokens(app.config, sensitiveProfile),
    createProfileVisibilityTokens(app.config, visibilityRules)
  ));

  return mapProfileRow(result.rows[0], kinkInterests, {
    includePrivateSensitive: true,
    sensitiveProfile,
    visibilityRules
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
    const tokenHash = createCrowdTokens(app.config, [crowd])[0]?.token_hash;
    return Boolean(tokenHash && viewerTokens.has(tokenHash));
  });
}

function buildSensitiveProfile(payload: ProfilePayload, kinkInterests: ProfileKinkInterest[]): SensitiveProfileData {
  return {
    is_trans: payload.is_trans,
    crowds: payload.crowds,
    kinks: kinkInterests.map((interest) => interest.label ?? interest.kink_id),
    kink_interests: kinkInterests,
    hiv_status: payload.hiv_status,
    custom_hiv_status: payload.custom_hiv_status
  };
}

function buildProfileModerationFields(payload: ProfilePayload, kinkInterests: ProfileKinkInterest[]) {
  return {
    display_name: payload.display_name,
    bio: payload.bio,
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
  sensitiveProfile: SensitiveProfileData | null;
  changedAt: Date | null;
};

async function loadExistingIdentityState(app: FastifyInstance, userId: string): Promise<ExistingIdentityState> {
  try {
    const result = await app.db.query<{
      profile_sensitive_ciphertext: string | null;
      profile_sensitive_nonce: string | null;
      profile_sensitive_auth_tag: string | null;
      profile_sensitive_key_version: string | null;
      trans_crowds_changed_at: string | Date | null;
    }>(
      `select
         profile_sensitive_ciphertext,
         profile_sensitive_nonce,
         profile_sensitive_auth_tag,
         profile_sensitive_key_version,
         trans_crowds_changed_at
       from profiles
       where id = $1`,
      [userId]
    );
    const row = result.rows[0];

    if (!row) {
      return {
        exists: false,
        sensitiveProfile: null,
        changedAt: null
      };
    }

    let sensitiveProfile: SensitiveProfileData | null = null;

    try {
      sensitiveProfile = decryptSensitiveProfile(app.config, row);
    } catch {
      sensitiveProfile = null;
    }

    return {
      exists: true,
      sensitiveProfile,
      changedAt: row.trans_crowds_changed_at ? new Date(row.trans_crowds_changed_at) : null
    };
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return {
        exists: false,
        sensitiveProfile: null,
        changedAt: null
      };
    }

    throw error;
  }
}

function hasTransCrowdChange(existingState: ExistingIdentityState, sensitiveProfile: SensitiveProfileData) {
  if (!existingState.exists) {
    return sensitiveProfile.is_trans !== null || sensitiveProfile.crowds.length > 0;
  }

  if (!existingState.sensitiveProfile) {
    return sensitiveProfile.is_trans !== null || sensitiveProfile.crowds.length > 0;
  }

  return existingState.sensitiveProfile.is_trans !== sensitiveProfile.is_trans ||
    !stringArraysEqual(existingState.sensitiveProfile.crowds, sensitiveProfile.crowds);
}

function assertTransCrowdChangeAllowed(existingState: ExistingIdentityState, hasChange: boolean) {
  if (!hasChange || !existingState.changedAt) {
    return;
  }

  const lockWindowMs = 14 * 24 * 60 * 60 * 1000;
  const lockExpiresAt = existingState.changedAt.getTime() + lockWindowMs;

  if (Date.now() < lockExpiresAt) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Trans status and crowd selection can only be changed once every 14 days."
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
            lat,
            lng,
            fuzzy_lat,
            fuzzy_lng,
            location_fuzz_radius_meters,
            location_updated_at,
            coalesce((
              select array_agg(user_badges.badge_key order by user_badges.awarded_at asc)
              from user_badges
              where user_badges.user_id = profiles.id
            ), '{}'::text[]) as badges,
            updated_at
     from profiles
     where id = $1`,
    [userId]
  );

  if (!result.rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }

  const row = result.rows[0];
  const relationship = !options.includePrivateSensitive && options.viewerUserId
    ? await getRelationshipPermissions(app, options.viewerUserId, userId)
    : null;
  const needsMutualCrowd =
    row.kinks_visibility === "mutual_crowds";
  const needsMutualCruush =
    row.kinks_visibility === "mutual_cruushes" ||
    FIXED_PRIVATE_PROFILE_VISIBILITY === "mutual_cruushes";
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

  if (!options.includePrivateSensitive && !visibilityRulesArePublic(visibilityRules)) {
    const viewerProfile = options.viewerUserId
      ? await loadVisibilitySubjectProfile(app, options.viewerUserId)
      : null;

    if (!viewerProfile || !canSubjectViewProfile(visibilityRules, viewerProfile, getProfileCoordinates(row))) {
      throw new ApiError(404, "NOT_FOUND", "Profile not found");
    }
  }

  if (relationship && options.viewerUserId) {
    await recordProfileView(app, options.viewerUserId, userId, relationship);
  }

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
    visibleCrowds
  });

  if (options.includePrivateSensitive && options.request) {
    const location = await buildOwnerLocationDisplay(app, options.request, userId);

    if (location) {
      return {
        ...mappedProfile,
        location
      };
    }
  }

  return mappedProfile;
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/api/profiles/me", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    return loadProfile(app, request, userId, reply);
  });

  app.get("/api/profiles/me/privacy-settings", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    return reply.send({
      data: publicPrivacySettings(await loadVisibilityPolicy(app, userId).catch(async (error) => {
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
            auditRequired: false,
            updatedAtMs: legacy.updatedAtMs,
            expiresAtMs: null,
            keyVersion: app.config.VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION || "v1"
          };
        }

        throw error;
      }))
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

    return reply.send({
      data: publicPrivacySettings(await saveVisibilityPolicy(app, userId, {
        baseMode,
        ghostModeEnabled: baseMode === "GHOST",
        ghostRadiusMeters: payload.ghostRadiusMeters ?? radiusMetersForLabel(payload.ghostRadiusLabel),
        preciseToMutualCruushes,
        preciseToMutualCrowds,
        preciseLocationVisibility: preciseToMutualCruushes ? "mutual_cruushes" : "none"
      }))
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

    return reply.send({
      data: await loadProfileData(app, userId, { includePrivateSensitive: false, viewerUserId: authenticatedUserId })
    });
  });

  app.put("/api/profiles/me", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const parsedPayload = profilePayloadSchema.parse(request.body);
    const payload: ProfilePayload = {
      ...parsedPayload,
      trans_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY,
      hiv_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY
    };

    const kinkInterests = normalizeKinkInterests(payload);
    const sensitiveProfile = buildSensitiveProfile(payload, kinkInterests);
    await moderateProfileOrReject(app, {
      userId,
      fields: buildProfileModerationFields(payload, kinkInterests),
      contentId: userId
    });
    const existingIdentityState = await loadExistingIdentityState(app, userId);
    const hasIdentityChange = hasTransCrowdChange(existingIdentityState, sensitiveProfile);
    assertTransCrowdChangeAllowed(existingIdentityState, hasIdentityChange);
    const encryptedSensitiveProfile = encryptSensitiveProfile(app.config, sensitiveProfile);
    const encryptedProfileVisibility = encryptProfileVisibility(app.config, payload.visibility_rules);
    const payloadForColumns: ProfilePayload = {
      ...payload,
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    };
    const values = PROFILE_COLUMNS.map((column) => {
      if (column === "id") {
        return userId;
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

    const placeholders = PROFILE_COLUMNS.map((_, index) => `$${index + 1}`);
    const updates = PROFILE_COLUMNS
      .filter((column) => column !== "id")
      .map((column) => column === "trans_crowds_changed_at"
        ? `${column} = coalesce(excluded.${column}, profiles.${column})`
        : `${column} = excluded.${column}`);

    const result = await app.db.query<ProfileRow>(
      `insert into profiles (${PROFILE_COLUMNS.join(", ")})
       values (${placeholders.join(", ")})
       on conflict (id) do update
       set ${updates.join(", ")}, updated_at = now()
       returning ${PROFILE_COLUMNS.join(", ")}, updated_at`,
      values
    );
    await syncProfileKinkInterests(app, userId, kinkInterests);
    await syncSensitiveProfileTokens(app, userId, combineSensitiveTokens(
      createSensitiveProfileTokens(app.config, sensitiveProfile),
      createProfileVisibilityTokens(app.config, payload.visibility_rules)
    ));

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
      await app.db.query(
        `insert into profiles (id, location_updated_at, updated_at)
         values ($1, now(), now())
         on conflict (id) do update
         set location_updated_at = now(),
             updated_at = now()`,
        [userId]
      );
      const location = await storeLocationEnvelope(app, {
        subjectUserId: userId,
        lat: payload.lat,
        lng: payload.lng,
        accuracyM: payload.fuzz_radius_meters,
        source: "GPS"
      });
      const policy = await loadVisibilityPolicy(app, userId);
      const token = await makeDisplayLocationToken(app, request, {
        subjectUserId: userId,
        viewerUserId: userId,
        policy,
        location,
        displayMode: "PRECISE",
        forceSelfPrecise: true
      });

      return reply.send({
        data: {
          id: userId,
          display_location_token: token,
          display_expires_at_ms: token.expiresAtMs,
          display_mode: "PRECISE",
          animation_hint: "NONE",
          location_updated_at: new Date(location.collectedAtMs).toISOString()
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
