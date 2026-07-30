import { requestApi } from './apiClient';

export type AppMetaPayload = {
  service: string;
  auth: string;
  storage: string;
  migratedFromSupabase: boolean;
  alphaTest: {
    enabled: boolean;
    active: boolean;
    endsAt: string | null;
    ended: boolean;
  };
  betaAccess?: {
    enabled: boolean;
    center: {
      lat: number;
      lng: number;
    };
    radiusMiles: number;
    venueName: string;
  };
  photoUploads?: {
    profilePhotos: boolean;
    messagePhotos: boolean;
  };
};

export function getAppMeta() {
  return requestApi<AppMetaPayload>('/api/meta');
}
