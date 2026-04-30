import { requestApi } from './apiClient';

export type DiscoveryUser = {
  id: string;
  name: string;
  display_name: string;
  age: number | null;
  pronouns: string;
  lat: number;
  lng: number;
  lastActive: string;
  distance: string;
  lookingFor: string[];
  vibes: string[];
  photo: string | null;
};

type Coordinates = {
  lat: number;
  lng: number;
};

export async function getNearbyUsers(coordinates?: Coordinates | null) {
  const params = new URLSearchParams();

  if (coordinates) {
    params.set('lat', String(coordinates.lat));
    params.set('lng', String(coordinates.lng));
  }

  const query = params.toString();
  const path = query ? `/api/users?${query}` : '/api/users';
  return requestApi<DiscoveryUser[]>(path);
}
