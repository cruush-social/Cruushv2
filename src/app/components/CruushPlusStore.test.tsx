import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CruushPlusStore from './CruushPlusStore';

vi.mock('../lib/billingApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/billingApi')>('../lib/billingApi');

  return {
    ...actual,
    getBillingPlans: vi.fn(),
  };
});

vi.mock('../lib/cryptoCheckoutApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/cryptoCheckoutApi')>(
    '../lib/cryptoCheckoutApi',
  );

  return {
    ...actual,
    getCryptoProcessorStatus: vi.fn(),
    createCryptoPaymentIntent: vi.fn(),
    getCryptoPaymentIntent: vi.fn(),
  };
});

const { getBillingPlans } = await import('../lib/billingApi');
const { createCryptoPaymentIntent, getCryptoProcessorStatus } = await import(
  '../lib/cryptoCheckoutApi'
);

const plans = [
  {
    id: 'plus_monthly' as const,
    name: 'Monthly cruush+',
    description: '$18.99 monthly cruush+ access.',
    amountCents: 1899,
    currency: 'USD' as const,
    interval: 'month' as const,
    durationMonths: 1,
    supplyRemaining: null,
    isFounder: false,
    isLifetime: false,
    badgeKeys: [],
  },
];

// A fuller catalogue, used for the pricing-presentation tests. The monthly
// plan is the reference every saving is measured against.
const conversionPlans = [
  { ...plans[0]! },
  {
    id: 'plus_annual' as const,
    name: 'Annual cruush+',
    description: '$119.99 per year for cruush+.',
    amountCents: 11999,
    currency: 'USD' as const,
    interval: 'year' as const,
    durationMonths: 12,
    supplyRemaining: null,
    isFounder: false,
    isLifetime: false,
    badgeKeys: [],
  },
  {
    id: 'founder_annual' as const,
    name: 'Founder annual cruush+',
    description: '$99.99 for one year of cruush+.',
    amountCents: 9999,
    currency: 'USD' as const,
    interval: 'year' as const,
    durationMonths: 12,
    supplyRemaining: 742,
    isFounder: true,
    isLifetime: false,
    badgeKeys: ['founder' as const],
  },
];

function renderStore() {
  return render(
    <MemoryRouter>
      <CruushPlusStore />
    </MemoryRouter>,
  );
}

describe('CruushPlusStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBillingPlans).mockResolvedValue({
      processor: 'fake',
      testCheckout: true,
      testWarning: 'TEST CHECKOUT - no real payment will be collected.',
      currency: 'USD',
      plans,
    });
  });

  describe('pricing presentation', () => {
    beforeEach(() => {
      vi.mocked(getCryptoProcessorStatus).mockResolvedValue({
        ready: false,
        asset: 'USDC',
        network: 'base',
        confirmationTarget: 1,
      });
      vi.mocked(getBillingPlans).mockResolvedValue({
        processor: 'fake',
        testCheckout: true,
        testWarning: 'TEST CHECKOUT - no real payment will be collected.',
        currency: 'USD',
        plans: conversionPlans,
      });
    });

    it('defaults to the best-value term rather than the cheapest one', async () => {
      // Defaulting to the cheapest plan anchors every other price against it.
      renderStore();

      expect(
        await screen.findByRole('button', { name: /get 1 year for \$99\.99/i }),
      ).toBeInTheDocument();
    });

    it('shows the per-month equivalent so a longer term reads as a better deal', async () => {
      renderStore();

      // $99.99 a year is $8.33 a month; $119.99 a year is $10.00.
      expect(await screen.findByText('$8.33/month')).toBeInTheDocument();
      expect(screen.getByText('$10.00/month')).toBeInTheDocument();
    });

    it('shows the saving against the monthly price, and never on the monthly plan itself', async () => {
      renderStore();

      // $8.33 against $18.99 is 56%; $10.00 against $18.99 is 47%.
      expect(await screen.findByText('Save 56%')).toBeInTheDocument();
      expect(screen.getByText('Save 47%')).toBeInTheDocument();
      expect(screen.queryByText('Save 0%')).not.toBeInTheDocument();
    });

    it('shows real scarcity on a limited plan', async () => {
      renderStore();

      expect(await screen.findByText(/742 left/)).toBeInTheDocument();
    });

    it('does not offer a sold-out plan', async () => {
      vi.mocked(getBillingPlans).mockResolvedValue({
        processor: 'fake',
        testCheckout: true,
        testWarning: 'TEST CHECKOUT - no real payment will be collected.',
        currency: 'USD',
        plans: conversionPlans.map((plan) =>
          plan.id === 'founder_annual' ? { ...plan, supplyRemaining: 0 } : plan,
        ),
      });

      renderStore();

      // The sold-out founder plan must not become the default selection.
      expect(
        await screen.findByRole('button', { name: /get 1 year for \$119\.99/i }),
      ).toBeInTheDocument();
      expect(screen.getByText('Sold out')).toBeInTheDocument();
    });
  });

  it('shows the real plan price and explains why cruush takes crypto', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue({
      ready: false,
      asset: 'USDC',
      network: 'base',
      confirmationTarget: 1,
    });

    renderStore();

    expect(await screen.findByText('$18.99')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /why cruush takes crypto/i }));
    expect(await screen.findByText(/checkout supports USDC on Base and PYUSD on Ethereum/i)).toBeInTheDocument();
    expect(screen.queryByText(/licensed processor/i)).not.toBeInTheDocument();
  });

  it('never starts a payment while the processor is not ready', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue({
      ready: false,
      asset: 'USDC',
      network: 'base',
      confirmationTarget: 1,
    });

    renderStore();

    const payButton = await screen.findByRole('button', { name: /get 1 month for \$18\.99/i });
    expect(payButton).toBeDisabled();

    fireEvent.click(payButton);
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it('starts one seamless Base USDC payment once the processor is ready', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue({
      ready: true,
      asset: 'USDC',
      network: 'base',
      confirmationTarget: 1,
    });
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'USDC',
      network: 'base',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: '0x73659c60270d326c06Ac204F1A9C63f889a3D14B',
      status: 'awaiting_payment',
      expiresAt: null,
      createdAt: null,
      updatedAt: null,
      paidAt: null,
    });

    renderStore();

    fireEvent.click(await screen.findByRole('button', { name: /get 1 month for \$18\.99/i }));

    await waitFor(() => {
      expect(createCryptoPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'plus_monthly',
          idempotencyKey: expect.any(String),
        }),
      );
    });

    expect(await screen.findByText(/waiting for your payment to arrive/i)).toBeInTheDocument();
    expect(screen.getByText('18.99 USDC')).toBeInTheDocument();
    expect(screen.getByText('0x73659c60270d326c06Ac204F1A9C63f889a3D14B')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payment started' })).toBeDisabled();
    expect(createCryptoPaymentIntent).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/voucher/i)).not.toBeInTheDocument();
  });

  it('shows the payment QR code once the server returns one', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue({
      ready: true,
      asset: 'USDC',
      network: 'base',
      confirmationTarget: 1,
    });
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'USDC',
      network: 'base',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: '0x73659c60270d326c06Ac204F1A9C63f889a3D14B',
      paymentUri:
        'ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=0x73659c60270d326c06Ac204F1A9C63f889a3D14B&uint256=18990000',
      qrCodeDataUrl: 'data:image/png;base64,fake',
      status: 'awaiting_payment',
      expiresAt: null,
      createdAt: null,
      updatedAt: null,
      paidAt: null,
    });

    renderStore();

    fireEvent.click(await screen.findByRole('button', { name: /get 1 month for \$18\.99/i }));

    const qrImage = await screen.findByAltText(/USDC payment address QR code/i);
    expect(qrImage).toHaveAttribute('src', 'data:image/png;base64,fake');
  });

  it('reuses the same idempotency key after an uncertain request failure', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue({
      ready: true,
      asset: 'USDC',
      network: 'base',
      confirmationTarget: 1,
    });
    vi.mocked(createCryptoPaymentIntent)
      .mockRejectedValueOnce(new Error('Connection interrupted.'))
      .mockRejectedValueOnce(new Error('Connection interrupted.'));

    renderStore();

    fireEvent.click(await screen.findByRole('button', { name: /get 1 month for \$18\.99/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted.');
    fireEvent.click(screen.getByRole('button', { name: /get 1 month for \$18\.99/i }));

    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createCryptoPaymentIntent).mock.calls[0]?.[0].idempotencyKey).toBe(
      vi.mocked(createCryptoPaymentIntent).mock.calls[1]?.[0].idempotencyKey,
    );
  });
});
