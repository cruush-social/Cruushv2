import { requestApi } from './apiClient';

export type PrivacySettings = {
  ghostModeEnabled: boolean;
  preciseLocationVisibility: 'none' | 'mutual_cruushes';
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  ghostModeEnabled: false,
  preciseLocationVisibility: 'none',
};

export function getMyPrivacySettings() {
  return requestApi<PrivacySettings>('/api/profiles/me/privacy-settings');
}

export function saveMyPrivacySettings(settings: PrivacySettings) {
  return requestApi<PrivacySettings>('/api/profiles/me/privacy-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
