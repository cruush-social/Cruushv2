import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(currentDir, "..");

describe("migration runner", () => {
  it("lists every numbered SQL migration in order", async () => {
    const sqlFiles = (await readdir(path.join(serverRoot, "sql")))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const listedFiles = Array.from(migrateSource.matchAll(/"(\d+_[^"]+\.sql)"/g), (match) => match[1]);

    expect(listedFiles).toEqual(sqlFiles);
  });

  it("keeps cruush+ billing ownership on app users before profile onboarding", async () => {
    const billingSql = await readFile(path.join(serverRoot, "sql", "027_cruush_plus_billing.sql"), "utf8");
    const rewardsSql = await readFile(path.join(serverRoot, "sql", "042_rewards_and_two_factor.sql"), "utf8");

    expect(billingSql).not.toContain("references profiles(id)");
    expect(billingSql).toContain("user_entitlements_user_id_fkey");
    expect(rewardsSql).toContain("daily_activity_credits_one_per_day");
    expect(rewardsSql).toContain("referrals_one_referrer_per_account");
    expect(rewardsSql).toContain("referrals_no_self_check");
    expect(rewardsSql).toContain("reward_grants_referral_uidx");
    expect(rewardsSql).toContain("reward_grants_milestone_uidx");
    expect(rewardsSql).toContain("idempotency_key text not null unique");
    expect(rewardsSql).toContain("reward grant ledger is append-only");
    expect(rewardsSql).toContain("referral association is immutable");
    expect(rewardsSql).toContain("user_two_factor_recovery_codes");
    expect(billingSql).toContain("foreign key (user_id) references app_users(id) on delete cascade");
  });

  it("adds the launch party and crowd feed schema after rewards and 2FA", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const launchSql = await readFile(path.join(serverRoot, "sql", "043_launch_party_crowd_feed.sql"), "utf8");
    const matchSettingsSql = await readFile(path.join(serverRoot, "sql", "044_cruush_match_settings.sql"), "utf8");

    expect(migrateSource).toMatch(/"042_rewards_and_two_factor\.sql",\s*"043_launch_party_crowd_feed\.sql",\s*"044_cruush_match_settings\.sql",\s*"045_message_favorite_images\.sql",\s*"046_referral_signup_privacy\.sql",\s*"047_beta_city_requests\.sql",\s*"048_cruush_plus_promo_codes\.sql"/);
    expect(launchSql).toContain("create table if not exists launch_events");
    expect(launchSql).toContain("create table if not exists event_memberships");
    expect(launchSql).toContain("create table if not exists event_staff");
    expect(launchSql).toContain("create table if not exists event_pass_icons");
    expect(launchSql).toContain("create table if not exists event_chats");
    expect(launchSql).toContain("create table if not exists feed_post_crowd_targets");
    expect(launchSql).toContain("idx_feed_post_crowd_targets_crowd");
    expect(launchSql).toContain("the-chocolate-factory-launch");
    expect(matchSettingsSql).toContain("create table if not exists user_cruush_match_settings");
    expect(matchSettingsSql).toContain("nsfw_message_visibility");
    expect(matchSettingsSql).toContain("mutual_crowds");
  });

  it("adds message favorite images after match settings", async () => {
    const favoriteImagesSql = await readFile(path.join(serverRoot, "sql", "045_message_favorite_images.sql"), "utf8");

    expect(favoriteImagesSql).toContain("create table if not exists message_favorite_images");
    expect(favoriteImagesSql).toContain("references media_objects(id) on delete cascade");
    expect(favoriteImagesSql).toContain("message_favorite_images_unique_media");
    expect(favoriteImagesSql).toContain("message_favorite_images_user_created_idx");
  });

  it("encrypts referral signup privacy and outside-radius beta city requests", async () => {
    const referralPrivacySql = await readFile(path.join(serverRoot, "sql", "046_referral_signup_privacy.sql"), "utf8");
    const betaCityRequestsSql = await readFile(path.join(serverRoot, "sql", "047_beta_city_requests.sql"), "utf8");

    expect(referralPrivacySql).toContain("signup_privacy_ciphertext");
    expect(referralPrivacySql).toContain("referrals_signup_privacy_encrypted_check");
    expect(betaCityRequestsSql).toContain("create table if not exists beta_city_requests");
    expect(betaCityRequestsSql).toContain("email_ciphertext");
    expect(betaCityRequestsSql).toContain("requested_city_ciphertext");
    expect(betaCityRequestsSql).toContain("beta_city_requests_unique_email_city");
  });
});
