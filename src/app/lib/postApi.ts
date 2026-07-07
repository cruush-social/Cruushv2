import { requestApi } from './apiClient';
import type { CruushBadge } from './billingApi';

export type FeedPostExpiry = '1h' | '6h' | '24h';

export type FeedPost = {
  id: string;
  content: string;
  expiresIn: FeedPostExpiry;
  expiresAt: string;
  createdAt: string;
  distance: string;
  user: {
    id: string;
    name: string;
    pronouns: string;
    photo: string | null;
    badges?: CruushBadge[];
  };
};

export type CreateFeedPostPayload = {
  content: string;
  expiresIn: FeedPostExpiry;
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

export async function deleteFeedPost(postId: string) {
  return requestApi<void>(`/api/posts/${postId}`, {
    method: 'DELETE',
  });
}
