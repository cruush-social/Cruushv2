import { requestApi } from './apiClient';

export type DiscoveryUser = {
  id: string;
  name: string;
  display_name: string;
  age: number | null;
  pronouns: string;
  lat: number;
  lng: number;
  lastActive: string;
  distance: string;
  lookingFor: string[];
  vibes: string[];
  photo: string | null;
};

type Coordinates = {
  lat: number;
  lng: number;
};

const FALLBACK_CENTER = {
  lat: 40.6782,
  lng: -73.9442,
};

const DISCOVERY_FALLBACK_OFFSETS = [
  { lat: 0.0034, lng: -0.0021 },
  { lat: -0.0022, lng: 0.0031 },
  { lat: 0.0012, lng: 0.0043 },
  { lat: -0.0038, lng: -0.0015 },
  { lat: 0.0044, lng: 0.0011 },
];

const DISCOVERY_FALLBACK_USERS = [
  {
    id: 'demo-jordan',
    name: 'Jordan',
    display_name: 'Jordan',
    age: 26,
    pronouns: 'they/them',
    lastActive: '2m ago',
    lookingFor: ['Friends', 'Dates', 'Fun'],
    vibes: ['Artsy', 'Chill', 'Goth'],
    photo: null,
  },
  {
    id: 'demo-alex',
    name: 'Alex',
    display_name: 'Alex',
    age: 29,
    pronouns: 'he/him',
    lastActive: '5m ago',
    lookingFor: ['Dates', 'Relationship', 'Fun'],
    vibes: ['Nerdy', 'Adventurous', 'Alt'],
    photo: null,
  },
  {
    id: 'demo-sam',
    name: 'Sam',
    display_name: 'Sam',
    age: 24,
    pronouns: 'she/her',
    lastActive: '15m ago',
    lookingFor: ['Friends', 'Fun', 'Community'],
    vibes: ['Outdoorsy', 'Creative', 'Goth'],
    photo: null,
  },
  {
    id: 'demo-river',
    name: 'River',
    display_name: 'River',
    age: 31,
    pronouns: 'they/them',
    lastActive: '1h ago',
    lookingFor: ['Friends', 'Community', 'Networking'],
    vibes: ['Activist', 'Thoughtful', 'Chill'],
    photo: null,
  },
  {
    id: 'demo-casey',
    name: 'Casey',
    display_name: 'Casey',
    age: 27,
    pronouns: 'he/they',
    lastActive: '3h ago',
    lookingFor: ['Dates', 'Fun', 'Relationship'],
    vibes: ['Musical', 'Playful', 'Artsy'],
    photo: null,
  },
] satisfies Omit<DiscoveryUser, 'lat' | 'lng' | 'distance'>[];

function formatPreviewDistance(index: number) {
  const baseMiles = 0.2 + index * 0.2;
  return `${baseMiles.toFixed(1)} mi`;
}

export function buildFallbackNearbyUsers(coordinates?: Coordinates | null): DiscoveryUser[] {
  const center = coordinates ?? FALLBACK_CENTER;

  return DISCOVERY_FALLBACK_USERS.map((user, index) => {
    const offset = DISCOVERY_FALLBACK_OFFSETS[index % DISCOVERY_FALLBACK_OFFSETS.length] ?? DISCOVERY_FALLBACK_OFFSETS[0];

    return {
      ...user,
      lat: center.lat + offset.lat,
      lng: center.lng + offset.lng,
      distance: formatPreviewDistance(index),
    };
  });
}

export async function getNearbyUsers(coordinates?: Coordinates | null) {
  const params = new URLSearchParams();

  if (coordinates) {
    params.set('lat', String(coordinates.lat));
    params.set('lng', String(coordinates.lng));
  }

  const query = params.toString();
  const path = query ? `/api/users?${query}` : '/api/users';
  return requestApi<DiscoveryUser[]>(path);
}
