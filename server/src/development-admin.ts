import { hashPassword } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { ApiError } from "./errors.js";

export const DEVELOPMENT_ADMIN_EMAIL = "admin@cruush.local";
export const DEVELOPMENT_ADMIN_DISPLAY_NAME = "Admin";
export const DEVELOPMENT_ADMIN_YEAR_OF_BIRTH = 1990;

type DevelopmentAdminContext = {
  config: Pick<AppConfig, "NODE_ENV" | "DEVELOPMENT_ADMIN_ENABLED" | "DEVELOPMENT_ADMIN_PASSWORD">;
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
  context: DevelopmentAdminContext,
  email: string,
  password: string
) {
  return (
    context.config.DEVELOPMENT_ADMIN_ENABLED &&
    context.config.NODE_ENV !== "production" &&
    context.config.DEVELOPMENT_ADMIN_PASSWORD.length > 0 &&
    email === DEVELOPMENT_ADMIN_EMAIL &&
    password === context.config.DEVELOPMENT_ADMIN_PASSWORD
  );
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
    `insert into profiles (id, display_name, year_of_birth)
     values ($1, $2, $3)
     on conflict (id) do update
     set display_name = excluded.display_name,
         year_of_birth = coalesce(profiles.year_of_birth, excluded.year_of_birth),
         updated_at = now()`,
    [user.id, DEVELOPMENT_ADMIN_DISPLAY_NAME, DEVELOPMENT_ADMIN_YEAR_OF_BIRTH]
  );

  return user.id;
}
