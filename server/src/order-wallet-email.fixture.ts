// Synthetic test data only. Never used by the production queue.
import type { OrderWalletEmailDetails } from './order-wallet-email-details.js';
export const walletEmailFixture: OrderWalletEmailDetails = {
  id: '00000000-0000-4000-8000-000000000002', planName: 'Monthly cruush+',
  asset: 'PYUSD', network: 'arbitrum', sendingApp: 'paypal', amountUsdCents: 1899,
  gasFeeUsdCents: 10, quotedAmountAtomic: '19090000',
  paymentAddress: '0x0000000000000000000000000000000000000001',
  createdAt: '2026-10-17T20:00:00.000Z', expiresAt: '2026-10-17T20:30:00.000Z',
  discount: null, sale: null,
};
