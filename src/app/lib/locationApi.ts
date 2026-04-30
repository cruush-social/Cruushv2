import { requestApi } from './apiClient';

export type ProfileLocationPayload = {
  lat: number;
  lng: number;
  fuzz_radius_meters?: number;
};

export type ProfileLocationRecord = {
  id: string;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  fuzz_radius_meters: number;
  location_updated_at: string | null;
};

export async function syncMyLocation(location: ProfileLocationPayload) {
  return requestApi<ProfileLocationRecord>('/api/profiles/me/location', {
    method: 'PUT',
    body: JSON.stringify(location),
  });
}
