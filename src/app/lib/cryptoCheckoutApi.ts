import { requestApi } from './apiClient';
import type { CruushPlusPlanId } from './billingApi';

export type CryptoPaymentRailId = 'usdc_arbitrum' | 'pyusd_arbitrum' | 'pyusd_ethereum' | 'usdc_base';
export type CryptoPaymentAsset = 'USDC' | 'PYUSD';
export type CryptoPaymentNetwork = 'arbitrum' | 'base' | 'ethereum';

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
  planId: CruushPlusPlanId;
  asset: CryptoPaymentAsset;
  network: CryptoPaymentNetwork;
  rail: CryptoPaymentRailId;
  chainId: number;
  tokenAddress: string;
  amountUsdCents: number;
  quotedAmountAtomic: string | null;
  paymentAddress: string | null;
  paymentUri: string | null;
  qrCodeDataUrl: string | null;
  status: CryptoPaymentStatus;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  paidAt: string | null;
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
