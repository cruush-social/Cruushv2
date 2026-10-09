import { hashPassword } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { ApiError } from "./errors.js";
import {
  DEFAULT_GHOST_RADIUS_METERS,
  saveVisibilityPolicy,
  storeLocationEnvelope
} from "./location-privacy.js";

export const DEVELOPMENT_ADMIN_EMAIL = "admin@cruush.local";
export const DEVELOPMENT_ADMIN_DISPLAY_NAME = "Admin";
export const DEVELOPMENT_ADMIN_YEAR_OF_BIRTH = 1990;
export const DEVELOPMENT_ADMIN_LOCATION = {
  lat: 40.7128,
  lng: -74.006,
  fuzzyLat: 40.7128,
  fuzzyLng: -74.006,
  fuzzRadiusMeters: 250
} as const;

type DevelopmentAdminContext = {
  config: AppConfig;
  db: DbClient;
};

type CreatedDevelopmentAdminRow = {
  id: string;
  email: string;
  display_name: string | null;
  email_verified_at: string | Date | null;
  created_at: string | Date;
};

export function isDevelopmentAdminLogin(
  context: {
    config: Pick<AppConfig, "NODE_ENV" | "DEVELOPMENT_ADMIN_ENABLED" | "DEVELOPMENT_ADMIN_PASSWORD">;
  },
  email: string,
  password: string
) {
  return (
    context.config.NODE_ENV !== "production" &&
    context.config.DEVELOPMENT_ADMIN_PASSWORD.length > 0 &&
    email === DEVELOPMENT_ADMIN_EMAIL &&
    password === context.config.DEVELOPMENT_ADMIN_PASSWORD
  );
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

async function hasEncryptedVisibilityPolicy(context: DevelopmentAdminContext, userId: string) {
  const result = await context.db.query<{ exists: boolean }>(
    `select true as exists
     from encrypted_visibility_tokens
     where subject_user_id = $1
     limit 1`,
    [userId]
  );

  return result.rows.length > 0;
}

export async function syncDevelopmentLocationPrivacy(context: DevelopmentAdminContext, input: {
  userId: string;
  lat: number;
  lng: number;
  accuracyM?: number;
  deviceReportedAtMs?: number;
}) {
  try {
    await storeLocationEnvelope(context, {
      subjectUserId: input.userId,
      lat: input.lat,
      lng: input.lng,
      accuracyM: input.accuracyM ?? 0,
      source: "SYSTEM",
      deviceReportedAtMs: input.deviceReportedAtMs
    });

    if (!(await hasEncryptedVisibilityPolicy(context, input.userId))) {
      await saveVisibilityPolicy(context, input.userId, {
        baseMode: "PUBLIC_PRECISE",
        ghostModeEnabled: false,
        ghostRadiusMeters: DEFAULT_GHOST_RADIUS_METERS,
        preciseToMutualCruushes: false,
        preciseLocationVisibility: "none"
      });
    }
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return;
    }

    throw error;
  }
}

export async function ensureDevelopmentAdminUser(context: DevelopmentAdminContext) {
  if (context.config.NODE_ENV === "production") {
    throw new ApiError(403, "FORBIDDEN", "Development admin cannot be created in production.");
  }

  if (!context.config.DEVELOPMENT_ADMIN_PASSWORD) {
    throw new ApiError(500, "INTERNAL_ERROR", "DEVELOPMENT_ADMIN_PASSWORD is required.");
  }

  const passwordHash = await hashPassword(context.config.DEVELOPMENT_ADMIN_PASSWORD);
  const userResult = await context.db.query<CreatedDevelopmentAdminRow>(
    `insert into app_users (email, password_hash, display_name, email_verified_at)
     values ($1, $2, $3, now())
     on conflict (email) do update
     set password_hash = excluded.password_hash,
         display_name = excluded.display_name,
         email_verified_at = coalesce(app_users.email_verified_at, now())
     returning id, email, display_name, email_verified_at, created_at`,
    [DEVELOPMENT_ADMIN_EMAIL, passwordHash, DEVELOPMENT_ADMIN_DISPLAY_NAME]
  );
  const user = userResult.rows[0];

  if (!user) {
    throw new ApiError(500, "INTERNAL_ERROR", "Unable to create development admin.");
  }

  await context.db.query(
    `insert into profiles (
       id,
       display_name,
       year_of_birth,
       lat,
       lng,
       fuzzy_lat,
       fuzzy_lng,
       location_fuzz_radius_meters,
       location_updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (id) do update
     set display_name = excluded.display_name,
         year_of_birth = coalesce(profiles.year_of_birth, excluded.year_of_birth),
         lat = excluded.lat,
         lng = excluded.lng,
         fuzzy_lat = excluded.fuzzy_lat,
         fuzzy_lng = excluded.fuzzy_lng,
         location_fuzz_radius_meters = excluded.location_fuzz_radius_meters,
         location_updated_at = excluded.location_updated_at,
         updated_at = now()`,
    [
      user.id,
      DEVELOPMENT_ADMIN_DISPLAY_NAME,
      DEVELOPMENT_ADMIN_YEAR_OF_BIRTH,
      DEVELOPMENT_ADMIN_LOCATION.lat,
      DEVELOPMENT_ADMIN_LOCATION.lng,
      DEVELOPMENT_ADMIN_LOCATION.fuzzyLat,
      DEVELOPMENT_ADMIN_LOCATION.fuzzyLng,
      DEVELOPMENT_ADMIN_LOCATION.fuzzRadiusMeters
    ]
  );
  await syncDevelopmentLocationPrivacy(context, {
    userId: user.id,
    lat: DEVELOPMENT_ADMIN_LOCATION.lat,
    lng: DEVELOPMENT_ADMIN_LOCATION.lng,
    accuracyM: DEVELOPMENT_ADMIN_LOCATION.fuzzRadiusMeters
  });

  return user.id;
}
