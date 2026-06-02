import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  formatDistanceMiles,
  formatLastActiveFromDate,
  formatLastActiveFromMinutes,
  getDiscoveryCoordinates
} from "../discovery-users.js";
import {
  createSensitiveProfileToken,
  decryptProfileVisibility,
  decryptSensitiveProfile,
  getSensitiveProfileTokenKeyVersion
} from "../profile-sensitive.js";
import {
  canSubjectViewProfile,
  type VisibilityCoordinates,
  type VisibilitySubjectProfile
} from "../profile-visibility.js";
import { getAuthenticatedUserId } from "../request-auth.js";
import { normalizeSingleLineText } from "../input-schema.js";
import { getRelationshipPermissions } from "../match-relationships.js";

type DiscoveryProfileRow = {
  id: string;
  display_name: string | null;
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
  updated_at: string | Date;
};

type DiscoveryViewerRow = Omit<DiscoveryProfileRow, "id" | "display_name" | "photos" | "updated_at">;

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
    ? item.split(",").map((part) => part.trim()).filter(Boolean)
    : []);
}, z.array(z.enum(["T4T", "Sapphic", "Gay"])).max(3).default([]));

const discoveryQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
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
  return value?.trim() || "Cruush user";
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
  where.push(`${column} && $${values.length}::text[]`);
}

function addVibeFilter(where: string[], values: unknown[], selectedValues: string[]) {
  if (selectedValues.length === 0) {
    return;
  }

  values.push(selectedValues);
  const selectedValuesPlaceholder = `$${values.length}`;
  where.push(`(
           vibes && ${selectedValuesPlaceholder}::text[]
           or scenes && ${selectedValuesPlaceholder}::text[]
           or archetypes && ${selectedValuesPlaceholder}::text[]
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
  const tokenHashes = selectedValues
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

async function loadDiscoveryRows(app: FastifyInstance, currentUserId: string, filters: DiscoveryQuery) {
  try {
    const values: unknown[] = [currentUserId];
    const where = [
      "profiles.id <> $1",
      "lat is not null",
      "lng is not null",
      "coalesce(profile_privacy.ghost_mode_enabled, false) = false"
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
         display_name,
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
         lat,
         lng,
         fuzzy_lat,
         fuzzy_lng,
         profiles.updated_at
       from profiles
       left join user_privacy_settings profile_privacy
         on profile_privacy.user_id = profiles.id
       where ${where.join("\n         and ")}
       order by profiles.updated_at desc
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
       order by last_active desc nulls last
       limit $1`,
      [filters.limit]
    );

    return {
      mode: "legacy" as const,
      rows: legacyRows.rows
    };
  }
}

function mapModernDiscoveryRow(
  row: DiscoveryProfileRow,
  centerLat: number,
  centerLng: number,
  relationship: Awaited<ReturnType<typeof getRelationshipPermissions>> | null = null
) {
  const coordinates = {
    lat: row.fuzzy_lat ?? row.lat,
    lng: row.fuzzy_lng ?? row.lng
  };

  if (coordinates.lat == null || coordinates.lng == null) {
    return null;
  }

  return {
    id: row.id,
    name: coerceDisplayName(row.display_name),
    display_name: coerceDisplayName(row.display_name),
    age: row.year_of_birth ? new Date().getFullYear() - row.year_of_birth : null,
    pronouns: coerceStringArray(row.pronouns).join(", "),
    lat: coordinates.lat,
    lng: coordinates.lng,
    lastActive: formatLastActiveFromDate(row.updated_at),
    distance: formatDistanceMiles(centerLat, centerLng, coordinates.lat, coordinates.lng),
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
    relationship: relationship?.isMutualCruush
      ? {
          mutualCruush: true,
          canMessage: relationship.canMessage
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

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/api/users", async (request, reply) => {
    const currentUserId = await getAuthenticatedUserId(request);
    const parsedQuery = discoveryQuerySchema.parse(request.query);
    await app.rateLimiter.assert({
      key: `discovery-read:${currentUserId}`,
      max: 30,
      windowMs: 60 * 1000,
      message: "Too many discovery refreshes. Try again later."
    });
    const centerLat = parsedQuery.lat ?? DEFAULT_CENTER.lat;
    const centerLng = parsedQuery.lng ?? DEFAULT_CENTER.lng;

    const usedIds = new Set<string>();
    const discoveryViewer = await loadDiscoveryViewer(app, currentUserId);
    const discoveryRows = await loadDiscoveryRows(app, currentUserId, parsedQuery);
    const realUsers = discoveryRows.mode === "modern"
      ? (await Promise.all(discoveryRows.rows
          .filter((row) => discoveryRowIsVisibleToViewer(app, row, discoveryViewer))
          .map(async (row) => {
            usedIds.add(row.id);
            const relationship = await getRelationshipPermissions(app, currentUserId, row.id);
            return mapModernDiscoveryRow(row, centerLat, centerLng, relationship);
          })))
          .filter((row): row is NonNullable<typeof row> => row !== null)
      : discoveryRows.rows.map((row, index) => {
          usedIds.add(row.id);
          return mapLegacyDiscoveryRow(row, centerLat, centerLng, index);
        });

    return reply.send({
      data: realUsers.slice(0, parsedQuery.limit)
    });
  });
}
