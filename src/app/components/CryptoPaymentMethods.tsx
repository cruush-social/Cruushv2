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
    availabilityNote: 'Cash App stablecoin transfers are not available to New York residents. If that applies to you, choose another available method.',
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
      'Open PayPal, go to Finances, and open PayPal USD (PYUSD). Before starting a timed cruush order, have enough PYUSD available to transfer. If needed, buy it and wait until PayPal allows the transfer.',
      'Tap the transfer arrows, choose Send, then paste the order address from cruush or scan its QR code.',
      'Confirm Arbitrum (Arbitrum One) on the network screen. If Arbitrum is unavailable, choose another cruush payment method before sending.',
      'Use Copy amount in cruush and enter that exact amount of PYUSD. It includes the cruush processing fee.',
      'Review the address, network and PayPal sending fee. Keep enough PYUSD to cover the payment and any fee PayPal shows. PayPal handles the network fee; you do not need a separate ETH balance in PayPal.',
      'Send while the order timer is running, allowing time for the transfer to arrive. Return to cruush to track confirmation. If you already sent payment, do not send it again while confirmation is pending.',
    ],
  }],
  pyusd_ethereum: [{
    title: 'Venmo',
    steps: [
      'Open the Crypto tab in Venmo and choose PayPal USD (PYUSD). Before starting a timed cruush order, have enough PYUSD available to transfer and complete any identity verification Venmo requires.',
      'Tap the transfer arrows, choose Send, then paste the order address from cruush or scan its QR code. Choose an external wallet if asked for the recipient type.',
      'Select Ethereum as the network. This order does not accept PYUSD on Solana.',
      'Use Copy amount in cruush and enter that exact amount of PYUSD. It includes the cruush processing fee. Venmo requires at least 10 PYUSD for an external Ethereum transfer.',
      'Review the address, network and Venmo sending fee. Keep enough PYUSD to cover the payment and any fee Venmo shows. Venmo handles the network fee; you do not need a separate ETH balance in Venmo.',
      'Send while the order timer is running, allowing time for the transfer to arrive. Return to cruush to track confirmation. If you already sent payment, do not send it again while confirmation is pending.',
    ],
  }],
  usdc_base: [{
    title: 'Crypto wallet',
    steps: [
      'Open your wallet or exchange. Before starting a timed cruush order, have enough USDC on Base available to send. USDC on another network cannot pay this order.',
      'Choose Send, select USDC as the asset and Base as the network, then paste the order address from cruush or scan its QR code.',
      'Use Copy amount in cruush and enter that exact amount of USDC. It includes the cruush processing fee.',
      'A self-custody wallet also needs ETH on Base for its sending fee. If you are withdrawing from an exchange, review its withdrawal fee and minimum instead.',
      'Check that the recipient will receive the full USDC amount shown by cruush after any withdrawal-fee deduction. Confirm the Base network and the order address.',
      'Send while the order timer is running, allowing time for the transfer to arrive. Return to cruush to track confirmation. If you already sent payment, do not send it again while confirmation is pending.',
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
        <section className="border-t border-border px-0 py-3 first:border-t-0" key={guide.title}>
          <h3 className="text-sm font-semibold">{guide.title}</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
            {guide.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          {rail === 'btc_bitcoin' && sendingApp && sendingApp !== 'wallet' ? (
            <a className="mt-2 inline-block text-sm text-primary underline" href={BITCOIN_SENDING_HELP[sendingApp]} target="_blank" rel="noopener noreferrer">
              {CRYPTO_SENDING_APP_LABELS[sendingApp]} Bitcoin sending instructions
            </a>
          ) : null}
        </section>
      ))}
    </div>
  );
}
