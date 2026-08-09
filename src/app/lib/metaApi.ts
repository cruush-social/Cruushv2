import { ApiClientError, getApiBaseUrl } from './apiClient';

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
  };
  photoUploads?: {
    profilePhotos: boolean;
    messagePhotos: boolean;
  };
};

export async function getAppMeta() {
  const response = await fetch(`${getApiBaseUrl()}/api/meta`, {
    credentials: 'include',
  });
  const bodyText = await response.text();
  let parsedBody: unknown = {};

  if (bodyText) {
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      parsedBody = {};
    }
  }

  if (!response.ok) {
    const apiError = (parsedBody as { error?: { code?: string; message?: string; details?: unknown } }).error;
    throw new ApiClientError(
      response.status,
      apiError?.code ?? 'INTERNAL_ERROR',
      apiError?.message ?? 'Request failed.',
      apiError?.details ?? null,
    );
  }

  const maybeWrapped = parsedBody as { data?: AppMetaPayload };
  return maybeWrapped.data ?? (parsedBody as AppMetaPayload);
}
