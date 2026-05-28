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
  scenes?: string[];
  archetypes?: string[];
  position: string[];
  role: string[];
  hostingTravel: string[];
  photo: string | null;
};

type Coordinates = {
  lat: number;
  lng: number;
};

export type DiscoveryFilterParams = {
  identities?: string[];
  presentations?: string[];
  lookingFor?: string[];
  timing?: string[];
  hosting?: string[];
  vibes?: string[];
  crowds?: string[];
  hobbies?: string[];
  positions?: string[];
  roles?: string[];
  kinks?: string[];
  bodyTypes?: string[];
  sexuality?: string[];
  substanceBoundaries?: string[];
};

function appendListParams(params: URLSearchParams, key: string, values?: string[]) {
  for (const value of values ?? []) {
    if (value.trim()) {
      params.append(key, value);
    }
  }
}

export async function getNearbyUsers(coordinates?: Coordinates | null, filters?: DiscoveryFilterParams) {
  const params = new URLSearchParams();

  if (coordinates) {
    params.set('lat', String(coordinates.lat));
    params.set('lng', String(coordinates.lng));
  }

  appendListParams(params, 'identities', filters?.identities);
  appendListParams(params, 'presentations', filters?.presentations);
  appendListParams(params, 'lookingFor', filters?.lookingFor);
  appendListParams(params, 'timing', filters?.timing);
  appendListParams(params, 'hosting', filters?.hosting);
  appendListParams(params, 'vibes', filters?.vibes);
  appendListParams(params, 'crowds', filters?.crowds);
  appendListParams(params, 'hobbies', filters?.hobbies);
  appendListParams(params, 'positions', filters?.positions);
  appendListParams(params, 'roles', filters?.roles);
  appendListParams(params, 'kinks', filters?.kinks);
  appendListParams(params, 'bodyTypes', filters?.bodyTypes);
  appendListParams(params, 'sexuality', filters?.sexuality);
  appendListParams(params, 'substanceBoundaries', filters?.substanceBoundaries);

  const query = params.toString();
  const path = query ? `/api/users?${query}` : '/api/users';
  return requestApi<DiscoveryUser[]>(path);
}
