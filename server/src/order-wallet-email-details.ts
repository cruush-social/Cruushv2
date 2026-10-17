import type { CryptoPaymentIntent } from './crypto-payments.js';

export type OrderWalletEmailDetails = Pick<CryptoPaymentIntent,
  'id' | 'asset' | 'network' | 'sendingApp' | 'amountUsdCents' | 'gasFeeUsdCents' |
  'quotedAmountAtomic' | 'paymentAddress' | 'createdAt' | 'expiresAt' | 'discount' | 'sale'> & { planName: string };

// Match the exact integer quote, never a floating-point price conversion.
export function walletEmailAmount(order: OrderWalletEmailDetails) {
  if (!order.quotedAmountAtomic || !/^\d+$/.test(order.quotedAmountAtomic) || BigInt(order.quotedAmountAtomic) <= 0n
    || !order.paymentAddress || !order.expiresAt || !order.createdAt) throw new Error('Incomplete order email details.');
  const decimals = order.asset === 'BTC' ? 8 : 6;
  const value = BigInt(order.quotedAmountAtomic);
  const unit = 10n ** BigInt(decimals);
  const fraction = (value % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${value / unit}${fraction ? `.${fraction}` : ''}`;
}

export function orderWalletEmailInstructions(order: OrderWalletEmailDetails) {
  const network = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', arbitrum: 'Arbitrum', base: 'Base', 'base-sepolia': 'Base Sepolia (test network)' }[order.network];
  const amount = `${walletEmailAmount(order)} ${order.asset}`;
  const app = order.sendingApp ?? 'wallet';
  const cashStablecoin = app === 'cash_app' && order.asset === 'USDC';
  const names = { paypal: 'PayPal', venmo: 'Venmo', cash_app: 'Cash App', wallet: 'your crypto wallet' };
  const links = {
    paypal: 'https://www.paypal.com/myaccount/crypto/',
    venmo: 'https://venmo.com/',
    cash_app: 'https://cash.app/launch/',
    wallet: null,
  };
  const guides = {
    paypal: 'https://www.paypal.com/us/cshelp/article/how-do-i-transfer-my-crypto-help822',
    venmo: 'https://help.venmo.com/cs/articles/crypto-transfers-vhel232',
    cash_app: cashStablecoin ? 'https://cash.app/press/cash-app-stablecoins-all-customers' : 'https://cash.app/bitcoin',
    wallet: null,
  };
  const supported = app === 'wallet' || (order.asset === 'BTC' && order.network === 'bitcoin')
    || (app === 'paypal' && order.asset === 'PYUSD' && ['arbitrum', 'ethereum'].includes(order.network))
    || (app === 'venmo' && order.asset === 'PYUSD' && order.network === 'ethereum')
    || (app === 'cash_app' && order.asset === 'USDC' && order.network === 'arbitrum');
  if (!supported) return { appName: names[app], appUrl: null, guideUrl: null, network, steps: [
    'Open cruush checkout and check the order ID matches this email.',
    `This order’s ${order.asset} / ${network} payment does not match the ${names[app]} instructions available in cruush. Return to checkout and choose a supported payment method before sending.`,
  ] };
  const opening = app === 'paypal'
    ? `Open PayPal, go to Finances and select ${order.asset}. Use the transfer arrows, then Send to an external wallet.`
    : app === 'venmo'
      ? `Open Venmo, go to the Crypto tab and select ${order.asset}. Use the transfer arrows, then Send to an external wallet.`
      : app === 'cash_app'
        ? cashStablecoin
          ? 'Confirm you are eligible for stablecoin transfers in Cash App. Open the Payment tab and paste the payment wallet ID into the search bar.'
          : 'Open Cash App, go to Money, then Bitcoin. Use the transfer arrows and choose Send to an external Bitcoin address.'
        : `Open your crypto wallet, select ${order.asset} on ${network}, and choose Send.`;
  return { appName: names[app], appUrl: links[app], guideUrl: guides[app], network, steps: [
    'Open cruush checkout and check the order ID matches this email and is still awaiting payment before sending. Do not pay an expired, cancelled or already paid order.',
    opening,
    cashStablecoin
      ? `Enter the dollar amount for exactly ${amount} and select ${network}. Check that Cash App will deliver that full USDC amount to the payment wallet ID. If ${network} is not listed or the received amount differs, do not send; return to checkout.`
      : `Paste the payment wallet ID shown in your order details as the recipient address. Select ${network} and enter exactly ${amount} in crypto units, not an approximate dollar conversion.${order.asset === 'BTC' ? ' Use an on-chain Bitcoin transfer, not Lightning.' : ''}`,
    `Review the address, ${network} network, amount and any sending fee. The order must receive the full ${amount}; your app’s sending fee is separate. Approve the transfer yourself. If this asset or network is unavailable in your app, return to checkout rather than choosing a different network.`,
    'Return to order history to follow payment detection and network confirmations. Your purchase activates after the full amount meets the confirmation target. If you already sent the payment, do not send it again while it is being checked.',
  ] };
}
