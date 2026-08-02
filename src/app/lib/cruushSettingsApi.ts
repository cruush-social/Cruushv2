import { requestApi } from './apiClient';

export type NsfwMessageVisibility = 'public' | 'mutual_cruushes' | 'mutual_crowds' | 'none';

export type CruushMatchSettings = {
  nsfwMessageVisibility: NsfwMessageVisibility;
  nsfwSendVisibility: NsfwMessageVisibility;
  updatedAt: string | null;
};

export type CruushMatchSettingsUpdate = Pick<CruushMatchSettings, 'nsfwMessageVisibility' | 'nsfwSendVisibility'>;

export const DEFAULT_CRUUSH_MATCH_SETTINGS: CruushMatchSettings = {
  nsfwMessageVisibility: 'mutual_cruushes',
  nsfwSendVisibility: 'mutual_cruushes',
  updatedAt: null,
};

export function getCruushMatchSettings() {
  return requestApi<CruushMatchSettings>('/api/cruush/settings');
}

function toCruushMatchSettingsUpdate(settings: CruushMatchSettingsUpdate): CruushMatchSettingsUpdate {
  return {
    nsfwMessageVisibility: settings.nsfwMessageVisibility,
    nsfwSendVisibility: settings.nsfwSendVisibility,
  };
}

export function saveCruushMatchSettings(settings: CruushMatchSettingsUpdate) {
  return requestApi<CruushMatchSettings>('/api/cruush/settings', {
    method: 'PUT',
    body: JSON.stringify(toCruushMatchSettingsUpdate(settings)),
  });
}
