import { requestApi } from './apiClient';

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
