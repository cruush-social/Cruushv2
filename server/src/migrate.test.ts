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

  it("seeds existing account notice dismissals for one-time launch popups", async () => {
    const noticeSql = await readFile(path.join(serverRoot, "sql", "055_user_notice_dismissals.sql"), "utf8");
    const affiliateNoticeSql = await readFile(path.join(serverRoot, "sql", "057_post_onboarding_affiliate_share_notice.sql"), "utf8");

    expect(noticeSql).toContain("create table if not exists user_notice_dismissals");
    expect(noticeSql).toContain("cruush:map-controls-intro-seen");
    expect(noticeSql).toContain("cruush:alpha-bug-tip-seen");
    expect(noticeSql).toContain("cruush:dl-mode-default-notice-seen");
    expect(noticeSql).toContain("cruush:beta-launch-plus-offer-seen:");
    expect(affiliateNoticeSql).toContain("cruush:post-onboarding-affiliate-share-seen:");
    expect(affiliateNoticeSql).toContain("join profiles");
    expect(affiliateNoticeSql).toContain("nullif(btrim(profiles.display_name), '') is not null");
    expect(affiliateNoticeSql).toContain("profiles.year_of_birth is not null");
  });

  it("keeps recurring and referral promotions active at seven days per grant", async () => {
    const rewardsSql = await readFile(path.join(serverRoot, "sql", "066_recurring_weekly_promotions.sql"), "utf8");

    expect(rewardsSql).toContain("('recurring_streak_reward_days', '7'::jsonb)");
    expect(rewardsSql).toContain("('activity_reward_cap_days', 'null'::jsonb)");
    expect(rewardsSql).toContain("'[\"cruush\",\"message\",\"post\"]'::jsonb");
    expect(rewardsSql).toContain("('referral_reward_days', '7'::jsonb)");
    expect(rewardsSql).toContain("('referral_reward_cap_days', 'null'::jsonb)");
  });

  it("revokes only post-August-7 automatic first-login trials while preserving earned rewards", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const revocationSql = await readFile(path.join(serverRoot, "sql", "073_revoke_post_aug7_automatic_cruush_plus_trials.sql"), "utf8");

    expect(migrateSource).toContain('"073_revoke_post_aug7_automatic_cruush_plus_trials.sql"');
    expect(revocationSql).toContain("first-login-cruush-plus-7d:%");
    expect(revocationSql).toContain("app_user.created_at >= timestamptz '2026-08-07 00:00:00-04'");
    expect(revocationSql).toContain("Automatic first-login cruush+ trial discontinued");
    expect(revocationSql).not.toContain("reward.source = 'activity_recurring'");
    expect(revocationSql).not.toContain("reward.source = 'referral'");
  });

  it("adds privacy-safe map Pings after the automatic-trial revocation", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const mapPingsSql = await readFile(path.join(serverRoot, "sql", "074_map_pings.sql"), "utf8");

    expect(migrateSource).toMatch(/"073_revoke_post_aug7_automatic_cruush_plus_trials\.sql",\s*"074_map_pings\.sql"/);
    expect(mapPingsSql).toContain("create table if not exists map_pings");
    expect(mapPingsSql).not.toContain("posts_expires_in_check");
    expect(mapPingsSql).toContain("radius_miles in (1, 3, 5, 10, 15)");
    expect(mapPingsSql).toContain("map_pings_user_idempotency_unique");
    expect(mapPingsSql).toContain("map_ping_id uuid references map_pings(id) on delete set null");
    expect(mapPingsSql).toContain("posts_map_ping_id_uidx");
    expect(mapPingsSql).not.toContain("app_notifications_map_ping_id_idx");
    expect(mapPingsSql).toContain("feed_post_expiry_default text not null default 'never'");
    expect(mapPingsSql).toContain("user_privacy_settings_feed_post_expiry_default_check");
    expect(mapPingsSql).not.toContain("map_pings_enabled");
    expect(mapPingsSql).not.toContain("app_notifications");
    expect(mapPingsSql).not.toMatch(/\b(lat|lng|longitude|latitude|distance_miles|recipient_count|recipient_id)\b/);
  });

  it("adds per-user Ghost Mode rotation and the heartbeat preference after map Pings", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const ghostPulseSql = await readFile(path.join(serverRoot, "sql", "075_ghost_mode_pulse.sql"), "utf8");

    expect(migrateSource).toMatch(/"074_map_pings\.sql",\s*"075_ghost_mode_pulse\.sql"/);
    expect(ghostPulseSql).toContain("ghost_mode_anchor_ms bigint");
    expect(ghostPulseSql).toContain("ghost_pulse_enabled boolean not null default true");
    expect(ghostPulseSql).toContain("where ghost_mode_enabled = true");
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
