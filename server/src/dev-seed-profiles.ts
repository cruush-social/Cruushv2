import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { hashPassword } from "./auth.js";
import { loadConfig, type AppConfig } from "./config.js";
import { createPool, type DbClient } from "./db.js";
import {
  DEVELOPMENT_ADMIN_DISPLAY_NAME,
  DEVELOPMENT_ADMIN_EMAIL,
  DEVELOPMENT_ADMIN_LOCATION,
  ensureDevelopmentAdminUser,
  syncDevelopmentLocationPrivacy
} from "./development-admin.js";
import {
  buildEncryptedRelationshipPayload,
  upsertEncryptedRelationshipRecord
} from "./encrypted-relationships.js";
import {
  createSensitiveProfileTokens,
  encryptProfileVisibility,
  encryptSensitiveProfile,
  type SensitiveProfileData
} from "./profile-sensitive.js";
import { emptyProfile } from "./profile-schema.js";
import { encryptMediaBytes } from "./media-encryption.js";
import {
  deleteEncryptedMediaObject,
  ENCRYPTED_PROFILE_PHOTO_MEDIA_PREFIX,
  writeEncryptedMediaObject
} from "./media-storage.js";

export const TEST_PROFILE_COUNT = 20;
const TEST_PROFILE_PASSWORD = "cruush-test-profile-password";
const DEVELOPMENT_CODE_OF_CONDUCT_VERSION = "2026-07-07";

type DevelopmentSeedContext = {
  config: AppConfig;
  db: DbClient;
};

export type DevelopmentTestProfile = {
  email: string;
  displayName: string;
  bio: string;
  signal: string;
  pronouns: string[];
  yearOfBirth: number;
  identities: string[];
  presentation: string[];
  sexuality: string[];
  lookingFor: string[];
  availability: string[];
  hostingTravel: string[];
  vibes: string[];
  scenes: string[];
  archetypes: string[];
  position: string[];
  role: string[];
  bodyType: string[];
  height: string;
  weight: string;
  hobbies: string[];
  photo: string;
  lat: number;
  lng: number;
  fuzzyLat: number;
  fuzzyLng: number;
  updatedAt: Date;
  sensitiveProfile: SensitiveProfileData;
};

type Crowd = SensitiveProfileData["crowds"][number];
type SeedProfileTemplate = readonly [
  name: string,
  pronouns: readonly string[],
  crowds: readonly Crowd[],
  position: readonly string[],
  lookingFor: readonly string[]
];

const seedProfileTemplates: readonly SeedProfileTemplate[] = [
  ["jay", ["he/him"], ["T4T", "Gay"], ["Top"], ["Tonight", "Dates"]],
  ["mari", ["she/her"], ["Dyke"], ["Bottom"], ["Coffee", "Cruising"]],
  ["atlas", ["they/them"], ["T4T", "Gay"], ["Versatile"], ["Friends", "Tonight"]],
  ["riley", ["she/they"], ["Dyke"], ["Switch"], ["Dates", "Dancing"]],
  ["kai", ["he/they"], ["T4T"], ["Top"], ["Cruising", "Chat"]],
  ["sage", ["they/them"], ["Gay"], ["Bottom"], ["Friends", "Tonight"]],
  ["river", ["they/she"], ["T4T"], ["Versatile"], ["Dates", "Coffee"]],
  ["cleo", ["she/her"], ["Dyke"], ["Top"], ["Dancing", "Chat"]],
  ["sasha", ["he/him"], ["Gay"], ["Versatile"], ["Tonight", "Cruising"]],
  ["indigo", ["they/them"], ["T4T", "Gay"], ["Switch"], ["Dates", "Friends"]],
  ["ari", ["she/they"], ["Dyke"], ["Bottom"], ["Coffee", "Tonight"]],
  ["fox", ["he/they"], ["T4T"], ["Top"], ["Cruising", "Friends"]],
  ["mars", ["they/them"], ["Gay"], ["Versatile"], ["Chat", "Dates"]],
  ["jo", ["she/her"], ["Dyke"], ["Switch"], ["Dancing", "Coffee"]],
  ["luna", ["they/she"], ["T4T", "Dyke"], ["Bottom"], ["Tonight", "Dates"]],
  ["noor", ["he/him"], ["Gay"], ["Top"], ["Friends", "Cruising"]],
  ["ember", ["she/they"], ["Dyke"], ["Versatile"], ["Chat", "Dancing"]],
  ["sol", ["they/them"], ["T4T"], ["Switch"], ["Coffee", "Friends"]],
  ["vale", ["he/they"], ["Gay"], ["Bottom"], ["Tonight", "Dates"]],
  ["ren", ["they/she"], ["T4T", "Dyke"], ["Versatile"], ["Cruising", "Chat"]]
] as const;

const seedCoordinateOffsets = [
  [-0.0087, -0.0112],
  [0.0026, -0.0108],
  [0.0205, 0.0028],
  [0.0112, 0.0052],
  [0.0038, 0.009],
  [0.0059, 0.0183],
  [-0.0068, 0.0028],
  [-0.0125, 0.0093],
  [-0.0095, 0.0175],
  [-0.0178, 0.0104],
  [-0.0248, 0.0102],
  [-0.0321, -0.0068],
  [-0.0233, -0.0109],
  [-0.0062, -0.033],
  [0.0085, -0.0328],
  [0.015, -0.0282],
  [0.026, -0.024],
  [0.0264, -0.0004],
  [0.0166, 0.016],
  [-0.0007, 0.0248]
] as const;

const nycCoordinates = seedCoordinateOffsets.map(([latOffset, lngOffset]) => [
  Number((DEVELOPMENT_ADMIN_LOCATION.lat + latOffset).toFixed(6)),
  Number((DEVELOPMENT_ADMIN_LOCATION.lng + lngOffset).toFixed(6))
] as const);

const seedSignals = [
  "Coffee and a walk after work",
  "Gallery hop, then dancing",
  "Looking for a chill rooftop hang",
  "Free for dinner tonight",
  "Park picnic if the weather holds",
  "Late-night noodles and a stroll",
  "Museum afternoon this weekend",
  "Dance floor energy tonight",
  "Gym session, then smoothies",
  "Board games and new friends",
  "Bookstore browse and coffee",
  "Cruising around the neighborhood",
  "Live music and good conversation",
  "Farmers market Saturday morning",
  "Open to spontaneous plans",
  "Bike ride before sunset",
  "Karaoke crew wanted",
  "Quiet tea and a long chat",
  "Movie night or a casual drink",
  "Exploring somewhere new today"
] as const;

const seedBodyTypes = ["athletic", "average", "bear", "curvy", "muscular", "otter", "petite", "slim", "stocky", "toned", "twink"] as const;
const seedHobbies = ["art", "camping", "cooking", "dancing", "fitness", "gaming", "music", "photography", "reading", "thrifting"] as const;
const seedHostingTravel = [
  ["can host", "can travel"],
  ["can travel", "hotel"],
  ["can't host", "can travel", "outdoors"],
  ["can host", "car"]
] as const;

function parseEnvFile(contents: string) {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function readEnvFile(url: URL) {
  if (!existsSync(url)) {
    return {};
  }

  return parseEnvFile(readFileSync(url, "utf8"));
}

export function loadSeedConfig() {
  const serverEnv = {
    ...process.env,
    ...readEnvFile(new URL("../.env.example", import.meta.url)),
    ...readEnvFile(new URL("../.env", import.meta.url)),
    ...readEnvFile(new URL("../.env.local", import.meta.url))
  };

  return loadConfig(serverEnv);
}

function createSeedPhoto(profileName: string, index: number) {
  const hue = (326 + index * 17) % 360;
  const initials = profileName.slice(0, 2).toUpperCase();
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
  <defs>
    <linearGradient id="backdrop" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 90%, 56%)"/>
      <stop offset="58%" stop-color="hsl(${(hue + 28) % 360}, 82%, 28%)"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
    <radialGradient id="face" cx="50%" cy="35%" r="62%">
      <stop offset="0%" stop-color="#ffe3ed"/>
      <stop offset="60%" stop-color="#bf5c75"/>
      <stop offset="100%" stop-color="#2a0d17"/>
    </radialGradient>
  </defs>
  <rect width="320" height="320" fill="url(#backdrop)"/>
  <circle cx="160" cy="126" r="70" fill="url(#face)"/>
  <path d="M58 320c10-82 66-126 142-126 58 0 100 44 112 126z" fill="#080808"/>
  <path d="M64 134c18-72 70-96 126-78 42 14 62 44 68 92-34-40-72-48-118-28-22 10-48 26-76 14z" fill="#050505"/>
  <circle cx="136" cy="138" r="8" fill="#12070c"/>
  <circle cx="192" cy="138" r="8" fill="#12070c"/>
  <path d="M136 176c18 13 40 13 58 0" fill="none" stroke="#fff4f8" stroke-width="8" stroke-linecap="round" opacity=".74"/>
  <text x="160" y="286" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#fff">${initials}</text>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function uuidFromSeed(seed: string) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}

function decodeSeedPhoto(photo: string) {
  const prefix = "data:image/svg+xml,";

  if (!photo.startsWith(prefix)) {
    throw new Error("Development profile photo must be an SVG data URL.");
  }

  return Buffer.from(decodeURIComponent(photo.slice(prefix.length)), "utf8");
}

const DEVELOPMENT_GALLERY_SIZE = 3;

async function upsertDevelopmentProfileGallery(
  context: DevelopmentSeedContext,
  userId: string,
  profile: Pick<DevelopmentTestProfile, "email" | "photo"> & { displayName: string }
) {
  const urls: string[] = [];

  for (let slot = 0; slot < DEVELOPMENT_GALLERY_SIZE; slot += 1) {
    urls.push(await upsertDevelopmentProfilePhoto(context, userId, {
      email: profile.email,
      photo: slot === 0 ? profile.photo : createSeedPhoto(profile.displayName, slot * 9),
      slot
    }));
  }

  return urls;
}

async function upsertDevelopmentProfilePhoto(
  context: DevelopmentSeedContext,
  userId: string,
  profile: Pick<DevelopmentTestProfile, "email" | "photo"> & { slot?: number }
) {
  const slotSuffix = profile.slot ? `:${profile.slot}` : "";
  const photoId = uuidFromSeed(`development-profile-photo:${profile.email}${slotSuffix}`);
  const filename = `${photoId}.png`;
  const publicUrl = `${ENCRYPTED_PROFILE_PHOTO_MEDIA_PREFIX}/${filename}`;
  const objectKey = `profile-photos/${filename}.enc`;
  const photoBytes = decodeSeedPhoto(profile.photo);
  const encryptedPhoto = encryptMediaBytes(context.config, photoBytes);

  // Development secrets can change between local sessions. Always replace the
  // object bytes so a deterministic media row never keeps obsolete ciphertext.
  await deleteEncryptedMediaObject(context.config, objectKey);
  await writeEncryptedMediaObject(context.config, objectKey, encryptedPhoto.ciphertext);

  await context.db.query(
    `insert into media_objects (
       id,
       owner_user_id,
       surface,
       object_key,
       public_url,
       media_type,
       mime_type,
       byte_size,
       width,
       height,
       encrypted_data_key,
       data_key_nonce,
       data_key_auth_tag,
       content_nonce,
       content_auth_tag,
       key_version,
       moderation_status,
       photodna_status,
       moderation_provider,
       moderation_provider_version,
       moderation_scores,
       moderation_decided_at,
       explicit_classification,
       legacy_asset,
       explicit_classification_source,
       explicit_classification_updated_at,
       explicit_classification_reason
     ) values (
       $1, $2, 'profile_photo', $3, $4, 'image', 'image/svg+xml', $5,
       320, 320, $6, $7, $8, $9, $10, $11, 'approved', 'not_configured',
       'development_seed', 'v1', '[]'::jsonb, now(), 'non_explicit', true,
       'provider', now(), 'Deterministic local development fixture.'
     )
     on conflict (id) do update
     set owner_user_id = excluded.owner_user_id,
         surface = excluded.surface,
         object_key = excluded.object_key,
         public_url = excluded.public_url,
         media_type = excluded.media_type,
         mime_type = excluded.mime_type,
         byte_size = excluded.byte_size,
         width = excluded.width,
         height = excluded.height,
         encrypted_data_key = excluded.encrypted_data_key,
         data_key_nonce = excluded.data_key_nonce,
         data_key_auth_tag = excluded.data_key_auth_tag,
         content_nonce = excluded.content_nonce,
         content_auth_tag = excluded.content_auth_tag,
         key_version = excluded.key_version,
         moderation_status = excluded.moderation_status,
         photodna_status = excluded.photodna_status,
         moderation_provider = excluded.moderation_provider,
         moderation_provider_version = excluded.moderation_provider_version,
         moderation_scores = excluded.moderation_scores,
         moderation_decided_at = excluded.moderation_decided_at,
         moderation_failure_reason = null,
         explicit_classification = excluded.explicit_classification,
         legacy_asset = excluded.legacy_asset,
         explicit_classification_source = excluded.explicit_classification_source,
         explicit_classification_updated_by = null,
         explicit_classification_updated_at = excluded.explicit_classification_updated_at,
         explicit_classification_reason = excluded.explicit_classification_reason,
         moderation_attempts = 0,
         moderation_next_retry_at = null,
         moderation_hold = null,
         deleted_at = null`,
    [
      photoId,
      userId,
      objectKey,
      publicUrl,
      photoBytes.length,
      encryptedPhoto.encryptedDataKey,
      encryptedPhoto.dataKeyNonce,
      encryptedPhoto.dataKeyAuthTag,
      encryptedPhoto.nonce,
      encryptedPhoto.authTag,
      encryptedPhoto.keyVersion
    ]
  );

  return publicUrl;
}

function offsetCoordinate(value: number, index: number, direction: 1 | -1) {
  const offset = (((index % 5) - 2) * 0.0012 + Math.floor(index / 5) * 0.0003) * direction;
  return Number((value + offset).toFixed(6));
}

export function buildDevelopmentTestProfiles(now = new Date()): DevelopmentTestProfile[] {
  return seedProfileTemplates.map(([name, pronouns, crowds, position, lookingFor], index) => {
    const [lat, lng] = nycCoordinates[index];
    const displayName = name;
    const sensitiveProfile: SensitiveProfileData = {
      is_trans: crowds.includes("T4T") ? true : false,
      crowds: [...crowds],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    };

    return {
      email: `test-cruush-${String(index + 1).padStart(2, "0")}@cruush.local`,
      displayName,
      bio: `${displayName} is a local development profile for checking discovery, profiles, messages, and Pings.`,
      signal: seedSignals[index],
      pronouns: [...pronouns],
      yearOfBirth: 1995 - (index % 8),
      identities: crowds.includes("T4T") ? ["Trans"] : ["Queer"],
      presentation: index % 2 === 0 ? ["Alt"] : ["Soft"],
      sexuality: crowds.includes("Dyke") ? ["Dyke"] : ["Queer"],
      lookingFor: [...lookingFor],
      availability: index % 3 === 0 ? ["Tonight"] : ["This week"],
      hostingTravel: [...seedHostingTravel[index % seedHostingTravel.length]],
      vibes: ["cruush test", "NYC beta", crowds[0]],
      scenes: index % 2 === 0 ? ["late night"] : ["day date"],
      archetypes: index % 2 === 0 ? ["soft goth"] : ["city flirt"],
      position: [...position],
      role: index % 2 === 0 ? ["Switch"] : [],
      bodyType: [seedBodyTypes[index % seedBodyTypes.length]],
      height: `${5 + (index % 2)}'${4 + (index % 8)}\"`,
      weight: `${135 + index * 5} lb`,
      hobbies: [seedHobbies[index % seedHobbies.length], seedHobbies[(index + 3) % seedHobbies.length]],
      photo: createSeedPhoto(displayName, index),
      lat,
      lng,
      fuzzyLat: offsetCoordinate(lat, index, 1),
      fuzzyLng: offsetCoordinate(lng, index, -1),
      updatedAt: new Date(now.getTime() - index * 11 * 60 * 1000),
      sensitiveProfile
    };
  });
}

/** Seeded visitors make Mile High Club visible on the local map and profiles. */
const DEVELOPMENT_TRAVEL_PROFILES = new Map<number, { lat: number; lng: number; label: string }>([
  [2, { lat: 40.733572, lng: -74.002742, label: "In from Chicago" }],
  [7, { lat: 40.718112, lng: -73.958647, label: "In from Los Angeles" }],
  [14, { lat: 40.81155, lng: -73.946477, label: "In from Atlanta" }]
] as const);

export function assertDevelopmentSeedConfig(config: Pick<AppConfig, "NODE_ENV" | "DEVELOPMENT_ADMIN_ENABLED" | "DEVELOPMENT_ADMIN_PASSWORD">) {
  if (config.NODE_ENV === "production") {
    throw new Error("Refusing to seed development profiles in production.");
  }

  if (!config.DEVELOPMENT_ADMIN_ENABLED || !config.DEVELOPMENT_ADMIN_PASSWORD) {
    throw new Error("Set DEVELOPMENT_ADMIN_ENABLED=true and DEVELOPMENT_ADMIN_PASSWORD before seeding dev profiles.");
  }
}

async function upsertSensitiveTokens(context: DevelopmentSeedContext, userId: string, sensitiveProfile: SensitiveProfileData) {
  const tokens = createSensitiveProfileTokens(context.config, sensitiveProfile);

  await context.db.query(
    "delete from profile_sensitive_tokens where user_id = $1",
    [userId]
  );

  if (tokens.length === 0) {
    return;
  }

  await context.db.query(
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
}

async function upsertDevelopmentProfile(context: DevelopmentSeedContext, profile: DevelopmentTestProfile) {
  const passwordHash = await hashPassword(TEST_PROFILE_PASSWORD);
  const userResult = await context.db.query<{ id: string }>(
    `insert into app_users (
       email,
       password_hash,
       display_name,
       email_verified_at,
       signup_birth_year,
       age_verified_at,
       code_of_conduct_accepted_version,
       code_of_conduct_accepted_at
     )
     values ($1, $2, $3, now(), $4, now(), $5, now())
     on conflict (email) do update
     set password_hash = excluded.password_hash,
         display_name = excluded.display_name,
         email_verified_at = coalesce(app_users.email_verified_at, now()),
         signup_birth_year = excluded.signup_birth_year,
         age_verified_at = coalesce(app_users.age_verified_at, now()),
         code_of_conduct_accepted_version = excluded.code_of_conduct_accepted_version,
         code_of_conduct_accepted_at = coalesce(app_users.code_of_conduct_accepted_at, now())
     returning id::text as id`,
    [profile.email, passwordHash, profile.displayName, profile.yearOfBirth, DEVELOPMENT_CODE_OF_CONDUCT_VERSION]
  );
  const userId = userResult.rows[0]?.id;

  if (!userId) {
    throw new Error(`Unable to create ${profile.email}.`);
  }

  const profilePhotoUrls = await upsertDevelopmentProfileGallery(context, userId, {
    email: profile.email,
    photo: profile.photo,
    displayName: profile.displayName
  });
  const encryptedSensitiveProfile = encryptSensitiveProfile(context.config, profile.sensitiveProfile);
  const encryptedProfileVisibility = encryptProfileVisibility(context.config, emptyProfile.visibility_rules);

  await context.db.query(
    `insert into profiles (
       id,
       display_name,
       photos,
       pronouns,
       year_of_birth,
       identities,
       presentation,
       sexuality,
       looking_for,
       availability,
       hosting_travel,
       vibes,
       scenes,
       archetypes,
       position,
       role,
       bio,
       signal,
       body_type,
       height,
       weight,
       hobbies,
       lat,
       lng,
       fuzzy_lat,
       fuzzy_lng,
       location_fuzz_radius_meters,
       location_updated_at,
       profile_sensitive_ciphertext,
       profile_sensitive_nonce,
       profile_sensitive_auth_tag,
       profile_sensitive_key_version,
       profile_sensitive_token_key_version,
       updated_at
     )
     values (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14, $15, $16,
       $17, $18, $19, $20, $21, $22,
       $23, $24, $25, $26, $27, $28,
       $29, $30, $31, $32, $33, $34
     )
     on conflict (id) do update
     set display_name = excluded.display_name,
         photos = excluded.photos,
         pronouns = excluded.pronouns,
         year_of_birth = excluded.year_of_birth,
         identities = excluded.identities,
         presentation = excluded.presentation,
         sexuality = excluded.sexuality,
         looking_for = excluded.looking_for,
         availability = excluded.availability,
         hosting_travel = excluded.hosting_travel,
         vibes = excluded.vibes,
         scenes = excluded.scenes,
         archetypes = excluded.archetypes,
         position = excluded.position,
         role = excluded.role,
         bio = excluded.bio,
         signal = excluded.signal,
         body_type = excluded.body_type,
         height = excluded.height,
         weight = excluded.weight,
         hobbies = excluded.hobbies,
         lat = excluded.lat,
         lng = excluded.lng,
         fuzzy_lat = excluded.fuzzy_lat,
         fuzzy_lng = excluded.fuzzy_lng,
         location_fuzz_radius_meters = excluded.location_fuzz_radius_meters,
         location_updated_at = excluded.location_updated_at,
         profile_sensitive_ciphertext = excluded.profile_sensitive_ciphertext,
         profile_sensitive_nonce = excluded.profile_sensitive_nonce,
         profile_sensitive_auth_tag = excluded.profile_sensitive_auth_tag,
         profile_sensitive_key_version = excluded.profile_sensitive_key_version,
         profile_sensitive_token_key_version = excluded.profile_sensitive_token_key_version,
         updated_at = excluded.updated_at`,
    [
      userId,
      profile.displayName,
      profilePhotoUrls,
      profile.pronouns,
      profile.yearOfBirth,
      profile.identities,
      profile.presentation,
      profile.sexuality,
      profile.lookingFor,
      profile.availability,
      profile.hostingTravel,
      profile.vibes,
      profile.scenes,
      profile.archetypes,
      profile.position,
      profile.role,
      profile.bio,
      profile.signal,
      profile.bodyType,
      profile.height,
      profile.weight,
      profile.hobbies,
      profile.lat,
      profile.lng,
      profile.fuzzyLat,
      profile.fuzzyLng,
      250,
      profile.updatedAt,
      encryptedSensitiveProfile.profile_sensitive_ciphertext,
      encryptedSensitiveProfile.profile_sensitive_nonce,
      encryptedSensitiveProfile.profile_sensitive_auth_tag,
      encryptedSensitiveProfile.profile_sensitive_key_version,
      encryptedSensitiveProfile.profile_sensitive_token_key_version,
      profile.updatedAt
    ]
  );

  await context.db.query(
    `update profiles
     set profile_visibility_ciphertext = $2,
         profile_visibility_nonce = $3,
         profile_visibility_auth_tag = $4,
         profile_visibility_key_version = $5,
         profile_visibility_token_key_version = $6
     where id = $1`,
    [
      userId,
      encryptedProfileVisibility.profile_visibility_ciphertext,
      encryptedProfileVisibility.profile_visibility_nonce,
      encryptedProfileVisibility.profile_visibility_auth_tag,
      encryptedProfileVisibility.profile_visibility_key_version,
      encryptedProfileVisibility.profile_visibility_token_key_version
    ]
  );

  await upsertSensitiveTokens(context, userId, profile.sensitiveProfile);
  await syncDevelopmentLocationPrivacy(context, {
    userId,
    lat: profile.lat,
    lng: profile.lng,
    accuracyM: 250,
    deviceReportedAtMs: profile.updatedAt.getTime()
  });
  await context.db.query(
    `insert into user_privacy_settings (user_id, ghost_mode_enabled, precise_location_visibility)
     values ($1, false, 'none')
     on conflict (user_id) do update
     set ghost_mode_enabled = false,
         precise_location_visibility = 'none',
         updated_at = now()`,
    [userId]
  );

  return userId;
}

export async function seedDevelopmentProfilesWithDb(context: DevelopmentSeedContext) {
  assertDevelopmentSeedConfig(context.config);
  const profiles = buildDevelopmentTestProfiles();

  await context.db.query("begin");

  try {
    const adminUserId = await ensureDevelopmentAdminUser(context);
    const adminPhotoUrls = await upsertDevelopmentProfileGallery(context, adminUserId, {
      displayName: DEVELOPMENT_ADMIN_DISPLAY_NAME,
      email: DEVELOPMENT_ADMIN_EMAIL,
      photo: createSeedPhoto(DEVELOPMENT_ADMIN_DISPLAY_NAME, TEST_PROFILE_COUNT)
    });
    const adminSensitiveProfile: SensitiveProfileData = {
      is_trans: null,
      crowds: [],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    };
    const encryptedAdminSensitiveProfile = encryptSensitiveProfile(context.config, adminSensitiveProfile);
    const encryptedAdminProfileVisibility = encryptProfileVisibility(context.config, emptyProfile.visibility_rules);

    await context.db.query(
      `update profiles
       set photos = $2,
           profile_sensitive_ciphertext = $3,
           profile_sensitive_nonce = $4,
           profile_sensitive_auth_tag = $5,
           profile_sensitive_key_version = $6,
           profile_sensitive_token_key_version = $7,
           profile_visibility_ciphertext = $8,
           profile_visibility_nonce = $9,
           profile_visibility_auth_tag = $10,
           profile_visibility_key_version = $11,
           profile_visibility_token_key_version = $12,
           updated_at = now()
       where id = $1`,
      [
        adminUserId,
        adminPhotoUrls,
        encryptedAdminSensitiveProfile.profile_sensitive_ciphertext,
        encryptedAdminSensitiveProfile.profile_sensitive_nonce,
        encryptedAdminSensitiveProfile.profile_sensitive_auth_tag,
        encryptedAdminSensitiveProfile.profile_sensitive_key_version,
        encryptedAdminSensitiveProfile.profile_sensitive_token_key_version,
        encryptedAdminProfileVisibility.profile_visibility_ciphertext,
        encryptedAdminProfileVisibility.profile_visibility_nonce,
        encryptedAdminProfileVisibility.profile_visibility_auth_tag,
        encryptedAdminProfileVisibility.profile_visibility_key_version,
        encryptedAdminProfileVisibility.profile_visibility_token_key_version
      ]
    );
    await upsertSensitiveTokens(context, adminUserId, adminSensitiveProfile);

    for (const [profileIndex, profile] of profiles.entries()) {
      const profileUserId = await upsertDevelopmentProfile(context, profile);

      // Visiting members show Mile High Club on the map and profiles without
      // turning it on for the signed-in development account.
      const travelPin = DEVELOPMENT_TRAVEL_PROFILES.get(profileIndex);
      if (travelPin) {
        await context.db.query(
          `insert into user_travel_pins (user_id, latitude, longitude, label, set_at, updated_at)
           values ($1, $2, $3, $4, now(), now())
           on conflict (user_id) do update
             set latitude = excluded.latitude,
                 longitude = excluded.longitude,
                 label = excluded.label,
                 updated_at = now()`,
          [profileUserId, travelPin.lat, travelPin.lng, travelPin.label]
        );
      } else {
        await context.db.query(`delete from user_travel_pins where user_id = $1`, [profileUserId]);
      }

      await upsertEncryptedRelationshipRecord(context, buildEncryptedRelationshipPayload({
        type: "cruush",
        actorUserId: profileUserId,
        targetUserId: adminUserId,
        createdAt: profile.updatedAt,
        targetSnapshot: {
          name: DEVELOPMENT_ADMIN_DISPLAY_NAME,
          pronouns: "",
          photo: null
        },
        metadata: {
          source: "development-seed"
        }
      }));
    }

    await context.db.query("commit");

    return {
      adminEmail: DEVELOPMENT_ADMIN_EMAIL,
      adminUserId,
      profileCount: profiles.length
    };
  } catch (error) {
    await context.db.query("rollback");
    throw error;
  }
}

export async function seedDevelopmentProfiles() {
  const config = loadSeedConfig();
  const db = createPool(config);

  try {
    return await seedDevelopmentProfilesWithDb({ config, db });
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await seedDevelopmentProfiles();
    console.log(`Seeded ${result.profileCount} test profiles that cruushed ${result.adminEmail}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
