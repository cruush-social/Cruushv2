import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CryptoPaymentRailId, CryptoProcessorStatus } from '../lib/cryptoCheckoutApi';
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
    getPulsePacks: vi.fn(),
    createPulsePaymentIntent: vi.fn(),
    getCurrentPulsePaymentIntent: vi.fn(),
    getCryptoProcessorStatus: vi.fn(),
    getCurrentCryptoPaymentIntent: vi.fn(),
    createCryptoPaymentIntent: vi.fn(),
    cancelCryptoPaymentIntent: vi.fn(),
    getCryptoPaymentIntent: vi.fn(),
  };
});

const { getBillingPlans } = await import('../lib/billingApi');
const {
  getPulsePacks, createPulsePaymentIntent, getCurrentPulsePaymentIntent,
  cancelCryptoPaymentIntent,
  createCryptoPaymentIntent,
  getCryptoPaymentIntent,
  getCryptoProcessorStatus,
  getCurrentCryptoPaymentIntent,
} = await import(
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
    id: 'plus_weekly' as const,
    name: 'Weekly cruush+',
    description: '$10.99 weekly cruush+ access.',
    amountCents: 1099,
    currency: 'USD' as const,
    interval: 'week' as const,
    durationDays: 7,
    supplyRemaining: null,
    isFounder: false,
    isLifetime: false,
    badgeKeys: [],
  },
  {
    id: 'plus_6_month' as const,
    name: '6 month cruush+',
    description: '$65.94 every 6 months for cruush+.',
    amountCents: 6594,
    currency: 'USD' as const,
    interval: '6_months' as const,
    durationMonths: 6,
    supplyRemaining: null,
    isFounder: false,
    isLifetime: false,
    badgeKeys: [],
  },
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

const processorRails: CryptoProcessorStatus['rails'] = [
  {
    id: 'usdc_arbitrum',
    asset: 'USDC',
    network: 'arbitrum',
    chainId: 42161,
    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    ready: false,
  },
  {
    id: 'pyusd_arbitrum',
    asset: 'PYUSD',
    network: 'arbitrum',
    chainId: 42161,
    tokenAddress: '0x46850aD61C2B7d64d08c9C754F45254596696984',
    ready: false,
  },
  {
    id: 'pyusd_ethereum',
    asset: 'PYUSD',
    network: 'ethereum',
    chainId: 1,
    tokenAddress: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
    ready: false,
  },
  {
    id: 'usdc_base',
    asset: 'USDC',
    network: 'base',
    chainId: 8453,
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ready: false,
  },
];

function processorStatus(readyRailIds: CryptoPaymentRailId[] = []): CryptoProcessorStatus {
  return {
    ready: readyRailIds.length > 0,
    asset: 'USDC',
    network: 'arbitrum',
    confirmationTarget: 1,
    rails: processorRails.map((rail) => ({
      ...rail,
      ready: readyRailIds.includes(rail.id),
    })),
  };
}

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
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue(null);
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
      vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());
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
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it('never shows a monthly rate on a term shorter than a month', async () => {
      // $10.99 for seven days is $47.10 a month on paper, which is meaningless to
      // someone buying a week and makes the cheapest entry point look like the
      // most expensive thing on the page.
      renderStore();

      fireEvent.click(await screen.findByRole('button', { name: /compare plans/i }));
      expect(await screen.findByText('7 days')).toBeInTheDocument();
      expect(screen.queryByText(/47\.10\/month/)).not.toBeInTheDocument();
    });

    it('puts the monthly rate on the right and the purchase price plus processing fee under the term', async () => {
      renderStore();

      // The comparison number gets the prominent right-hand price position.
      expect(await screen.findByText('$8.33/month')).toBeInTheDocument();
      expect(screen.getByText('$99.99 + processing fee')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /compare plans/i }));
      expect(screen.getByText('$10.00/month')).toBeInTheDocument();
      expect(screen.getByText('$119.99 + processing fee')).toBeInTheDocument();
      expect(screen.getByText('$10.99/month')).toBeInTheDocument();
      expect(screen.getByText('$65.94 + processing fee')).toBeInTheDocument();
    });

    it('shows the saving against the monthly price, and never on the monthly plan itself', async () => {
      renderStore();

      // $8.33 against $18.99 is 56%; $10.00 against $18.99 is 47%.
      expect(await screen.findByText('Save 56%')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /compare plans/i }));
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
      fireEvent.click(screen.getByRole('button', { name: /compare plans/i }));
      expect(screen.getByText('Sold out')).toBeInTheDocument();
    });
  });

  it('shows the real plan price and explains why cruush takes crypto', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());

    renderStore();

    expect(await screen.findByText('$18.99/month')).toBeInTheDocument();
    expect(screen.getByText('Who has a cruush on you')).toBeInTheDocument();
    expect(screen.getByText('See your full incoming cruush and profile-view lists.')).toBeInTheDocument();
    expect(screen.getByText('More Pulses')).toBeInTheDocument();
    expect(screen.getByText('Send up to 5 Pulses per day.')).toBeInTheDocument();
    expect(screen.getByText('Mile High Club')).toBeInTheDocument();
    expect(screen.getByText('Drop a pin where you are visiting and cruise from there.')).toBeInTheDocument();
    expect(screen.getByText('Feed+')).toBeInTheDocument();
    expect(screen.getByText('Add up to three photo hearts, post to a specific Crowd, and choose when your post expires.')).toBeInTheDocument();
    expect(screen.getByText('Cruise Carousel')).toBeInTheDocument();
    expect(screen.getByText('Spin through nearby profiles and browse again.')).toBeInTheDocument();
    expect(screen.getByText('All seeking and visibility controls')).toBeInTheDocument();
    expect(screen.getByText('Use all seeking filters, combine more visibility controls, save visibility sets, add up to 10 searchable profile tags, and add as many profile kinks as fit you. Basic includes 3 tags and 3 kinks.')).toBeInTheDocument();
    expect(screen.getByText('Dark Room')).toBeInTheDocument();
    expect(screen.getByText('Browse the map without appearing on it.')).toBeInTheDocument();
    const benefits = screen.getByRole('list', { name: 'cruush+ benefits' });
    const benefitCards = within(benefits).getAllByRole('listitem');
    expect(benefits).toHaveClass('grid-cols-3');
    expect(benefitCards).toHaveLength(7);
    expect(benefitCards.every((card) => !card.className.includes('col-span-'))).toBe(true);
    expect(benefitCards[6]).toHaveClass('col-start-2');
    expect(screen.queryByText('Post to the local feed')).not.toBeInTheDocument();
    expect(screen.queryByText('Cruise nearby profiles')).not.toBeInTheDocument();
    expect(screen.queryByText('Stealth Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Ghost Mode')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A crypto wallet' })).toBeInTheDocument();
    expect(screen.getByText('USDC · Arbitrum')).toBeInTheDocument();
    expect(screen.getByText('PYUSD · Arbitrum')).toBeInTheDocument();
    expect(screen.getByText('USDC · Base')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Something else' })).not.toBeInTheDocument();
    expect(screen.getByText(/Cash App stablecoin transfers are not available to New York residents/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /why cruush takes crypto/i }));
    expect(await screen.findByText(/Cash App pays with USDC on Arbitrum/i)).toBeInTheDocument();
    expect(screen.queryByText(/licensed processor/i)).not.toBeInTheDocument();
  });

  it('puts the ready checkout before the benefits and legal sections', async () => {
    vi.mocked(getBillingPlans).mockResolvedValue({
      processor: 'fake',
      testCheckout: true,
      testWarning: 'TEST CHECKOUT - no real payment will be collected.',
      currency: 'USD',
      plans: conversionPlans,
    });
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus([
      'usdc_arbitrum',
      'pyusd_arbitrum',
      'usdc_base',
    ]));

    renderStore();

    const main = (await screen.findByText('Choose your time')).closest('main');
    expect(main).not.toBeNull();
    expect(main?.children).toHaveLength(6);
    expect(main?.children[1]).toHaveTextContent('Choose your time');
    expect(main?.children[1]).toHaveTextContent('Recommended');
    expect(main?.children[2]).toHaveTextContent('What are you paying from?');
    expect(main?.children[2]).toContainElement(screen.getByRole('button', { name: 'Cash App' }));
    expect(main?.children[2]).toContainElement(screen.getByRole('button', { name: 'PayPal' }));
    expect(main?.children[2]).toContainElement(screen.getByRole('button', { name: 'A crypto wallet' }));
    expect(main?.children[2]).toContainElement(screen.getByRole('button', { name: /get 1 year for \$99\.99/i }));
    expect(main?.children[3]).toContainElement(screen.getByRole('list', { name: 'cruush+ benefits' }));
    expect(main?.children[4]).toContainElement(screen.getByRole('button', { name: /why cruush takes crypto/i }));
    expect(main?.children[5]).toContainElement(screen.getByRole('link', { name: /read the billing policy/i }));
  });

  it('never starts a payment while the processor is not ready', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());

    renderStore();

    const payButton = await screen.findByRole('button', { name: /get 1 month for \$18\.99/i });
    expect(payButton).toBeDisabled();
    for (const sourceLabel of ['Cash App', 'PayPal', 'A crypto wallet']) {
      const sourceButton = screen.getByRole('button', { name: sourceLabel });
      expect(sourceButton).toBeDisabled();
      expect(sourceButton).toHaveAttribute('aria-pressed', 'false');
      expect(sourceButton).not.toHaveClass('bg-primary/10');
    }

    fireEvent.click(payButton);
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it.each([
    ['Cash App', 'usdc_arbitrum', [
      'Confirm you are eligible. Cash App says stablecoin transfers are not available to New York residents.',
      'Open Cash App and go to the Payment tab.',
    ]],
    ['PayPal', 'pyusd_arbitrum', [
      'Open PayPal, go to Finances, and open your PayPal USD (PYUSD) balance.',
    ]],
    ['A crypto wallet', 'usdc_base', [
      'Choose USDC as the asset and Base as the network.',
    ]],
  ] as const)('maps %s to the exact %s rail and instructions', async (sourceLabel, rail, instructions) => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus([
      'usdc_arbitrum',
      'pyusd_arbitrum',
      'usdc_base',
    ]));
    vi.mocked(createCryptoPaymentIntent).mockRejectedValue(new Error('Stop after request mapping.'));

    renderStore();

    const sourceButton = await screen.findByRole('button', { name: sourceLabel });
    fireEvent.click(sourceButton);
    expect(sourceButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /how to send this payment/i }));
    for (const instruction of instructions) {
      expect(await screen.findByText(instruction)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: /get 1 month for \$18\.99/i }));

    await waitFor(() => {
      expect(createCryptoPaymentIntent).toHaveBeenCalledWith({
        planId: 'plus_monthly',
        idempotencyKey: expect.any(String),
        rail,
      });
    });
  });

  it('moves selection to a ready visible rail and disables unavailable sources', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_base']));

    renderStore();

    const walletButton = await screen.findByRole('button', { name: 'A crypto wallet' });
    await waitFor(() => expect(walletButton).toHaveAttribute('aria-pressed', 'true'));
    expect(walletButton).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeDisabled();
  });

  it('selects the ready Venmo PYUSD Ethereum rail and starts its checkout', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['pyusd_ethereum']));

    renderStore();

    const payButton = await screen.findByRole('button', { name: /get 1 month for \$18\.99/i });
    await waitFor(() => expect(payButton).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Venmo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'A crypto wallet' })).toBeDisabled();
    fireEvent.click(payButton);
    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalledWith({
      planId: 'plus_monthly',
      idempotencyKey: expect.any(String),
      rail: 'pyusd_ethereum',
    }));
  });

  it('starts one seamless Base USDC payment once the processor is ready', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_base']));
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
          rail: 'usdc_base',
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

  it('restores the current open payment after a reload instead of creating another address', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_base']));
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'USDC',
      network: 'base',
      rail: 'usdc_base',
      chainId: 8453,
      tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: '0x73659c60270d326c06Ac204F1A9C63f889a3D14B',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'awaiting_payment',
      expiresAt: '2099-09-01T12:30:00.000Z',
      createdAt: '2099-09-01T12:00:00.000Z',
      updatedAt: '2099-09-01T12:00:00.000Z',
      paidAt: null,
    });

    renderStore();

    expect(await screen.findByText(/waiting for your payment to arrive/i)).toBeInTheDocument();
    expect(screen.getByText('Protected order')).toBeInTheDocument();
    expect(screen.getByText(/order timer:/i)).toBeInTheDocument();
    expect(screen.getByText(/this address is unique to your order/i)).toHaveTextContent(
      /Send the exact amount in USDC on Base and allow time for it to arrive on-chain before the timer reaches 0/i,
    );
    expect(screen.getByText('0x73659c60270d326c06Ac204F1A9C63f889a3D14B')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payment started' })).toBeDisabled();
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it('cancels a recorded order before unlocking another payment method', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus([
      'usdc_arbitrum',
      'pyusd_arbitrum',
      'usdc_base',
    ]));
    const openIntent = {
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly' as const,
      asset: 'USDC' as const,
      network: 'arbitrum' as const,
      rail: 'usdc_arbitrum' as const,
      chainId: 42161,
      tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: '0x1111111111111111111111111111111111111111',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'awaiting_payment' as const,
      expiresAt: '2099-09-01T13:00:00.000Z',
      createdAt: '2099-09-01T12:00:00.000Z',
      updatedAt: '2099-09-01T12:00:00.000Z',
      paidAt: null,
    };
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue(openIntent);
    vi.mocked(cancelCryptoPaymentIntent).mockResolvedValue({
      ...openIntent,
      paymentAddress: null,
      status: 'cancelled',
      updatedAt: '2099-09-01T12:01:00.000Z',
    });

    renderStore();

    expect(await screen.findByRole('button', { name: 'Change payment method' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Change payment method' }));
    expect(screen.getByText(/only cancel if you have not sent payment/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and choose another method' }));

    await waitFor(() => {
      expect(cancelCryptoPaymentIntent).toHaveBeenCalledWith(openIntent.id);
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Previous order cancelled. Choose how you want to pay.',
    );
    expect(screen.queryByText(openIntent.paymentAddress)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'PayPal' }));
    expect(screen.getByRole('button', { name: 'PayPal' })).toHaveAttribute('aria-pressed', 'true');
    const replacement = {
      ...openIntent,
      id: '00000000-0000-4000-8000-000000000012',
      asset: 'PYUSD' as const,
      rail: 'pyusd_arbitrum' as const,
      tokenAddress: '0x46850aD61C2B7d64d08c9C754F45254596696984',
      paymentAddress: '0x2222222222222222222222222222222222222222',
      createdAt: '2099-09-01T12:01:00.000Z',
      expiresAt: '2099-09-02T12:01:00.000Z',
    };
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue(replacement);
    fireEvent.click(screen.getByRole('button', { name: /get 1 month for/i }));
    expect(await screen.findByText(replacement.paymentAddress)).toBeInTheDocument();
    expect(createCryptoPaymentIntent).toHaveBeenCalledWith({
      planId: 'plus_monthly', rail: 'pyusd_arbitrum', idempotencyKey: expect.any(String),
    });
    expect(screen.queryByText(openIntent.paymentAddress)).not.toBeInTheDocument();
  });

  it('keeps a restored open payment on its original rail when that rail is unavailable', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_base']));
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000011',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'USDC',
      network: 'arbitrum',
      rail: 'usdc_arbitrum',
      chainId: 42161,
      tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: '0x1111111111111111111111111111111111111111',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'awaiting_payment',
      expiresAt: '2099-09-01T12:30:00.000Z',
      createdAt: '2099-09-01T12:00:00.000Z',
      updatedAt: '2099-09-01T12:00:00.000Z',
      paidAt: null,
    });

    renderStore();

    expect(await screen.findByText(/waiting for your payment to arrive/i)).toBeInTheDocument();
    expect(screen.getByText('0x1111111111111111111111111111111111111111')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cash App' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'A crypto wallet' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Payment started' })).toBeDisabled();
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it('keeps an unavailable restored rail locked after polling reports the payment paid', async () => {
    let pollPayment: (() => void) | null = null;
    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((
      ((handler: TimerHandler, timeout?: number) => {
        if (timeout === 10_000 && typeof handler === 'function') {
          pollPayment = handler;
        }
        return 1;
      }) as typeof window.setInterval
    ));
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_base']));
    const restoredIntent = {
      id: '00000000-0000-4000-8000-000000000012',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly' as const,
      asset: 'USDC' as const,
      network: 'arbitrum' as const,
      rail: 'usdc_arbitrum' as const,
      chainId: 42161,
      tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: '0x2222222222222222222222222222222222222222',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'awaiting_payment' as const,
      expiresAt: '2099-09-01T12:30:00.000Z',
      createdAt: '2099-09-01T12:00:00.000Z',
      updatedAt: '2099-09-01T12:00:00.000Z',
      paidAt: null,
    };
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue(restoredIntent);
    vi.mocked(getCryptoPaymentIntent).mockResolvedValue({
      ...restoredIntent,
      paymentAddress: null,
      status: 'paid',
      updatedAt: '2099-09-01T12:01:00.000Z',
      paidAt: '2099-09-01T12:01:00.000Z',
    });

    try {
      renderStore();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(pollPayment).not.toBeNull();
      setIntervalSpy.mockRestore();
      expect(await screen.findByText(/waiting for your payment to arrive/i)).toBeInTheDocument();

      await act(async () => {
        pollPayment?.();
        await Promise.resolve();
      });

      expect(screen.getByText(/payment confirmed\. your cruush\+ time is active/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cash App' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'A crypto wallet' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'cruush+ active' })).toBeDisabled();
      expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('hides stale payment instructions at the server deadline and requires a fresh payment', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_base']));
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'USDC',
      network: 'base',
      rail: 'usdc_base',
      chainId: 8453,
      tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: '0x73659c60270d326c06Ac204F1A9C63f889a3D14B',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'awaiting_payment',
      expiresAt: '2020-01-01T00:00:00.000Z',
      createdAt: '2019-12-31T23:30:00.000Z',
      updatedAt: '2019-12-31T23:30:00.000Z',
      paidAt: null,
    });

    renderStore();
    fireEvent.click(await screen.findByRole('button', { name: /get 1 month for \$18\.99/i }));

    expect(await screen.findByText(/this payment window expired/i)).toBeInTheDocument();
    expect(screen.queryByText('0x73659c60270d326c06Ac204F1A9C63f889a3D14B')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a fresh payment' })).toBeEnabled();
  });

  it('keeps a seen payment confirming after its send window closes without showing the address', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_base']));
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'USDC',
      network: 'base',
      rail: 'usdc_base',
      chainId: 8453,
      tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: '0x73659c60270d326c06Ac204F1A9C63f889a3D14B',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'confirming',
      expiresAt: '2020-01-01T00:00:00.000Z',
      createdAt: '2019-12-31T23:30:00.000Z',
      updatedAt: '2020-01-01T00:00:01.000Z',
      paidAt: null,
    });

    renderStore();

    expect(await screen.findByText(/payment seen\. waiting for network confirmation/i)).toBeInTheDocument();
    expect(screen.queryByText(/this payment window expired/i)).not.toBeInTheDocument();
    expect(screen.queryByText('0x73659c60270d326c06Ac204F1A9C63f889a3D14B')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payment started' })).toBeDisabled();
  });

  it('keeps plan and payment source fixed while an address request is in flight', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus([
      'usdc_arbitrum',
      'pyusd_arbitrum',
      'usdc_base',
    ]));
    let resolveIntent: ((value: never) => void) | null = null;
    vi.mocked(createCryptoPaymentIntent).mockImplementation(() => new Promise((resolve) => {
      resolveIntent = resolve as (value: never) => void;
    }));

    renderStore();
    fireEvent.click(await screen.findByRole('button', { name: /get 1 month for \$18\.99/i }));

    expect(await screen.findByRole('button', { name: 'Starting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'A crypto wallet' })).toBeDisabled();
    resolveIntent = null;
  });

  it('does not offer a second charge after the payment is already paid', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_base']));
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'USDC',
      network: 'base',
      rail: 'usdc_base',
      chainId: 8453,
      tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: '0x73659c60270d326c06Ac204F1A9C63f889a3D14B',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'paid',
      expiresAt: '2099-09-01T12:30:00.000Z',
      createdAt: '2099-09-01T12:00:00.000Z',
      updatedAt: '2099-09-01T12:01:00.000Z',
      paidAt: '2099-09-01T12:01:00.000Z',
    });

    renderStore();
    fireEvent.click(await screen.findByRole('button', { name: /get 1 month for \$18\.99/i }));

    expect(await screen.findByText(/payment confirmed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cruush+ active' })).toBeDisabled();
    expect(createCryptoPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('shows the payment QR code once the server returns one', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_base']));
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
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_base']));
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

  it('puts the one-time no-voluntary-refund billing policy at the bottom', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());

    renderStore();

    const link = await screen.findByRole('link', { name: 'Read the billing policy' });
    const refundLink = screen.getByRole('link', { name: 'Request a legally required refund review' });
    expect(link).toHaveAttribute('href', '/billing-policy');
    expect(refundLink).toHaveAttribute('href', '/support?refund=1');
    expect(link.closest('div')).toHaveTextContent('One-time purchase. Nothing renews automatically.');
    expect(link.closest('div')).toHaveTextContent(
      'Purchases are final and non-refundable except where applicable law requires a withdrawal, refund, remedy, or forced reversal.',
    );
  });
});

describe('Pulse checkout shares the live processor', () => {
  it('loads Pulse packs and sends the chosen pack to the real Pulse intent API', async () => {
    vi.mocked(getPulsePacks).mockResolvedValue({ packs: [{ id: 'ping_3', name: '3 Pulses', description: '3 permanent Pulse credits', pingCount: 3, amountCents: 299, currency: 'USD' }] });
    vi.mocked(getCurrentPulsePaymentIntent).mockResolvedValue(null);
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue({ ready: true, asset: 'USDC', network: 'arbitrum', confirmationTarget: 1, rails: [{ id: 'usdc_arbitrum', asset: 'USDC', network: 'arbitrum', chainId: 42161, tokenAddress: '', ready: true }] });
    vi.mocked(createPulsePaymentIntent).mockResolvedValue({ id: 'pulse-order', userId: 'member', planId: 'ping_3', productType: 'ping_pack', asset: 'USDC', network: 'arbitrum', rail: 'usdc_arbitrum', chainId: 42161, tokenAddress: '', amountUsdCents: 299, quotedAmountAtomic: '2990000', paymentAddress: '0x123', paymentUri: null, qrCodeDataUrl: null, status: 'paid', expiresAt: null, createdAt: null, updatedAt: null, paidAt: null });
    render(<MemoryRouter><CruushPlusStore product="ping_pack" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Get 3 pulses for $2.99' }));
    await waitFor(() => expect(createPulsePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ packId: 'ping_3', rail: 'usdc_arbitrum' })));
    expect(await screen.findByText('Payment confirmed. Your Pulses are available.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cruush+ checkout' })).toBeInTheDocument();
  });
});
