import { requestApi } from './apiClient';
import type { CruushEntitlement } from './cruushApi';

export const DEBUG_CRUUSH_PLUS_EVENT = 'cruush-debug-cruush-plus-changed';

export async function getDebugCruushPlus() {
  return requestApi<CruushEntitlement>('/api/dev/cruush-plus');
}

export async function setDebugCruushPlus(enabled: boolean) {
  return requestApi<CruushEntitlement>('/api/dev/cruush-plus', {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}
