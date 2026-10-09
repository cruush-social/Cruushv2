import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { cleanupAccountDeletionMedia } from "./account-deletion-media-cleanup.js";

const config = loadConfig();
const db = createPool(config);

try {
  const result = await cleanupAccountDeletionMedia(db, config, 500);
  console.log(
    `Scanned ${result.scanned} account deletion media object(s), completed ${result.completed}, failed ${result.failed}.`
  );
} finally {
  await db.end();
}
