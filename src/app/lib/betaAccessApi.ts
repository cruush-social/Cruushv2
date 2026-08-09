import { requestApi } from './apiClient';
import type { BetaAccessLocationPayload } from './authApi';

export type BetaAccessCheckPayload = {
  enabled: boolean;
  allowed: boolean;
};

export type BetaCityRequestPayload = {
  accepted: true;
  requestId: string | null;
};

export function checkBetaAccess(location: BetaAccessLocationPayload) {
  return requestApi<BetaAccessCheckPayload>('/api/beta/access/check', {
    method: 'POST',
    body: JSON.stringify(location),
  });
}

export function requestBetaCity(payload: { email: string; requestedCity: string }) {
  return requestApi<BetaCityRequestPayload>('/api/beta/city-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
