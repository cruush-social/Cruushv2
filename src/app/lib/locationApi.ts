import { requestApi } from './apiClient';
import type { DisplayLocationToken } from './displayLocationTokens';

export type ProfileLocationPayload = {
  lat: number;
  lng: number;
  fuzz_radius_meters?: number;
};

export type ProfileLocationRecord = {
  id: string;
  lat?: number | null;
  lng?: number | null;
  fuzzy_lat?: number | null;
  fuzzy_lng?: number | null;
  fuzz_radius_meters?: number;
  display_location_token?: DisplayLocationToken;
  display_expires_at_ms?: number;
  display_mode?: 'PRECISE' | 'GHOST';
  animation_hint?: 'NONE' | 'FADE_LAST_MINUTE' | 'SIGNAL_LOSS' | 'REAPPEAR';
  location_updated_at: string | null;
};

export async function syncMyLocation(location: ProfileLocationPayload) {
  return requestApi<ProfileLocationRecord>('/api/profiles/me/location', {
    method: 'PUT',
    body: JSON.stringify(location),
  });
}
