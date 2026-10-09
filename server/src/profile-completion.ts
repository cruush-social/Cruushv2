import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import type { RewardConfig } from "./reward-config.js";

type CompletionRow = {
  display_name: string | null;
  year_of_birth: number | null;
  bio: string | null;
  pronouns: string[] | null;
  identities: string[] | null;
  looking_for: string[] | null;
  vibes: string[] | null;
  photos: string[] | null;
};

export type ProfileCompletionResult = {
  complete: boolean;
  missingFields: string[];
};

function populated(value: unknown) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return Array.isArray(value) && value.length > 0;
}

export async function checkProfileCompletion(
  db: DbClient,
  userId: string,
  config: Pick<RewardConfig, "profileCompletionFields">,
  _appConfig?: AppConfig
): Promise<ProfileCompletionResult> {
  const result = await db.query<CompletionRow>(
    `select
       display_name,
       year_of_birth,
       bio,
       pronouns,
       identities,
       looking_for,
       vibes,
       photos
     from profiles
     where id = $1
     limit 1`,
    [userId]
  );
  const row = result.rows[0];
  const missingFields = config.profileCompletionFields.filter((field) => !row || !populated(row[field]));

  return {
    complete: missingFields.length === 0,
    missingFields
  };
}
