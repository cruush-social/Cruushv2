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

  it("starts production crypto allocation after the reconciled address history", async () => {
    const allocatorSql = await readFile(
      path.join(serverRoot, "sql", "190_crypto_payment_allocator_history_floor.sql"),
      "utf8"
    );

    expect(allocatorSql).toContain("greatest(allocator_last_value, saved_maximum, 12)");
    expect(allocatorSql).toContain("perform setval(");
    expect(allocatorSql).toContain("crypto_payment_intents_derivation_index_seq");
    expect(allocatorSql).not.toMatch(/\b(insert into|update|delete from|truncate|drop table)\b/i);
  });

  it("sets the new crypto order database fallback to 24 hours", async () => {
    const windowSql = await readFile(
      path.join(serverRoot, "sql", "125_crypto_payment_24_hour_window.sql"),
      "utf8"
    );

    expect(windowSql).toContain("alter column expires_at set default");
    expect(windowSql).toContain("interval '1440 minutes'");
  });

  it("keeps Ping pack grants permanent, exact, and linked to one payment intent", async () => {
    const pingPackSql = await readFile(
      path.join(serverRoot, "sql", "123_ping_pack_purchases.sql"),
      "utf8"
    );

    expect(pingPackSql).toContain("product_type in ('cruush_plus', 'ping_pack')");
    expect(pingPackSql).toContain("crypto_payment_intent_id uuid not null unique");
    expect(pingPackSql).toContain("pack_id = 'ping_3' and ping_count = 3 and amount_cents = 299");
    expect(pingPackSql).toContain("pack_id = 'ping_10' and ping_count = 10 and amount_cents = 799");
    expect(pingPackSql).toContain("pack_id = 'ping_25' and ping_count = 25 and amount_cents = 1499");
    expect(pingPackSql).not.toMatch(/expires_at|expiration/i);
  });

  it("raises Pulse prices without invalidating historical pack grants", async () => {
    const priceSql = await readFile(
      path.join(serverRoot, "sql", "193_pulse_pack_prices.sql"),
      "utf8"
    );

    expect(priceSql).toContain("amount_cents in (299, 999)");
    expect(priceSql).toContain("amount_cents in (799, 2499)");
    expect(priceSql).toContain("amount_cents in (1499, 4999)");
  });

  it("adds member-controlled site reminders and their notification type", async () => {
    const reminderSql = await readFile(
      path.join(serverRoot, "sql", "194_site_reminders.sql"),
      "utf8"
    );
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");

    expect(reminderSql).toContain("site_reminders_enabled boolean not null default true");
    expect(reminderSql).toContain("'site_reminder'");
    expect(migrateSource).toMatch(/"193_pulse_pack_prices\.sql",\s*"194_site_reminders\.sql"/);
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

  it("keeps the Mile High Club pin schema replay-safe", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const travelPinsSql = await readFile(path.join(serverRoot, "sql", "097_travel_pins.sql"), "utf8");

    expect(migrateSource).toContain('"097_travel_pins.sql"');
    expect(travelPinsSql).toContain("create table if not exists user_travel_pins");
    expect(travelPinsSql).toContain("create index if not exists user_travel_pins_set_at_idx");
    expect(travelPinsSql).toContain("user_id uuid primary key references profiles(id) on delete cascade");
    expect(travelPinsSql).not.toMatch(/\b(drop|truncate|delete from|update)\b/i);
  });

  it("orders the complete 1.6 schema slice from Feed audiences through the Side Quest catalog", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");

    expect(migrateSource).toMatch(
      /"097_travel_pins\.sql",\s*"098_feed_plus_audience\.sql",\s*"099_profile_zodiac\.sql",\s*"100_pulse_notifications\.sql",\s*"101_map_presence_hours\.sql",\s*"102_profile_side_badges\.sql",\s*"103_places\.sql",\s*"104_spots_taxonomy\.sql",\s*"105_feed_post_photos\.sql",\s*"106_side_quests\.sql",\s*"107_side_quest_first_ping\.sql",\s*"108_side_quest_catalog\.sql"/
    );
  });

  it("registers the CLUBS20 redemption ledger and Club Side Quest catalog extension last", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const sql = await readFile(path.join(serverRoot, "sql", "204_clubs20_coupon_and_club_side_quests.sql"), "utf8");

    expect(migrateSource).toMatch(/"203_encrypted_club_enrollments\.sql",\s*"204_clubs20_coupon_and_club_side_quests\.sql"/);
    expect(sql).toContain("create table if not exists checkout_coupon_redemptions");
    expect(sql).toContain("primary key (user_id, coupon_code)");
    expect(sql).toContain("'join_club', 'send_club_message'");
  });

  it("skips the historical replay after verifying the deployed migration-203 schema", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");

    expect(migrateSource).toContain('const productionBaselineFile = "203_encrypted_club_enrollments.sql"');
    expect(migrateSource).toContain("to_regclass('public.encrypted_club_enrollments')");
    expect(migrateSource).toContain("to_regclass('public.idx_encrypted_club_enrollments_user')");
    expect(migrateSource).toContain("column_name = 'member_index'");
    expect(migrateSource).toContain("migrationFiles.slice(productionBaselineIndex + 1)");
    expect(migrateSource).toContain(": migrationFiles;");
    expect(migrateSource).toContain("for (const file of pendingMigrationFiles)");
  });

  it("deduplicates active survey responses before installing replay-safe uniqueness guards", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const surveySql = await readFile(path.join(serverRoot, "sql", "109_survey_response_uniqueness.sql"), "utf8");

    expect(migrateSource).toMatch(/"108_side_quest_catalog\.sql",\s*"109_survey_response_uniqueness\.sql"/);
    expect(surveySql).toContain("partition by requester_user_id");
    expect(surveySql).toContain("set status = 'dismissed'");
    expect(surveySql).toContain("deduplicatedSurveyResponse");
    expect(surveySql).toContain("support_requests_active_survey_requester_uidx");
    expect(surveySql).not.toContain("surveySubmissionId");
    expect(surveySql).not.toMatch(/\b(delete from|truncate|drop table)\b/i);
  });

  it("normalizes saved Gaming hobbies to Video games in a replay-safe migration", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const videoGamesSql = await readFile(path.join(serverRoot, "sql", "133_profile_video_games.sql"), "utf8");

    expect(migrateSource).toMatch(/"132_default_profile_side_badges\.sql",\s*"133_profile_video_games\.sql"/);
    expect(videoGamesSql).toContain("when 'gaming' then 'Video games'");
    expect(videoGamesSql).toContain("when 'video games' then 'Video games'");
    expect(videoGamesSql).toContain("where lower(trim(value)) in ('gaming', 'video games')");
    expect(videoGamesSql).not.toMatch(/\b(delete from|truncate|drop table)\b/i);
  });

  it("imports the full retained public Spot workbook after the final profile migration", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const placesSql = await readFile(path.join(serverRoot, "sql", "134_full_nyc_spot_import.sql"), "utf8");

    expect(migrateSource).toMatch(/"133_profile_video_games\.sql",\s*"134_full_nyc_spot_import\.sql"/);
    expect(placesSql).toContain("Source-platform public places: 5279. OpenStreetMap venues: 5482.");
    expect(placesSql).toContain("'adult_shop', 'music_venue', 'sports_venue'");
    expect(placesSql).toContain("delete from place_tags where tag = 't4t_spot'");
    expect(placesSql).not.toContain("sniffies.com");
    expect(placesSql).not.toMatch(/tower_residential/i);
  });

  it("preserves archived Spots, removed import descriptions and member data during replay", async () => {
    const readSql = (file: string) => readFile(path.join(serverRoot, "sql", file), "utf8");
    const [importSql, detailsSql, cleanupSql, bathroomSql, duplicateSql, prefixSql, migrateSource] = await Promise.all([
      readSql("134_full_nyc_spot_import.sql"),
      readSql("120_public_spot_details.sql"),
      readSql("155_preserve_spot_cleanup.sql"),
      readSql("149_merge_bathroom_subspots.sql"),
      readSql("151_merge_duplicate_named_spots.sql"),
      readSql("152_merge_prefix_duplicate_spots.sql"),
      readFile(path.join(currentDir, "migrate.ts"), "utf8")
    ]);
    expect(importSql.match(/on conflict \(slug\) do nothing;/g)).toHaveLength(28);
    expect(importSql).not.toContain("on conflict (slug) do update");
    expect(detailsSql).not.toContain("description = seed.description");
    expect(cleanupSql).toContain("original_description");
    expect(cleanupSql).toContain("on conflict (place_id) do nothing");
    expect(cleanupSql).toContain("from backed_up saved");
    expect(cleanupSql).toContain("p.source_kind = 'community'");
    expect(cleanupSql).toContain("public-place-6a2e454d808e887c3edaf873");
    expect(migrateSource).toContain('"155_preserve_spot_cleanup.sql"');
    for (const sql of [bathroomSql, duplicateSql, prefixSql]) {
      expect(sql).not.toMatch(/delete\s+from\s+places/i);
      expect(sql).toContain("status = 'published'");
      expect(sql).toContain("status = 'archived'");
      expect(sql).toContain("slug like 'public-place-%'");
    }
  });

  it("migrates kink roles through the existing profile role column", async () => {
    const taxonomySql = await readFile(path.join(serverRoot, "sql", "128_profile_taxonomy_final.sql"), "utf8");
    const profileFieldsSql = await readFile(path.join(serverRoot, "sql", "129_profile_preferred_spots_protection.sql"), "utf8");

    expect(taxonomySql).toContain("role = pg_temp.cruush_profile_roles_v16(role, kinks)");
    expect(taxonomySql).not.toMatch(/\broles\s*=/);
    expect(profileFieldsSql).toContain("set role = array(");
    expect(profileFieldsSql).toContain("archetypes = owned_profiles.archetypes_with_owned");
    expect(profileFieldsSql).not.toMatch(/\broles\s*=/);
  });

  it("keeps the late 1.6 migrations replay-safe and dependency ordered", async () => {
    const [
      feedAudienceSql,
      zodiacSql,
      pulseSql,
      presenceSql,
      sideBadgesSql,
      placesSql,
      taxonomySql,
      feedPhotosSql,
      sideQuestsSql,
      firstPingSql,
      catalogSql
    ] = await Promise.all([
      "098_feed_plus_audience.sql",
      "099_profile_zodiac.sql",
      "100_pulse_notifications.sql",
      "101_map_presence_hours.sql",
      "102_profile_side_badges.sql",
      "103_places.sql",
      "104_spots_taxonomy.sql",
      "105_feed_post_photos.sql",
      "106_side_quests.sql",
      "107_side_quest_first_ping.sql",
      "108_side_quest_catalog.sql"
    ].map((file) => readFile(path.join(serverRoot, "sql", file), "utf8")));

    expect(feedAudienceSql).toContain("add column if not exists audience");
    expect(feedAudienceSql).toContain("drop constraint if exists posts_audience_check");
    expect(feedAudienceSql).toContain("create index if not exists posts_audience_created_at_idx");
    expect(zodiacSql).toContain("add column if not exists zodiac");
    expect(pulseSql).toContain("create table if not exists map_ping_notifications");
    expect(pulseSql).toContain("create unique index if not exists map_ping_notifications_ping_recipient_idx");
    expect(presenceSql).toContain("where map_presence_hours is null");
    expect(presenceSql).toContain("drop constraint if exists user_privacy_settings_map_presence_hours_check");
    expect(sideBadgesSql).toContain("add column if not exists side_badges");
    expect(placesSql).toContain("create table if not exists place_board_messages");
    expect(placesSql).toContain("on conflict (id) do nothing");
    expect(placesSql).toContain("expires_at timestamptz not null default (now() + interval '7 days')");
    expect(placesSql).toContain("create index if not exists idx_place_board_messages_expires");
    expect(placesSql).toContain("create index if not exists idx_place_checkins_place_active");
    expect(taxonomySql).toContain("on conflict (place_id, tag) do nothing");
    expect(taxonomySql).toContain("where tag in ('dyke_spot', 'dyke_bar')");
    expect(taxonomySql).toContain("select place_id, 'leans_women'");
    expect(taxonomySql).toContain("set facility_type = 'other'");
    expect(taxonomySql).toContain("where facility_type = 'venue'");
    expect(placesSql).toContain("'gingers-bar', 'Ginger''s Bar'");
    expect(placesSql).toMatch(/'gingers-bar'.*'bar'.*'published'/);
    expect(feedPhotosSql).toContain("conrelid = 'media_objects'::regclass");
    expect(feedPhotosSql).toContain("create table if not exists feed_post_attachments");
    expect(feedPhotosSql).toContain("create or replace function assert_feed_attachment_media_approved");
    expect(feedPhotosSql).toContain("drop trigger if exists feed_attachments_approved_media_only");
    expect(sideQuestsSql).toContain("create table if not exists side_quest_claims");
    expect(sideQuestsSql).toContain("add column if not exists bonus_credit_used");
    expect(firstPingSql).toContain("drop constraint if exists side_quest_claims_quest_check");
    expect(firstPingSql).toContain("'send_ping'");
    expect(catalogSql).toContain("drop constraint if exists side_quest_claims_quest_check");
    expect(catalogSql).toContain("'upload_first_photo'");
    expect(catalogSql).toContain("'save_visibility_set'");
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

  it("keeps superseded notification constraints replay-safe until the final validated constraint", async () => {
    for (const file of [
      "042_rewards_and_two_factor.sql",
      "069_nearby_activity_notifications.sql",
      "089_site_wide_announcements.sql",
      "100_pulse_notifications.sql",
      "112_place_checkin_board_access.sql",
      "187_subscription_expiry_reminders.sql",
      "194_site_reminders.sql"
    ]) {
      const sql = await readFile(path.join(serverRoot, "sql", file), "utf8");
      const typeConstraint = sql.match(
        /add constraint app_notifications_type_check[\s\S]*?\)\) not valid;/i
      )?.[0];

      expect(typeConstraint).toContain("'announcement'");
      expect(typeConstraint).toMatch(/not valid;$/i);
    }

    const finalSql = await readFile(path.join(serverRoot, "sql", "196_nearby_feed_post_notifications.sql"), "utf8");
    expect(finalSql).toContain("'nearby_feed_post'");
    expect(finalSql).not.toMatch(/app_notifications_type_check[\s\S]*?not valid/i);
  });

  it("adds the expanded Feed timers and nearby Feed notification type", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const expirySql = await readFile(path.join(serverRoot, "sql", "195_feed_post_expiry_intervals.sql"), "utf8");
    const notificationSql = await readFile(path.join(serverRoot, "sql", "196_nearby_feed_post_notifications.sql"), "utf8");

    expect(migrateSource).toMatch(/"194_site_reminders\.sql",\s*"195_feed_post_expiry_intervals\.sql",\s*"196_nearby_feed_post_notifications\.sql"/);
    expect(expirySql).toContain("'12h', '24h', '2d', '3d', '5d', '7d'");
    expect(expirySql).toContain("user_privacy_settings_feed_post_expiry_default_check");
    expect(notificationSql).toContain("'nearby_feed_post'");
  });

  it("adds a nullable account-backed map Spot visibility preference", async () => {
    const migrateSource = await readFile(path.join(currentDir, "migrate.ts"), "utf8");
    const preferenceSql = await readFile(path.join(serverRoot, "sql", "197_map_spots_visibility.sql"), "utf8");

    expect(migrateSource).toMatch(/"196_nearby_feed_post_notifications\.sql",\s*"197_map_spots_visibility\.sql"/);
    expect(preferenceSql).toContain("add column if not exists map_spots_visible boolean");
    expect(preferenceSql).not.toContain("default");
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
    const normalStart = migrateSource.indexOf("for (const file of pendingMigrationFiles)");

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

  it("seeds the NSFW Club coupon as a replay-safe 30-day promo code", async () => {
    const couponSql = await readFile(path.join(serverRoot, "sql", "094_nsfwclub30_promo_code.sql"), "utf8");

    expect(couponSql).toContain("insert into cruush_plus_promo_codes");
    expect(couponSql).toContain("'NSFWCLUB30'");
    expect(couponSql).toMatch(/grant_days[\s\S]*\n\s{2}30,/);
    expect(couponSql).toContain("on conflict (code) do update");
    expect(couponSql).not.toContain("delete from");
    expect(couponSql).not.toContain("reward_grants");
  });

  it("caps the NSFW Club coupon without overriding a later operator limit", async () => {
    const capSql = await readFile(path.join(serverRoot, "sql", "095_nsfwclub30_promo_code_cap.sql"), "utf8");

    expect(capSql).toContain("update cruush_plus_promo_codes");
    expect(capSql).toContain("max_redemptions = 500");
    expect(capSql).toContain("upper(code) = 'NSFWCLUB30'");
    expect(capSql).toContain("max_redemptions is null");
    expect(capSql).not.toContain("delete from");
    expect(capSql).not.toContain("reward_grants");
  });
});
