import { requestApi } from './apiClient';
import type { CruushPlusPlanId } from './billingApi';

export type CryptoPaymentRailId = 'usdc_arbitrum' | 'pyusd_arbitrum' | 'pyusd_ethereum' | 'usdc_base' | 'btc_bitcoin';
export type CryptoPaymentAsset = 'USDC' | 'PYUSD' | 'BTC';
export type CryptoPaymentNetwork = 'arbitrum' | 'base' | 'ethereum' | 'bitcoin';

export type CryptoProcessorStatus = {
  ready: boolean;
  asset: CryptoPaymentAsset;
  network: CryptoPaymentNetwork;
  confirmationTarget: number;
  rails: Array<{
    id: CryptoPaymentRailId;
    asset: CryptoPaymentAsset;
    network: CryptoPaymentNetwork;
    chainId: number;
    tokenAddress: string;
    ready: boolean;
  }>;
};

export type CryptoPaymentStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'confirming'
  | 'paid'
  | 'expired'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export type CryptoPaymentIntent = {
  id: string;
  userId: string;
  planId: string;
  productType: 'cruush_plus' | 'ping_pack';
  asset: CryptoPaymentAsset;
  network: CryptoPaymentNetwork;
  rail: CryptoPaymentRailId;
  chainId: number;
  tokenAddress: string;
  amountUsdCents: number;
  gasFeeUsdCents?: number;
  totalUsdCents?: number;
  fundingEstimates?: Array<{ app: string; minimumSendAtomic?: string; meetsSendingMinimum?: boolean; allowanceUsdCents: number; availableUsdCents: number; availableAtomic: string; estimated: true }>;
  quotedAmountAtomic: string | null;
  paymentAddress: string | null;
  paymentUri: string | null;
  qrCodeDataUrl: string | null;
  status: CryptoPaymentStatus;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  paidAt: string | null;
  confirmations?: number;
  confirmationTarget?: number;
  paymentAmountReceived?: boolean;
};

export function isSettledCryptoPayment(status: CryptoPaymentStatus) {
  return status === 'paid';
}

export function isOpenCryptoPayment(status: CryptoPaymentStatus) {
  return status === 'pending' || status === 'awaiting_payment' || status === 'confirming';
}

export async function getCryptoProcessorStatus() {
  return requestApi<CryptoProcessorStatus>('/api/crypto/status');
}

export async function createCryptoPaymentIntent(input: {
  planId: CruushPlusPlanId;
  idempotencyKey: string;
  rail?: CryptoPaymentRailId;
}) {
  return requestApi<CryptoPaymentIntent>('/api/crypto/payment-intents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getCryptoPaymentIntent(intentId: string) {
  return requestApi<CryptoPaymentIntent>(`/api/crypto/payment-intents/${intentId}`);
}

export async function getCurrentCryptoPaymentIntent() {
  return requestApi<CryptoPaymentIntent | null>('/api/crypto/payment-intents/current');
}

export async function cancelCryptoPaymentIntent(intentId: string) {
  return requestApi<CryptoPaymentIntent>(`/api/crypto/payment-intents/${intentId}/cancel`, {
    method: 'POST',
  });
}

export type PulsePack = { id: 'ping_3' | 'ping_10' | 'ping_25'; name: string; description: string; pingCount: number; amountCents: number; currency: 'USD' };
export function getPulsePacks() {
  return requestApi<{ packs: PulsePack[] }>('/api/billing/ping-packs');
}
export function createPulsePaymentIntent(input: { packId: string; idempotencyKey: string; rail: CryptoPaymentRailId }) {
  return requestApi<CryptoPaymentIntent>('/api/crypto/ping-pack-intents', { method: 'POST', body: JSON.stringify(input) });
}
export function getCurrentPulsePaymentIntent() {
  return requestApi<CryptoPaymentIntent | null>('/api/crypto/ping-pack-intents/current');
}
