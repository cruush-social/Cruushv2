import { describe, it, expect, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { formatGasEth, readTreasuryGasBalance, runCryptoGasAlertPass, startCryptoGasAlertScheduler } from "./crypto-gas-alerts.js";
import { CryptoGasEmailRejectedError, sendCryptoGasAlertEmail } from "./mailer.js";
import { OWNER_FULL_ACCESS_EMAIL } from "./owner-access.js";

const xpub = "xpub6FHa3pjLCk84BayeJxFW2SP4XRrFd1JYnxeLeU8EqN3vDfZmbqBqaGJAyiLjTAwm6ZLRQUMv1ZACTj37sR62cfN7fe5JnJ7dh8zL4fiyLHV";
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
const config = { CRYPTO_GAS_ALERT_EMAIL_ENABLED: true, CRYPTO_PROCESSOR_ENABLED: true,
  CRYPTO_PROCESSOR_WALLET_XPUB: xpub, CRYPTO_PROCESSOR_BASE_RPC_URL: "https://rpc.test",
  RESEND_API_KEY: "synthetic", MAIL_FROM: "cruush <test@cruush.test>" } as AppConfig;

describe("read-only gas monitor", () => {
  it("checks the chain before reading balance and never calls a money-moving method", async () => {
    const methods: string[] = [];
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(init!.body as string); methods.push(body.method);
      return new Response(JSON.stringify({ result: body.method === "eth_chainId" ? "0x2105" : "0x0" }));
    }) as typeof fetch;
    expect(await readTreasuryGasBalance("https://rpc.test", 8453, "0xfixture", fetcher)).toBe(0n);
    expect(methods).toEqual(["eth_chainId", "eth_getBalance"]);
  });
  it("rejects the wrong chain before reading any balance", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ result: "0x1" }))) as typeof fetch;
    await expect(readTreasuryGasBalance("https://rpc.test", 8453, "0xfixture", fetcher)).rejects.toThrow(/wrong chain/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([{ error: { code: -1 } }, { result: null }, { result: "zero" }, { result: "0x00" }])("does not interpret malformed readings as zero: %j", async bad => {
    const fetcher = vi.fn(async (_url, init) => new Response(JSON.stringify(
      JSON.parse(init!.body as string).method === "eth_chainId" ? { result: "0x2105" } : bad))) as typeof fetch;
    await expect(readTreasuryGasBalance("https://rpc.test", 8453, "0xfixture", fetcher)).rejects.toThrow();
  });
  it("does no DB, network or email work when disabled", async () => {
    const db = { query: vi.fn(), end: vi.fn() }; const readBalance = vi.fn(); const send = vi.fn();
    expect(await runCryptoGasAlertPass({ config: { ...config, CRYPTO_GAS_ALERT_EMAIL_ENABLED: false }, db, log }, { readBalance, send })).toEqual({ checked: 0, emailed: 0 });
    expect(db.query).not.toHaveBeenCalled(); expect(readBalance).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    expect(startCryptoGasAlertScheduler({ config: { ...config, CRYPTO_GAS_ALERT_EMAIL_ENABLED: false }, db, log })).toBeNull();
  });
  it("does not email or change an episode after an RPC outage", async () => {
    const db = { query: vi.fn(), end: vi.fn() }; const send = vi.fn();
    expect(await runCryptoGasAlertPass({ config, db, log }, { readBalance: vi.fn().mockRejectedValue(new Error("unavailable")), send })).toEqual({ checked: 0, emailed: 0 });
    expect(db.query).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("formats small ETH balances without scientific notation or rounding", () => {
    expect(formatGasEth(1n)).toBe("0.000000000000000001");
    expect(formatGasEth(400_000_000_000_000n)).toBe("0.0004");
  });
});

describe("owner gas email", () => {
  it("sends only to the existing owner, with one idempotency key and explicit network/amount", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "message-fixture" })));
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(await sendCryptoGasAlertEmail({ config, logger: log, idempotencyKey: "episode-fixture",
        network: "Base", address: "0xpublicfixture", balanceEth: "0", topUpEth: "0.0004", targetEth: "0.0004" })).toEqual({ accepted: true, providerMessageId: "message-fixture" });
      const init = fetcher.mock.calls[0]![1]; const body = JSON.parse(init.body);
      expect(body.to).toEqual([OWNER_FULL_ACCESS_EMAIL]); expect(init.headers["Idempotency-Key"]).toBe("episode-fixture");
      expect(body.text).toContain("Send 0.0004 ETH on Base"); expect(body.text).toContain("No automatic purchase or swap");
      expect(body.text).toContain("PYUSD and USDC");
    } finally { vi.unstubAllGlobals(); }
  });
  it.each([400, 401, 403, 422, 429])("classifies gas email HTTP %s as a definite rejection", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("untrusted provider body", { status })));
    try {
      await expect(sendCryptoGasAlertEmail({ config, logger: log, idempotencyKey: "episode-fixture",
        network: "Base", address: "0xfixture", balanceEth: "0", topUpEth: "0.0004", targetEth: "0.0004" }))
        .rejects.toBeInstanceOf(CryptoGasEmailRejectedError);
    } finally { vi.unstubAllGlobals(); }
  });
  it.each([408, 409, 500, 503])("keeps gas email HTTP %s delivery uncertain", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("untrusted provider body", { status })));
    try {
      await expect(sendCryptoGasAlertEmail({ config, logger: log, idempotencyKey: "episode-fixture",
        network: "Base", address: "0xfixture", balanceEth: "0", topUpEth: "0.0004", targetEth: "0.0004" }))
        .rejects.not.toBeInstanceOf(CryptoGasEmailRejectedError);
    } finally { vi.unstubAllGlobals(); }
  });
  it("uses the episode sender snapshot after MAIL_FROM changes", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "message-fixture" })));
    vi.stubGlobal("fetch", fetcher);
    try {
      await sendCryptoGasAlertEmail({ config: { ...config, MAIL_FROM: "new@cruush.test" },
        mailFrom: "original@cruush.test", logger: log, idempotencyKey: "episode-fixture",
        network: "Base", address: "0xfixture", balanceEth: "0", topUpEth: "0.0004", targetEth: "0.0004" });
      expect(JSON.parse(fetcher.mock.calls[0]![1].body).from).toBe("original@cruush.test");
    } finally { vi.unstubAllGlobals(); }
  });
  it("redacts the recipient and provider response when delivery fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private echoed content", { status: 500 })));
    log.error.mockClear();
    try {
      await expect(sendCryptoGasAlertEmail({ config, logger: log, idempotencyKey: "episode-fixture",
        network: "Base", address: "0xfixture", balanceEth: "0", topUpEth: "0.0004", targetEth: "0.0004" })).rejects.toThrow();
      expect(log.error).toHaveBeenCalledWith({ statusCode: 500 }, expect.any(String));
    } finally { vi.unstubAllGlobals(); }
  });
});
