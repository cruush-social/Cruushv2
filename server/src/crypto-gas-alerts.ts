import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { runTransaction } from "./db.js";
import { deriveCryptoReceivingAddress, fingerprintCryptoWalletXpub, isValidCryptoWalletXpub } from "./crypto-wallet.js";
import { CryptoGasEmailRejectedError, sendCryptoGasAlertEmail } from "./mailer.js";

// Early warnings at one quarter of the suggested working balance. Re-arm only
// after the target is restored, so balance noise cannot generate new episodes.
export const GAS_ALERT_NETWORKS = [
  { chainId: 42161, name: "Arbitrum One", endpoint: "CRYPTO_PROCESSOR_ARBITRUM_RPC_URL", lowWei: 100_000_000_000_000n, targetWei: 400_000_000_000_000n },
  { chainId: 1, name: "Ethereum mainnet", endpoint: "CRYPTO_PROCESSOR_ETHEREUM_RPC_URL", lowWei: 500_000_000_000_000n, targetWei: 2_000_000_000_000_000n },
  { chainId: 8453, name: "Base", endpoint: "CRYPTO_PROCESSOR_BASE_RPC_URL", lowWei: 100_000_000_000_000n, targetWei: 400_000_000_000_000n },
] as const;

type GasEmailSnapshot = {
  network: string;
  address: string;
  balanceEth: string;
  topUpEth: string;
  targetEth: string;
  mailFrom: string;
};

type AlertState = {
  email_snapshot: GasEmailSnapshot | null;
  episode_id: string | null;
  first_attempt_at: string | Date | null;
  email_sent_at: string | Date | null;
  claimed_until: string | Date | null;
};

export function formatGasEth(wei: bigint) {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % (10n ** 18n)).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

// The only on-chain methods used here are eth_chainId and eth_getBalance.
// Unknown, malformed, wrong-chain or unavailable readings are never zero.
export async function readTreasuryGasBalance(endpoint: string, chainId: number, address: string, fetcher: typeof fetch = fetch) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Unsupported gas-monitor endpoint.");
  }
  async function rpc(method: string, params: unknown[]) {
    const response = await fetcher(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8000), redirect: "error",
    });
    if (!response.ok) throw new Error("Gas-monitor source unavailable.");
    const body = await response.json() as { error?: unknown; result?: unknown };
    if (body.error || typeof body.result !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/i.test(body.result)) {
      throw new Error("Invalid gas-monitor reading.");
    }
    return BigInt(body.result);
  }
  if (await rpc("eth_chainId", []) !== BigInt(chainId)) throw new Error("Gas-monitor source has the wrong chain.");
  return rpc("eth_getBalance", [address, "latest"]);
}

export async function runCryptoGasAlertPass(app: Pick<FastifyInstance, "config" | "db" | "log">, options: {
  now?: Date;
  readBalance?: typeof readTreasuryGasBalance;
  send?: typeof sendCryptoGasAlertEmail;
} = {}) {
  const config: AppConfig = app.config;
  if (!config.CRYPTO_GAS_ALERT_EMAIL_ENABLED || !config.CRYPTO_PROCESSOR_ENABLED
    || !config.RESEND_API_KEY || !config.MAIL_FROM
    || !isValidCryptoWalletXpub(config.CRYPTO_PROCESSOR_WALLET_XPUB ?? "")) return { checked: 0, emailed: 0 };
  const xpub = config.CRYPTO_PROCESSOR_WALLET_XPUB!;
  const fingerprint = fingerprintCryptoWalletXpub(xpub);
  const address = deriveCryptoReceivingAddress(xpub, 0);
  const now = options.now ?? new Date();
  let checked = 0;
  let emailed = 0;
  for (const network of GAS_ALERT_NETWORKS) {
    const endpoint = config[network.endpoint];
    if (!endpoint) continue;
    let balance: bigint;
    try {
      balance = await (options.readBalance ?? readTreasuryGasBalance)(endpoint, network.chainId, address);
      if (balance < 0n || balance >= 2n ** 256n) throw new Error("Invalid balance.");
      checked++;
    } catch {
      app.log.warn({ chainId: network.chainId }, "gas balance unavailable; no low-gas email sent");
      continue;
    }
    const claimToken = randomUUID();
    const episode = await runTransaction(app.db, async db => {
      await db.query(`insert into crypto_gas_alerts(wallet_fingerprint, chain_id, balance_wei)
        values ($1, $2, $3) on conflict (wallet_fingerprint, chain_id) do nothing`, [fingerprint, network.chainId, balance.toString()]);
      const result = await db.query<AlertState>(`select episode_id, first_attempt_at, email_sent_at, claimed_until, email_snapshot
        from crypto_gas_alerts where wallet_fingerprint = $1 and chain_id = $2 for update`, [fingerprint, network.chainId]);
      const state = result.rows[0];
      if (!state) throw new Error("Gas alert state unavailable.");
      await db.query(`update crypto_gas_alerts set balance_wei = $3, updated_at = $4
        where wallet_fingerprint = $1 and chain_id = $2`, [fingerprint, network.chainId, balance.toString(), now]);
      // Do not clear an in-flight send. The next observed healthy pass can re-arm.
      if (balance >= network.targetWei && (!state.claimed_until || new Date(state.claimed_until) <= now)) {
        await db.query(`update crypto_gas_alerts set episode_id = null, first_attempt_at = null,
          email_sent_at = null, provider_message_id = null, claim_token = null, claimed_until = null, email_snapshot = null
          where wallet_fingerprint = $1 and chain_id = $2`, [fingerprint, network.chainId]);
        return null;
      }
      if (balance >= network.lowWei || state.email_sent_at
        || (state.claimed_until && new Date(state.claimed_until) > now)) return null;
      // Resend idempotency lasts 24 hours. An ambiguous send is held after 23
      // hours instead of risking a second email outside the provider window.
      if (state.first_attempt_at && now.getTime() - new Date(state.first_attempt_at).getTime() >= 23 * 60 * 60 * 1000) {
        app.log.warn({ chainId: network.chainId }, "gas email delivery needs operator review");
        return null;
      }
      const episodeId = state.episode_id ?? randomUUID();
      const snapshot = state.email_snapshot ?? {
        network: network.name, address, balanceEth: formatGasEth(balance),
        topUpEth: formatGasEth(network.targetWei - balance), targetEth: formatGasEth(network.targetWei),
        mailFrom: config.MAIL_FROM,
      };
      await db.query(`update crypto_gas_alerts set episode_id = $3, claim_token = $4,
        claimed_until = $5, first_attempt_at = coalesce(first_attempt_at, $6),
        email_snapshot = coalesce(email_snapshot, $7::jsonb)
        where wallet_fingerprint = $1 and chain_id = $2`,
      [fingerprint, network.chainId, episodeId, claimToken, new Date(now.getTime() + 5 * 60 * 1000), now, JSON.stringify(snapshot)]);
      return { id: episodeId, snapshot, hadUncertainAttempt: state.first_attempt_at !== null };
    });
    if (!episode) continue;
    try {
      const delivery = await (options.send ?? sendCryptoGasAlertEmail)({
        config, logger: app.log, idempotencyKey: `crypto-gas/${fingerprint}/${network.chainId}/${episode.id}`,
        ...episode.snapshot,
      });
      if (delivery.accepted) {
        await app.db.query(`update crypto_gas_alerts set email_sent_at = $5,
          provider_message_id = $6, claimed_until = $5, claim_token = null
          where wallet_fingerprint = $1 and chain_id = $2 and episode_id = $3 and claim_token = $4`,
        [fingerprint, network.chainId, episode.id, claimToken, now, delivery.providerMessageId]);
        emailed++;
      }
    } catch (error) {
      // A definite rejection can clear only this attempt's uncertainty. Never
      // erase an earlier timeout/crash that may already have sent the email.
      if (error instanceof CryptoGasEmailRejectedError && !episode.hadUncertainAttempt) {
        await app.db.query(`update crypto_gas_alerts set first_attempt_at = null
          where wallet_fingerprint = $1 and chain_id = $2 and episode_id = $3 and claim_token = $4`,
        [fingerprint, network.chainId, episode.id, claimToken]);
      }
      app.log.warn({ chainId: network.chainId }, "low-gas email failed; same episode will retry");
    } finally {
      await app.db.query(`update crypto_gas_alerts set claimed_until = $5, claim_token = null
        where wallet_fingerprint = $1 and chain_id = $2 and episode_id = $3 and claim_token = $4`,
      [fingerprint, network.chainId, episode.id, claimToken, now]);
    }
  }
  return { checked, emailed };
}

export function startCryptoGasAlertScheduler(app: Pick<FastifyInstance, "config" | "db" | "log">) {
  if (!app.config.CRYPTO_GAS_ALERT_EMAIL_ENABLED) return null;
  let running = false;
  let stopped = false;
  const run = async () => {
    if (running || stopped) return;
    running = true;
    try { await runCryptoGasAlertPass(app); }
    catch { app.log.warn({}, "gas warning monitor will retry"); }
    finally { running = false; }
  };
  const timer = setInterval(() => void run(), 10 * 60 * 1000);
  timer.unref();
  void run();
  return () => { stopped = true; clearInterval(timer); };
}
