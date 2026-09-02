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
  ghostRotationMinutes?: number;
  preciseToMutualCruushes: boolean;
  preciseToMutualCrowds: CrowdPrecisionPolicy[];
  darkRoomDistanceLabel?: boolean;
  preciseLocationVisibility: 'none' | 'mutual_cruushes';
  updatedAtMs: number;
  ghostRotationExpiresAtMs?: number | null;
};

export type PrivacySettingsUpdate = Pick<
  PrivacySettings,
  | 'baseMode'
  | 'ghostModeEnabled'
  | 'ghostRadiusMeters'
  | 'ghostRotationMinutes'
  | 'preciseToMutualCruushes'
  | 'preciseToMutualCrowds'
  | 'preciseLocationVisibility'
  | 'darkRoomDistanceLabel'
>;

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  baseMode: 'PUBLIC_PRECISE',
  ghostModeEnabled: false,
  ghostRadiusMeters: 1609,
  ghostRadiusLabel: '1 mi',
  ghostRotationMinutes: 15,
  preciseToMutualCruushes: false,
  preciseToMutualCrowds: [],
  preciseLocationVisibility: 'none',
  darkRoomDistanceLabel: false,
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

export const GHOST_ROTATION_OPTIONS = [
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  ...Array.from({ length: 24 }, (_, index) => ({
    label: `${index + 1} ${index === 0 ? 'hour' : 'hours'}`,
    minutes: (index + 1) * 60,
  })),
];

export type MapPresenceSettings = {
  hours: number;
  minHours: number;
  maxHours: number;
};

export const DEFAULT_MAP_PRESENCE_SETTINGS: MapPresenceSettings = {
  hours: 168,
  minHours: 1,
  maxHours: 168,
};

export const MAP_PRESENCE_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '3h', hours: 3 },
  { label: '6h', hours: 6 },
  { label: '8h', hours: 8 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '3d', hours: 72 },
  { label: '4d', hours: 96 },
  { label: '5d', hours: 120 },
  { label: '6d', hours: 144 },
  { label: '7d', hours: 168 },
] as const;

export function getMyMapPresenceSettings() {
  return requestApi<MapPresenceSettings>('/api/privacy/map-presence');
}

export function saveMyMapPresenceSettings(hours: number) {
  return requestApi<MapPresenceSettings>('/api/privacy/map-presence', {
    method: 'PUT',
    body: JSON.stringify({ hours }),
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
    ghostRotationMinutes: settings.ghostRotationMinutes,
    preciseToMutualCruushes: settings.preciseToMutualCruushes,
    preciseToMutualCrowds: settings.preciseToMutualCrowds,
    preciseLocationVisibility: settings.preciseLocationVisibility,
    darkRoomDistanceLabel: settings.darkRoomDistanceLabel,
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

export function getMapPresence() {
  return getMyMapPresenceSettings();
}

export function saveMapPresence(hours: number) {
  return saveMyMapPresenceSettings(hours);
}

export type TravelPin = {
  userId: string;
  latitude: number;
  longitude: number;
  label: string;
  setAtMs: number;
  /** When this pin may next be moved. */
  movableAtMs: number;
};

export const TRAVEL_PIN_MOVE_COOLDOWN_MS = 3 * 60 * 60 * 1000;

export function getMyTravelPin() {
  return requestApi<{ pin: TravelPin | null }>('/api/privacy/travel');
}

export type TravelAddressResult = {
  latitude: number;
  longitude: number;
  label: string;
  attribution: string;
};

export function geocodeTravelAddress(query: string) {
  return requestApi<{ result: TravelAddressResult | null }>('/api/privacy/travel/geocode', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export function saveMyTravelPin(input: { latitude: number; longitude: number; label?: string }) {
  return requestApi<{ pin: TravelPin }>('/api/privacy/travel', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function clearMyTravelPin() {
  return requestApi<{ pin: null }>('/api/privacy/travel', { method: 'DELETE' });
}
