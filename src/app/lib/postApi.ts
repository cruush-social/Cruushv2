import { requestApi } from './apiClient';
import type { CruushBadge } from './billingApi';

export type FeedPostExpiry = '1h' | '6h' | '24h' | '7d' | 'never';
export type FeedPostWindow = '1h' | '3h' | '6h' | '24h' | '7d';
export type FeedLocationPinVisibility = 'off' | 'mutuals' | 'same_crowd' | 'public';

export type FeedPost = {
  id: string;
  content: string;
  expiresIn: FeedPostExpiry;
  expiresAt: string | null;
  createdAt: string;
  distance: string;
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
    badges?: CruushBadge[];
    attendingLaunchParty?: boolean;
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
};

export type CreateFeedPostPayload = {
  content: string;
  expiresIn: FeedPostExpiry;
  crowdTargets?: string[];
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

  const query = params.toString();
  return requestApi<FeedPost[]>(query ? `/api/posts?${query}` : '/api/posts');
}

export async function createFeedPost(payload: CreateFeedPostPayload) {
  return requestApi<FeedPost>('/api/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
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
