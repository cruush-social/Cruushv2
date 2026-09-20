import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrderHistory from './OrderHistory';
import { getCryptoOrderHistory } from '../lib/cryptoCheckoutApi';
vi.mock('../lib/cryptoCheckoutApi', () => ({ getCryptoOrderHistory: vi.fn() }));

afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe('Order history', () => {
  it('refreshes an expired payment through confirmation and activation, then stops on unmount', async () => {
    vi.useFakeTimers();
    const order = { id: 'order-1', name: 'Monthly cruush+', productType: 'cruush_plus', asset: 'BTC', network: 'bitcoin', sendingApp: 'paypal', amountUsdCents: 1899, gasFeeUsdCents: 100, totalUsdCents: 1999, quotedAmountAtomic: '10000', status: 'expired', createdAt: '2026-09-01T10:00:00Z', expiresAt: '2026-09-02T10:00:00Z', paidAt: null, activatedAt: null, confirmations: 3, confirmationTarget: 6, paymentAmountReceived: true } as const;
    vi.mocked(getCryptoOrderHistory).mockResolvedValueOnce({ orders: [order], nextCursor: null }).mockResolvedValue({ orders: [{ ...order, status: 'paid', confirmations: 6, activatedAt: '2026-09-03T10:00:00Z' }], nextCursor: null });
    const view = render(<MemoryRouter><OrderHistory /></MemoryRouter>);
    await act(async () => {});
    expect(screen.getByText('Payment window closed')).toBeInTheDocument();
    expect(screen.getByText('3/6 · Full payment detected')).toBeInTheDocument();
    // The app the order was paid from is named with its asset and network.
    expect(screen.getByText('$19.99 · BTC (bitcoin) · PayPal')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText('Payment confirmed')).toBeInTheDocument();
    expect(screen.getByText('6/6 · Full payment detected')).toBeInTheDocument();
    expect(screen.getByText(/^Activated /)).toBeInTheDocument();
    view.unmount();
    await vi.advanceTimersByTimeAsync(30000);
    expect(getCryptoOrderHistory).toHaveBeenCalledTimes(2);
  });
});
