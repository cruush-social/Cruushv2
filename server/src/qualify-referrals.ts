import { buildServer } from "./app.js";
import { loadConfig } from "./config.js";
import { qualifyPendingReferrals } from "./referrals-service.js";

const app = buildServer(loadConfig());

try {
  const results = await qualifyPendingReferrals(app, { limit: 500 });
  app.log.info(results, "one-shot referral qualification finished");
} finally {
  await app.close();
}
