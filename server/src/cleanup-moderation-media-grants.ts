import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { cleanupModerationMediaGrants } from "./moderation-media-grants.js";

const config = loadConfig();
const db = createPool(config);

try {
  const deleted = await cleanupModerationMediaGrants(db, config, 500);
  console.log(`Deleted ${deleted} expired or orphaned moderation media asset(s).`);
} finally {
  await db.end();
}
