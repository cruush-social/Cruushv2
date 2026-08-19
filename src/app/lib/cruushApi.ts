import { getCurrentUserId } from './sessionUser';
import { requestApi } from './apiClient';
import type { CruushBadge } from './billingApi';
import {
  decryptDisplayLocationToken,
  type DisplayLocationToken,
} from './displayLocationTokens';

export type CruushTargetUser = {
  name: string;
  pronouns?: string;
  photo?: string | null;
};

export type CruushRecord = {
  id: string;
  fromUserId: string;
  toUserId: string;
  createdAt: string;
  mutual: boolean;
  permissions?: {
    matchId: string | null;
    canMessage: boolean;
    canRevealPreciseLocation: boolean;
  };
};

export type CruushActivityItem = CruushRecord & {
  user: {
    id: string;
    name: string;
    pronouns: string;
    photo: string | null;
    photoExplicit?: boolean;
    badges?: CruushBadge[];
  };
};

export type CruushActivityPerson = {
  id: string;
  name: string;
  pronouns: string;
  photo: string | null;
  photoExplicit?: boolean;
  badges?: CruushBadge[];
};

export type CruushLockableActivityItem = {
  id: string;
  createdAt: string;
  mutual?: boolean;
  locked: boolean;
  user: CruushActivityPerson | null;
};

export type MutualCruushActivityItem = {
  id: string;
  matchId: string;
  createdAt: string;
  locked: false;
  user: CruushActivityPerson;
  mutualCrowds: string[];
  vibes: string[];
  distance: string;
  lastActive: string;
  canMessage: boolean;
  canRevealPreciseLocation: boolean;
  displayLocationToken?: DisplayLocationToken;
  displayExpiresAtMs?: number;
  distanceLabel?: string;
  coordinates: {
    lat: number;
    lng: number;
    precision: 'fuzzy' | 'precise';
  } | null;
};

type TokenizedMutualMapItem = Omit<MutualCruushActivityItem, 'id' | 'coordinates' | 'distance'> & {
  profileToken: string;
  distanceLabel: string;
  displayLocationToken: DisplayLocationToken;
  displayExpiresAtMs: number;
  relationship?: {
    mutualCruush: boolean;
    canMessage: boolean;
    precision?: 'fuzzy' | 'precise';
  };
};

type MutualMapResponse = {
  mapEpochMs: number;
  profiles: TokenizedMutualMapItem[];
};

export type MutualCruushMapFilters = {
  ageRange?: [number, number];
  distance?: number;
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

export type ProfileViewActivityItem = CruushLockableActivityItem & {
  viewedAt: string;
};

export type CruushEntitlement = {
  cruushPlus: boolean;
  expiresAt: string | null;
};

export type CruushActivityCounts = {
  incoming: number;
  sent: number;
  mutual: number;
  views: number;
};

export type CruushActivity = {
  entitlement: CruushEntitlement;
  counts: CruushActivityCounts;
  incoming: CruushLockableActivityItem[];
  sent: CruushLockableActivityItem[];
  mutual: MutualCruushActivityItem[];
  views: ProfileViewActivityItem[];
  received?: CruushActivityItem[];
};

function normalizeCruushSnapshotPhoto(_photo: string | null | undefined): null {
  // Snapshot photo URLs are no longer sent to the server; the server also
  // refuses to store them. Always send null.
  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function sendCruush(toUserId: string, targetUser?: CruushTargetUser) {
  if (!isUuid(toUserId)) {
    throw new Error('This profile cannot receive cruushes.');
  }

  const normalizedTargetUser = targetUser
    ? {
        ...targetUser,
        photo: normalizeCruushSnapshotPhoto(targetUser.photo),
      }
    : undefined;

  return requestApi<CruushRecord>('/api/cruush', {
    method: 'POST',
    body: JSON.stringify({
      toUserId,
      targetUser: normalizedTargetUser,
    }),
  });
}

export async function getMyCruushActivity() {
  return requestApi<CruushActivity>('/api/cruush/me');
}

export async function getMyLegacyCruushActivity() {
  const userId = await getCurrentUserId();
  return requestApi<{ received: CruushActivityItem[]; sent: CruushActivityItem[] }>(`/api/cruush/${userId}`);
}

function appendMutualMapListParams(params: URLSearchParams, key: string, values?: string[]) {
  for (const value of values ?? []) {
    if (value.trim()) {
      params.append(key, value);
    }
  }
}

export async function getMutualCruushMap(filters?: MutualCruushMapFilters) {
  const params = new URLSearchParams();
  if (filters?.distance != null && filters.distance !== 100) {
    params.set('distance', String(filters.distance));
  }
  if (filters?.ageRange && filters.ageRange[0] !== 18) {
    params.set('minAge', String(filters.ageRange[0]));
  }
  if (filters?.ageRange && filters.ageRange[1] !== 99) {
    params.set('maxAge', String(filters.ageRange[1]));
  }
  appendMutualMapListParams(params, 'identities', filters?.identities);
  appendMutualMapListParams(params, 'presentations', filters?.presentations);
  appendMutualMapListParams(params, 'lookingFor', filters?.lookingFor);
  appendMutualMapListParams(params, 'timing', filters?.timing);
  appendMutualMapListParams(params, 'hosting', filters?.hosting);
  appendMutualMapListParams(params, 'vibes', filters?.vibes);
  appendMutualMapListParams(params, 'crowds', filters?.crowds);
  appendMutualMapListParams(params, 'hobbies', filters?.hobbies);
  appendMutualMapListParams(params, 'positions', filters?.positions);
  appendMutualMapListParams(params, 'roles', filters?.roles);
  appendMutualMapListParams(params, 'kinks', filters?.kinks);
  appendMutualMapListParams(params, 'bodyTypes', filters?.bodyTypes);
  appendMutualMapListParams(params, 'sexuality', filters?.sexuality);
  appendMutualMapListParams(params, 'substanceBoundaries', filters?.substanceBoundaries);
  const query = params.toString();
  const response = await requestApi<MutualMapResponse | MutualCruushActivityItem[]>(
    query ? `/api/cruush/mutual-map?${query}` : '/api/cruush/mutual-map',
  );

  if (Array.isArray(response)) {
    return response;
  }

  return Promise.all(response.profiles.map(async (item): Promise<MutualCruushActivityItem> => {
    const displayPayload = await decryptDisplayLocationToken(item.displayLocationToken);

    return {
      id: item.profileToken,
      matchId: item.matchId,
      createdAt: item.createdAt,
      locked: item.locked,
      user: item.user,
      mutualCrowds: item.mutualCrowds,
      vibes: item.vibes,
      distance: item.distanceLabel,
      lastActive: item.lastActive,
      canMessage: item.canMessage,
      canRevealPreciseLocation: item.canRevealPreciseLocation,
      displayLocationToken: item.displayLocationToken,
      displayExpiresAtMs: item.displayExpiresAtMs,
      distanceLabel: item.distanceLabel,
      coordinates: {
        lat: displayPayload.latitude,
        lng: displayPayload.longitude,
        precision: displayPayload.displayMode === 'PRECISE' ? 'precise' : 'fuzzy',
      },
    };
  }));
}

export async function revokeMutualCruush(otherUserId: string) {
  return requestApi<{ revoked: boolean }>(`/api/cruush/matches/${otherUserId}`, {
    method: 'DELETE',
  });
}

export async function revokeSentCruush(otherUserId: string) {
  if (!isUuid(otherUserId)) {
    throw new Error('This cruush cannot be unsent.');
  }

  return requestApi<{ revoked: boolean; mutualRevoked: boolean }>(`/api/cruush/${otherUserId}`, {
    method: 'DELETE',
  });
}
