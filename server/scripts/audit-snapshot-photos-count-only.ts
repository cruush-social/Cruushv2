/**
 * Count-only audit of stored cruush snapshot photo URLs.
 *
 * Prints COUNTS ONLY — never a URL, username, password, or any other stored
 * value. Safe to paste into an incident log.
 *
 * Read-only: runs SELECTs and in-memory decryption only; never writes.
 *
 * Usage (from server/, with the production environment variables present —
 * DATABASE_URL plus the RELATIONSHIP_ENCRYPTION_KEY* variables the API uses):
 *   npx tsx scripts/audit-snapshot-photos-count-only.ts
 *
 * On the production host, run it inside the API container so the exact
 * runtime environment is used:
 *   docker exec <api-container> npx tsx scripts/audit-snapshot-photos-count-only.ts
 */
import { loadConfig } from "../src/config.js";
import { createPool } from "../src/db.js";
import { decryptRelationshipPayload } from "../src/encrypted-relationships.js";

const CREDENTIAL_URL_PATTERN = /:\/\/[^/@\s]+:[^/@\s]+@/;

async function main() {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    const legacy = await pool.query<{
      total: string;
      with_photo: string;
      credential_bearing: string;
      non_https: string;
    }>(
      `select
         count(*)::text as total,
         count(*) filter (where to_user_photo is not null)::text as with_photo,
         count(*) filter (where to_user_photo ~ '://[^/@\\s]+:[^/@\\s]+@')::text as credential_bearing,
         count(*) filter (where to_user_photo is not null and to_user_photo !~ '^https://')::text as non_https
       from cruushes`
    );

    const row = legacy.rows[0];
    console.log("legacy cruushes.to_user_photo:");
    console.log(`  total rows:               ${row.total}`);
    console.log(`  with photo set:           ${row.with_photo}`);
    console.log(`  credential-bearing URLs:  ${row.credential_bearing}`);
    console.log(`  non-HTTPS values:         ${row.non_https}`);

    const encrypted = await pool.query<{
      id: string;
      record_ciphertext: string;
      record_nonce: string;
      record_auth_tag: string;
      encryption_key_version: string | null;
    }>(
      `select id, record_ciphertext, record_nonce, record_auth_tag, encryption_key_version
       from encrypted_relationship_records`
    );

    let total = 0;
    let cruushRecords = 0;
    let decryptFailures = 0;
    let withPhoto = 0;
    let credentialBearing = 0;
    let nonHttps = 0;

    for (const record of encrypted.rows) {
      total += 1;
      let payload: { type?: unknown; targetSnapshot?: { photo?: unknown } };
      try {
        payload = decryptRelationshipPayload(config, record) as typeof payload;
      } catch {
        decryptFailures += 1;
        continue;
      }

      if (payload.type !== "cruush") {
        continue;
      }
      cruushRecords += 1;

      const photo = payload.targetSnapshot?.photo;
      if (typeof photo === "string" && photo.length > 0) {
        withPhoto += 1;
        if (CREDENTIAL_URL_PATTERN.test(photo)) credentialBearing += 1;
        if (!photo.startsWith("https://")) nonHttps += 1;
      }
    }

    console.log("encrypted_relationship_records:");
    console.log(`  total records:            ${total}`);
    console.log(`  cruush records:           ${cruushRecords}`);
    console.log(`  decrypt failures:         ${decryptFailures}`);
    console.log(`  snapshots with photo:     ${withPhoto}`);
    console.log(`  credential-bearing URLs:  ${credentialBearing}`);
    console.log(`  non-HTTPS values:         ${nonHttps}`);

    console.log("not covered by this script (check separately):");
    console.log("  - application/container logs that may echo request bodies");
    console.log("  - database backups and dumps taken before cleanup");
    console.log("  - git history (local repository has corrupt objects; audit on a fresh clone)");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("audit failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
