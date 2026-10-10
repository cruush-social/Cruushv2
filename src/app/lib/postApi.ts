import { requestApi, requestApiWithUploadRetry } from './apiClient';
import type { CruushBadge } from './billingApi';
import type { SideBadges } from './profileApi';
import type { DlModePhotoRelationship } from './dlMode';

export type FeedPostExpiry = '30m' | '1h' | '3h' | '6h' | '12h' | '24h' | '2d' | '3d' | '5d' | '7d' | '8d' | '9d' | '10d' | '11d' | '12d' | '13d' | '14d' | '15d' | '16d' | '17d' | '18d' | '19d' | '20d' | '21d' | '22d' | '23d' | '24d' | '25d' | '26d' | '27d' | '28d' | '29d' | '30d' | 'never';
export type FeedPostWindow = '1h' | '3h' | '6h' | '24h' | '7d' | '8d' | '9d' | '10d' | '11d' | '12d' | '13d' | '14d' | '15d' | '16d' | '17d' | '18d' | '19d' | '20d' | '21d' | '22d' | '23d' | '24d' | '25d' | '26d' | '27d' | '28d' | '29d' | '30d';
export type FeedLocationPinVisibility = 'off' | 'mutuals' | 'same_crowd' | 'public';
export type FeedPostAudience = 'public' | 'mutuals' | 'crowd';

export type FeedPhoto = {
  id: string;
  url: string;
  thumbnailUrl: string;
  explicit: boolean;
};

export type FeedPost = {
  id: string;
  content: string;
  expiresIn: FeedPostExpiry;
  expiresAt: string | null;
  createdAt: string;
  paginationCursor?: string;
  distance: string;
  audience: FeedPostAudience;
  showDistance?: boolean;
  tags?: string[];
  photos?: FeedPhoto[];
  crowdTargets?: string[];
  locationPin?: {
    userId: string;
    visibility: FeedLocationPinVisibility;
  };
  partyStatus?: {
    eventSlug: string;
    label: string;
  };
  user: {
    id: string;
    name: string;
    pronouns: string;
    photo: string | null;
    outOfSight?: boolean;
    photoExplicit?: boolean;
    sharesCrowd?: boolean;
    photoRelationship?: DlModePhotoRelationship;
    canMessage?: boolean;
    badges?: CruushBadge[];
    sideBadges?: SideBadges;
    attendingLaunchParty?: boolean;
    travelling?: boolean;
    vibes?: string[];
  };
};

export type FeedSettings = {
  locationPinVisibility: FeedLocationPinVisibility;
  hideFromPurgatory?: boolean;
  showDistanceLabels: boolean;
  postExpiryDefault: FeedPostExpiry;
  feedWindow: FeedPostWindow;
};

export type FeedPostFilters = {
  within?: FeedPostWindow;
  distanceMiles?: number | 'global';
  limit?: number;
  before?: string;
  cursor?: string;
  coordinates?: {
    lat: number;
    lng: number;
  } | null;
  seeking?: {
    searchQuery?: string;
    mileHighClub?: boolean;
    excludeMileHighClub?: boolean;
    purgatoryMembers?: boolean;
    excludePurgatoryMembers?: boolean;
    ageRange?: [number, number];
    identities?: string[];
    presentations?: string[];
    lookingFor?: string[];
    timing?: string[];
    hosting?: string[];
    preferredSpots?: string[];
    vibes?: string[];
    crowds?: string[];
    hobbies?: string[];
    positions?: string[];
    roles?: string[];
    kinks?: string[];
    bodyTypes?: string[];
    sexuality?: string[];
    zodiac?: string[];
    substanceBoundaries?: string[];
    protectionBoundaries?: string[];
  };
};

export type CreateFeedPostPayload = {
  content: string;
  expiresIn: FeedPostExpiry;
  audience: FeedPostAudience;
  showDistance: boolean;
  crowdTargets?: string[];
  photoMediaIds?: string[];
  tags?: string[];
};

export async function getFeedPosts(filters: FeedPostFilters = {}) {
  const params = new URLSearchParams();

  if (filters.within) {
    params.set('within', filters.within);
  }

  if (filters.distanceMiles === 'global' || (typeof filters.distanceMiles === 'number' && Number.isFinite(filters.distanceMiles))) {
    params.set('distanceMiles', String(filters.distanceMiles));
  }

  if (typeof filters.limit === 'number' && Number.isFinite(filters.limit)) {
    params.set('limit', String(filters.limit));
  }

  if (filters.before) {
    params.set('before', filters.before);
  }
  if (filters.cursor) {
    params.set('cursor', filters.cursor);
  }

  if (filters.coordinates) {
    params.set('lat', String(filters.coordinates.lat));
    params.set('lng', String(filters.coordinates.lng));
  }

  if (filters.seeking?.mileHighClub) {
    params.set('mileHighClub', '1');
  }
  if (filters.seeking?.excludeMileHighClub) {
    params.set('excludeMileHighClub', '1');
  }
  if (filters.seeking?.purgatoryMembers) params.set('purgatoryMembers', '1');
  if (filters.seeking?.excludePurgatoryMembers) params.set('excludePurgatoryMembers', '1');
  if (filters.seeking?.searchQuery?.trim()) {
    params.set('q', filters.seeking.searchQuery.trim());
  }
  if (filters.seeking?.ageRange && filters.seeking.ageRange[0] !== 18) {
    params.set('minAge', String(filters.seeking.ageRange[0]));
  }
  if (filters.seeking?.ageRange && filters.seeking.ageRange[1] !== 99) {
    params.set('maxAge', String(filters.seeking.ageRange[1]));
  }
  const appendSeekingValues = (key: string, values?: string[]) => {
    for (const value of values ?? []) {
      if (value.trim()) {
        params.append(key, value);
      }
    }
  };
  appendSeekingValues('identities', filters.seeking?.identities);
  appendSeekingValues('presentations', filters.seeking?.presentations);
  appendSeekingValues('lookingFor', filters.seeking?.lookingFor);
  appendSeekingValues('timing', filters.seeking?.timing);
  appendSeekingValues('hosting', filters.seeking?.hosting);
  appendSeekingValues('preferredSpots', filters.seeking?.preferredSpots);
  appendSeekingValues('vibes', filters.seeking?.vibes);
  appendSeekingValues('crowds', filters.seeking?.crowds);
  appendSeekingValues('hobbies', filters.seeking?.hobbies);
  appendSeekingValues('positions', filters.seeking?.positions);
  appendSeekingValues('roles', filters.seeking?.roles);
  appendSeekingValues('kinks', filters.seeking?.kinks);
  appendSeekingValues('bodyTypes', filters.seeking?.bodyTypes);
  appendSeekingValues('sexuality', filters.seeking?.sexuality);
  appendSeekingValues('zodiac', filters.seeking?.zodiac);
  appendSeekingValues('substanceBoundaries', filters.seeking?.substanceBoundaries);
  appendSeekingValues('protectionBoundaries', filters.seeking?.protectionBoundaries);

  const query = params.toString();
  return requestApi<FeedPost[]>(query ? `/api/posts?${query}` : '/api/posts');
}

export async function createFeedPost(payload: CreateFeedPostPayload) {
  return requestApi<FeedPost>('/api/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadFeedPhoto(photo: File) {
  const formData = new FormData();
  formData.set('photo', photo);

  return requestApiWithUploadRetry<
    | FeedPhoto
    | { status: 'pending_review'; assetId: string }
  >('/api/feed/photos', {
    method: 'POST',
    body: formData,
  });
}

export async function deleteStagedFeedPhoto(assetId: string) {
  return requestApi<void>(`/api/media/assets/${assetId}`, {
    method: 'DELETE',
  });
}

export async function getFeedSettings() {
  return requestApi<FeedSettings>('/api/feed/settings');
}

export async function updateFeedSettings(payload: FeedSettings) {
  return requestApi<FeedSettings>('/api/feed/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteFeedPost(postId: string) {
  return requestApi<void>(`/api/posts/${postId}`, {
    method: 'DELETE',
  });
}
