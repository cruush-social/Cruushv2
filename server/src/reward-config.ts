import { z } from "zod";
import type { DbClient } from "./db.js";

const activityTypeSchema = z.enum(["cruush", "message", "post", "profile_update", "social"]);
const profileFieldSchema = z.enum([
  "display_name",
  "year_of_birth",
  "bio",
  "pronouns",
  "identities",
  "looking_for",
  "vibes",
  "photos"
]);

const rewardConfigSchema = z.object({
  recurringStreakDays: z.number().int().min(1).max(365),
  recurringStreakRewardDays: z.number().int().min(1).max(90),
  longStreakDays: z.number().int().min(1).max(3650),
  longStreakBonusDays: z.number().int().min(1).max(365),
  activityRewardCapDays: z.number().int().min(0).max(365),
  activityRewardCapPeriodDays: z.number().int().min(1).max(365),
  referralMinAccountAgeDays: z.number().int().min(0).max(365),
  referralRewardDays: z.number().int().min(1).max(365),
  maxBankedPromotionalDays: z.number().int().min(0).max(3650),
  referralRewardCapDays: z.number().int().min(0).max(36500).nullable(),
  twoFactorTrustPoints: z.number().int().min(0).max(100),
  referralTrustPoints: z.number().int().min(0).max(100),
  maxReferralTrustPoints: z.number().int().min(0).max(100),
  eligibleActivityTypes: z.array(activityTypeSchema).min(1),
  profileCompletionFields: z.array(profileFieldSchema).min(1)
});

export type RewardConfig = z.infer<typeof rewardConfigSchema>;
export type RewardActivityType = z.infer<typeof activityTypeSchema>;

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  recurringStreakDays: 7,
  recurringStreakRewardDays: 1,
  longStreakDays: 30,
  longStreakBonusDays: 3,
  activityRewardCapDays: 7,
  activityRewardCapPeriodDays: 30,
  referralMinAccountAgeDays: 7,
  referralRewardDays: 7,
  maxBankedPromotionalDays: 90,
  referralRewardCapDays: null,
  twoFactorTrustPoints: 10,
  referralTrustPoints: 1,
  maxReferralTrustPoints: 20,
  eligibleActivityTypes: ["cruush", "message", "post"],
  profileCompletionFields: [
    "display_name",
    "year_of_birth",
    "bio",
    "pronouns",
    "identities",
    "looking_for",
    "vibes"
  ]
};

const settingMap = {
  recurring_streak_days: "recurringStreakDays",
  recurring_streak_reward_days: "recurringStreakRewardDays",
  long_streak_days: "longStreakDays",
  long_streak_bonus_days: "longStreakBonusDays",
  activity_reward_cap_days: "activityRewardCapDays",
  activity_reward_cap_period_days: "activityRewardCapPeriodDays",
  referral_min_account_age_days: "referralMinAccountAgeDays",
  referral_reward_days: "referralRewardDays",
  max_banked_promotional_days: "maxBankedPromotionalDays",
  referral_reward_cap_days: "referralRewardCapDays",
  two_factor_trust_points: "twoFactorTrustPoints",
  referral_trust_points: "referralTrustPoints",
  max_referral_trust_points: "maxReferralTrustPoints",
  eligible_activity_types: "eligibleActivityTypes",
  profile_completion_fields: "profileCompletionFields"
} as const;

type SettingRow = {
  key: keyof typeof settingMap;
  value: unknown;
};

const configCache = new WeakMap<DbClient, { expiresAt: number; value: RewardConfig }>();
const CACHE_TTL_MS = 60_000;

function isMissingSettingsTable(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: string }).code) === "42P01";
}

export async function loadRewardConfig(db: DbClient, options: { bypassCache?: boolean } = {}) {
  const cached = configCache.get(db);

  if (!options.bypassCache && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const candidate: Record<string, unknown> = { ...DEFAULT_REWARD_CONFIG };

  try {
    const result = await db.query<SettingRow>(
      `select key, value
       from reward_settings
       where key = any($1::text[])`,
      [Object.keys(settingMap)]
    );

    for (const row of result.rows) {
      const configKey = settingMap[row.key];

      if (configKey) {
        candidate[configKey] = row.value;
      }
    }
  } catch (error) {
    if (!isMissingSettingsTable(error)) {
      throw error;
    }
  }

  const parsed = rewardConfigSchema.safeParse(candidate);
  const value = parsed.success ? parsed.data : DEFAULT_REWARD_CONFIG;
  configCache.set(db, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value
  });
  return value;
}

export function clearRewardConfigCache(db?: DbClient) {
  if (db) {
    configCache.delete(db);
  }
}
