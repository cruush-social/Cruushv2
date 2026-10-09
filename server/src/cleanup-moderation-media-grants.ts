import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { cleanupModeratorAccessEvents } from "./moderation-access-log.js";
import { cleanupModerationMediaGrants } from "./moderation-media-grants.js";
import { cleanupExpiredProfilePhotoReviews } from "./profile-photo-manual-reviews.js";
import { recalculateDecayingTrustProfiles } from "./trust-engine.js";

const config = loadConfig();
const db = createPool(config);

try {
  const [deletedGrants, deletedReviews, deletedAccessEvents, recalculatedTrustProfiles] = await Promise.all([
    cleanupModerationMediaGrants(db, config, 500),
    cleanupExpiredProfilePhotoReviews(db, config, 500),
    cleanupModeratorAccessEvents(db, 500),
    recalculateDecayingTrustProfiles(db, 500)
  ]);
  console.log(`Deleted ${deletedGrants} expired or orphaned moderation media asset(s), ${deletedReviews} expired or rejected profile-photo review object(s), and ${deletedAccessEvents} expired moderator access event(s). Recalculated ${recalculatedTrustProfiles} trust profile(s) with decaying negative events.`);
} finally {
  await db.end();
}
