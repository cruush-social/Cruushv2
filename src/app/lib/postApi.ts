import { requestApi } from './apiClient';
import type { CruushBadge } from './billingApi';

export type FeedPostExpiry = '1h' | '6h' | '24h';
export type FeedLocationPinVisibility = 'off' | 'mutuals' | 'same_crowd' | 'public';

export type FeedPost = {
  id: string;
  content: string;
  expiresIn: FeedPostExpiry;
  expiresAt: string;
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
    badges?: CruushBadge[];
  };
};

export type FeedSettings = {
  locationPinVisibility: FeedLocationPinVisibility;
};

export type CreateFeedPostPayload = {
  content: string;
  expiresIn: FeedPostExpiry;
  crowdTargets?: string[];
};

export async function getFeedPosts() {
  return requestApi<FeedPost[]>('/api/posts');
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
