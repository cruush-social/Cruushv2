import { loadConfig } from "./config.js";
import { buildServer } from "./app.js";
import { startReferralQualificationScheduler } from "./referrals-service.js";
import { startMessageExpiryScheduler } from "./message-expiry.js";

const config = loadConfig();
const app = buildServer(config);
let stopReferralScheduler: (() => void) | null = null;
let stopMessageExpiryScheduler: (() => void) | null = null;

const shutdown = async () => {
  stopReferralScheduler?.();
  stopMessageExpiryScheduler?.();
  await app.close();
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

await app.listen({
  host: config.HOST,
  port: config.PORT
});

stopReferralScheduler = startReferralQualificationScheduler(app);
stopMessageExpiryScheduler = startMessageExpiryScheduler(app);
