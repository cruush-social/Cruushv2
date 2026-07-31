import { requestApi } from './apiClient';

export type NsfwMessageVisibility = 'public' | 'mutual_cruushes' | 'mutual_crowds' | 'none';

export type CruushMatchSettings = {
  nsfwMessageVisibility: NsfwMessageVisibility;
  nsfwSendVisibility: NsfwMessageVisibility;
  updatedAt: string | null;
};

export const DEFAULT_CRUUSH_MATCH_SETTINGS: CruushMatchSettings = {
  nsfwMessageVisibility: 'mutual_cruushes',
  nsfwSendVisibility: 'mutual_cruushes',
  updatedAt: null,
};

export function getCruushMatchSettings() {
  return requestApi<CruushMatchSettings>('/api/cruush/settings');
}

export function saveCruushMatchSettings(settings: Pick<CruushMatchSettings, 'nsfwMessageVisibility' | 'nsfwSendVisibility'>) {
  return requestApi<CruushMatchSettings>('/api/cruush/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
