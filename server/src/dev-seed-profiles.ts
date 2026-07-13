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
  encryptSensitiveProfile,
  type SensitiveProfileData
} from "./profile-sensitive.js";

export const TEST_PROFILE_COUNT = 20;
const TEST_PROFILE_PASSWORD = "cruush-test-profile-password";

type DevelopmentSeedContext = {
  config: AppConfig;
  db: DbClient;
};

export type DevelopmentTestProfile = {
  email: string;
  displayName: string;
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
      pronouns: [...pronouns],
      yearOfBirth: 1995 - (index % 8),
      identities: crowds.includes("T4T") ? ["Trans"] : ["Queer"],
      presentation: index % 2 === 0 ? ["Alt"] : ["Soft"],
      sexuality: crowds.includes("Dyke") ? ["Dyke"] : ["Queer"],
      lookingFor: [...lookingFor],
      availability: index % 3 === 0 ? ["Tonight"] : ["This week"],
      hostingTravel: index % 4 === 0 ? ["Can Host"] : ["Can Travel"],
      vibes: ["cruush test", "NYC beta", crowds[0]],
      scenes: index % 2 === 0 ? ["late night"] : ["day date"],
      archetypes: index % 2 === 0 ? ["soft goth"] : ["city flirt"],
      position: [...position],
      role: index % 2 === 0 ? ["Switch"] : [],
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
    `insert into app_users (email, password_hash, display_name, email_verified_at)
     values ($1, $2, $3, now())
     on conflict (email) do update
     set password_hash = excluded.password_hash,
         display_name = excluded.display_name,
         email_verified_at = coalesce(app_users.email_verified_at, now())
     returning id::text as id`,
    [profile.email, passwordHash, profile.displayName]
  );
  const userId = userResult.rows[0]?.id;

  if (!userId) {
    throw new Error(`Unable to create ${profile.email}.`);
  }

  const encryptedSensitiveProfile = encryptSensitiveProfile(context.config, profile.sensitiveProfile);

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
       $23, $24, $25, $26, $27, $28
     )
     on conflict (id) do update
     set display_name = excluded.display_name,
         photos = profiles.photos,
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
      [],
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

    for (const profile of profiles) {
      const profileUserId = await upsertDevelopmentProfile(context, profile);

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
