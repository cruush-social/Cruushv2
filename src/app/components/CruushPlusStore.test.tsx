import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { PopupRouteContext } from '../lib/popupRouteContext';
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
    getBitcoinSendingEligibility: vi.fn(),
    getCryptoProcessorStatus: vi.fn(),
    validateCheckoutCoupon: vi.fn(),
    getCurrentCryptoPaymentIntent: vi.fn(),
    createCryptoPaymentIntent: vi.fn(),
    cancelCryptoPaymentIntent: vi.fn(),
    getCryptoPaymentIntent: vi.fn(),
  };
});

vi.mock('../lib/posthog', () => ({
  trackBitcoinCheckoutMilestone: vi.fn(),
  trackCruushPlusConversion: vi.fn(),
}));

const { getBillingPlans } = await import('../lib/billingApi');
const {
  getPulsePacks, createPulsePaymentIntent, getCurrentPulsePaymentIntent,
  cancelCryptoPaymentIntent,
  createCryptoPaymentIntent,
  getBitcoinSendingEligibility,
  getCryptoPaymentIntent,
  getCryptoProcessorStatus,
  getCurrentCryptoPaymentIntent,
  validateCheckoutCoupon,
} = await import(
  '../lib/cryptoCheckoutApi'
);
const { trackBitcoinCheckoutMilestone } = await import('../lib/posthog');

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

const bitcoinRail = {
  id: 'btc_bitcoin' as const,
  asset: 'BTC' as const,
  network: 'bitcoin' as const,
  chainId: 0,
  tokenAddress: '',
  ready: true,
};

function bitcoinOnlyProcessorStatus(): CryptoProcessorStatus {
  return {
    ready: true,
    asset: 'BTC',
    network: 'bitcoin',
    confirmationTarget: 6,
    rails: [
      ...processorRails.map((rail) => ({ ...rail, ready: false })),
      bitcoinRail,
    ],
  };
}

function renderStore() {
  return render(
    <MemoryRouter>
      <CruushPlusStore />
    </MemoryRouter>,
  );
}

function BackDestination() {
  return <span data-testid="back-destination">{useLocation().pathname}</span>;
}

// Every render loads the Bitcoin sending sample. An empty map evaluates nothing,
// so tests that are not about it keep the whole catalogue listed.
beforeEach(() => {
  vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: {} });
  vi.mocked(createCryptoPaymentIntent).mockReset().mockRejectedValue(new Error('No order in this test.'));
  vi.mocked(createPulsePaymentIntent).mockReset().mockRejectedValue(new Error('No order in this test.'));
  vi.mocked(validateCheckoutCoupon).mockReset();
});

describe('CruushPlusStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: {} });
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue(null);
    vi.mocked(getBillingPlans).mockResolvedValue({
      processor: 'fake',
      testCheckout: true,
      testWarning: 'TEST CHECKOUT - no real payment will be collected.',
      currency: 'USD',
      plans,
    });
  });

  it.each(['direct', 'history', 'popup'])('makes Back work from %s entry', async (entry) => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus([]));
    const close = vi.fn();
    render(
      <MemoryRouter initialEntries={entry === 'history' ? ['/settings', '/store'] : entry === 'popup' ? ['/feed', '/store'] : ['/store']} initialIndex={entry === 'direct' ? 0 : 1}>
        <PopupRouteContext.Provider value={entry === 'popup' ? { onClose: close } : null}>
          <CruushPlusStore />
          <BackDestination />
        </PopupRouteContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Back', exact: true }));
    expect(screen.getByTestId('back-destination')).toHaveTextContent(entry === 'history' ? '/settings' : entry === 'popup' ? '/feed' : '/map');
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    ['PayPal', 'pyusd_arbitrum', 'paypal'],
    ['Venmo', 'pyusd_ethereum', 'venmo'],
    ['A crypto wallet', 'usdc_base', 'wallet'],
  ] as const)('starts stablecoin checkout from %s on its matching network', async (name, rail, sendingApp) => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_arbitrum', 'pyusd_arbitrum', 'pyusd_ethereum', 'usdc_base']));
    vi.mocked(createCryptoPaymentIntent).mockRejectedValue(new Error('Stop after request mapping.'));
    renderStore();
    const picker = await screen.findByLabelText('Where you are paying from');
    expect(within(picker).queryByRole('button', { name: 'Cash App' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sorry, we are now migrating to stablecoin.')).not.toBeInTheDocument();
    const button = within(picker).getByRole('button', { name });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'plus_monthly', rail, sendingApp,
    })));
  });

  it.each([
    ['PayPal', 'pyusd_arbitrum', 'paypal', 'PYUSD', 'arbitrum', 42161, 'https://www.paypal.com/myaccount/crypto/'],
    ['Venmo', 'pyusd_ethereum', 'venmo', 'PYUSD', 'ethereum', 1, 'https://venmo.com/'],
    ['A crypto wallet', 'usdc_base', 'wallet', 'USDC', 'base', 8453, 'ethereum:0xfixture@8453/transfer?uint256=19000000'],
  ] as const)('opens the matching destination for a restored %s stablecoin order', async (name, rail, sendingApp, asset, network, chainId, expectedHref) => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus([rail]));
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010', userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly', asset, network, rail, chainId, tokenAddress: '0xfixture', sendingApp,
      amountUsdCents: 1899, quotedAmountAtomic: '19000000', paymentAddress: '0xfixture',
      paymentUri: 'ethereum:0xfixture@8453/transfer?uint256=19000000', qrCodeDataUrl: null,
      status: 'awaiting_payment', expiresAt: '2099-01-01T00:00:00Z', createdAt: null, updatedAt: null, paidAt: null,
    });
    renderStore();
    const link = await screen.findByRole('link', { name: sendingApp === 'wallet' ? 'Open app' : `Open ${name}` });
    expect(link).toHaveAttribute('href', expectedHref);
    expect(screen.getByRole('button', { name: 'Copy amount' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeEnabled();
  });

  it('keeps fast address feedback readable without creating a second order', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['pyusd_arbitrum']));
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue({
      id: 'feedback-order', userId: 'feedback-user', planId: 'plus_monthly',
      asset: 'PYUSD', network: 'arbitrum', rail: 'pyusd_arbitrum', sendingApp: 'paypal',
      amountUsdCents: 1899, quotedAmountAtomic: '19000000', paymentAddress: '0xfixture',
      status: 'awaiting_payment', expiresAt: '2099-01-01T00:00:00Z', createdAt: null, updatedAt: null, paidAt: null,
    });
    renderStore();
    const paypal = await screen.findByRole('button', { name: 'PayPal' });
    await waitFor(() => expect(paypal).toBeEnabled());
    fireEvent.click(paypal);
    expect(await screen.findByText('Your order’s payment address is ready')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy address' })).not.toBeInTheDocument();
    fireEvent.click(paypal);
    expect(createCryptoPaymentIntent).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Copy address' })).toBeEnabled();
    expect(screen.queryByText('Your order’s payment address is ready')).not.toBeInTheDocument();
  });

  it('keeps stablecoin checkout disabled when no supported rail is ready', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus([]));
    renderStore();
    const picker = await screen.findByLabelText('Where you are paying from');
    for (const name of ['PayPal', 'Venmo', 'A crypto wallet']) {
      expect(within(picker).getByRole('button', { name })).toBeDisabled();
    }
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it.each(['usdc_arbitrum', 'btc_bitcoin'] as const)('uses stablecoin choices after an old %s Cash App order expires', async (rail) => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus(['usdc_arbitrum', 'pyusd_arbitrum', 'pyusd_ethereum', 'usdc_base']));
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010', userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly', asset: rail === 'btc_bitcoin' ? 'BTC' : 'USDC',
      network: rail === 'btc_bitcoin' ? 'bitcoin' : 'arbitrum', rail,
      chainId: rail === 'btc_bitcoin' ? 0 : 42161, tokenAddress: '', sendingApp: 'cash_app',
      amountUsdCents: 1899, quotedAmountAtomic: '18990000', paymentAddress: null,
      paymentUri: null, qrCodeDataUrl: null, status: 'awaiting_payment',
      expiresAt: '2020-01-01T00:00:00.000Z', createdAt: '2019-12-31T23:30:00.000Z',
      updatedAt: '2019-12-31T23:30:00.000Z', paidAt: null,
    });
    renderStore();
    expect(await screen.findByText(/this payment window expired/i)).toBeInTheDocument();
    const picker = screen.getByLabelText('Where you are paying from');
    expect(within(picker).queryByRole('button', { name: 'Cash App' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a fresh payment' })).toBeDisabled();
    fireEvent.click(within(picker).getByRole('button', { name: 'PayPal' }));
    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
      rail: 'pyusd_arbitrum', sendingApp: 'paypal',
    })));
  });

  it('shows plans without waiting for slower processor and Bitcoin checks', async () => {
    vi.mocked(getCryptoProcessorStatus).mockReturnValue(new Promise(() => {}));
    vi.mocked(getBitcoinSendingEligibility).mockReturnValue(new Promise(() => {}));

    renderStore();

    expect(await screen.findByText('$18.99/month')).toBeInTheDocument();
    expect(screen.queryByText('Loading plans…')).not.toBeInTheDocument();
  });

  it('applies CLUBS20 and sends the normalized code with the discounted checkout', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(validateCheckoutCoupon).mockResolvedValue({ code: 'CLUBS20', percentOff: 20 });
    vi.mocked(createCryptoPaymentIntent).mockRejectedValue(new Error('Stop after request mapping.'));

    renderStore();
    const couponInput = await screen.findByLabelText('Coupon code');
    fireEvent.change(couponInput, { target: { value: 'clubs20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText(/CLUBS20 applied\. 20% off\./)).toHaveTextContent('$18.99 becomes $15.19');
    fireEvent.click(screen.getByRole('button', { name: 'Cash App' }));

    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'plus_monthly',
      couponCode: 'CLUBS20',
    })));
  });

  it('uses automatic server sale prices without coupon stacking or an expiry countdown', async () => {
    const sale = { id: 'cruush-plus-50', percentOff: 50, endsAt: null, couponStacking: false } as const;
    vi.mocked(getBillingPlans).mockResolvedValue({
      processor: 'fake', testCheckout: true, testWarning: '', currency: 'USD', sale,
      plans: [{ ...plans[0]!, amountCents: 950, originalAmountCents: 1899, sale }],
    });
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());

    renderStore();

    await screen.findByText('$9.50/month');
    expect(screen.queryByRole('complementary', { name: 'cruush+ sale' })).not.toBeInTheDocument();
    expect(screen.getByText('$18.99/month')).toHaveClass('line-through');
    expect(screen.getByText('$9.50/month')).toBeInTheDocument();
    expect(screen.queryByLabelText('Coupon code')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cash App' }));

    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalled());
    expect(vi.mocked(createCryptoPaymentIntent).mock.calls[0]?.[0]).toMatchObject({ planId: 'plus_monthly' });
    expect(vi.mocked(createCryptoPaymentIntent).mock.calls[0]?.[0]).not.toHaveProperty('couponCode');
    expect(validateCheckoutCoupon).not.toHaveBeenCalled();
  });

  it.each([false, true])('preserves a pre-sale active order price (coupon: %s)', async (hasCoupon) => {
    const sale = { id: 'cruush-plus-50', percentOff: 50, endsAt: null, couponStacking: false } as const;
    vi.mocked(getBillingPlans).mockResolvedValue({
      processor: 'fake', testCheckout: true, testWarning: '', currency: 'USD', sale,
      plans: [{ ...plans[0]!, amountCents: 950, originalAmountCents: 1899, sale }],
    });
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue({
      id: 'pre-sale-order', userId: 'member', planId: 'plus_monthly', productType: 'cruush_plus',
      asset: 'BTC', network: 'bitcoin', rail: 'btc_bitcoin', chainId: 0, tokenAddress: '',
      amountUsdCents: hasCoupon ? 1519 : 1899, sale: null,
      discount: hasCoupon ? { code: 'CLUBS20', percentOff: 20, originalAmountUsdCents: 1899, discountAmountUsdCents: 380, amountUsdCents: 1519 } : null,
      quotedAmountAtomic: '18990000', paymentAddress: 'bc1qexistingtestorder', paymentUri: null, qrCodeDataUrl: null,
      status: 'awaiting_payment', expiresAt: '2099-09-01T12:30:00.000Z', createdAt: null, updatedAt: null, paidAt: null,
    });

    renderStore();

    await screen.findByRole('button', { name: 'Payment started' });
    const priceList = screen.getByRole('list', { name: 'cruush+ prices' });
    expect(within(priceList).queryByText('$9.50/month')).not.toBeInTheDocument();
    expect(within(priceList).getByText(hasCoupon ? '$15.19/month' : '$18.99/month')).toBeInTheDocument();
    if (hasCoupon) {
      expect(screen.getByLabelText('Coupon code')).toBeDisabled();
      expect(screen.getByText(/CLUBS20 applied/)).toHaveTextContent('$18.99 becomes $15.19');
    }
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it('states that Lifetime includes unlimited Pulses', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());
    vi.mocked(getBillingPlans).mockResolvedValue({
      processor: 'fake',
      testCheckout: true,
      testWarning: 'TEST CHECKOUT - no real payment will be collected.',
      currency: 'USD',
      plans: [{
        ...plans[0]!,
        id: 'lifetime_founder',
        name: 'Lifetime founder cruush+',
        interval: 'lifetime',
        durationMonths: undefined,
        amountCents: 99999,
        isFounder: true,
        isLifetime: true,
        supplyRemaining: 1000,
        badgeKeys: ['founder', 'lifetime_founder'],
      }],
    });

    renderStore();

    expect(await screen.findByText(/keep it forever with unlimited Pulses/i)).toBeInTheDocument();
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
        await screen.findByText('$99.99 + processing fee'),
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

    it('labels a 1000-count plan as limited without changing other remaining counts', async () => {
      vi.mocked(getBillingPlans).mockResolvedValue({
        processor: 'fake',
        testCheckout: true,
        testWarning: 'TEST CHECKOUT - no real payment will be collected.',
        currency: 'USD',
        plans: conversionPlans.map((plan) =>
          plan.id === 'founder_annual' ? { ...plan, supplyRemaining: 1000 } : plan,
        ),
      });

      renderStore();

      expect(await screen.findByText(/LIMITED/)).toBeInTheDocument();
      expect(screen.queryByText(/1000 left/)).not.toBeInTheDocument();
    });

    it('keeps non-1000 remaining counts unchanged', async () => {
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
        await screen.findByText('$119.99 + processing fee'),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /compare plans/i }));
      expect(screen.getByText('Sold out')).toBeInTheDocument();
    });
  });

  it('shows the real plan price and explains why cruush takes crypto', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());

    renderStore();

    const sectionHeading = await screen.findByRole('heading', { name: 'cruush+ & Rewards' });
    expect(sectionHeading.querySelector('.cruush-logo-font')).toHaveTextContent('cruush+');
    expect(await screen.findByText('$18.99/month')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show cruush+ benefits' }));
    expect(await screen.findByText('Full activity')).toBeInTheDocument();
    expect(screen.getByText('See your full incoming cruush and profile-view lists.')).toBeInTheDocument();
    expect(screen.getByText('More Pulses')).toBeInTheDocument();
    expect(screen.getByText('Send up to 5 Pulses per day. Lifetime includes unlimited Pulses.')).toBeInTheDocument();
    expect(screen.getByText('Mile High Club')).toBeInTheDocument();
    expect(screen.getByText('Drop a pin where you are visiting and cruise from there.')).toBeInTheDocument();
    expect(screen.getByText('Confessional+')).toBeInTheDocument();
    expect(screen.getByText('Add up to three photo hearts and ten tags, post to a specific Crowd, and choose when your post expires.')).toBeInTheDocument();
    expect(screen.getByText('Carousel')).toBeInTheDocument();
    expect(screen.getByText('Spin through nearby profiles and browse again.')).toBeInTheDocument();
    expect(screen.getByText('All seeking and visibility controls')).toBeInTheDocument();
    expect(screen.getByText('Use all seeking filters, combine more visibility controls, save visibility sets, add up to 10 searchable profile tags and 10 hobbies, and add up to 10 profile kinks. Basic includes 3 tags, 3 hobbies and 3 kinks.')).toBeInTheDocument();
    expect(screen.getByText('Dark Room')).toBeInTheDocument();
    expect(screen.getByText('Browse the map without appearing on it.')).toBeInTheDocument();
    const benefits = screen.getByRole('list', { name: 'cruush+ features' });
    const benefitCards = within(benefits).getAllByRole('listitem');
    expect(benefits).not.toHaveClass('sm:grid-cols-2');
    expect(benefitCards).toHaveLength(7);
    expect(benefitCards[0]).toHaveClass('rounded-xl', 'border');
    expect(screen.queryByText('Post to the local Confessional')).not.toBeInTheDocument();
    expect(screen.queryByText('Cruise nearby profiles')).not.toBeInTheDocument();
    expect(screen.queryByText('Stealth Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Ghost Mode')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A crypto wallet' })).toBeInTheDocument();
    expect(screen.getAllByText('BTC · Bitcoin')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Something else' })).not.toBeInTheDocument();
    expect(screen.queryByText(/stablecoin transfers are not available/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /why cruush takes crypto/i }));
    expect(await screen.findByText(/Pay with Bitcoin from Cash App, PayPal, Venmo or a compatible wallet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crypto first. On our terms.' })).toHaveAttribute('href', '/blog/crypto-first.html');
    expect(screen.queryByText(/licensed processor/i)).not.toBeInTheDocument();
  });

  it('puts the Rewards-style benefits accordion below Checkout-first tabs and above checkout', async () => {
    vi.mocked(getBillingPlans).mockResolvedValue({
      processor: 'fake',
      testCheckout: true,
      testWarning: 'TEST CHECKOUT - no real payment will be collected.',
      currency: 'USD',
      plans: conversionPlans,
    });
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());

    renderStore();

    const main = (await screen.findByText('Choose your time')).closest('main');
    expect(main).not.toBeNull();
    const mainChildren = Array.from(main?.children ?? []);
    expect(mainChildren[0]).toContainElement(screen.getByRole('tab', { name: 'cruush+' }));
    expect(screen.getByRole('tab', { name: 'cruush+' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Rewards' })).toHaveAttribute('aria-selected', 'false');
    const benefitsToggle = screen.getByRole('button', { name: 'Show cruush+ benefits' });
    const benefitsIndex = mainChildren.findIndex((child) => child.contains(benefitsToggle));
    expect(benefitsIndex).toBeGreaterThanOrEqual(0);
    expect(benefitsToggle.closest('[data-slot="accordion-item"]')).toHaveClass('border-0');
    expect(benefitsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'cruush+ features' })).not.toBeInTheDocument();
    fireEvent.click(benefitsToggle);
    expect(mainChildren[benefitsIndex]).toContainElement(screen.getByRole('list', { name: 'cruush+ features' }));
    const whyCryptoButton = screen.getByRole('button', { name: /why cruush takes crypto/i });
    const whyCryptoIndex = mainChildren.findIndex((child) => child.contains(whyCryptoButton));
    expect(whyCryptoIndex).toBe(benefitsIndex + 1);
    const plansIndex = mainChildren.findIndex((child) => child.textContent?.includes('Choose your time'));
    expect(mainChildren[plansIndex]).toHaveTextContent('Recommended');
    expect(screen.getByRole('button', { name: /Compare plans/i }).closest('[data-slot="accordion"]')).toHaveClass('mt-2');
    const paymentIndex = mainChildren.findIndex((child) => child.textContent?.includes('What are you paying from?'));
    expect(mainChildren[paymentIndex]).toContainElement(screen.getByRole('button', { name: 'Cash App' }));
    expect(mainChildren[paymentIndex]).toContainElement(screen.getByRole('button', { name: 'PayPal' }));
    expect(mainChildren[paymentIndex]).toContainElement(screen.getByRole('button', { name: 'A crypto wallet' }));
    expect(screen.queryByRole('button', { name: /get 1 year for/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pulse checkout' })).not.toBeInTheDocument();
    expect(mainChildren[whyCryptoIndex]).toContainElement(whyCryptoButton);
    const billingIndex = mainChildren.findIndex((child) => child.textContent?.includes('billing policy'));
    const orderHistoryIndex = mainChildren.findIndex((child) => child.contains(screen.getByRole('link', { name: 'Order history' })));
    expect(orderHistoryIndex).toBe(billingIndex - 1);
    expect(mainChildren[billingIndex]).toContainElement(screen.getByRole('link', { name: /read the billing policy/i }));
  });

  it('reuses the Rewards benefit accordion without changing checkout controls', async () => {
    vi.mocked(getBillingPlans).mockResolvedValue({
      processor: 'fake',
      testCheckout: true,
      testWarning: 'TEST CHECKOUT - no real payment will be collected.',
      currency: 'USD',
      plans: conversionPlans,
    });
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());

    renderStore();

    const planButton = (await screen.findByText('$99.99 + processing fee')).closest('button');
    expect(planButton).toHaveClass('border-x-0', 'border-y');
    expect(planButton).not.toHaveClass('rounded-xl');

    const compareItem = screen.getByRole('button', { name: /Compare plans/i }).closest('[data-slot="accordion-item"]');
    expect(compareItem).toHaveClass('rounded-none', 'border-x-0', 'border-b-0');
    expect(compareItem).not.toHaveClass('rounded-full');

    const paymentGuideItem = screen.getByRole('button', { name: /How to send this payment/i }).closest('[data-slot="accordion-item"]');
    expect(paymentGuideItem).not.toHaveClass('rounded-none', 'border-x-0', 'border-b-0');
    expect(screen.getByRole('button', { name: 'Cash App' })).not.toHaveClass('rounded-xl');

    fireEvent.click(screen.getByRole('button', { name: 'Show cruush+ benefits' }));
    const benefits = await screen.findByRole('list', { name: 'cruush+ features' });
    for (const benefit of within(benefits).getAllByRole('listitem')) {
      expect(benefit).toHaveClass('rounded-xl', 'border');
    }
  });

  it('never starts a payment while the processor is not ready', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());

    renderStore();

    await screen.findByText(/crypto payment is not available yet/i);
    const picker = screen.getByLabelText('Where you are paying from');
    for (const sourceLabel of ['Cash App', 'PayPal', 'Venmo', 'A crypto wallet']) {
      expect(within(picker).getByRole('button', { name: sourceLabel })).toBeDisabled();
    }
    expect(screen.getByText(/crypto payment is not available yet/i)).toBeInTheDocument();

    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it('keeps Bitcoin sources visible when the processor is ready', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());

    renderStore();

    const cashAppButton = await screen.findByRole('button', { name: 'Cash App' });
    expect(cashAppButton).toBeEnabled();
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Venmo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'A crypto wallet' })).toBeEnabled();
  });

  it('selects Venmo on the Bitcoin rail and starts its checkout', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());

    renderStore();

    const payButton = await screen.findByRole('button', { name: 'Venmo' });
    await waitFor(() => expect(payButton).toBeEnabled());
    expect(payButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A crypto wallet' })).toBeInTheDocument();
    fireEvent.click(payButton);
    expect(payButton).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalledWith({
      planId: 'plus_monthly',
      idempotencyKey: expect.any(String),
      rail: 'btc_bitcoin',
      sendingApp: 'venmo',
    }));
  });

  it('starts one seamless Bitcoin payment once the processor is ready', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'BTC',
      network: 'bitcoin',
      rail: 'btc_bitcoin',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: 'bc1qexampleaddressforthebitcoinpayment0000000',
      status: 'awaiting_payment',
      expiresAt: null,
      createdAt: null,
      updatedAt: null,
      paidAt: null,
    });

    renderStore();

    fireEvent.click(await screen.findByRole('button', { name: 'A crypto wallet' }));

    await waitFor(() => {
      expect(createCryptoPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'plus_monthly',
          idempotencyKey: expect.any(String),
          rail: 'btc_bitcoin',
        }),
      );
    });

    expect(await screen.findByRole('list', { name: 'Payment progress' })).toHaveTextContent('0/6 confirmations');
    expect(screen.getByText('0.1899 BTC')).toBeInTheDocument();
    expect(screen.getByText('bc1qexampleaddressforthebitcoinpayment0000000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payment started' })).toBeDisabled();
    expect(createCryptoPaymentIntent).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/voucher/i)).not.toBeInTheDocument();
  });

  it('restores the current open Bitcoin payment after a reload instead of creating another address', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'BTC',
      network: 'bitcoin',
      rail: 'btc_bitcoin',
      chainId: 0,
      tokenAddress: '',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: 'bc1qexampleaddressfortherestoredpayment000000',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'awaiting_payment',
      expiresAt: '2099-09-01T12:30:00.000Z',
      createdAt: '2099-09-01T12:00:00.000Z',
      updatedAt: '2099-09-01T12:00:00.000Z',
      paidAt: null,
    });

    renderStore();

    expect(await screen.findByRole('list', { name: 'Payment progress' })).toHaveTextContent('0/6 confirmations');
    expect(screen.getByText('bc1qexampleaddressfortherestoredpayment000000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payment started' })).toBeDisabled();
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it('cancels a recorded order while new cruush+ purchases remain disabled', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    const openIntent = {
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly' as const,
      asset: 'BTC' as const,
      network: 'bitcoin' as const,
      rail: 'btc_bitcoin' as const,
      chainId: 0,
      tokenAddress: '',
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
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'PayPal' }));
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it('keeps a restored open Bitcoin payment on its original rail', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000011',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'BTC',
      network: 'bitcoin',
      rail: 'btc_bitcoin',
      chainId: 0,
      tokenAddress: '',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: 'bc1qrestoredbitcoinaddress000000000000000000',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'awaiting_payment',
      expiresAt: '2099-09-01T12:30:00.000Z',
      createdAt: '2099-09-01T12:00:00.000Z',
      updatedAt: '2099-09-01T12:00:00.000Z',
      paidAt: null,
    });

    renderStore();

    expect(await screen.findByRole('list', { name: 'Payment progress' })).toHaveTextContent('0/6 confirmations');
    expect(screen.getByText('bc1qrestoredbitcoinaddress000000000000000000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cash App' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'A crypto wallet' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Payment started' })).toBeDisabled();
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it('keeps a restored Bitcoin payment locked after polling reports the payment paid', async () => {
    let pollPayment: (() => void) | null = null;
    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((
      ((handler: TimerHandler, timeout?: number) => {
        if (timeout === 10_000 && typeof handler === 'function') {
          pollPayment = handler;
        }
        return 1;
      }) as typeof window.setInterval
    ));
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    const restoredIntent = {
      id: '00000000-0000-4000-8000-000000000012',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly' as const,
      asset: 'BTC' as const,
      network: 'bitcoin' as const,
      rail: 'btc_bitcoin' as const,
      chainId: 0,
      tokenAddress: '',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: 'bc1qpaidbitcoinaddress00000000000000000000',
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
      expect(await screen.findByRole('list', { name: 'Payment progress' })).toHaveTextContent('0/6 confirmations');

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
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'BTC',
      network: 'bitcoin',
      rail: 'btc_bitcoin',
      chainId: 0,
      tokenAddress: '',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: 'bc1qexpiredbitcoinaddress000000000000000000',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'awaiting_payment',
      expiresAt: '2020-01-01T00:00:00.000Z',
      createdAt: '2019-12-31T23:30:00.000Z',
      updatedAt: '2019-12-31T23:30:00.000Z',
      paidAt: null,
    });

    renderStore();
    fireEvent.click(await screen.findByRole('button', { name: 'A crypto wallet' }));

    expect(await screen.findByText(/this payment window expired/i)).toBeInTheDocument();
    expect(screen.queryByText('bc1qexpiredbitcoinaddress000000000000000000')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a fresh payment' })).toBeEnabled();
  });

  it('keeps a seen payment confirming after its send window closes without showing the address', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'BTC',
      network: 'bitcoin',
      rail: 'btc_bitcoin',
      chainId: 0,
      tokenAddress: '',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: 'bc1qconfirmingbitcoinaddress00000000000000',
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
    expect(screen.queryByText('bc1qconfirmingbitcoinaddress00000000000000')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payment started' })).toBeDisabled();
  });

  it('keeps plan and payment source fixed while an address request is in flight', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    let resolveIntent: ((value: never) => void) | null = null;
    vi.mocked(createCryptoPaymentIntent).mockImplementation(() => new Promise((resolve) => {
      resolveIntent = resolve as (value: never) => void;
    }));

    renderStore();
    fireEvent.click(await screen.findByRole('button', { name: 'Cash App' }));

    expect(await screen.findByRole('button', { name: 'Starting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'A crypto wallet' })).toBeDisabled();
    resolveIntent = null;
  });

  it('does not offer a second charge after the payment is already paid', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'BTC',
      network: 'bitcoin',
      rail: 'btc_bitcoin',
      chainId: 0,
      tokenAddress: '',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: 'bc1qpaidbitcoinaddress00000000000000000000',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'paid',
      expiresAt: '2099-09-01T12:30:00.000Z',
      createdAt: '2099-09-01T12:00:00.000Z',
      updatedAt: '2099-09-01T12:01:00.000Z',
      paidAt: '2099-09-01T12:01:00.000Z',
    });

    renderStore();
    fireEvent.click(await screen.findByRole('button', { name: 'A crypto wallet' }));

    expect(await screen.findByText(/payment confirmed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cruush+ active' })).toBeDisabled();
    expect(createCryptoPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('shows the payment QR code once the server returns one', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_monthly',
      asset: 'BTC',
      network: 'bitcoin',
      rail: 'btc_bitcoin',
      amountUsdCents: 1899,
      quotedAmountAtomic: '18990000',
      paymentAddress: 'bc1qqrbitcoinaddress0000000000000000000000',
      paymentUri: 'bitcoin:bc1qqrbitcoinaddress0000000000000000000000?amount=0.0001899',
      qrCodeDataUrl: 'data:image/png;base64,fake',
      status: 'awaiting_payment',
      expiresAt: null,
      createdAt: null,
      updatedAt: null,
      paidAt: null,
    });

    renderStore();

    fireEvent.click(await screen.findByRole('button', { name: 'A crypto wallet' }));

    const qrImage = await screen.findByAltText(/BTC payment address QR code/i);
    expect(qrImage).toHaveAttribute('src', 'data:image/png;base64,fake');
    expect(screen.getByRole('link', { name: 'Open app' })).toHaveAttribute('href', expect.stringContaining('bitcoin:'));
    expect(screen.queryByRole('link', { name: 'Open wallet' })).not.toBeInTheDocument();
    expect(screen.getByText('Make sure your wallet also has enough crypto to cover its network fee.')).toBeInTheDocument();

    const paymentGuide = screen.getByRole('button', { name: 'How to send this payment' });
    expect(paymentGuide).toHaveAttribute('aria-expanded', 'false');
    expect(paymentGuide.closest('[data-slot="accordion-item"]')).not.toHaveClass('rounded-none', 'border-x-0', 'border-b-0');
    expect(screen.queryByText('Open your wallet or exchange and choose Send.')).not.toBeInTheDocument();
    fireEvent.click(paymentGuide);
    expect(await screen.findByText('Open your wallet and choose Send Bitcoin.')).toBeInTheDocument();
  });

  it('reuses the same idempotency key after an uncertain request failure', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(createCryptoPaymentIntent)
      .mockRejectedValueOnce(new Error('Connection interrupted.'))
      .mockRejectedValueOnce(new Error('Connection interrupted.'));

    renderStore();

    fireEvent.click(await screen.findByRole('button', { name: 'A crypto wallet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted.');
    fireEvent.click(screen.getByRole('button', { name: 'A crypto wallet' }));

    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createCryptoPaymentIntent).mock.calls[0]?.[0].idempotencyKey).toBe(
      vi.mocked(createCryptoPaymentIntent).mock.calls[1]?.[0].idempotencyKey,
    );
  });

  it('puts the one-time purchase and voluntary-refund billing policy at the bottom', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());

    renderStore();

    const link = await screen.findByRole('link', { name: 'read the billing policy' });
    const refundLink = screen.getByRole('link', { name: 'request a refund review' });
    const billingSupportLink = screen.getByRole('link', { name: 'report a billing issue' });
    expect(link).toHaveAttribute('href', '/billing-policy');
    expect(refundLink).toHaveAttribute('href', '/support?refund=1');
    expect(billingSupportLink).toHaveAttribute('href', '/support?billing=payment');
    expect(link.closest('div')).toHaveTextContent('after 30 minutes, contact payment support.');
    expect(link.closest('div')).toHaveTextContent('Please don’t pay again while it’s being checked.');
    fireEvent.click(screen.getByRole('button', { name: 'Why cruush takes crypto' }));
    expect(screen.getByRole('link', { name: 'How stablecoin payments work' })).toHaveAttribute('href', '/blog/stablecoin-payments.html');
    expect(screen.getByRole('link', { name: 'Crypto first. On our terms.' })).toHaveAttribute('href', '/blog/crypto-first.html');
    expect(link.closest('div')).toHaveTextContent('one-time purchase. nothing renews automatically.');
    expect(link.closest('div')).toHaveTextContent(
      'we offer voluntary refunds if your paid order wasn’t applied or you experienced a technical checkout issue. any withdrawal, refund, or other remedy required by applicable law still applies.',
    );
  });
});

describe('Pulse checkout shares the live processor', () => {
  it('loads Pulse packs and sends the chosen pack to the real Pulse intent API', async () => {
    vi.mocked(getPulsePacks).mockResolvedValue({ packs: [{ id: 'ping_3', name: '3 Pulses', description: '3 permanent Pulse credits', pingCount: 3, amountCents: 999, currency: 'USD' }] });
    vi.mocked(getCurrentPulsePaymentIntent).mockResolvedValue(null);
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(createPulsePaymentIntent).mockResolvedValue({ id: 'pulse-order', userId: 'member', planId: 'ping_3', productType: 'ping_pack', asset: 'BTC', network: 'bitcoin', rail: 'btc_bitcoin', chainId: 0, tokenAddress: '', amountUsdCents: 999, quotedAmountAtomic: '9990000', paymentAddress: 'bc1qpulsebitcoinaddress000000000000000000', paymentUri: null, qrCodeDataUrl: null, status: 'paid', expiresAt: null, createdAt: null, updatedAt: null, paidAt: null });
    render(<MemoryRouter><CruushPlusStore product="ping_pack" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Cash App' }));
    await waitFor(() => expect(createPulsePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ packId: 'ping_3', rail: 'btc_bitcoin', sendingApp: 'cash_app' })));
    expect(await screen.findByRole('button', { name: 'Pulses added' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'cruush+ checkout' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'cruush+ sale' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Coupon code')).toBeInTheDocument();
  });
});

describe('Bitcoin through Cash App, PayPal, Venmo or a wallet', () => {
  const bitcoinRail = {
    id: 'btc_bitcoin' as const,
    asset: 'BTC' as const,
    network: 'bitcoin' as const,
    chainId: 0,
    tokenAddress: '',
    ready: true,
  };

  /** Production at launch: only the Bitcoin rail is ready. */
  function bitcoinOnlyProcessorStatus(): CryptoProcessorStatus {
    return {
      ready: true,
      asset: 'BTC',
      network: 'bitcoin',
      confirmationTarget: 6,
      rails: [
        ...processorRails.map((rail) => ({ ...rail, ready: false })),
        bitcoinRail,
      ],
    };
  }

  /** All processor rails report ready; checkout still exposes Bitcoin only. */
  function everyRailProcessorStatus(): CryptoProcessorStatus {
    return {
      ...bitcoinOnlyProcessorStatus(),
      rails: [
        ...processorRails.map((rail) => ({ ...rail, ready: true })),
        bitcoinRail,
      ],
    };
  }

  // At a quote where the weekly plan is under every app's minimum, the monthly
  // and 6 month plans clear Cash App only, and the annual plans clear all three.
  const perAppEligibility = {
    rail: 'btc_bitcoin' as const,
    products: {
      plus_weekly: [],
      plus_monthly: ['Cash App'],
      plus_6_month: ['Cash App'],
      plus_annual: ['Cash App', 'PayPal', 'Venmo'],
      founder_annual: ['Cash App', 'PayPal', 'Venmo'],
    },
  };

  const pulsePacks = [
    { id: 'ping_3' as const, name: '3 Pulses', description: '3 permanent Pulse credits', pingCount: 3, amountCents: 999, currency: 'USD' as const },
    { id: 'ping_10' as const, name: '10 Pulses', description: '10 permanent Pulse credits', pingCount: 10, amountCents: 2499, currency: 'USD' as const },
    { id: 'ping_25' as const, name: '25 Pulses', description: '25 permanent Pulse credits', pingCount: 25, amountCents: 4999, currency: 'USD' as const },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue(null);
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
    vi.mocked(getBillingPlans).mockResolvedValue({
      processor: 'fake',
      testCheckout: true,
      testWarning: 'TEST CHECKOUT - no real payment will be collected.',
      currency: 'USD',
      plans: conversionPlans,
    });
  });

  it('offers exactly Cash App, PayPal, Venmo and a wallet, all on Bitcoin, while only Bitcoin is ready', async () => {
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: {} });
    renderStore();

    const picker = await screen.findByLabelText('Where you are paying from');
    expect(picker).toHaveClass('grid-cols-2');
    const buttons = within(picker).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Cash App', 'PayPal', 'Venmo', 'A crypto wallet']);
    expect(within(picker).getAllByText('BTC · Bitcoin')).toHaveLength(3);
    expect(within(picker).queryByText(/USDC|PYUSD/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /why cruush takes crypto/i }));
    expect(await screen.findByText(/Pay with Bitcoin from Cash App/)).toBeInTheDocument();
    expect(screen.queryByText(/Cash App pays with USDC/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bitcoin' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Send Bitcoin with Cash App, PayPal or Venmo/i)).not.toBeInTheDocument();
    for (const button of buttons) {
      expect(button).toBeEnabled();
    }
    // No app minimum applies until the member chooses an app.
    expect(screen.getByRole('button', { name: 'Cash App' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('$99.99 + processing fee')).toBeInTheDocument();
  });

  it('does not regress a Bitcoin-only checkout to the unavailable stablecoin fallback', async () => {
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: {} });
    renderStore();

    const picker = await screen.findByLabelText('Where you are paying from');
    expect(within(picker).getAllByText('BTC · Bitcoin')).toHaveLength(3);
    expect(screen.queryByText(/crypto payment is not available yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/stablecoin transfers are not available/i)).not.toBeInTheDocument();

    const paypal = within(picker).getByRole('button', { name: 'PayPal' });
    expect(paypal).toBeEnabled();
    fireEvent.click(paypal);

    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
      rail: 'btc_bitcoin',
      sendingApp: 'paypal',
    })));
  });

  it('sends the chosen app with the Bitcoin rail so the order records it', async () => {
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: {} });
    vi.mocked(createCryptoPaymentIntent).mockRejectedValue(new Error('Stop after request mapping.'));
    renderStore();

    fireEvent.click(await screen.findByRole('button', { name: 'Venmo' }));
    expect(screen.getByRole('button', { name: 'Venmo' })).toHaveAttribute('aria-pressed', 'true');
    const paymentGuideToggle = screen.getByRole('button', { name: /how to send this payment/i });
    expect(paymentGuideToggle).toHaveClass('text-sm');
    fireEvent.click(paymentGuideToggle);
    const paymentGuideTitle = await screen.findByRole('heading', { name: 'Cash App, PayPal or Venmo' });
    expect(paymentGuideTitle).toHaveClass('text-sm');
    expect(paymentGuideTitle.parentElement?.querySelector('ol')).toHaveClass('text-sm', 'leading-6');
    expect(screen.getByRole('link', { name: 'Venmo Bitcoin sending instructions' })).toHaveClass('text-sm');


    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalledWith({
      planId: 'founder_annual',
      idempotencyKey: expect.any(String),
      rail: 'btc_bitcoin',
      sendingApp: 'venmo',
    }));
    expect(trackBitcoinCheckoutMilestone).toHaveBeenCalledWith('bitcoin payment method selected', {
      productType: 'cruush_plus',
      productId: 'founder_annual',
      sendingApp: 'venmo',
    });
    expect(trackBitcoinCheckoutMilestone).not.toHaveBeenCalledWith(
      'bitcoin order created',
      expect.anything(),
    );
  });

  it('tracks order creation and confirmation without payment identifiers', async () => {
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: {} });
    vi.mocked(createCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000099',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'founder_annual',
      productType: 'cruush_plus',
      asset: 'BTC',
      network: 'bitcoin',
      rail: 'btc_bitcoin',
      sendingApp: 'paypal',
      chainId: 0,
      tokenAddress: '',
      amountUsdCents: 9999,
      quotedAmountAtomic: '150000',
      paymentAddress: 'bc1qnever-send-this-to-analytics',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'paid',
      expiresAt: '2099-09-01T12:30:00.000Z',
      createdAt: '2099-09-01T12:00:00.000Z',
      updatedAt: '2099-09-01T12:01:00.000Z',
      paidAt: '2099-09-01T12:01:00.000Z',
    });
    renderStore();

    fireEvent.click(await screen.findByRole('button', { name: 'PayPal' }));

    await waitFor(() => expect(trackBitcoinCheckoutMilestone).toHaveBeenCalledTimes(3));
    expect(vi.mocked(trackBitcoinCheckoutMilestone).mock.calls).toEqual([
      ['bitcoin payment method selected', {
        productType: 'cruush_plus',
        productId: 'founder_annual',
        sendingApp: 'paypal',
      }],
      ['bitcoin order created', {
        productType: 'cruush_plus',
        productId: 'founder_annual',
        sendingApp: 'paypal',
      }],
      ['bitcoin payment confirmed', {
        productType: 'cruush_plus',
        productId: 'founder_annual',
        sendingApp: 'paypal',
      }],
    ]);
  });

  it('keeps cheaper plans visible and disables Cash App below its minimum', async () => {
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue(perAppEligibility);
    renderStore();
    fireEvent.click(await screen.findByRole('button', { name: /Compare plans/i }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Other cruush+ prices' })).getByText('7 days'));
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'A crypto wallet' })).toBeEnabled();
    expect(screen.getByText('Minimum 0.00005 BTC')).toBeInTheDocument();
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it('greys PayPal and Venmo for a small purchase without changing the product', async () => {
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue(perAppEligibility);
    renderStore();
    fireEvent.click(await screen.findByRole('button', { name: /Compare plans/i }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Other cruush+ prices' })).getByText('1 month'));
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Venmo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeEnabled();
    expect(screen.getByText('$18.99 + processing fee')).toBeInTheDocument();
    expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
  });

  it('lists everything for a wallet, which has no app minimum', async () => {
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue(perAppEligibility);
    renderStore();

    fireEvent.click(await screen.findByRole('button', { name: 'A crypto wallet' }));
    fireEvent.click(screen.getByRole('button', { name: /Compare plans/i }));

    const otherPrices = await screen.findByRole('list', { name: 'Other cruush+ prices' });
    expect(within(otherPrices).getByText('7 days')).toBeInTheDocument();
    expect(within(otherPrices).getAllByRole('listitem')).toHaveLength(4);
  });

  it('keeps every plan listed when the Bitcoin eligibility sample does not cover a plan', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(everyRailProcessorStatus());
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({
      rail: 'btc_bitcoin',
      products: { plus_weekly: [] },
    });
    renderStore();

    // Bitcoin remains the only checkout rail; the eligibility sample only filters app minimums.
    fireEvent.click(await screen.findByRole('button', { name: /Compare plans/i }));
    const otherPrices = await screen.findByRole('list', { name: 'Other cruush+ prices' });
    expect(within(otherPrices).getByText('7 days')).toBeInTheDocument();
  });

  it('keeps Bitcoin app checkout available when the eligibility sample is unavailable', async () => {
    vi.mocked(getBitcoinSendingEligibility).mockRejectedValue(new Error('chain source unavailable'));
    renderStore();

    const paypal = await screen.findByRole('button', { name: 'PayPal' });
    await waitFor(() => expect(paypal).toBeEnabled());
    expect(within(paypal).getByText('BTC · Bitcoin')).toBeInTheDocument();
    expect(screen.queryByText('Checking minimum')).not.toBeInTheDocument();
    fireEvent.click(paypal);
    fireEvent.click(screen.getByRole('button', { name: /Compare plans/i }));

    const otherPrices = await screen.findByRole('list', { name: 'Other cruush+ prices' });
    expect(within(otherPrices).getByText('7 days')).toBeInTheDocument();
  });

  it('offers the repriced 3-Pulse entry pack through Cash App', async () => {
    vi.mocked(getPulsePacks).mockResolvedValue({ packs: pulsePacks });
    vi.mocked(getCurrentPulsePaymentIntent).mockResolvedValue(null);
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: { ping_3: ['Cash App'], ping_10: ['Cash App'], ping_25: ['Cash App'] } });
    vi.mocked(createPulsePaymentIntent).mockRejectedValue(new Error('Stop after request mapping.'));
    render(<MemoryRouter><CruushPlusStore product="ping_pack" /></MemoryRouter>);
    expect(await screen.findByText('$9.99')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cash App' }));
    await waitFor(() => expect(createPulsePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ packId: 'ping_3', sendingApp: 'cash_app' })));
  });

  it('enables PayPal only after a qualifying Pulse pack is selected', async () => {
    vi.mocked(getPulsePacks).mockResolvedValue({ packs: pulsePacks });
    vi.mocked(getCurrentPulsePaymentIntent).mockResolvedValue(null);
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: { ping_3: [], ping_10: ['Cash App'], ping_25: ['Cash App', 'PayPal', 'Venmo'] } });
    render(<MemoryRouter><CruushPlusStore product="ping_pack" /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'PayPal' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Compare plans/i }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Other Pulse prices' })).getByText('25 Pulses'));
    expect(screen.getByRole('button', { name: 'PayPal' })).toBeEnabled();
    expect(createPulsePaymentIntent).not.toHaveBeenCalled();
  });

  it('keeps the wallet usable when no app can send the smallest Pulse pack', async () => {
    vi.mocked(getPulsePacks).mockResolvedValue({ packs: pulsePacks });
    vi.mocked(getCurrentPulsePaymentIntent).mockResolvedValue(null);
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: { ping_3: [], ping_10: ['Cash App'], ping_25: ['Cash App'] } });
    render(<MemoryRouter><CruushPlusStore product="ping_pack" /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'PayPal' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cash App' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'A crypto wallet' }));
    await waitFor(() => expect(createPulsePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ packId: 'ping_3', sendingApp: 'wallet' })));
  });

  it('starts just one order when the app button is tapped twice rapidly', async () => {
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: {} });
    let rejectOrder: (error: Error) => void = () => {};
    vi.mocked(createCryptoPaymentIntent).mockImplementation(() => new Promise((_resolve, reject) => { rejectOrder = reject; }));
    renderStore();
    const button = await screen.findByRole('button', { name: 'Cash App' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(createCryptoPaymentIntent).toHaveBeenCalledTimes(1);
    await act(async () => rejectOrder(new Error('Preview ended.')));
  });

  it('restores an open PayPal Bitcoin order onto the PayPal source', async () => {
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue(perAppEligibility);
    vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000021',
      userId: '00000000-0000-4000-8000-000000000001',
      planId: 'plus_annual',
      productType: 'cruush_plus',
      asset: 'BTC',
      network: 'bitcoin',
      rail: 'btc_bitcoin',
      sendingApp: 'paypal',
      chainId: 0,
      tokenAddress: '',
      amountUsdCents: 11999,
      gasFeeUsdCents: 20,
      totalUsdCents: 12019,
      fundingEstimates: [{ app: 'PayPal', minimumSendAtomic: '100000', meetsSendingMinimum: true, allowanceUsdCents: 1200, availableUsdCents: 13219, availableAtomic: '165000', estimated: true }],
      quotedAmountAtomic: '150000',
      paymentAddress: 'bc1qexampleaddressforthepaypalorder000000000',
      paymentUri: null,
      qrCodeDataUrl: null,
      status: 'awaiting_payment',
      expiresAt: '2099-09-01T12:30:00.000Z',
      createdAt: '2099-09-01T12:00:00.000Z',
      updatedAt: '2099-09-01T12:00:00.000Z',
      paidAt: null,
    });
    renderStore();

    const paymentProgress = await screen.findByRole('list', { name: 'Payment progress' });
    expect(within(paymentProgress).getAllByRole('listitem')).toHaveLength(1);
    expect(within(paymentProgress).getByText('0/6 confirmations')).toBeInTheDocument();
    expect(screen.getByText(/waiting for your payment to arrive/i)).toBeInTheDocument();
    expect(screen.getByText('Protected order')).toBeInTheDocument();
    expect(screen.getByText(/^Order timer: \d+:\d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
    const protectedOrder = screen.getByRole('button', { name: /Protected order.*Order timer:/ });
    expect(protectedOrder).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/This address is unique to your order/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Checkout updates when your payment/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy amount' })).toBeVisible();
    fireEvent.click(protectedOrder);
    expect(protectedOrder).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/This address is unique to your order/)).toBeVisible();
    expect(screen.getByText(/Checkout updates when your payment/)).toBeVisible();
    fireEvent.click(protectedOrder);
    expect(screen.queryByText(/This address is unique to your order/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Order timer:/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'PayPal' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cash App' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Venmo' })).toHaveAttribute('aria-pressed', 'false');
    // Funding guidance follows the requested collapsed Protected order section.
    expect(screen.queryByText(/^PayPal: have about/)).not.toBeInTheDocument();
    fireEvent.click(protectedOrder);
    expect(screen.getByText(/^PayPal: have about/)).toBeVisible();
    expect(screen.queryByText(/^Cash App: have about/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Venmo: have about/)).not.toBeInTheDocument();
  });

  it('restores all four stablecoin sources once every rail is ready', async () => {
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(everyRailProcessorStatus());
    vi.mocked(createCryptoPaymentIntent).mockRejectedValue(new Error('Stop after request mapping.'));
    vi.mocked(getBitcoinSendingEligibility).mockResolvedValue({ rail: 'btc_bitcoin', products: {} });
    renderStore();

    const picker = await screen.findByLabelText('Where you are paying from');
    expect(picker).toHaveClass('grid-cols-2');
    const buttons = within(picker).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Cash App', 'PayPal', 'Venmo', 'A crypto wallet',
    ]);
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Cash AppUSDC · Arbitrum', 'PayPalPYUSD · Arbitrum', 'VenmoPYUSD · Ethereum', 'A crypto walletUSDC · Base',
    ]);
    for (const button of buttons) {
      expect(button).toBeEnabled();
      expect(button.className).not.toContain('col-span');
    }
    // Stablecoin checkout keeps its existing initial source selection.
    await waitFor(() => {
      expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    });

    fireEvent.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(createCryptoPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
      rail: 'pyusd_arbitrum', sendingApp: 'paypal',
    })));
  });
});


describe('sale expiry keeps catalogue and issued-order prices separate', () => {
  it.each([
    { product: 'cruush_plus' as const, hasOrder: false, lateInitial: false },
    { product: 'ping_pack' as const, hasOrder: false, lateInitial: false },
    { product: 'cruush_plus' as const, hasOrder: true, lateInitial: false },
    { product: 'ping_pack' as const, hasOrder: true, lateInitial: false },
    { product: 'cruush_plus' as const, hasOrder: false, lateInitial: true },
    { product: 'ping_pack' as const, hasOrder: false, lateInitial: true },
    { product: 'cruush_plus' as const, hasOrder: false, lateInitial: false, wake: 'focus' },
    { product: 'ping_pack' as const, hasOrder: false, lateInitial: false, wake: 'visibilitychange' },
    { product: 'cruush_plus' as const, hasOrder: false, lateInitial: false, wake: 'focus', refreshFails: true },
    { product: 'ping_pack' as const, hasOrder: false, lateInitial: false, wake: 'visibilitychange', refreshFails: true },
  ])('$product restores catalogue pricing at expiry while preserving an issued order ($hasOrder, late sample: $lateInitial)', async ({ product, hasOrder, lateInitial, wake, refreshFails }) => {
    const deadline = Date.parse('2026-10-12T03:59:00Z');
    const isPulse = product === 'ping_pack';
    const amountUsdCents = isPulse ? 500 : 950;
    const originalAmountUsdCents = isPulse ? 999 : 1899;
    const discountedText = isPulse ? '$5.00' : '$9.50/month';
    const listText = isPulse ? '$9.99' : '$18.99/month';
    const sale = { id: 'cruush-plus-50', percentOff: 50, endsAt: '2026-10-12T03:59:00Z', couponStacking: false } as const;
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(deadline - 1000);
    let view: ReturnType<typeof render> | undefined;
    try {
      window.localStorage.clear();
      vi.mocked(getCryptoProcessorStatus).mockResolvedValue(bitcoinOnlyProcessorStatus());
      vi.mocked(getBillingPlans).mockResolvedValue({
        processor: 'fake', testCheckout: true, testWarning: '', currency: 'USD', sale,
        plans: [{ ...plans[0]!, amountCents: 950, originalAmountCents: 1899, sale }],
      });
      vi.mocked(getPulsePacks).mockResolvedValue({ sale, packs: [{
        id: 'ping_3', name: '3 Pulses', description: '3 permanent Pulse credits', pingCount: 3,
        amountCents: 500, originalAmountCents: 999, currency: 'USD', sale,
      }] });
      const productId = isPulse ? 'ping_3' : 'plus_monthly';
      let finishInitialSample = () => {};
      const initialSample = new Promise<Awaited<ReturnType<typeof getBitcoinSendingEligibility>>>(resolve => {
        finishInitialSample = () => resolve({ rail: 'btc_bitcoin', products: { [productId]: [] } });
        if (!lateInitial) finishInitialSample();
      });
      vi.mocked(getBitcoinSendingEligibility).mockReset()
        .mockReturnValueOnce(initialSample)
        .mockResolvedValue({ rail: 'btc_bitcoin', products: { [productId]: ['Cash App'] } });
      if (refreshFails) vi.mocked(getBitcoinSendingEligibility).mockRejectedValue(new Error('Offline'));
      const order = hasOrder ? {
        id: 'expiry-locked-order', userId: 'member', planId: isPulse ? 'ping_3' : 'plus_monthly', productType: product,
        asset: 'BTC' as const, network: 'bitcoin' as const, rail: 'btc_bitcoin' as const, chainId: 0, tokenAddress: '',
        amountUsdCents, discount: null,
        sale: { ...sale, originalAmountUsdCents, amountUsdCents, discountAmountUsdCents: originalAmountUsdCents - amountUsdCents },
        quotedAmountAtomic: '9500000', paymentAddress: 'bc1qexistingtestorder', paymentUri: null, qrCodeDataUrl: null,
        status: 'awaiting_payment' as const, expiresAt: '2026-10-12T04:29:00Z', createdAt: null, updatedAt: null, paidAt: null,
      } : null;
      vi.mocked(getCurrentCryptoPaymentIntent).mockResolvedValue(order);
      vi.mocked(getCurrentPulsePaymentIntent).mockResolvedValue(order);
      await act(async () => {
        view = render(<MemoryRouter><CruushPlusStore product={product} /></MemoryRouter>);
      });
      const prices = within(screen.getByRole('list', { name: isPulse ? 'Pulse prices' : 'cruush+ prices' }));
      expect(prices.getByText(discountedText)).toBeInTheDocument();
      expect(prices.getByText(listText)).toHaveClass('line-through');
      expect(screen.getByRole('button', { name: 'Cash App' })).toBeDisabled();
      await act(async () => {
        if (wake) {
          vi.setSystemTime(deadline);
          (wake === 'focus' ? window : document).dispatchEvent(new Event(wake));
        } else {
          await vi.advanceTimersByTimeAsync(1000);
        }
      });
      expect(getBitcoinSendingEligibility).toHaveBeenCalledTimes(2);
      if (hasOrder) {
        expect(prices.getByText(discountedText)).toBeInTheDocument();
        expect(prices.getByText(listText)).toHaveClass('line-through');
        expect(screen.getByRole('button', { name: 'Payment started' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cash App' })).toBeDisabled();
      } else {
        if (!refreshFails) expect(screen.getByRole('button', { name: 'Cash App' })).toBeEnabled();
        expect(prices.queryByText(discountedText)).not.toBeInTheDocument();
        expect(prices.getByText(listText)).not.toHaveClass('line-through');
        expect(screen.getByLabelText('Coupon code')).toBeInTheDocument();
      }
      if (lateInitial) {
        await act(async () => { finishInitialSample(); });
        expect(screen.getByRole('button', { name: 'Cash App' })).toBeEnabled();
      }
      expect(createCryptoPaymentIntent).not.toHaveBeenCalled();
      expect(createPulsePaymentIntent).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });
});
