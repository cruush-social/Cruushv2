/** Customer balance guidance, never a fee charged or an authenticated app quote.
 * Policy: $5 minimum (Ethereum $10), 10% of the purchase rounded up to $1,
 * and three times the observed collection cost, whichever is greater.
 * Network costs can exceed the allowance; the customer's app gives the final fee.
 */

/** The app a member sends from, as the checkout records it on the order. */
export const CRYPTO_SENDING_APPS = ["cash_app", "paypal", "venmo", "wallet"] as const;
export type CryptoSendingApp = typeof CRYPTO_SENDING_APPS[number];

const SENDING_APP_LABELS: Record<Exclude<CryptoSendingApp, "wallet">, string> = {
  cash_app: "Cash App",
  paypal: "PayPal",
  venmo: "Venmo"
};

export function isCryptoSendingApp(value: unknown): value is CryptoSendingApp {
  return typeof value === "string" && (CRYPTO_SENDING_APPS as readonly string[]).includes(value);
}

/**
 * Which apps an estimate covers. On the Bitcoin rail the recorded app narrows
 * it to that one app; a wallet has no app minimum and gets none; an order
 * recorded before the app was stored keeps every app's guidance. The
 * stablecoin rails each belong to one app.
 */
function sendingAppsFor(rail: string, sendingApp: CryptoSendingApp | null | undefined) {
  if (rail === 'btc_bitcoin') {
    if (sendingApp === 'wallet') return [];
    if (sendingApp) return [SENDING_APP_LABELS[sendingApp]];
    return ['Cash App', 'PayPal', 'Venmo'];
  }
  return rail === 'usdc_arbitrum' ? ['Cash App']
    : rail === 'pyusd_arbitrum' ? ['PayPal']
    : rail === 'pyusd_ethereum' ? ['Venmo'] : [];
}

export function cryptoFundingEstimates(input: { rail: string; sendingApp?: CryptoSendingApp | null; amountUsdCents: number; gasFeeUsdCents: number; quotedAmountAtomic: string | null }) {
  const apps = sendingAppsFor(input.rail, input.sendingApp);
  const total = input.amountUsdCents + input.gasFeeUsdCents;
  if (!apps.length || !input.quotedAmountAtomic || !/^\d+$/.test(input.quotedAmountAtomic) || total <= 0) return [];
  const minimum = input.rail === 'pyusd_ethereum' ? 1000 : 500;
  const allowanceUsdCents = Math.max(minimum, Math.ceil(input.amountUsdCents / 1000) * 100, Math.ceil(input.gasFeeUsdCents * 3 / 100) * 100);
  const quote = BigInt(input.quotedAmountAtomic);
  const allowanceAtomic = (quote * BigInt(allowanceUsdCents) + BigInt(total) - 1n) / BigInt(total);
  return apps.map(app => {
    // These are recipient minimums. Buying more cannot make a smaller exact order eligible.
    const minimumSendAtomic = input.rail === 'btc_bitcoin'
      ? (app === 'Cash App' ? '5000' : '100000')
      : input.rail === 'pyusd_ethereum' ? '10000000' : input.rail === 'pyusd_arbitrum' ? '1000000' : undefined;
    return { app, minimumSendAtomic, meetsSendingMinimum: minimumSendAtomic === undefined ? true : quote >= BigInt(minimumSendAtomic), allowanceUsdCents, availableUsdCents: total + allowanceUsdCents, availableAtomic: (quote + allowanceAtomic).toString(), estimated: true as const };
  });
}
