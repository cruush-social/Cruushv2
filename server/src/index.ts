import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(file: string) {
  const candidatePaths = [
    path.resolve(process.cwd(), file),
    path.resolve(process.cwd(), "server", file),
    path.resolve(serverDir, file)
  ];

  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");
loadEnvFile(".env.example");

import { loadConfig } from "./config.js";
import { buildServer } from "./app.js";
import { startReferralQualificationScheduler } from "./referrals-service.js";
import { startMessageExpiryScheduler } from "./message-expiry.js";
import { startAccountDeletionMediaCleanupScheduler } from "./account-deletion-media-cleanup.js";
import { startPendingPhotoModerationRetryScheduler } from "./recheck-pending-photo-moderations.js";
import { startMapPingCleanupScheduler } from "./map-ping-cleanup.js";

const config = loadConfig();
const app = buildServer(config);
let stopReferralScheduler: (() => void) | null = null;
let stopMessageExpiryScheduler: (() => void) | null = null;
let stopAccountDeletionMediaCleanupScheduler: (() => void) | null = null;
let stopPendingPhotoModerationRetryScheduler: (() => void) | null = null;
let stopMapPingCleanupScheduler: (() => void) | null = null;

const shutdown = async () => {
  stopReferralScheduler?.();
  stopMessageExpiryScheduler?.();
  stopAccountDeletionMediaCleanupScheduler?.();
  stopPendingPhotoModerationRetryScheduler?.();
  stopMapPingCleanupScheduler?.();
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
stopAccountDeletionMediaCleanupScheduler = startAccountDeletionMediaCleanupScheduler(app);
stopPendingPhotoModerationRetryScheduler = startPendingPhotoModerationRetryScheduler(app);
stopMapPingCleanupScheduler = startMapPingCleanupScheduler(app);
