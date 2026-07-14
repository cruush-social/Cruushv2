import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { cleanupModerationMediaGrants } from "./moderation-media-grants.js";
import { cleanupExpiredProfilePhotoReviews } from "./profile-photo-manual-reviews.js";

const config = loadConfig();
const db = createPool(config);

try {
  const [deletedGrants, deletedReviews] = await Promise.all([
    cleanupModerationMediaGrants(db, config, 500),
    cleanupExpiredProfilePhotoReviews(db, config, 500)
  ]);
  console.log(`Deleted ${deletedGrants} expired or orphaned moderation media asset(s) and ${deletedReviews} expired or rejected profile-photo review object(s).`);
} finally {
  await db.end();
}
