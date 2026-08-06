import { loadConfig } from "./config.js";
import { buildServer } from "./app.js";
import { startReferralQualificationScheduler } from "./referrals-service.js";
import { startAccountDeletionMediaCleanupScheduler } from "./account-deletion-media-cleanup.js";

const config = loadConfig();
const app = buildServer(config);
let stopReferralScheduler: (() => void) | null = null;
let stopAccountDeletionMediaCleanupScheduler: (() => void) | null = null;

const shutdown = async () => {
  stopReferralScheduler?.();
  stopAccountDeletionMediaCleanupScheduler?.();
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
stopAccountDeletionMediaCleanupScheduler = startAccountDeletionMediaCleanupScheduler(app);
