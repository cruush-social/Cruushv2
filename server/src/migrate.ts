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
  "034_moderation_actions.sql"
];

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(currentDir, "../sql");
const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  for (const file of migrationFiles) {
    const sql = await readFile(path.join(sqlDir, file), "utf8");
    const client = await pool.connect();

    try {
      console.log(`Running ${file}`);
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      console.log(`Finished ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  console.log("Migrations complete.");
} finally {
  await pool.end();
}
