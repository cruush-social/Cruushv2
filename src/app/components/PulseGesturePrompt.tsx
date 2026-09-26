import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useExclusivePopup, usePopupQueueIdle } from '../lib/popupQueue';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import PulseLedIcon from './PulseLedIcon';

export const PULSE_GESTURE_DELAY_MS = 30_000;

export function pulseGestureSeenKey(userId: string) {
  return `cruush:pulse-gesture-intro-seen:${userId}`;
}

export default function PulseGesturePrompt({ pending, userId }: { pending: boolean; userId: string }) {
  const location = useLocation();
  const queueIdle = usePopupQueueIdle();
  const [open, setOpen] = useState(false);
  const showing = useExclusivePopup('pulse-gesture', open);

  useEffect(() => {
    if (
      !pending
      || open
      || !queueIdle
      || !location.pathname.startsWith('/map')
      || window.localStorage.getItem(pulseGestureSeenKey(userId)) === 'true'
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      window.localStorage.setItem(pulseGestureSeenKey(userId), 'true');
      setOpen(true);
    }, PULSE_GESTURE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [location.pathname, open, pending, queueIdle, userId]);

  const dismiss = () => setOpen(false);

  return (
    <Dialog open={showing} onOpenChange={(nextOpen) => {
      if (!nextOpen) dismiss();
    }}>
      <DialogContent floating className="max-w-sm rounded-lg border-white/10 bg-background" data-testid="pulse-gesture-prompt">
        <DialogHeader bugButton={false}>
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full border border-[#c8ff31]/45 bg-black/45 shadow-[0_0_24px_rgba(200,255,49,0.28)]">
            <PulseLedIcon className="h-10 w-10 animate-pulse text-[#c8ff31]" />
          </div>
          <DialogTitle>Send a Pulse</DialogTitle>
          <DialogDescription>
            Tap Map Controls, then Send a Pulse. Choose a radius and tap Send Pulse.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full rounded-full" onClick={dismiss} style={{ background: 'var(--cruush-gradient)' }}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
