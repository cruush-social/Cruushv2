import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const migrationFiles = [
  "001_init.sql",
  "002_profiles.sql",
  "003_profiles_migration_slice.sql",
  "004_posts.sql",
  "005_cruushes.sql",
  "006_auth_session_upgrade.sql",
  "007_email_verification_tokens.sql",
  "008_messages.sql",
  "009_direct_messages.sql",
  "010_profile_locations.sql",
  "011_password_reset_tokens.sql",
  "012_substance_boundaries.sql",
  "013_kink_fetish_interests.sql",
  "014_profile_role_and_kink_visibility.sql",
  "015_profile_sensitive_tokens.sql",
  "016_profile_visibility_rules.sql",
  "017_rate_limit_buckets.sql",
  "018_match_visibility_relationships.sql",
  "019_encrypted_relationship_storage.sql",
  "020_ghost_mode_location_privacy.sql",
  "021_reports.sql",
  "022_moderation_foundation.sql",
  "023_stream_moderation.sql",
  "024_open_beta_storage_messaging.sql",
  "025_message_media_attachments.sql",
  "026_chat_beta_controls.sql",
  "027_cruush_plus_billing.sql",
  "028_app_user_code_of_conduct.sql",
  "029_support_requests.sql",
  "030_csam_incident_reporting.sql",
  "031_profile_visibility_sets.sql",
  "032_account_status_and_moderators.sql",
  "033_user_blocks_and_report_targets.sql",
  "034_moderation_actions.sql",
  "035_notifications_and_push.sql",
  "036_beta_reporting_admin_moderation.sql",
  "037_media_asset_foundation.sql",
  "038_moderation_media_grants.sql",
  "039_profile_photo_manual_reviews.sql",
  "040_severe_access_bans.sql",
  "041_unified_moderation_queue.sql",
  "042_rewards_and_two_factor.sql",
  "043_launch_party_crowd_feed.sql",
  "044_cruush_match_settings.sql",
  "045_message_favorite_images.sql",
  "046_referral_signup_privacy.sql",
  "047_beta_city_requests.sql",
  "048_cruush_plus_promo_codes.sql",
  "049_feed_location_pin_visibility.sql",
  "050_body_type_taxonomy_cleanup.sql",
  "050_owner_full_access_account.sql",
  "051_cruush_match_mutual_crowds.sql",
  "052_profile_signal.sql",
  "053_feed_distance_label_setting.sql",
  "054_notification_sound_preference.sql",
  "055_user_notice_dismissals.sql",
  "056_daily_login_bonus_rewards.sql",
  "057_post_onboarding_affiliate_share_notice.sql",
  "058_support_request_bug_triage.sql",
  "059_map_presence_duration.sql",
  "060_first_feed_post_prompt_notice.sql",
  "061_moderator_account_bans.sql",
  "062_account_deletion_media_cleanup.sql",
  "062_message_expiry_cleanup.sql",
  "063_media_classification_audit.sql",
  "064_owner_access_repair.sql",
  "064_support_request_replies.sql",
  "065_owner_photo_messaging_repair.sql",
  "066_recurring_weekly_promotions.sql",
  "067_feed_post_expiry_options.sql",
  "068_cruush_message_visibility.sql",
  "069_nearby_activity_notifications.sql",
  "070_photo_moderation_retries.sql",
  "071_moderation_system_errors.sql",
  "072_moderation_system_error_context.sql",
  "073_revoke_post_aug7_automatic_cruush_plus_trials.sql",
  "074_map_pings.sql",
  "076_account_deletion_integrity.sql",
  "077_notification_type_preferences.sql",
  "078_activity_reward_earned_guard.sql",
  "079_daily_check_in_rewards.sql",
  "080_reward_invariants.sql",
  "081_signup_age_verification.sql",
  "082_two_factor_cruush_plus_reward.sql",
  "084_suspension_appeals.sql",
  "085_feed_window_default.sql",
  "086_waitlist30_promo_code.sql",
  "087_signup_consent.sql",
  "088_feed_deleted_account_cleanup.sql",
  "089_site_wide_announcements.sql",
  "090_feed_orphaned_author_cleanup.sql",
  "091_feed_legacy_deleted_profile_cleanup.sql",
  "092_support_request_survey_source.sql",
  "093_ghost_pulse_setting.sql",
  "094_nsfwclub30_promo_code.sql",
  "095_nsfwclub30_promo_code_cap.sql",
  "096_notification_quiet_hours.sql",
  "097_travel_pins.sql",
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
  "108_side_quest_catalog.sql",
  "109_survey_response_uniqueness.sql",
  "110_feed_post_tags.sql",
  "111_place_board_post_expiry.sql",
  "112_place_checkin_board_access.sql",
  "113_spot_vibes_amenities.sql",
  "114_place_vibe_reports.sql",
  "115_profile_tags.sql",
  "116_tutorial_side_quest.sql",
  "117_public_spots_100mi_nyc.sql",
  "118_women_centered_queer_venues.sql",
  "119_spot_lean_amenity_access.sql",
  "120_public_spot_details.sql",
  "121_hide_competitor_spot_sources.sql",
  "122_place_detail_suggestions.sql",
  "123_group_pulses.sql",
  "124_profile_taxonomy.sql",
  "125_profile_body_hair.sql",
  "126_profile_taxonomy_expansion.sql",
  "127_profile_hair_now.sql",
  "128_profile_taxonomy_final.sql",
  "129_profile_preferred_spots_protection.sql",
  "130_profile_tag_reservations.sql",
  "131_profile_taxonomy_refinements.sql",
  "132_default_profile_side_badges.sql",
  "133_profile_video_games.sql",
  "134_full_nyc_spot_import.sql",
  "135_gyms_from_source_platform_only.sql",
  "136_major_sports_venues_only.sql",
  "137_lgbt_community_spaces_and_ymca.sql",
  "138_alt_music_venues_only.sql",
  "139_live_music_rooms.sql",
  "140_other_bucket_categories.sql",
  "141_dedupe_spots_at_one_coordinate.sql",
  "142_drop_leans_men_and_techno_tags.sql",
  "143_email_change_requests.sql",
  "144_profile_protections.sql",
  "145_rewrite_scraped_spot_descriptions.sql",
  "146_pulse_radius_25_50.sql",
  "147_feed_post_expiry_3h.sql",
  "148_name_unnamed_spots.sql",
  "149_merge_bathroom_subspots.sql",
  "150_feed_post_expiry_30m.sql"
];
const rewardSafetyPreflightFiles = [
  "079_daily_check_in_rewards.sql",
  "080_reward_invariants.sql"
] as const;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(currentDir, "../sql");
const pool = new Pool({ connectionString: databaseUrl, max: 1 });

async function runMigration(file: string, phase = "migration") {
  const sql = await readFile(path.join(sqlDir, file), "utf8");
  const client = await pool.connect();

  try {
    console.log(`Running ${file} (${phase})`);
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log(`Finished ${file} (${phase})`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

try {
  const rewardSchema = await pool.query<{
    reward_settings: boolean;
    daily_activity_credits: boolean;
    reward_grants: boolean;
  }>(
    `select
       to_regclass('public.reward_settings') is not null as reward_settings,
       to_regclass('public.daily_activity_credits') is not null as daily_activity_credits,
       to_regclass('public.reward_grants') is not null as reward_grants`
  );
  const existingRewardSchema = rewardSchema.rows[0];

  if (
    existingRewardSchema?.reward_settings &&
    existingRewardSchema.daily_activity_credits &&
    existingRewardSchema.reward_grants
  ) {
    for (const file of rewardSafetyPreflightFiles) {
      await runMigration(file, "reward safety preflight");
    }
  }

  for (const file of migrationFiles) {
    await runMigration(file);
  }

  console.log("Migrations complete.");
} finally {
  await pool.end();
}
