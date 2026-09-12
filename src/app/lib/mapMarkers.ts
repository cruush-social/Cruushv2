import type { DlModePhotoRelationship } from './dlMode';
import type { SideBadgeSelection } from './profileApi';

export type MapMarkerBadge = {
  kind: 'role' | 'position' | 'custom';
  label: string;
  iconName?: string;
  badgeId?: string;
  frame?: string;
  intent?: SideBadgeSelection['intent'];
  saved?: boolean;
};

export type MapMarker = {
  id: string;
  kind?: 'person' | 'event' | 'place' | 'cluster';
  displayName: string;
  userId?: string;
  signal?: string | null;
  latestFeedPostPreview?: string | null;
  approximateLatitude: number;
  approximateLongitude: number;
  lastActiveLabel?: string;
  photo?: string | null;
  photoExplicit?: boolean;
  photoRelationship?: DlModePhotoRelationship;
  travelling?: boolean;
  travelLabel?: string;
  isCurrentUser?: boolean;
  // Local UI state for the signed-in user's marker. Never populate from discovery data.
  ownerStealthActive?: boolean;
  displayMode?: 'PRECISE' | 'GHOST';
  animationHint?: 'NONE' | 'FADE_LAST_MINUTE' | 'SIGNAL_LOSS' | 'REAPPEAR';
  ghostRotationExpiresAtMs?: number;
  privacyRadiusMeters?: number;
  npcGhostDemo?: boolean;
  hasSharedCrowd?: boolean;
  activePing?: {
    id: string;
    expiresAt: string;
  } | null;
  roleBadge?: MapMarkerBadge | null;
  badge?: MapMarkerBadge | null;
  relationship?: {
    kind: 'mutual_cruush';
    precision?: 'fuzzy' | 'precise';
    canMessage: boolean;
  } | null;
  event?: {
    slug: string;
    venueName: string;
    attendeeCount: number;
    raUrl: string;
    iconAsset: string;
  };
  place?: {
    id: string;
    facilityType: string;
    activeCheckins: number;
  };
  cluster?: {
    id: string;
    count: number;
    label: string;
    kind?: 'venue' | 'people' | 'place';
    memberIds?: string[];
    action?: 'zoom' | 'spiderfy';
  };
};

export type CruushMapInstance = {
  getBounds?: () => {
    getEast: () => number;
    getNorth: () => number;
    getSouth: () => number;
    getWest: () => number;
  };
  getCenter?: () => { lat: number; lng: number };
  getZoom?: () => number;
  off?: (event: string, handler: () => void) => void;
  on?: (event: string, handler: () => void) => void;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const POSITION_BADGE_VALUES = new Set([
  'bottom',
  'side',
  'pillow princess',
  'stone bottom',
  'stone top',
  'top',
  'vers bottom',
  'vers top',
  'versatile',
  'none',
  'oral',
  'oral only',
  'hands only',
  'gooner',
]);

const POSITION_BADGE_ALIASES: Record<string, string> = {
  vers: 'versatile',
  'versatile bottom': 'vers bottom',
  'versatile top': 'vers top',
};

const ROLE_BADGE_VALUES = new Set([
  'brat',
  'brat tamer',
  'caregiver',
  'degradee',
  'degrader',
  'dominant',
  'handler',
  'hunter',
  'little',
  'masochist',
  'owner',
  'pet',
  'pleasure dom',
  'pleasure sub',
  'pleasure switch',
  'prey',
  'rigger',
  'rope bunny',
  'sadist',
  'sadomasochist',
  'submissive',
  'switch',
  'service',
  'service dom',
  'service sub',
  'service switch',
  'trainer',
  'worship',
  'worshipper',
  'worshipped',
]);

const ROLE_BADGE_ALIASES: Record<string, string> = {
  dom: 'dominant',
  sub: 'submissive',
};

function normalizeBadgeValue(value: string) {
  const normalizedValue = value.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return POSITION_BADGE_ALIASES[normalizedValue] ?? normalizedValue;
}

function findKnownBadgeValue(values: string[] | undefined) {
  return values
    ?.map(normalizeBadgeValue)
    .find((value) => POSITION_BADGE_VALUES.has(value));
}

export function createMapMarkerBadge(positionValues: string[] = [], _hostingTravelValues: string[] = []) {
  const positionValue = findKnownBadgeValue(positionValues);

  if (positionValue) {
    return {
      kind: 'position',
      label: positionValue,
      iconName: positionValue,
    } satisfies MapMarkerBadge;
  }

  return null;
}

export function createMapMarkerRoleBadge(roleValues: string[] = []) {
  const roleValue = roleValues
    .map((value) => value.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' '))
    .map((value) => ROLE_BADGE_ALIASES[value] ?? value)
    .find((value) => ROLE_BADGE_VALUES.has(value));

  if (!roleValue) {
    return null;
  }

  return {
    kind: 'role',
    label: roleValue,
    iconName: roleValue,
  } satisfies MapMarkerBadge;
}

export function createSavedMapMarkerBadge(
  selection: SideBadgeSelection | null | undefined,
  fallback: MapMarkerBadge | null,
) {
  if (!selection) {
    return fallback;
  }

  const badgeId = normalizeBadgeValue(selection.badge_id);

  if (!badgeId || badgeId === 'none') {
    return null;
  }

  const kind = ROLE_BADGE_VALUES.has(badgeId)
    ? 'role'
    : POSITION_BADGE_VALUES.has(badgeId)
      ? 'position'
      : 'custom';
  const label = badgeId
    .replace(/^(vibes|kinks)\s+/, '')
    .replace(/^hanky\s+/, '')
    .trim();

  return {
    kind,
    label,
    iconName: badgeId,
    badgeId,
    frame: selection.frame,
    intent: selection.intent,
    saved: true,
  } satisfies MapMarkerBadge;
}
