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
    const listStart = migrateSource.indexOf("const migrationFiles = [");
    const listEnd = migrateSource.indexOf("];", listStart);
    const migrationListSource = migrateSource.slice(listStart, listEnd + 2);
    const listedFiles = Array.from(
      migrationListSource.matchAll(/"(\d+_[^"]+\.sql)"/g),
      (match) => match[1]
    );

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
    expect(rewardsSql).toContain("'nearby_activity'");
    expect(billingSql).toContain("foreign key (user_id) references app_users(id) on delete cascade");
  });

  it("seeds the original reward schema with only the final check-in rule", async () => {
    const rewardsSql = await readFile(path.join(serverRoot, "sql", "042_rewards_and_two_factor.sql"), "utf8");

    expect(rewardsSql).toContain("('recurring_streak_reward_days', '1'::jsonb)");
    expect(rewardsSql).toContain("('activity_reward_cap_days', '5'::jsonb)");
    expect(rewardsSql).toContain("('activity_reward_cap_period_days', '30'::jsonb)");
    expect(rewardsSql).toContain("'[\"check_in\"]'::jsonb");
    expect(rewardsSql).not.toContain("'[\"cruush\",\"message\",\"post\"]'::jsonb");
  });

  it("keeps the one-day 2FA promotion cutover replay-safe", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const promoSql = await readFile(path.join(serverRoot, "sql", "082_two_factor_cruush_plus_reward.sql"), "utf8");

    expect(migrateSource).toMatch(/"081_signup_age_verification\.sql",\s*"082_two_factor_cruush_plus_reward\.sql"/);
    expect(promoSql).toContain("two_factor_promo_reward_days");
    expect(promoSql).toContain("two_factor_promo_cutover_at");
    expect(promoSql).toContain("on conflict (key) do nothing");
  });

  it("keeps the daily-login migration replay on the final reward cap", async () => {
    const loginRewardsSql = await readFile(path.join(serverRoot, "sql", "056_daily_login_bonus_rewards.sql"), "utf8");

    expect(loginRewardsSql).toContain("('activity_reward_cap_days', '5'::jsonb)");
    expect(loginRewardsSql).not.toContain("('activity_reward_cap_days', '30'::jsonb)");
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

  it("keeps the replayed recurring reward settings on the final check-in rule", async () => {
    const rewardsSql = await readFile(path.join(serverRoot, "sql", "066_recurring_weekly_promotions.sql"), "utf8");

    expect(rewardsSql).toContain("('recurring_streak_reward_days', '1'::jsonb)");
    expect(rewardsSql).toContain("('activity_reward_cap_days', '5'::jsonb)");
    expect(rewardsSql).toContain("('activity_reward_cap_period_days', '30'::jsonb)");
    expect(rewardsSql).toContain("'[\"check_in\"]'::jsonb");
    expect(rewardsSql).not.toContain("'[\"cruush\",\"message\",\"post\"]'::jsonb");
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

  it("keeps the V2-only Ghost pulse migration out of v1.2", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");

    expect(migrateSource).not.toContain("075_ghost_mode_pulse.sql");
    await expect(readFile(path.join(serverRoot, "sql", "075_ghost_mode_pulse.sql"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps account deletion evidence valid across migration replays", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const reportsSql = await readFile(path.join(serverRoot, "sql", "021_reports.sql"), "utf8");
    const supportSql = await readFile(path.join(serverRoot, "sql", "029_support_requests.sql"), "utf8");
    const reportTargetsSql = await readFile(path.join(serverRoot, "sql", "033_user_blocks_and_report_targets.sql"), "utf8");
    const moderationSql = await readFile(path.join(serverRoot, "sql", "036_beta_reporting_admin_moderation.sql"), "utf8");
    const deletionIntegritySql = await readFile(path.join(serverRoot, "sql", "076_account_deletion_integrity.sql"), "utf8");

    expect(migrateSource).toMatch(/"074_map_pings\.sql",\s*"076_account_deletion_integrity\.sql"/);
    expect(reportsSql).toContain("add column if not exists target_account_deleted_at timestamptz");
    expect(supportSql).toContain("add column if not exists requester_account_deleted_at timestamptz");
    expect(reportTargetsSql).toContain("target_account_deleted_at is not null");
    expect(reportTargetsSql).toContain("target_type = 'user'");
    expect(moderationSql).toContain("target_account_deleted_at is not null");
    expect(deletionIntegritySql).toContain("requester_account_deleted_at");
    expect(deletionIntegritySql).toContain("target_account_deleted_at");
    expect(deletionIntegritySql).toContain("idx_messages_user_id");
    expect(deletionIntegritySql).toContain("preserve_account_deletion_evidence");
    expect(deletionIntegritySql).toContain("guard_deleted_support_reply_recipient");
    expect(deletionIntegritySql).toContain("support_request_replies_active_requester_check");
    expect(deletionIntegritySql).toContain("for update of reply");
    expect(deletionIntegritySql).toContain("request.requester_account_deleted_at = deleted_at");
    expect(deletionIntegritySql).toContain("post.user_id = old.id");
    expect(deletionIntegritySql).toContain("message.user_id = old.id");
    expect(deletionIntegritySql).toContain("order by report.id");
    expect(deletionIntegritySql).toContain("for update");
    expect(deletionIntegritySql).toContain("before delete on app_users");
  });

  it("cleans feed posts owned by deleted or orphaned accounts", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const cleanupSql = await readFile(path.join(serverRoot, "sql", "088_feed_deleted_account_cleanup.sql"), "utf8");

    expect(migrateSource).toMatch(/"087_signup_consent\.sql",\s*"088_feed_deleted_account_cleanup\.sql"/);
    expect(cleanupSql).toContain("delete from posts post");
    expect(cleanupSql).toContain("author.account_status = 'deleted'");
    expect(cleanupSql).toContain("author.id is null");
  });

  it("cleans posts left by the legacy deleted-profile sentinel", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const cleanupSql = await readFile(path.join(serverRoot, "sql", "091_feed_legacy_deleted_profile_cleanup.sql"), "utf8");

    expect(migrateSource).toMatch(/"090_feed_orphaned_author_cleanup\.sql",\s*"091_feed_legacy_deleted_profile_cleanup\.sql"/);
    expect(cleanupSql).toContain("delete from posts post");
    expect(cleanupSql).toContain("user deleted profile");
  });

  it("adds notification-type preferences after account deletion integrity", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const preferencesSql = await readFile(path.join(serverRoot, "sql", "077_notification_type_preferences.sql"), "utf8");

    expect(migrateSource).toMatch(/"076_account_deletion_integrity\.sql",\s*"077_notification_type_preferences\.sql"/);
    expect(preferencesSql).toContain("add column if not exists nearby_enabled boolean not null default true");
    expect(preferencesSql).toContain("add column if not exists rewards_enabled boolean not null default true");
  });

  it("keeps the pre-079 reward guard fail-closed on the final check-in rule", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const rewardGuardSql = await readFile(path.join(serverRoot, "sql", "078_activity_reward_earned_guard.sql"), "utf8");

    expect(migrateSource).toMatch(/"077_notification_type_preferences\.sql",\s*"078_activity_reward_earned_guard\.sql"/);
    expect(rewardGuardSql).toContain("before insert on reward_grants");
    expect(rewardGuardSql).toContain("legacy activity bonus grants are disabled");
    expect(rewardGuardSql).toContain("seven check-ins, one reward day, and five days per rolling 30 days");
    expect(rewardGuardSql).toContain("mod(streak_value, boundary_days) <> 0");
    expect(rewardGuardSql).toContain("new.days <> configured_reward_days");
    expect(rewardGuardSql).toContain("from user_activity_streaks streak");
    expect(rewardGuardSql).toContain("from daily_activity_credits credit");
    expect(rewardGuardSql).toContain("credit.activity_type = 'check_in'");
    expect(rewardGuardSql).toContain("activity reward exceeds the rolling 30-day cap");
    expect(rewardGuardSql).toContain("for update");
    expect(rewardGuardSql).not.toContain("activity reward configuration must remain seven days");
    expect(rewardGuardSql).not.toMatch(/\b(update|delete)\s+reward_grants\b/i);
  });

  it("replaces action rewards with capped daily check-in rewards", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const checkInSql = await readFile(path.join(serverRoot, "sql", "079_daily_check_in_rewards.sql"), "utf8");

    expect(migrateSource).toMatch(/"078_activity_reward_earned_guard\.sql",\s*"079_daily_check_in_rewards\.sql"/);
    expect(checkInSql).toContain("('recurring_streak_reward_days', '1'::jsonb)");
    expect(checkInSql).toContain("('activity_reward_cap_days', '5'::jsonb)");
    expect(checkInSql).toContain("('activity_reward_cap_period_days', '30'::jsonb)");
    expect(checkInSql).toContain("'[\"check_in\"]'::jsonb");
    expect(checkInSql).toContain("credit.activity_type = 'check_in'");
    expect(checkInSql).toContain("activity reward configuration must remain seven check-ins, one reward day, and five days per rolling 30 days");
    expect(checkInSql).toContain("activity reward exceeds the rolling 30-day cap");
    expect(checkInSql).not.toMatch(/\b(update|delete)\s+reward_grants\b/i);
  });

  it("locks daily check-in reward invariants without rewriting legacy rows", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const invariantSql = await readFile(path.join(serverRoot, "sql", "080_reward_invariants.sql"), "utf8");

    expect(migrateSource).toMatch(/"079_daily_check_in_rewards\.sql",\s*"080_reward_invariants\.sql"/);
    expect(invariantSql).toContain("daily_activity_credits_check_in_only");
    expect(invariantSql).toContain("check (activity_type = 'check_in') not valid");
    expect(invariantSql).toContain("reward_grants_check_in_only_shape");
    expect(invariantSql).toMatch(
      /check \(\s*source not in \('activity_recurring', 'activity_long_bonus'\)\s*or \(source = 'activity_recurring' and days = 1\)\s*\) not valid/
    );
    expect(invariantSql).toContain("enforce_daily_check_in_reward_settings");
    expect(invariantSql).toContain("before insert or update on reward_settings");
    expect(invariantSql).toContain("unsafe daily check-in reward setting is forbidden");
    expect(invariantSql).toContain("'recurring_streak_reward_days', '1'::jsonb");
    expect(invariantSql).toContain("'activity_reward_cap_days', '5'::jsonb");
    expect(invariantSql).toContain("'eligible_activity_types', '[\"check_in\"]'::jsonb");
    expect(invariantSql).not.toMatch(/\b(update|delete)\s+(reward_grants|daily_activity_credits)\b/i);
  });

  it("runs reward safety migrations before normal replay on existing databases", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const preflightStart = migrateSource.indexOf("for (const file of rewardSafetyPreflightFiles)");
    const normalStart = migrateSource.indexOf("for (const file of migrationFiles)");

    expect(migrateSource).toMatch(
      /const rewardSafetyPreflightFiles = \[\s*"079_daily_check_in_rewards\.sql",\s*"080_reward_invariants\.sql"\s*\] as const;/
    );
    expect(migrateSource).not.toContain("migrationFiles.slice(-2)");
    expect(migrateSource).toContain('"079_daily_check_in_rewards.sql"');
    expect(migrateSource).toContain('"080_reward_invariants.sql"');
    expect(migrateSource).toContain("to_regclass('public.reward_settings')");
    expect(migrateSource).toContain("to_regclass('public.daily_activity_credits')");
    expect(migrateSource).toContain("to_regclass('public.reward_grants')");
    expect(preflightStart).toBeGreaterThan(-1);
    expect(normalStart).toBeGreaterThan(preflightStart);
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
