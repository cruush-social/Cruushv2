import type {
  CryptoPaymentNetwork,
  CryptoPaymentRailId,
} from '../lib/cryptoCheckoutApi';

export const CRYPTO_PAYMENT_SOURCES: ReadonlyArray<{
  rail: CryptoPaymentRailId;
  label: string;
  asset: string;
  network: string;
  availabilityNote?: string;
}> = [
  {
    rail: 'usdc_arbitrum',
    label: 'Cash App',
    asset: 'USDC',
    network: 'Arbitrum',
    availabilityNote: 'Cash App stablecoin transfers are not available to New York residents. If that applies to you, choose Bitcoin for Cash App, or another available method.',
  },
  { rail: 'pyusd_arbitrum', label: 'PayPal', asset: 'PYUSD', network: 'Arbitrum' },
  { rail: 'pyusd_ethereum', label: 'Venmo', asset: 'PYUSD', network: 'Ethereum' },
  { rail: 'usdc_base', label: 'A crypto wallet', asset: 'USDC', network: 'Base' },
  { rail: 'btc_bitcoin', label: 'Bitcoin', asset: 'BTC', network: 'Bitcoin', availabilityNote: 'Send Bitcoin with Cash App, PayPal or Venmo. Cash App supports on-chain Bitcoin in New York. Each app has its own sending minimum and fees.' },
];

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

export function CryptoPaymentMethodInstructions({ rail }: { rail: CryptoPaymentRailId }) {
  const guides = PAYMENT_METHOD_GUIDES[rail] ?? [];

  return (
    <div className="space-y-3">
      {guides.map((guide) => (
        <section className="rounded-lg border border-border bg-muted/30 p-3" key={guide.title}>
          <h3 className="text-sm font-semibold">{guide.title}</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
            {guide.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>
      ))}
    </div>
  );
}
