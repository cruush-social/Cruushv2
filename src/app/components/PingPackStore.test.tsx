import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CryptoPaymentIntent, CryptoProcessorStatus } from '../lib/cryptoCheckoutApi';
import PingPackStore from './PingPackStore';

vi.mock('../lib/pingPackApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/pingPackApi')>('../lib/pingPackApi');
  return {
    ...actual,
    getPingPacks: vi.fn(),
    getCurrentPingPackPaymentIntent: vi.fn(),
    createPingPackPaymentIntent: vi.fn(),
  };
});

vi.mock('../lib/cryptoCheckoutApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/cryptoCheckoutApi')>('../lib/cryptoCheckoutApi');
  return {
    ...actual,
    getCryptoProcessorStatus: vi.fn(),
    getCryptoPaymentIntent: vi.fn(),
    cancelCryptoPaymentIntent: vi.fn(),
  };
});

const {
  createPingPackPaymentIntent,
  getCurrentPingPackPaymentIntent,
  getPingPacks,
} = await import('../lib/pingPackApi');
const {
  cancelCryptoPaymentIntent,
  getCryptoProcessorStatus,
} = await import('../lib/cryptoCheckoutApi');

const packs = [
  { id: 'ping_3' as const, name: '3 Pings', description: '3 permanent Ping credits', pingCount: 3, amountCents: 299, currency: 'USD' as const },
  { id: 'ping_10' as const, name: '10 Pings', description: '10 permanent Ping credits', pingCount: 10, amountCents: 799, currency: 'USD' as const },
  { id: 'ping_25' as const, name: '25 Pings', description: '25 permanent Ping credits', pingCount: 25, amountCents: 1499, currency: 'USD' as const },
];

function processorStatus(ready = true): CryptoProcessorStatus {
  return {
    ready,
    asset: 'USDC',
    network: 'arbitrum',
    confirmationTarget: 1,
    rails: [
      { id: 'usdc_arbitrum', asset: 'USDC', network: 'arbitrum', chainId: 42161, tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', ready },
      { id: 'pyusd_arbitrum', asset: 'PYUSD', network: 'arbitrum', chainId: 42161, tokenAddress: '0x46850aD61C2B7d64d08c9C754F45254596696984', ready },
      { id: 'pyusd_ethereum', asset: 'PYUSD', network: 'ethereum', chainId: 1, tokenAddress: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8', ready: false },
      { id: 'usdc_base', asset: 'USDC', network: 'base', chainId: 8453, tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', ready },
    ],
  };
}

function openIntent(): CryptoPaymentIntent {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    userId: '00000000-0000-4000-8000-000000000001',
    planId: 'ping_10',
    productType: 'ping_pack',
    asset: 'USDC',
    network: 'arbitrum',
    rail: 'usdc_arbitrum',
    chainId: 42161,
    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    amountUsdCents: 799,
    quotedAmountAtomic: '7990000',
    paymentAddress: '0x73659c60270d326c06Ac204F1A9C63f889a3D14B',
    paymentUri: null,
    qrCodeDataUrl: null,
    status: 'awaiting_payment',
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paidAt: null,
  };
}

function renderStore() {
  return render(<MemoryRouter><PingPackStore /></MemoryRouter>);
}

describe('PingPackStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPingPacks).mockResolvedValue({ currency: 'USD', packs });
    vi.mocked(getCryptoProcessorStatus).mockResolvedValue(processorStatus());
    vi.mocked(getCurrentPingPackPaymentIntent).mockResolvedValue(null);
  });

  it('shows the approved catalog, permanent-credit rule, 30-minute duration, and legal links', async () => {
    renderStore();

    expect(await screen.findByRole('heading', { name: 'Buy Ping packs' })).toBeInTheDocument();
    expect(screen.getByText('$2.99')).toBeInTheDocument();
    expect(screen.getByText('$7.99')).toBeInTheDocument();
    expect(screen.getByText('$14.99')).toBeInTheDocument();
    expect(screen.getAllByText(/Purchased Pings never expire/)).toHaveLength(2);
    expect(screen.getAllByText(/30 minutes/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Read the billing policy' })).toHaveAttribute('href', '/billing-policy');
    expect(screen.getByRole('link', { name: 'Request a legally required refund review' })).toHaveAttribute('href', '/support?refund=1');
    expect(screen.getByText(/not available to New York residents/)).toBeInTheDocument();
  });

  it('uses the shared exact PayPal and wallet instructions', async () => {
    renderStore();

    await screen.findByText('$7.99');
    fireEvent.click(screen.getByRole('button', { name: 'PayPal' }));
    fireEvent.click(screen.getByRole('button', { name: 'How to send this payment' }));
    expect(await screen.findByText(/open your PayPal USD \(PYUSD\) balance/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm the network is Arbitrum/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'A crypto wallet' }));
    expect(await screen.findByText(/Choose USDC as the asset and Base as the network/i)).toBeInTheDocument();
  });

  it('restores an open member order and can cancel it to change payment method', async () => {
    const current = openIntent();
    vi.mocked(getCurrentPingPackPaymentIntent).mockResolvedValue(current);
    vi.mocked(cancelCryptoPaymentIntent).mockResolvedValue({ ...current, status: 'cancelled' });
    renderStore();

    expect(await screen.findByText(/Order timer:/)).toBeInTheDocument();
    expect(screen.getByText(current.paymentAddress!)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change payment method' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and choose another method' }));

    await waitFor(() => expect(cancelCryptoPaymentIntent).toHaveBeenCalledWith(current.id));
    expect(await screen.findByText('Previous order cancelled. Choose how you want to pay.')).toBeInTheDocument();
  });

  it('starts the selected pack without sending a client price', async () => {
    vi.mocked(createPingPackPaymentIntent).mockResolvedValue(openIntent());
    renderStore();

    fireEvent.click(await screen.findByRole('button', { name: 'Buy 10 Pings for $7.99' }));
    await waitFor(() => expect(createPingPackPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
      packId: 'ping_10',
      rail: 'usdc_arbitrum',
    })));
    expect(vi.mocked(createPingPackPaymentIntent).mock.calls[0]?.[0]).not.toHaveProperty('amountCents');
  });
});
