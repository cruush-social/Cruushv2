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
import { startPlaceCheckinExpiryScheduler } from "./place-checkin-expiry.js";
import { syncAllVerifiedMembersToResendAudience } from "./resend-audience.js";
import { startCryptoGasAlertScheduler } from "./crypto-gas-alerts.js";
import { startCryptoWatcher } from "./crypto-watcher-runtime.js";
import { createBitcoinSource } from "./bitcoin.js";
import { createMempoolBitcoinSource, type MempoolBitcoinSource } from "./bitcoin-mempool-source.js";
import { isCryptoPaymentRailReady } from "./crypto-payments.js";
import { sendBitcoinMonitoringCapacityAlertEmail } from "./mailer.js";

import { startSubscriptionExpiryScheduler } from "./subscription-expiry.js";
import { startWeeklyOrderReportScheduler } from "./weekly-order-report.js";
import { startSiteReminderScheduler } from "./site-reminders.js";
import { startOutOfSightWelcomeEmailScheduler } from "./oos-welcome-email.js";
import { startSinnersWelcomeEmailScheduler } from "./sinners-welcome-email.js";
import { startBugReportEmailRetentionScheduler } from "./bug-report-email-retention.js";

const config = loadConfig();
let cryptoWatcherHandle: ReturnType<typeof startCryptoWatcher> = null;
const mempoolBitcoinSource: MempoolBitcoinSource | null =
  config.CRYPTO_PROCESSOR_ENABLED === true &&
  config.CRYPTO_PROCESSOR_WATCHER_ENABLED === true &&
  isCryptoPaymentRailReady(config, "btc_bitcoin")
    ? createMempoolBitcoinSource({
        verifier: createBitcoinSource(config.CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL ?? ""),
        onStatus: status => {
          if (status.type === "capacity") {
            if (status.level === "critical") console.warn(`[bitcoin-mempool] CRITICAL: ${status.activeAddresses} active checkout addresses; scale the monitoring source now.`);
            else if (status.level === "warning") console.warn(`[bitcoin-mempool] WARNING: ${status.activeAddresses} active checkout addresses; plan the next monitoring source.`);
            else console.info(`[bitcoin-mempool] active checkout addresses back below the warning threshold (${status.activeAddresses}).`);
            if (status.level !== "normal") {
              void sendBitcoinMonitoringCapacityAlertEmail({
                activeAddresses: status.activeAddresses,
                config,
                level: status.level,
                logger: app.log
              }).catch(error => {
                console.warn("[bitcoin-mempool] capacity alert email failed", error instanceof Error ? error.message : "unknown error");
              });
            }
          } else if (status.type === "socket-error") console.warn("[bitcoin-mempool] WebSocket error; monitoring will retry.");
          else console.warn("[bitcoin-mempool] WebSocket disconnected; monitoring will reconnect.");
        }
      })
    : null;
const app = buildServer(config);
let stopReferralScheduler: (() => void) | null = null;
let stopMessageExpiryScheduler: (() => void) | null = null;
let stopAccountDeletionMediaCleanupScheduler: (() => void) | null = null;
let stopPendingPhotoModerationRetryScheduler: (() => void) | null = null;
let stopMapPingCleanupScheduler: (() => void) | null = null;
let stopCryptoWatcher: (() => void) | null = null;
let stopCryptoGasAlerts: (() => void) | null = null;
let stopPlaceCheckinExpiryScheduler: (() => void) | null = null;

let stopSubscriptionExpiryScheduler: (() => void) | null = null;
let stopWeeklyOrderReportScheduler: (() => void) | null = null;
let stopSiteReminderScheduler: (() => void) | null = null;
let stopOutOfSightWelcomeEmailScheduler: (() => void) | null = null;
let stopSinnersWelcomeEmailScheduler: (() => void) | null = null;
let stopBugReportEmailRetentionScheduler: (() => void) | null = null;

const shutdown = async () => {
  stopSubscriptionExpiryScheduler?.();
  stopWeeklyOrderReportScheduler?.();
  stopSiteReminderScheduler?.();
  stopOutOfSightWelcomeEmailScheduler?.();
  stopSinnersWelcomeEmailScheduler?.();
  stopBugReportEmailRetentionScheduler?.();
  stopReferralScheduler?.();
  stopMessageExpiryScheduler?.();
  stopAccountDeletionMediaCleanupScheduler?.();
  stopPendingPhotoModerationRetryScheduler?.();
  stopMapPingCleanupScheduler?.();
  stopCryptoWatcher?.();
  stopCryptoGasAlerts?.();
  stopPlaceCheckinExpiryScheduler?.();
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
// Returns null and logs why unless the processor, the watcher, and a chain
// endpoint are all explicitly configured.
cryptoWatcherHandle = startCryptoWatcher(app, mempoolBitcoinSource ? { bitcoinSource: mempoolBitcoinSource } : {});
stopCryptoWatcher = cryptoWatcherHandle?.stop ?? null;
stopCryptoGasAlerts = startCryptoGasAlertScheduler(app);
// Prime the active-address subscription immediately after watcher startup.
if (mempoolBitcoinSource) void cryptoWatcherHandle?.runOnce();
stopPlaceCheckinExpiryScheduler = startPlaceCheckinExpiryScheduler(app);
stopSubscriptionExpiryScheduler = startSubscriptionExpiryScheduler(app);
stopWeeklyOrderReportScheduler = startWeeklyOrderReportScheduler(app);
stopSiteReminderScheduler = startSiteReminderScheduler(app);
stopOutOfSightWelcomeEmailScheduler = startOutOfSightWelcomeEmailScheduler(app);
stopSinnersWelcomeEmailScheduler = startSinnersWelcomeEmailScheduler(app);
stopBugReportEmailRetentionScheduler = startBugReportEmailRetentionScheduler(app);
// Side Quest nudges are off for now at Julien's request: no prompt, and no
// notification standing in for one. The sweep is left in place, so turning
// them back on is this one line.
// stopSideQuestNotificationScheduler = startSideQuestNotificationScheduler(app);
void syncAllVerifiedMembersToResendAudience({
  config,
  db: app.db,
  logger: app.log
}).catch((error) => {
  app.log.warn({ err: error }, "verified member audience reconciliation failed");
});
