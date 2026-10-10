import { useEffect, useState } from 'react';
import './SaleCampaignBanner.css';

export function SaleBanner({ percentOff, endsAt = null, onClick }: { percentOff: number; endsAt?: string | null; onClick: () => void }) {
  const [now, setNow] = useState(Date.now);
  const deadline = endsAt === null ? null : Date.parse(endsAt);

  useEffect(() => {
    if (deadline === null || !Number.isFinite(deadline)) return;
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = setInterval(refresh, 1000);
    const expiry = setTimeout(refresh, Math.max(0, deadline - Date.now()));
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      clearTimeout(expiry);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [deadline]);
  const [flickering, setFlickering] = useState(false);

  useEffect(() => {
    if (percentOff <= 0 || typeof window.matchMedia !== 'function') return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(() => {
        setFlickering(true);
        timer = setTimeout(() => {
          setFlickering(false);
          schedule();
        }, 1100);
      }, 700 + Math.random() * 1100);
    };
    const syncMotion = () => {
      clearTimeout(timer);
      setFlickering(false);
      if (!reducedMotion.matches) schedule();
    };
    syncMotion();
    reducedMotion.addEventListener('change', syncMotion);
    return () => {
      clearTimeout(timer);
      reducedMotion.removeEventListener('change', syncMotion);
    };
  }, [percentOff]);

  if (percentOff <= 0 || (deadline !== null && (!Number.isFinite(deadline) || deadline <= now))) return null;
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const countdown = remaining === null ? null : [
    Math.floor(remaining / 3600), Math.floor((remaining % 3600) / 60), remaining % 60,
  ].map(value => String(value).padStart(2, '0')).join(':');

  const glowClass = `cruush-sale-text${flickering ? ' cruush-sale-text--flickering' : ''}`;

  return (
    <aside aria-label="cruush+ sale" className="cruush-sale-banner w-full border-y border-primary bg-primary/10 px-3 text-white sm:px-4">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left" onClick={onClick}>
        <span className="flex min-w-0 flex-col">
          {countdown !== null && <time dateTime={endsAt!} aria-label="Sale countdown" className={`${glowClass} text-sm leading-5 tabular-nums text-muted-foreground`}>{countdown}</time>}
          <span className={`${glowClass} cruush-sale-heading text-sm font-medium`}>Purgatory Sacrifical Offering</span>
        </span>
        <span className={`${glowClass} cruush-sale-offer shrink-0 text-base font-semibold`}>{percentOff}% off this weekend</span>
      </button>
    </aside>
  );
}
