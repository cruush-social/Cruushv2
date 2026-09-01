import { requestApi } from './apiClient';
import type { CruushBadge } from './billingApi';
import type { SideBadges } from './profileApi';

export type FeedPostExpiry = '1h' | '6h' | '24h' | '7d' | 'never';
export type FeedPostWindow = '1h' | '3h' | '6h' | '24h' | '7d';
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
  distance: string;
  audience: FeedPostAudience;
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
    photoExplicit?: boolean;
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
  showDistanceLabels: boolean;
  postExpiryDefault: FeedPostExpiry;
  feedWindow: FeedPostWindow;
};

export type FeedPostFilters = {
  within?: FeedPostWindow;
  distanceMiles?: number;
  limit?: number;
  before?: string;
  coordinates?: {
    lat: number;
    lng: number;
  } | null;
  seeking?: {
    searchQuery?: string;
    mileHighClub?: boolean;
    ageRange?: [number, number];
    identities?: string[];
    presentations?: string[];
    lookingFor?: string[];
    timing?: string[];
    hosting?: string[];
    vibes?: string[];
    crowds?: string[];
    hobbies?: string[];
    positions?: string[];
    roles?: string[];
    kinks?: string[];
    bodyTypes?: string[];
    sexuality?: string[];
    substanceBoundaries?: string[];
  };
};

export type CreateFeedPostPayload = {
  content: string;
  expiresIn: FeedPostExpiry;
  audience: FeedPostAudience;
  crowdTargets?: string[];
  photoMediaIds?: string[];
  tags?: string[];
};

export async function getFeedPosts(filters: FeedPostFilters = {}) {
  const params = new URLSearchParams();

  if (filters.within) {
    params.set('within', filters.within);
  }

  if (typeof filters.distanceMiles === 'number' && Number.isFinite(filters.distanceMiles)) {
    params.set('distanceMiles', String(filters.distanceMiles));
  }

  if (typeof filters.limit === 'number' && Number.isFinite(filters.limit)) {
    params.set('limit', String(filters.limit));
  }

  if (filters.before) {
    params.set('before', filters.before);
  }

  if (filters.coordinates) {
    params.set('lat', String(filters.coordinates.lat));
    params.set('lng', String(filters.coordinates.lng));
  }

  if (filters.seeking?.mileHighClub) {
    params.set('mileHighClub', '1');
  }
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
  appendSeekingValues('vibes', filters.seeking?.vibes);
  appendSeekingValues('crowds', filters.seeking?.crowds);
  appendSeekingValues('hobbies', filters.seeking?.hobbies);
  appendSeekingValues('positions', filters.seeking?.positions);
  appendSeekingValues('roles', filters.seeking?.roles);
  appendSeekingValues('kinks', filters.seeking?.kinks);
  appendSeekingValues('bodyTypes', filters.seeking?.bodyTypes);
  appendSeekingValues('sexuality', filters.seeking?.sexuality);
  appendSeekingValues('substanceBoundaries', filters.seeking?.substanceBoundaries);

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

  return requestApi<
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
