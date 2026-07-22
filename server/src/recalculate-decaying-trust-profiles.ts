import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { recalculateDecayingTrustProfiles } from "./trust-engine.js";

const config = loadConfig();
const db = createPool(config);

try {
  const recalculated = await recalculateDecayingTrustProfiles(db);
  console.log(`Recalculated ${recalculated} trust profile(s) with decaying negative events.`);
} finally {
  await db.end();
}
