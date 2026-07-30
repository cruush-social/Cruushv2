import { requestApi } from './apiClient';
import type { CruushIconName } from '../components/CruushIconImage';

export type LaunchEvent = {
  id: string;
  slug: string;
  title: string;
  venueName: string;
  address: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  radiusMiles: number;
  startsAt: string;
  endsAt: string;
  pinDisappearsAt: string;
  chatExpiresAt: string;
  raUrl: string;
  iconAsset: string;
  attendeeCount: number;
  joined: boolean;
  passIconName: CruushIconName | null;
  conversationId: string | null;
};

export type EventPassReveal = {
  eventSlug: string;
  iconName: CruushIconName;
  withinRadius: true;
  emailAvailable: boolean;
};

export type EventChatJoin = {
  eventSlug: string;
  conversationId: string;
  joined: true;
  currentUserRole: 'member';
};

export async function getActiveEvents() {
  return requestApi<LaunchEvent[]>('/api/events/active');
}

export async function revealEventPass(slug: string, coordinates: { latitude: number; longitude: number }) {
  return requestApi<EventPassReveal>(`/api/events/${slug}/reveal-pass`, {
    method: 'POST',
    body: JSON.stringify(coordinates),
  });
}

export async function emailEventPass(slug: string) {
  return requestApi<{ emailed: boolean; previewUrl: string | null }>(`/api/events/${slug}/pass-email`, {
    method: 'POST',
  });
}

export async function joinEventChat(slug: string) {
  return requestApi<EventChatJoin>(`/api/events/${slug}/join-chat`, {
    method: 'POST',
  });
}
