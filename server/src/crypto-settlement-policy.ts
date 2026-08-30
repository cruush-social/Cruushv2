/**
 * What a given amount of confirmed money means for a payment intent.
 *
 * Every value here is a product decision, not an engineering one. The defaults
 * below are the conservative reading and are marked as needing sign-off in
 * docs/plans/v2-crypto-processor.md. They are gathered in one place so that
 * changing the policy never means editing the watcher.
 *
 * The bias throughout: never take money without granting access, and never
 * grant access silently when something is off. Anything unusual is still
 * settled or still flagged, but it always leaves a note a human can read.
 */

export type CryptoSettlementPolicy = {
  /**
   * Confirmations required before confirmed money counts. 1 is the current
   * placeholder from the original plan and is NOT a production decision.
   */
  confirmationTarget: number;
  /**
   * Underpayment this small is treated as full payment, expressed in basis
   * points of the quoted amount.
   *
   * An ERC-20 transfer pays gas separately in the chain's native token, so the
   * token amount is normally exactly what the sender typed. The gap this covers
   * is the other route in: an exchange or custodial wallet that deducts its own
   * withdrawal fee from the amount sent. Venmo and PayPal sending PYUSD out are
   * exactly that kind of sender.
   *
   * With zero tolerance, that member pays, receives nothing, and has to write
   * to support while cruush holds their money. That is a worse failure than
   * giving away a few cents.
   */
  underpaymentToleranceBps: number;
  /**
   * Hard ceiling on the tolerance above, in atomic units. Without it, a
   * percentage tolerance scales with price, so the $999 lifetime plan would
   * forgive far more than the $9.99 weekly one for no reason. Both rails use
   * 6 decimals, so 250000 is $0.25.
   */
  underpaymentToleranceMaxAtomic: bigint;
  /**
   * Overpayment beyond this is still granted, and recorded rather than passing
   * silently.
   *
   * cruush does not refund, so this flag does not start a refund decision. It
   * exists so that a member who sends $500 for a $9.99 plan by mistake shows up
   * in the reconciliation report instead of vanishing into the treasury
   * unnoticed. What happens next is a human's call, not the processor's.
   */
  overpaymentFlagBps: number;
  /**
   * Whether money that arrives after the checkout window expired can still
   * settle. A transfer is irreversible; refusing it would mean keeping funds
   * and giving nothing, so this defaults to true.
   */
  acceptLatePayment: boolean;
  /**
   * How long after expiry an abandoned checkout keeps being watched.
   *
   * Without a bound, accepting late payment means every abandoned checkout is
   * watched forever, so the watch set only ever grows and the watcher keeps
   * polling for eternity on behalf of payments that will never arrive. That is
   * the single largest long-run cost in this design, and it is pure waste.
   *
   * Seven days is long enough to cover someone who started a checkout, got
   * distracted, and finished days later, while keeping the watch set bounded.
   * Money arriving after the window is not lost: it still lands in a wallet
   * cruush controls, and the reconciliation report can still find it by address
   * or transaction hash. It just is not settled automatically.
   */
  lateArrivalWatchDays: number;
};

export const DEFAULT_CRYPTO_SETTLEMENT_POLICY: CryptoSettlementPolicy = {
  // Overridden per rail by CRYPTO_PAYMENT_RAILS; see resolveSettlementPolicy.
  // This standalone default is deliberately cautious rather than 1.
  confirmationTarget: 30,
  underpaymentToleranceBps: 50,
  underpaymentToleranceMaxAtomic: 250_000n,
  overpaymentFlagBps: 100,
  acceptLatePayment: true,
  lateArrivalWatchDays: 7
};

export type SettlementOutcome =
  | { kind: "insufficient"; shortfallAtomic: bigint; note: string }
  | { kind: "settled"; note: null }
  | { kind: "settled_underpaid_within_tolerance"; shortfallAtomic: bigint; note: string }
  | { kind: "settled_overpaid"; excessAtomic: bigint; note: string };

function basisPointsOf(value: bigint, bps: number) {
  if (bps <= 0) {
    return 0n;
  }

  return (value * BigInt(Math.trunc(bps))) / 10_000n;
}

/**
 * Decides what confirmed money means against what was quoted. Pure: it reads
 * no clock, no database, and no configuration beyond the policy passed in.
 */
export function evaluateCryptoSettlement(input: {
  quotedAmountAtomic: bigint;
  confirmedAmountAtomic: bigint;
  policy: CryptoSettlementPolicy;
}): SettlementOutcome {
  const { quotedAmountAtomic, confirmedAmountAtomic, policy } = input;

  if (quotedAmountAtomic <= 0n) {
    throw new Error("A payment intent must have a positive quoted amount before it can settle.");
  }

  if (confirmedAmountAtomic < quotedAmountAtomic) {
    const shortfallAtomic = quotedAmountAtomic - confirmedAmountAtomic;
    const proportional = basisPointsOf(quotedAmountAtomic, policy.underpaymentToleranceBps);
    const tolerance = proportional < policy.underpaymentToleranceMaxAtomic
      ? proportional
      : policy.underpaymentToleranceMaxAtomic;

    if (shortfallAtomic <= tolerance) {
      return {
        kind: "settled_underpaid_within_tolerance",
        shortfallAtomic,
        note: `Underpaid by ${shortfallAtomic} atomic units, inside the configured tolerance. Granted.`
      };
    }

    return {
      kind: "insufficient",
      shortfallAtomic,
      note: `Received ${confirmedAmountAtomic} of ${quotedAmountAtomic} atomic units. Waiting for ${shortfallAtomic} more.`
    };
  }

  const excessAtomic = confirmedAmountAtomic - quotedAmountAtomic;
  const flagThreshold = basisPointsOf(quotedAmountAtomic, policy.overpaymentFlagBps);

  if (excessAtomic > flagThreshold) {
    return {
      kind: "settled_overpaid",
      excessAtomic,
      note: `Overpaid by ${excessAtomic} atomic units. Granted, and recorded for support visibility.`
    };
  }

  return { kind: "settled", note: null };
}

export function settlementOutcomeGrantsAccess(outcome: SettlementOutcome) {
  return outcome.kind !== "insufficient";
}

/**
 * Whether an intent that has already passed its checkout window may still be
 * settled by money that has now arrived. Kept separate from the amount
 * decision because it is a different question with a different answer.
 */
export function lateArrivalIsSettleable(input: {
  status: string;
  policy: CryptoSettlementPolicy;
}) {
  if (input.status === "expired") {
    return input.policy.acceptLatePayment;
  }

  // Anything already terminal for a non-timing reason stays terminal.
  return input.status === "awaiting_payment" || input.status === "confirming";
}
