import { requestApi } from './apiClient';

export const MAP_PING_RADII_MILES = [1, 3, 5, 10, 15] as const;

export type MapPingRadiusMiles = (typeof MAP_PING_RADII_MILES)[number];

export type MapPingAllowance = {
  limit: number;
  used: number;
  remaining: number;
  nextEligibleAt: string | null;
};

export type ActiveMapPing = {
  id: string;
  expiresAt: string;
};

export type ReceivedMapPing = ActiveMapPing & {
  sourceUserId: string;
};

export type MapPingStatus = {
  allowance: MapPingAllowance;
  activePing: ActiveMapPing | null;
  receivedPings: ReceivedMapPing[];
};

export function getMapPingStatus() {
  return requestApi<MapPingStatus>('/api/map-pings/status');
}

export function sendMapPing(
  radiusMiles: MapPingRadiusMiles,
  idempotencyKey = crypto.randomUUID(),
) {
  return requestApi<MapPingStatus>('/api/map-pings', {
    method: 'POST',
    body: JSON.stringify({
      radiusMiles,
      idempotencyKey,
    }),
  });
}
