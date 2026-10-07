import { useEffect, useState } from 'react';
import { getMyBillingStatus } from '../lib/billingApi';
import CruushPlusWord from './CruushPlusWord';

export function formatCruushPlusTimeLeft(expiresAt: string, nowMs: number) {
  const remainingSeconds = Math.max(0, Math.floor((Date.parse(expiresAt) - nowMs) / 1000));
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  const clock = [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * How long a member's current cruush+ still runs, counting down. Buying again
 * adds the new term after this date, so the checkout shows it first. Members
 * without a dated term (none, or lifetime) see nothing.
 */
export default function CruushPlusTimeLeft() {
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    void getMyBillingStatus()
      .then((status) => {
        if (active && status.cruushPlus && status.expiresAt) {
          setExpiresAt(status.expiresAt);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!expiresAt) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt || Date.parse(expiresAt) <= nowMs) {
    return null;
  }

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-card/70 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.24)]"
      data-testid="cruush-plus-time-left"
    >
      <span className="text-sm text-white/72"><CruushPlusWord /> time left</span>
      <span className="text-base tabular-nums text-white" role="timer">{formatCruushPlusTimeLeft(expiresAt, nowMs)}</span>
    </div>
  );
}
