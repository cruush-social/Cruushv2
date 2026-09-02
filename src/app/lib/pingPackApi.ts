import { requestApi } from './apiClient';
import type {
  CryptoPaymentIntent,
  CryptoPaymentRailId,
} from './cryptoCheckoutApi';

export type PingPackId = 'ping_3' | 'ping_10' | 'ping_25';

export type PingPack = {
  id: PingPackId;
  name: string;
  description: string;
  pingCount: number;
  amountCents: number;
  currency: 'USD';
};

export type PingPackCatalog = {
  currency: 'USD';
  packs: PingPack[];
};

export async function getPingPacks() {
  return requestApi<PingPackCatalog>('/api/billing/ping-packs');
}

export async function createPingPackPaymentIntent(input: {
  packId: PingPackId;
  idempotencyKey: string;
  rail?: CryptoPaymentRailId;
}) {
  return requestApi<CryptoPaymentIntent>('/api/crypto/ping-pack-intents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getCurrentPingPackPaymentIntent() {
  return requestApi<CryptoPaymentIntent | null>('/api/crypto/ping-pack-intents/current');
}
