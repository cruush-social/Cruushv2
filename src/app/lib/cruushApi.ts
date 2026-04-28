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
};

export type CruushActivityItem = CruushRecord & {
  user: {
    id: string;
    name: string;
    pronouns: string;
    photo: string | null;
  };
};

export type CruushActivity = {
  received: CruushActivityItem[];
  sent: CruushActivityItem[];
};

export async function sendCruush(toUserId: string, targetUser?: CruushTargetUser) {
  return requestApi<CruushRecord>('/api/cruush', {
    method: 'POST',
    body: JSON.stringify({
      toUserId,
      targetUser,
    }),
  });
}

export async function getMyCruushActivity() {
  const userId = await getCurrentUserId();
  return requestApi<CruushActivity>(`/api/cruush/${userId}`);
}
