/** Customer balance guidance, never a fee charged or an authenticated app quote.
 * Policy: $5 minimum (Ethereum $10), 10% of the purchase rounded up to $1,
 * and three times the observed collection cost, whichever is greater.
 * Network costs can exceed the allowance; the customer's app gives the final fee.
 */
export function cryptoFundingEstimates(input: { rail: string; amountUsdCents: number; gasFeeUsdCents: number; quotedAmountAtomic: string | null }) {
  const apps = input.rail === 'btc_bitcoin' ? ['Cash App', 'PayPal', 'Venmo']
    : input.rail === 'usdc_arbitrum' ? ['Cash App']
    : input.rail === 'pyusd_arbitrum' ? ['PayPal']
    : input.rail === 'pyusd_ethereum' ? ['Venmo'] : [];
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
