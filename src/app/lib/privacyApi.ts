import { requestApi } from './apiClient';

export type CrowdPrecisionPolicy = {
  crowdId: 'T4T' | 'Gay' | 'Dyke';
  precisionEnabled: boolean;
  mutualityRequired: boolean;
  minimumTrustLevel: 'MEMBER' | 'VERIFIED' | 'MUTUAL_INTERACTION';
  createdAtMs: number;
  revokedAtMs: number | null;
};

export type PrivacySettings = {
  baseMode: 'PUBLIC_PRECISE' | 'GHOST' | 'STEALTH';
  ghostModeEnabled: boolean;
  ghostRadiusMeters: number;
  ghostRadiusLabel: string;
  preciseToMutualCruushes: boolean;
  preciseToMutualCrowds: CrowdPrecisionPolicy[];
  preciseLocationVisibility: 'none' | 'mutual_cruushes';
  updatedAtMs: number;
  ghostRotationExpiresAtMs?: number | null;
};

export type PrivacySettingsUpdate = Pick<
  PrivacySettings,
  | 'baseMode'
  | 'ghostModeEnabled'
  | 'ghostRadiusMeters'
  | 'preciseToMutualCruushes'
  | 'preciseToMutualCrowds'
  | 'preciseLocationVisibility'
>;

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  baseMode: 'PUBLIC_PRECISE',
  ghostModeEnabled: false,
  ghostRadiusMeters: 1609,
  ghostRadiusLabel: '1 mi',
  preciseToMutualCruushes: false,
  preciseToMutualCrowds: [],
  preciseLocationVisibility: 'none',
  updatedAtMs: 0,
};

export const GHOST_RADIUS_OPTIONS = [
  { label: '500 ft', meters: 152 },
  { label: '0.25 mi', meters: 402 },
  { label: '0.5 mi', meters: 805 },
  { label: '1 mi', meters: 1609 },
  { label: '3 mi', meters: 4828 },
  { label: '5 mi', meters: 8047 },
] as const;

export type MapPresenceSettings = {
  days: number;
  minDays: number;
  maxDays: number;
};

export const DEFAULT_MAP_PRESENCE_SETTINGS: MapPresenceSettings = {
  days: 7,
  minDays: 1,
  maxDays: 30,
};

export const MAP_PRESENCE_OPTIONS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
] as const;

export function getMyMapPresenceSettings() {
  return requestApi<MapPresenceSettings>('/api/privacy/map-presence');
}

export function saveMyMapPresenceSettings(days: number) {
  return requestApi<MapPresenceSettings>('/api/privacy/map-presence', {
    method: 'PUT',
    body: JSON.stringify({ days }),
  });
}

export type GhostPulseSettings = {
  enabled: boolean;
};

export const DEFAULT_GHOST_PULSE_SETTINGS: GhostPulseSettings = {
  enabled: true,
};

export function getMyGhostPulseSettings() {
  return requestApi<GhostPulseSettings>('/api/privacy/ghost-pulse');
}

export function saveMyGhostPulseSettings(enabled: boolean) {
  return requestApi<GhostPulseSettings>('/api/privacy/ghost-pulse', {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

export type PrivacyAuditAccess = {
  viewer_profile_token: string;
  viewer: {
    id: string;
    name: string;
    pronouns: string;
    photo: string | null;
    photoExplicit?: boolean;
  };
  reason: string;
  permission_type: 'mutual_cruush' | 'mutual_crowd';
  granted_at_ms: number;
  last_decision_at_ms: number;
  revoke_action_token: string;
};

export type PrivacyAuditResponse = {
  exact_location_access: PrivacyAuditAccess[];
};

export function getMyPrivacySettings() {
  return requestApi<PrivacySettings>('/api/profiles/me/privacy-settings');
}

function toPrivacySettingsUpdate(settings: PrivacySettings): PrivacySettingsUpdate {
  return {
    baseMode: settings.baseMode,
    ghostModeEnabled: settings.ghostModeEnabled,
    ghostRadiusMeters: settings.ghostRadiusMeters,
    preciseToMutualCruushes: settings.preciseToMutualCruushes,
    preciseToMutualCrowds: settings.preciseToMutualCrowds,
    preciseLocationVisibility: settings.preciseLocationVisibility,
  };
}

export function saveMyPrivacySettings(settings: PrivacySettings) {
  return requestApi<PrivacySettings>('/api/profiles/me/privacy-settings', {
    method: 'PUT',
    body: JSON.stringify(toPrivacySettingsUpdate(settings)),
  });
}

export function getPrivacyAudit() {
  return requestApi<PrivacyAuditResponse>('/api/privacy/audit');
}

export function revokePrivacyAccess(revokeActionToken: string) {
  return requestApi<{
    status: 'revoked';
    effective_at_ms: number;
    new_visibility_for_viewer: 'GHOST_OR_NONE';
  }>('/api/privacy/revoke', {
    method: 'POST',
    body: JSON.stringify({
      revoke_action_token: revokeActionToken,
    }),
  });
}

export type MapPresenceSettings = {
  days: number;
};

export function getMapPresence() {
  return requestApi<MapPresenceSettings>('/api/privacy/map-presence');
}

export function saveMapPresence(days: number) {
  return requestApi<MapPresenceSettings>('/api/privacy/map-presence', {
    method: 'PUT',
    body: JSON.stringify({ days }),
  });
}
