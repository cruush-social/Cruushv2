import { getCurrentUserId } from './sessionUser';
import { requestApi } from './apiClient';

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
  };
};

export type CruushActivityPerson = {
  id: string;
  name: string;
  pronouns: string;
  photo: string | null;
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
  coordinates: {
    lat: number;
    lng: number;
    precision: 'fuzzy' | 'precise';
  } | null;
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

function normalizeCruushSnapshotPhoto(photo: string | null | undefined) {
  if (!photo) {
    return null;
  }

  try {
    const parsedUrl = new URL(photo);
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.username ||
      parsedUrl.password ||
      hostname === 'localhost' ||
      hostname === 'metadata.google.internal' ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.local')
    ) {
      return null;
    }

    return photo.length <= 2048 ? photo : null;
  } catch {
    return null;
  }
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

export async function getMutualCruushMap() {
  return requestApi<MutualCruushActivityItem[]>('/api/cruush/mutual-map');
}

export async function revokeMutualCruush(otherUserId: string) {
  return requestApi<{ revoked: boolean }>(`/api/cruush/matches/${otherUserId}`, {
    method: 'DELETE',
  });
}
