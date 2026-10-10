import { useEffect, useRef, useState } from 'react';
import { useExclusivePopup } from '../lib/popupQueue';
import { getMyProfile, PROFILE_CHANGED_EVENT } from '../lib/profileApi';
import { MAP_SERVICE_AREA_ACCESS_CHANGED } from '../lib/mapServiceAreaAccess';
import FirstEntryPromptSurface from './FirstEntryPromptSurface';
import PurgatoryMemberBadge from './PurgatoryMemberBadge';
import { Button } from './ui/button';

export function purgatoryPromptHandledKey(userId: string) {
  return `cruush:first-entry-purgatory:v1:${userId}`;
}

function wasHandled(userId: string) {
  try { return localStorage.getItem(purgatoryPromptHandledKey(userId)) === 'true'; }
  catch { return false; }
}

export default function PurgatoryInfoPrompt({ userId }: { userId: string }) {
  const dismissButton = useRef<HTMLButtonElement>(null);
  const [membership, setMembership] = useState<{ userId: string; outside: boolean } | null>(null);
  const [handled, setHandled] = useState(() => wasHandled(userId));
  const showing = useExclusivePopup('purgatory-info', !handled && membership?.userId === userId && membership.outside);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    setMembership(null);
    const alreadyHandled = wasHandled(userId);
    setHandled(alreadyHandled);
    if (alreadyHandled) return;
    const refresh = async () => {
      const currentRequest = ++requestId;
      try {
        const profile = await getMyProfile();
        if (active && currentRequest === requestId) setMembership({ userId, outside: profile.outOfSight === true && profile.travelling !== true });
      } catch {
        if (active && currentRequest === requestId) setMembership(null);
      }
    };
    void refresh();
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    window.addEventListener(MAP_SERVICE_AREA_ACCESS_CHANGED, refresh);
    return () => {
      active = false;
      window.removeEventListener(PROFILE_CHANGED_EVENT, refresh);
      window.removeEventListener(MAP_SERVICE_AREA_ACCESS_CHANGED, refresh);
    };
  }, [userId]);

  const dismiss = () => {
    try { localStorage.setItem(purgatoryPromptHandledKey(userId), 'true'); }
    catch { /* Storage may be blocked; dismissal still works for this mount. */ }
    setHandled(true);
  };

  return (
    <FirstEntryPromptSurface
      open={showing}
      initialFocusRef={dismissButton}
      onDismiss={dismiss}
      testId="purgatory-info-prompt"
      title="Purgatory"
      description="Purgatory is for members outside cruush’s service area. You can still post, message, and connect on cruush."
      icon={<PurgatoryMemberBadge size="card" />}
      primary={(
        <Button asChild className="min-h-11 rounded-full text-white" style={{ background: 'var(--cruush-gradient)' }}>
          <button ref={dismissButton} type="button" onClick={dismiss}>Got it</button>
        </Button>
      )}
      secondary={null}
    />
  );
}
