import type {
  CryptoPaymentNetwork,
  CryptoPaymentRailId,
  CryptoSendingApp,
} from '../lib/cryptoCheckoutApi';

export const CRYPTO_SENDING_APP_LABELS: Record<CryptoSendingApp, string> = {
  cash_app: 'Cash App',
  paypal: 'PayPal',
  venmo: 'Venmo',
  wallet: 'A crypto wallet',
};

export type CryptoPaymentSource = {
  /** One entry per app and rail pair; the id names both. */
  id: string;
  rail: CryptoPaymentRailId;
  sendingApp: CryptoSendingApp;
  label: string;
  asset: string;
  network: string;
  availabilityNote?: string;
};

// Cash App, PayPal and Venmo each send Bitcoin on-chain, so every app is
// listed on the Bitcoin rail as well as on its stablecoin rail. A source is
// only shown while its rail is ready.
export const CRYPTO_PAYMENT_SOURCES: ReadonlyArray<CryptoPaymentSource> = [
  {
    id: 'cash_app_usdc_arbitrum',
    rail: 'usdc_arbitrum',
    sendingApp: 'cash_app',
    label: 'Cash App',
    asset: 'USDC',
    network: 'Arbitrum',
    availabilityNote: 'Cash App stablecoin transfers are not available to New York residents. If that applies to you, choose Bitcoin for Cash App, or another available method.',
  },
  { id: 'paypal_pyusd_arbitrum', rail: 'pyusd_arbitrum', sendingApp: 'paypal', label: 'PayPal', asset: 'PYUSD', network: 'Arbitrum' },
  { id: 'venmo_pyusd_ethereum', rail: 'pyusd_ethereum', sendingApp: 'venmo', label: 'Venmo', asset: 'PYUSD', network: 'Ethereum' },
  { id: 'wallet_usdc_base', rail: 'usdc_base', sendingApp: 'wallet', label: 'A crypto wallet', asset: 'USDC', network: 'Base' },
  { id: 'cash_app_btc_bitcoin', rail: 'btc_bitcoin', sendingApp: 'cash_app', label: 'Cash App', asset: 'BTC', network: 'Bitcoin' },
  { id: 'paypal_btc_bitcoin', rail: 'btc_bitcoin', sendingApp: 'paypal', label: 'PayPal', asset: 'BTC', network: 'Bitcoin' },
  { id: 'venmo_btc_bitcoin', rail: 'btc_bitcoin', sendingApp: 'venmo', label: 'Venmo', asset: 'BTC', network: 'Bitcoin' },
  { id: 'wallet_btc_bitcoin', rail: 'btc_bitcoin', sendingApp: 'wallet', label: 'A crypto wallet', asset: 'BTC', network: 'Bitcoin' },
];

/** The source an existing order was started from: its app on its rail, or the rail's first source for older orders. */
export function cryptoPaymentSourceForIntent(intent: { rail: CryptoPaymentRailId; sendingApp?: CryptoSendingApp | null }) {
  return CRYPTO_PAYMENT_SOURCES.find((source) => source.rail === intent.rail && source.sendingApp === intent.sendingApp)
    ?? CRYPTO_PAYMENT_SOURCES.find((source) => source.rail === intent.rail)
    ?? null;
}

type PaymentMethodGuide = {
  title: string;
  steps: readonly string[];
};

const PAYMENT_METHOD_GUIDES: Partial<Record<CryptoPaymentRailId, readonly PaymentMethodGuide[]>> = {
  btc_bitcoin: [{
    title: 'Cash App, PayPal or Venmo',
    steps: [
      'Open Bitcoin in your payment app and choose Send to an external Bitcoin address.',
      'Paste the order address from cruush or scan its QR code. Use the Bitcoin network, not Lightning.',
      'Enter the BTC amount shown by cruush. The amount stays fixed for this order.',
      'Cash App requires at least 0.00005 BTC for an on-chain send. Its free Standard option requires at least 0.001 BTC and can take up to 24 hours.',
      'PayPal and Venmo require at least 0.001 BTC for an external send. For smaller orders, choose another available method.',
      'Check the app’s sending fee and total before sending. Keep enough Bitcoin in your balance to cover both the payment and that fee.',
      'Payment must arrive on-chain before the order timer ends. Checkout then tracks 0/6 through 6/6 confirmations; six averages about an hour after broadcast with prompt inclusion, but can take longer.',
    ],
  }],
  usdc_arbitrum: [{
    title: 'Cash App',
    steps: [
      'Confirm you are eligible. Cash App says stablecoin transfers are not available to New York residents.',
      'Open Cash App and go to the Payment tab.',
      'Copy the order address from cruush and paste it into the Cash App search bar.',
      'Enter the exact dollar amount shown by cruush. Cash App sends it as USDC.',
      'When Cash App shows the network, choose Arbitrum.',
      'If Arbitrum is not listed, do not send. Choose another available payment method.',
      'Check the total Cash App will charge, including any sending fee. Allow time for payment to arrive on-chain before the cruush order timer reaches 0.',
    ],
  }],
  pyusd_arbitrum: [{
    title: 'PayPal',
    steps: [
      'Open PayPal, go to Finances, and open your PayPal USD (PYUSD) balance.',
      'Tap the transfer arrows, tap Send, then paste or scan the order address from cruush.',
      'On the blockchain network confirmation screen, confirm the network is Arbitrum.',
      'If the screen does not say Arbitrum, do not send. Choose another available payment method.',
      'Enter the exact PYUSD amount shown by cruush.',
      'Review the amount, network, address, and PayPal sending fee. Allow time for payment to arrive on-chain before the cruush order timer reaches 0.',
    ],
  }],
  pyusd_ethereum: [{
    title: 'Venmo',
    steps: [
      'Open the Crypto tab in Venmo and choose PayPal USD (PYUSD).',
      'Tap the transfer arrows, choose Send, then paste or scan the order address from cruush.',
      'Select Ethereum as the network. Do not choose Solana.',
      'Enter the exact PYUSD amount shown by cruush. Venmo requires at least 10 PYUSD for an external Ethereum transfer.',
      'Review the total, including Venmo’s sending fee, and make sure your balance covers it.',
      'Allow time for payment to arrive on-chain before the cruush order timer reaches 0.',
    ],
  }],
  usdc_base: [{
    title: 'Crypto wallet',
    steps: [
      'Open your wallet or exchange and choose Send.',
      'Choose USDC as the asset and Base as the network.',
      'Paste the order address from cruush or scan its QR code.',
      'Enter the exact USDC amount shown by cruush.',
      'Sending fees are not included. Check the fee in your wallet and keep enough to cover it separately.',
      'Check the amount, network, and address. Allow time for payment to arrive on-chain before the cruush order timer reaches 0.',
    ],
  }],
};

export const CRYPTO_NETWORK_LABELS: Record<CryptoPaymentNetwork, string> = {
  bitcoin: 'Bitcoin',
  arbitrum: 'Arbitrum',
  base: 'Base',
  ethereum: 'Ethereum',
};

export const BITCOIN_SENDING_HELP = {
  cash_app: 'https://cash.app/help/us/en-us/3106-bitcoin-withdrawals',
  paypal: 'https://www.paypal.com/us/cshelp/article/how-do-i-transfer-my-crypto-help822',
  venmo: 'https://help.venmo.com/cs/articles/crypto-transfers-vhel232',
} as const;

export function CryptoPaymentMethodInstructions({ rail, sendingApp }: { rail: CryptoPaymentRailId; sendingApp?: CryptoSendingApp }) {
  const guides = rail === 'btc_bitcoin' && sendingApp === 'wallet'
    ? [{ title: 'A crypto wallet', steps: [
        'Open your wallet and choose Send Bitcoin.',
        ...(PAYMENT_METHOD_GUIDES.btc_bitcoin?.[0]?.steps ?? []).slice(1).filter(step => !step.startsWith('Cash App requires') && !step.startsWith('PayPal and Venmo require')),
      ] }]
    : PAYMENT_METHOD_GUIDES[rail] ?? [];

  return (
    <div className="space-y-3">
      {guides.map((guide) => (
        <section className="rounded-lg border border-border bg-muted/30 p-3" key={guide.title}>
          <h3 className="text-sm font-semibold">{guide.title}</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted-foreground sm:text-xs sm:leading-5">
            {guide.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          {rail === 'btc_bitcoin' && sendingApp && sendingApp !== 'wallet' ? (
            <a className="mt-2 inline-block text-sm text-primary underline sm:text-xs" href={BITCOIN_SENDING_HELP[sendingApp]} target="_blank" rel="noopener noreferrer">
              {CRYPTO_SENDING_APP_LABELS[sendingApp]} Bitcoin sending instructions
            </a>
          ) : null}
        </section>
      ))}
    </div>
  );
}
