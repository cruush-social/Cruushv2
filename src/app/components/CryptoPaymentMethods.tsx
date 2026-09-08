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
    availabilityNote: 'Cash App stablecoin transfers are not available to New York residents. If that applies to you, choose PayPal or a crypto wallet.',
  },
  { rail: 'pyusd_arbitrum', label: 'PayPal', asset: 'PYUSD', network: 'Arbitrum' },
  { rail: 'usdc_base', label: 'A crypto wallet', asset: 'USDC', network: 'Base' },
];

type PaymentMethodGuide = {
  title: string;
  steps: readonly string[];
};

const PAYMENT_METHOD_GUIDES: Partial<Record<CryptoPaymentRailId, readonly PaymentMethodGuide[]>> = {
  usdc_arbitrum: [{
    title: 'Cash App',
    steps: [
      'Confirm you are eligible. Cash App says stablecoin transfers are not available to New York residents.',
      'Open Cash App and go to the Payment tab.',
      'Copy the order address from cruush and paste it into the Cash App search bar.',
      'Enter the exact dollar amount shown by cruush. Cash App sends it as USDC.',
      'When Cash App shows the network, choose Arbitrum.',
      'If Arbitrum is not listed, do not send. Choose another available payment method.',
      'Check the amount and address, then send before the cruush order timer reaches 0.',
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
      'Review the amount, network, and address, then tap Send Now before the cruush order timer reaches 0.',
    ],
  }],
  usdc_base: [{
    title: 'Crypto wallet',
    steps: [
      'Open your wallet or exchange and choose Send.',
      'Choose USDC as the asset and Base as the network.',
      'Paste the order address from cruush or scan its QR code.',
      'Enter the exact USDC amount shown by cruush.',
      'Check the amount, network, and address, then send before the cruush order timer reaches 0.',
    ],
  }],
};

export const CRYPTO_NETWORK_LABELS: Record<CryptoPaymentNetwork, string> = {
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
