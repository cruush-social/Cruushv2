import { describe, expect, it } from "vitest";
import {
  DEFAULT_CRYPTO_SETTLEMENT_POLICY,
  evaluateCryptoSettlement,
  lateArrivalIsSettleable,
  settlementOutcomeGrantsAccess
} from "./crypto-settlement-policy.js";

// 18.99 USDC at six decimals, the monthly plan.
const quoted = 18_990_000n;

function evaluate(confirmedAmountAtomic: bigint, overrides = {}) {
  return evaluateCryptoSettlement({
    quotedAmountAtomic: quoted,
    confirmedAmountAtomic,
    policy: { ...DEFAULT_CRYPTO_SETTLEMENT_POLICY, ...overrides }
  });
}

describe("crypto settlement amounts", () => {
  it("settles an exact payment with no note to raise", () => {
    const outcome = evaluate(quoted);

    expect(outcome.kind).toBe("settled");
    expect(settlementOutcomeGrantsAccess(outcome)).toBe(true);
  });

  it("does not grant access on a real shortfall, and says how much is missing", () => {
    // 1 USDC short, far past any tolerance.
    const outcome = evaluate(quoted - 1_000_000n);

    expect(outcome.kind).toBe("insufficient");
    expect(settlementOutcomeGrantsAccess(outcome)).toBe(false);
    expect(outcome).toMatchObject({ shortfallAtomic: 1_000_000n });
    expect(outcome.note).toContain("1000000 more");
  });

  it("forgives a few cents, so a custodial withdrawal fee does not cost a member their access", () => {
    // The failure this prevents: PayPal or an exchange deducts its fee from the
    // amount sent, the member pays, and receives nothing.
    const outcome = evaluate(quoted - 5_000n);

    expect(outcome.kind).toBe("settled_underpaid_within_tolerance");
    expect(settlementOutcomeGrantsAccess(outcome)).toBe(true);
  });

  it("refuses to grant on a large shortfall even when a tolerance is configured", () => {
    // 1% tolerance is 189900 atomic units; a 1 USDC shortfall is far past it.
    const outcome = evaluate(quoted - 1_000_000n, { underpaymentToleranceBps: 100 });

    expect(outcome.kind).toBe("insufficient");
    expect(settlementOutcomeGrantsAccess(outcome)).toBe(false);
  });

  it("settles a shortfall inside the configured tolerance and records it", () => {
    const outcome = evaluate(quoted - 1_000n, { underpaymentToleranceBps: 100 });

    expect(outcome.kind).toBe("settled_underpaid_within_tolerance");
    expect(settlementOutcomeGrantsAccess(outcome)).toBe(true);
    expect(outcome.note).toContain("inside the configured tolerance");
  });

  it("caps the tolerance in absolute terms, so an expensive plan does not forgive more", () => {
    // 50 bps of the $999 lifetime plan would be about $5. The cap holds it to
    // $0.25, the same as every other plan.
    const lifetime = 999_000_000n;

    expect(evaluateCryptoSettlement({
      quotedAmountAtomic: lifetime,
      confirmedAmountAtomic: lifetime - 250_000n,
      policy: DEFAULT_CRYPTO_SETTLEMENT_POLICY
    }).kind).toBe("settled_underpaid_within_tolerance");

    expect(evaluateCryptoSettlement({
      quotedAmountAtomic: lifetime,
      confirmedAmountAtomic: lifetime - 250_001n,
      policy: DEFAULT_CRYPTO_SETTLEMENT_POLICY
    }).kind).toBe("insufficient");
  });

  it("keeps the tolerance proportional when that is smaller than the cap", () => {
    // 50 bps of the $9.99 weekly plan is about $0.05, well under the $0.25 cap.
    const weekly = 9_990_000n;

    expect(evaluateCryptoSettlement({
      quotedAmountAtomic: weekly,
      confirmedAmountAtomic: weekly - 49_950n,
      policy: DEFAULT_CRYPTO_SETTLEMENT_POLICY
    }).kind).toBe("settled_underpaid_within_tolerance");

    expect(evaluateCryptoSettlement({
      quotedAmountAtomic: weekly,
      confirmedAmountAtomic: weekly - 60_000n,
      policy: DEFAULT_CRYPTO_SETTLEMENT_POLICY
    }).kind).toBe("insufficient");
  });

  it("grants on a small overpayment without flagging it", () => {
    // 1% flag threshold is 189900; 1000 over is well inside it.
    expect(evaluate(quoted + 1_000n).kind).toBe("settled");
  });

  it("grants on a large overpayment and records it, since cruush does not refund", () => {
    const outcome = evaluate(quoted + 5_000_000n);

    expect(outcome.kind).toBe("settled_overpaid");
    expect(settlementOutcomeGrantsAccess(outcome)).toBe(true);
    expect(outcome).toMatchObject({ excessAtomic: 5_000_000n });
    expect(outcome.note).toContain("recorded for support visibility");
    expect(outcome.note).not.toContain("refund");
  });

  it("treats two half payments that add up as one settled payment", () => {
    // The watcher sums confirmed transfers before calling this, so the sum is
    // what matters, not how many transactions it arrived in.
    expect(evaluate(quoted / 2n + quoted / 2n).kind).toBe("settled");
  });

  it("refuses to evaluate an intent that was never quoted an amount", () => {
    expect(() => evaluateCryptoSettlement({
      quotedAmountAtomic: 0n,
      confirmedAmountAtomic: 1n,
      policy: DEFAULT_CRYPTO_SETTLEMENT_POLICY
    })).toThrow(/positive quoted amount/);
  });
});

describe("late arrival", () => {
  it("settles money that arrives after expiry, because a transfer cannot be undone", () => {
    expect(lateArrivalIsSettleable({ status: "expired", policy: DEFAULT_CRYPTO_SETTLEMENT_POLICY })).toBe(true);
    expect(DEFAULT_CRYPTO_SETTLEMENT_POLICY.acceptLatePayment).toBe(true);
  });

  it("leaves expired intents alone when late payment is turned off", () => {
    expect(lateArrivalIsSettleable({
      status: "expired",
      policy: { ...DEFAULT_CRYPTO_SETTLEMENT_POLICY, acceptLatePayment: false }
    })).toBe(false);
  });

  it("watches open intents and never revives a terminal one", () => {
    expect(lateArrivalIsSettleable({ status: "awaiting_payment", policy: DEFAULT_CRYPTO_SETTLEMENT_POLICY })).toBe(true);
    expect(lateArrivalIsSettleable({ status: "confirming", policy: DEFAULT_CRYPTO_SETTLEMENT_POLICY })).toBe(true);

    for (const status of ["failed", "cancelled", "refunded", "paid"]) {
      expect(
        lateArrivalIsSettleable({ status, policy: DEFAULT_CRYPTO_SETTLEMENT_POLICY }),
        `${status} must not be settleable`
      ).toBe(false);
    }
  });
});
