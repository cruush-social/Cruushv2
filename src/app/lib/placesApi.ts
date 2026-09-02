import { requestApi } from './apiClient';
import type { CruushBadge } from './billingApi';
import type { SideBadges } from './profileApi';
import type { PlaceAmenity, PlaceFacilityType, PlaceSort, PlaceTag, PlaceVibe } from './places';

export type PlaceRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  accessInstructions: string;
  latitude: number;
  longitude: number;
  address: string | null;
  facilityType: PlaceFacilityType;
  status: 'pending' | 'published' | 'rejected' | 'archived';
  sourceKind: 'official' | 'open_data' | 'community';
  sourceUrl: string | null;
  sourceAttribution: string | null;
  verifiedAt: string | null;
  createdAt: string;
  tags: PlaceTag[];
  vibes?: PlaceVibe[];
  amenities?: PlaceAmenity[];
  distanceMiles: number | null;
  activeCheckins: number;
  recentActivityAt: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  viewerRating: number | null;
  suggestionCount: number;
  autoShortlistedAt: string | null;
};

export type PlaceDetailRecord = PlaceRecord & {
  popularTimes: Array<{ weekday: number; hour: number; count: number }>;
  visiblePeople: Array<{
    id: string;
    name: string;
    photo: string | null;
    photoExplicit?: boolean;
    pronouns?: string;
    badges?: CruushBadge[];
    sideBadges?: SideBadges;
    mutual?: boolean;
    travelling?: boolean;
  }>;
  ratingBreakdown: Array<{
    category: PlaceRatingCategory;
    average: number | null;
    count: number;
    viewerRating: number | null;
  }>;
  viewerCheckin: { visible: boolean; checkedInAt: string; expiresAt: string } | null;
};

export type PlaceRatingCategory = 'overall' | 'gender_inclusivity' | 'lgbtq_friendliness' | 'safety' | 'accessibility' | 'cleanliness';

export type PlaceBoardMessage = {
  id: string;
  content: string;
  createdAt: string;
  expiresAt: string | null;
  canDelete: boolean;
  user: {
    id: string;
    name: string;
    pronouns: string;
    photo: string | null;
    photoExplicit?: boolean;
    badges?: CruushBadge[];
    sideBadges?: SideBadges;
    vibes: string[];
    mutual: boolean;
    travelling?: boolean;
  };
};

export async function getPlaces(options: {
  latitude?: number;
  longitude?: number;
  sort?: PlaceSort;
  query?: string;
  facilityTypes?: PlaceFacilityType[];
  tags?: PlaceTag[];
  vibes?: PlaceVibe[];
  amenities?: PlaceAmenity[];
  radiusMiles?: number;
  activity?: 'any' | 'active' | 'recent';
  limit?: number;
  offset?: number;
} = {}) {
  const params = new URLSearchParams({
    radiusMiles: String(options.radiusMiles ?? 100),
    sort: options.sort ?? 'nearest',
    activity: options.activity ?? 'any',
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
  });
  if (options.latitude != null) params.set('lat', String(options.latitude));
  if (options.longitude != null) params.set('lng', String(options.longitude));
  if (options.query) params.set('query', options.query);
  if (options.facilityTypes?.length) params.set('facilityTypes', options.facilityTypes.join(','));
  if (options.tags?.length) params.set('tags', options.tags.join(','));
  if (options.vibes?.length) params.set('vibes', options.vibes.join(','));
  if (options.amenities?.length) params.set('amenities', options.amenities.join(','));
  return requestApi<PlaceRecord[]>(`/api/places?${params.toString()}`, { method: 'GET' });
}

export async function getPlace(placeId: string) {
  return requestApi<PlaceDetailRecord>(`/api/places/${placeId}`, { method: 'GET' });
}

export async function getPlaceBoard(placeId: string, options: { limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 30),
    offset: String(options.offset ?? 0),
  });
  return requestApi<PlaceBoardMessage[]>(`/api/places/${placeId}/board?${params.toString()}`, { method: 'GET' });
}

export async function deletePlaceBoardMessage(placeId: string, messageId: string) {
  return requestApi<void>(`/api/places/${placeId}/board/${messageId}`, { method: 'DELETE' });
}

export async function postPlaceBoardMessage(placeId: string, input: { content: string }) {
  return requestApi<{ placeId: string; boardPostId: string }>(`/api/places/${placeId}/board`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function ratePlace(placeId: string, category: PlaceRatingCategory, stars: number) {
  return requestApi<{ placeId: string; category: PlaceRatingCategory; stars: number }>(`/api/places/${placeId}/rating`, { method: 'PUT', body: JSON.stringify({ category, stars }) });
}

export async function removePlaceRating(placeId: string) {
  return requestApi<void>(`/api/places/${placeId}/rating`, { method: 'DELETE' });
}

export async function checkIntoPlace(placeId: string, input: {
  content?: string;
  vibes: PlaceVibe[];
  amenities: PlaceAmenity[];
  durationHours: 1 | 3 | 6 | 12 | 24;
  visible: boolean;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  observedAt: string;
}) {
  return requestApi<{ placeId: string; boardPostId: string | null; visible: boolean; expiresAt: string }>(`/api/places/${placeId}/check-ins`, { method: 'POST', body: JSON.stringify(input) });
}

export async function checkOutOfPlace(placeId: string) {
  return requestApi<void>(`/api/places/${placeId}/check-ins/me`, { method: 'DELETE' });
}

export async function contributePlaceDetails(placeId: string, input: {
  vibes?: PlaceVibe[];
  amenities?: PlaceAmenity[];
  accessInstructions?: string;
}) {
  return requestApi<{ placeId: string }>(`/api/places/${placeId}/details`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function submitPlace(input: {
  name: string;
  description: string;
  accessInstructions: string;
  latitude: number;
  longitude: number;
  address?: string;
  facilityType: PlaceFacilityType;
  tags: PlaceTag[];
  vibes: PlaceVibe[];
  amenities: PlaceAmenity[];
  sourceUrl?: string;
}) {
  return requestApi<{ id: string; status: 'pending'; suggestionCount: number; autoShortlisted: boolean }>('/api/places', { method: 'POST', body: JSON.stringify(input) });
}
