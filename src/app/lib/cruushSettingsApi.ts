import { requestApi } from './apiClient';

export type NsfwMessageVisibility = 'public' | 'mutual_cruushes' | 'mutual_crowds' | 'none';
export type MessageVisibility = 'public' | 'mutual_cruushes' | 'mutual_crowds';

export type CruushMatchSettings = {
  messageVisibility: MessageVisibility;
  nsfwMessageVisibility: NsfwMessageVisibility;
  nsfwSendVisibility: NsfwMessageVisibility;
  updatedAt: string | null;
};

export type CruushMatchSettingsUpdate = Partial<Pick<CruushMatchSettings, 'messageVisibility' | 'nsfwMessageVisibility' | 'nsfwSendVisibility'>>;

export const DEFAULT_CRUUSH_MATCH_SETTINGS: CruushMatchSettings = {
  messageVisibility: 'mutual_cruushes',
  nsfwMessageVisibility: 'public',
  nsfwSendVisibility: 'public',
  updatedAt: null,
};

export function getCruushMatchSettings() {
  return requestApi<CruushMatchSettings>('/api/cruush/settings');
}

function toCruushMatchSettingsUpdate(settings: CruushMatchSettingsUpdate): CruushMatchSettingsUpdate {
  return {
    ...(settings.messageVisibility ? { messageVisibility: settings.messageVisibility } : {}),
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
