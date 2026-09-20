import { useEffect, useState } from 'react';
import { requestApi } from './apiClient';

export type TrustRestrictedFeature = 'direct_messages' | 'group_messages' | 'group_creation'
  | 'direct_message_photos' | 'group_message_photos' | 'photo_uploads' | 'feed_posting' | 'pink_book' | 'map_pings' | 'favorite_images';
export type TrustRestriction = { restricted: boolean; dueToTrust: boolean; recoveryAt: string | null };
type TrustRestrictions = {
  checkedAt: string;
  features: Record<TrustRestrictedFeature, TrustRestriction>;
};

export function trustRestrictionMessage(label: string, restriction: TrustRestriction | undefined, checkedAt: string) {
  if (!restriction?.restricted) return null;
  const notice = `${label} is temporarily restricted${restriction.dueToTrust ? ' because of your trust score' : ''}.`;
  if (!restriction.recoveryAt) return notice;
  const end = new Date(restriction.recoveryAt);
  const now = new Date(checkedAt);
  if (!Number.isFinite(end.getTime()) || !Number.isFinite(now.getTime())) return notice;
  const sameDay = end.toDateString() === now.toDateString();
  const days = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
  const timing = sameDay || end <= now ? 'later today' : `in ${days} ${days === 1 ? 'day' : 'days'}`;
  return `${notice} Access is expected to return ${timing}, provided you follow the Code of Conduct.`;
}

export function useTrustRestrictions(enabled = true) {
  const [state, setState] = useState<TrustRestrictions | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const next = await requestApi<TrustRestrictions>('/api/me/trust-restrictions');
        if (active) setState(next);
      } catch {
        // Preserve the last known state; the actual operation still enforces server policy.
      } finally {
        running = false;
      }
    };
    void refresh();
    const focus = () => { void refresh(); };
    const interval = window.setInterval(focus, 60_000);
    window.addEventListener('focus', focus);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [enabled]);
  return {
    // A response without the full feature map must not take the screen down
    // with it: an unknown feature simply reads as unrestricted.
    restricted: (feature: TrustRestrictedFeature) => enabled && state?.features?.[feature]?.restricted === true,
    message: (feature: TrustRestrictedFeature, label: string) => enabled && state?.features?.[feature]
      ? trustRestrictionMessage(label, state.features[feature], state.checkedAt) : null,
  };
}
