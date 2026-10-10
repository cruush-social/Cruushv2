import { requestApi } from './apiClient';
import type { ProfileVisibilityRules } from './profileApi';

type ClubRecordBase = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  memberCount: number;
  requiresJoinApproval: boolean;
};

export type ClubDirectoryRecord = ClubRecordBase & {
  currentUserRole: 'owner' | 'admin' | 'moderator' | 'member' | null;
  conversationId: string | null;
  pendingJoinRequestCount: number;
  lastActiveAt: string;
};

export type ClubDetailRecord = ClubRecordBase & {
  currentUserRole: 'owner' | 'admin' | 'moderator' | 'member' | null;
  conversationId: string | null;
  joinRequestStatus: 'none' | 'pending' | 'member';
  visibilityRules?: ProfileVisibilityRules;
};

export type ClubMetadataInput = {
  title: string;
  summary: string;
  tags: string[];
};

export type ClubApplicant = {
  userId: string;
  name: string;
  photo: string | null;
  requestedAt: string;
};

export function getClubs(query = '', sort: 'recent' | 'nearby' = 'recent') {
  const normalized = query.trim().toLowerCase();
  if (!normalized && sort === 'recent') return requestApi<ClubDirectoryRecord[]>('/api/clubs');

  const search = new URLSearchParams({ sort });
  if (normalized) search.set('q', normalized);
  const tags = normalized.split(',').map((tag) => tag.trim()).filter(Boolean);
  if (tags.length <= 10 && tags.every((tag) => tag.length <= 64)) search.set('tags', tags.join(','));
  return requestApi<ClubDirectoryRecord[]>(`/api/clubs?${search.toString()}`);
}

export function getClub(clubId: string) {
  return requestApi<ClubDetailRecord>(`/api/clubs/${clubId}`);
}

export function requestClubJoin(clubId: string) {
  return requestApi<
    | { joinRequestStatus: 'pending' }
    | { joinRequestStatus: 'member'; conversationId: string }
  >(`/api/clubs/${clubId}/join-requests`, {
    method: 'POST',
  });
}

export function createClub(input: ClubMetadataInput & { memberIds: string[]; visibilityRules?: ProfileVisibilityRules; requiresJoinApproval?: boolean }) {
  return requestApi<ClubDetailRecord>('/api/clubs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateClubVisibility(clubId: string, visibilityRules: ProfileVisibilityRules) {
  return requestApi<{ visibilityRules: ProfileVisibilityRules }>(`/api/clubs/${clubId}/visibility`, {
    method: 'PUT',
    body: JSON.stringify({ visibilityRules }),
  });
}

export function updateClub(clubId: string, input: ClubMetadataInput & { requiresJoinApproval?: boolean }) {
  return requestApi<ClubDetailRecord>(`/api/clubs/${clubId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteClub(clubId: string) {
  return requestApi<void>(`/api/clubs/${clubId}`, {
    method: 'DELETE',
  });
}

export function getClubJoinRequests(clubId: string) {
  return requestApi<ClubApplicant[]>(`/api/clubs/${clubId}/join-requests`);
}

export function reviewClubJoinRequest(clubId: string, requesterUserId: string, decision: 'approve' | 'deny') {
  return requestApi<{ decision: 'approve' | 'deny' }>(
    `/api/clubs/${clubId}/join-requests/${requesterUserId}`,
    { method: 'POST', body: JSON.stringify({ decision }) },
  );
}
