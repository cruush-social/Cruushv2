export type MapMarkerBadge = {
  kind: 'position';
  label: string;
  iconName?: string;
};

export type MapMarker = {
  id: string;
  kind?: 'person' | 'event' | 'cluster';
  displayName: string;
  approximateLatitude: number;
  approximateLongitude: number;
  lastActiveLabel?: string;
  photo?: string | null;
  isCurrentUser?: boolean;
  displayMode?: 'PRECISE' | 'GHOST';
  animationHint?: 'NONE' | 'FADE_LAST_MINUTE' | 'SIGNAL_LOSS' | 'REAPPEAR';
  privacyRadiusMeters?: number;
  npcGhostDemo?: boolean;
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
  cluster?: {
    id: string;
    count: number;
    label: string;
  };
};

export type CruushMapInstance = {
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const POSITION_BADGE_VALUES = new Set([
  'bottom',
  'side',
  'pillow princess',
  'stone top',
  'top',
  'vers bottom',
  'vers top',
  'versatile',
  'none',
  'oral',
  'gooner',
]);

const POSITION_BADGE_ALIASES: Record<string, string> = {
  vers: 'versatile',
  'versatile bottom': 'vers bottom',
  'versatile top': 'vers top',
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
