import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import {
  emptyProfile,
  profileLocationPayloadSchema,
  profilePayloadSchema,
  type ProfilePayload
} from "../profile-schema.js";
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
import { getAuthenticatedUserId } from "../request-auth.js";

const profileParamsSchema = z.object({
  userId: z.uuid()
}).strict();

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
    hasMutualCrowd?: boolean;
    sensitiveProfile?: SensitiveProfileData | null;
    visibilityRules?: ProfileVisibilityRules | null;
    showKinks?: boolean;
  } = {}
) {
  const includePrivateSensitive = options.includePrivateSensitive ?? true;
  const hasMutualCrowd = options.hasMutualCrowd ?? false;
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

    return false;
  };
  const sensitiveProfile = options.sensitiveProfile ?? null;
  const visibilityRules = options.visibilityRules ?? null;
  const showKinks = options.showKinks ?? canShowByVisibility(row.kinks_visibility);
  const showTransStatus = canShowByVisibility(row.trans_status_visibility);
  const showHivStatus = canShowByVisibility(row.hiv_status_visibility);
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
    trans_status_visibility: row.trans_status_visibility ?? "public",
    crowds: includePrivateSensitive ? sensitiveProfile?.crowds ?? [] : [],
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
    hiv_status_visibility: row.hiv_status_visibility ?? "mutual_cruushes",
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
    visibility_rules: includePrivateSensitive ? visibilityRules ?? emptyProfile.visibility_rules : emptyProfile.visibility_rules,
    updated_at: new Date(row.updated_at).toISOString()
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
    const row = result.rows[0];

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

async function loadProfile(app: FastifyInstance, userId: string, reply: FastifyReply) {
  return reply.send({
    data: await loadProfileData(app, userId, { includePrivateSensitive: true })
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

async function profilesShareCrowd(app: FastifyInstance, firstUserId: string, secondUserId: string) {
  if (firstUserId === secondUserId) {
    return true;
  }

  const [firstTokens, secondTokens] = await Promise.all([
    loadSensitiveProfileTokenHashes(app, firstUserId),
    loadSensitiveProfileTokenHashes(app, secondUserId)
  ]);
  const crowdTokenHashes = new Set(createCrowdTokens(app.config, [...CROWD_OPTIONS]).map((token) => token.token_hash));

  for (const tokenHash of crowdTokenHashes) {
    if (firstTokens.has(tokenHash) && secondTokens.has(tokenHash)) {
      return true;
    }
  }

  return false;
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
  options: { includePrivateSensitive: boolean; viewerUserId?: string }
) {
  const result = await app.db.query<ProfileRow>(
    `select ${PROFILE_COLUMNS.join(", ")}, lat, lng, fuzzy_lat, fuzzy_lng, updated_at
     from profiles
     where id = $1`,
    [userId]
  );

  if (!result.rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }

  const row = result.rows[0];
  const needsMutualCrowd =
    row.kinks_visibility === "mutual_crowds" ||
    row.trans_status_visibility === "mutual_crowds" ||
    row.hiv_status_visibility === "mutual_crowds";
  const hasMutualCrowd = options.viewerUserId && needsMutualCrowd
    ? await profilesShareCrowd(app, options.viewerUserId, userId)
    : false;
  const sensitiveProfile = decryptSensitiveProfile(app.config, row);
  const visibilityRules = decryptProfileVisibility(app.config, row);

  if (!options.includePrivateSensitive && !visibilityRulesArePublic(visibilityRules)) {
    const viewerProfile = options.viewerUserId
      ? await loadVisibilitySubjectProfile(app, options.viewerUserId)
      : null;

    if (!viewerProfile || !canSubjectViewProfile(visibilityRules, viewerProfile, getProfileCoordinates(row))) {
      throw new ApiError(404, "NOT_FOUND", "Profile not found");
    }
  }

  const showKinks = options.includePrivateSensitive || (row.kinks_visibility ?? "public") === "public" || ((row.kinks_visibility ?? "public") === "mutual_crowds" && hasMutualCrowd);
  const kinkInterests = showKinks
    ? await loadProfileKinkInterests(app, userId)
    : [];

  return mapProfileRow(row, kinkInterests, {
    includePrivateSensitive: options.includePrivateSensitive,
    hasMutualCrowd,
    sensitiveProfile,
    visibilityRules,
    showKinks
  });
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/api/profiles/me", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    return loadProfile(app, userId, reply);
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
    const userId = await getAuthenticatedUserId(request);
    const payload = profilePayloadSchema.parse(request.body);
    const kinkInterests = normalizeKinkInterests(payload);
    const sensitiveProfile = buildSensitiveProfile(payload, kinkInterests);
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
    const userId = await getAuthenticatedUserId(request);
    const payload = profileLocationPayloadSchema.parse(request.body);
    const fuzzyCoordinates = createFuzzyCoordinates(payload.lat, payload.lng, payload.fuzz_radius_meters);

    try {
      const result = await app.db.query<ProfileLocationRow>(
        `insert into profiles (
           id,
           lat,
           lng,
           fuzzy_lat,
           fuzzy_lng,
           location_fuzz_radius_meters,
           location_updated_at
         )
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (id) do update
         set lat = excluded.lat,
             lng = excluded.lng,
             fuzzy_lat = excluded.fuzzy_lat,
             fuzzy_lng = excluded.fuzzy_lng,
             location_fuzz_radius_meters = excluded.location_fuzz_radius_meters,
             location_updated_at = now(),
             updated_at = now()
         returning
           id::text as id,
           lat,
           lng,
           fuzzy_lat,
           fuzzy_lng,
           location_fuzz_radius_meters,
           location_updated_at`,
        [
          userId,
          payload.lat,
          payload.lng,
          fuzzyCoordinates.fuzzyLat,
          fuzzyCoordinates.fuzzyLng,
          payload.fuzz_radius_meters
        ]
      );

      return reply.send({
        data: mapProfileLocationRow(result.rows[0])
      });
    } catch (error) {
      if (isSchemaCompatibilityError(error)) {
        throw new ApiError(
          503,
          "LOCATION_STORAGE_UNAVAILABLE",
          "Location storage is unavailable until the latest database migrations run."
        );
      }

      throw error;
    }
  });
}
