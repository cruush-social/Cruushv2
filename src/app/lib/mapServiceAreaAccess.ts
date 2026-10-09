import { requestApi } from './apiClient';

export const MAP_SERVICE_AREA_ACCESS_CHANGED = 'cruush:map-service-area-access-changed';

export type ProfilePinServiceAreaAccess = {
  profilePinsAllowed: boolean;
  accessExpiresAtMs: number | null;
};

/** Use the server's effective location, including an active Mile High Club pin. */
export async function getProfilePinServiceAreaAccess() {
  return requestApi<ProfilePinServiceAreaAccess>('/api/users/map-access');
}

export function notifyMapServiceAreaAccessChanged() {
  window.dispatchEvent(new Event(MAP_SERVICE_AREA_ACCESS_CHANGED));
}
