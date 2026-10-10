import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { WelcomeDayStatus } from '../lib/rewardsApi';

interface OutsideServiceAreaCardProps {
  browseLimitVisible?: boolean;
  currentUserEmail: string;
  onActivate: () => void;
  onRequestedCityChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  requestedCity: string;
  requestingCity: boolean;
  cityRequestNotice: string | null;
  cityRequestError: string | null;
  welcomeDayStatus: WelcomeDayStatus | null;
  claimingWelcomeDay: boolean;
  welcomeDayError: string | null;
  onClaimWelcomeDay: () => void;
  hasCruushPlus: boolean;
}

export default function OutsideServiceAreaCard({
  browseLimitVisible = false,
  currentUserEmail,
  onActivate,
  onRequestedCityChange,
  onSubmit,
  requestedCity,
  requestingCity,
  cityRequestNotice,
  cityRequestError,
  welcomeDayStatus,
  claimingWelcomeDay,
  welcomeDayError,
  onClaimWelcomeDay,
  hasCruushPlus,
}: OutsideServiceAreaCardProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [mobileScale, setMobileScale] = useState(1);
  const [mobileTop, setMobileTop] = useState<number>();
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const card = cardRef.current;
    if (!frame || !card) return;
    const mobile = window.matchMedia('(max-width: 639px)');
    const recentlyActive = frame.parentElement?.querySelector<HTMLElement>('[data-testid="recently-active-panel"]');
    const browseLimit = browseLimitVisible
      ? frame.parentElement?.querySelector<HTMLElement>('[data-testid="mile-high-club-browse-limit"]')
      : null;
    const fit = () => {
      const parentTop = frame.parentElement?.getBoundingClientRect().top ?? 0;
      const top = mobile.matches && browseLimit
        ? Math.max(128, browseLimit.getBoundingClientRect().bottom - parentTop + 16)
        : undefined;
      setMobileTop(top);
      const frameTop = top === undefined ? frame.getBoundingClientRect().top : parentTop + top;
      const frameBottom = frame.getBoundingClientRect().bottom;
      const availableHeight = recentlyActive
        ? Math.min(frameBottom, recentlyActive.getBoundingClientRect().top - 16) - frameTop
        : frameBottom - frameTop;
      setMobileScale(mobile.matches && card.offsetHeight > 0
        ? Math.max(0, Math.min(1, availableHeight / card.offsetHeight))
        : 1);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    observer.observe(card);
    if (recentlyActive) observer.observe(recentlyActive);
    if (browseLimit) observer.observe(browseLimit);
    mobile.addEventListener('change', fit);
    fit();
    return () => { observer.disconnect(); mobile.removeEventListener('change', fit); };
  }, [browseLimitVisible]);
  const welcomeDayActive = welcomeDayStatus?.claimed === true
    && (!welcomeDayStatus.activeUntil || Date.parse(welcomeDayStatus.activeUntil) > Date.now());
  const canUseMileHighClub = hasCruushPlus || welcomeDayActive;

  return (
    <div ref={frameRef} style={{ top: mobileTop }} className="pointer-events-auto absolute inset-x-4 top-32 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-20 flex items-start justify-center sm:inset-0 sm:px-4 sm:pb-36 sm:pt-32">
      <div ref={cardRef} style={{ transform: mobileScale < 1 ? `scale(${mobileScale})` : undefined, transformOrigin: 'top center' }} className="h-fit min-h-0 w-full max-w-md shrink-0 sm:max-h-full sm:overflow-y-auto rounded-3xl border border-white/10 bg-[color:var(--cruush-black-glass)] p-6 text-center text-white shadow-[0_24px_80px_rgba(0,0,0,0.68)] backdrop-blur-[var(--cruush-black-glass-blur)]">
        <h2 className="text-2xl font-semibold">NYC open beta</h2>
        <p className="mt-3 text-sm text-white/72">
          You can still post, message, and connect on cruush. The map is available within 100 miles of the center of New York during the NYC open beta.
        </p>
        <Button
          className="mt-5 h-12 w-full rounded-full border border-[#77B9DA]/65 bg-black/88 text-white hover:bg-black/92 disabled:border-white/15 disabled:bg-white/10 disabled:text-white/45"
          onClick={onActivate}
          disabled={!canUseMileHighClub}
          type="button"
        >
          Turn on Mile High Club
        </Button>
        <p className="mt-2 text-left text-sm leading-5 text-white/60">
          Mile High Club lets you drop a temporary pin where you are visiting and browse cruushes around that location.
        </p>
        <div className="mt-5 rounded-2xl border border-white/12 bg-white/5 p-4 text-left">
          <p className="text-sm font-semibold text-white">One free day of cruush+</p>
          <p className="mt-2 text-sm leading-5 text-white/72">
            Redeem it now to use Mile High Club, or leave it available and redeem it later.
          </p>
          <Button
            className="mt-3 h-11 w-full rounded-full"
            disabled={!welcomeDayStatus?.available || claimingWelcomeDay}
            onClick={onClaimWelcomeDay}
            style={{ background: 'var(--cruush-gradient)' }}
            type="button"
          >
            {claimingWelcomeDay
              ? 'Redeeming...'
              : welcomeDayStatus?.claimed
                ? 'Free day redeemed'
                : 'Redeem free day'}
          </Button>
          {welcomeDayStatus?.claimed ? (
            <p className="mt-2 text-xs text-white/60" role="status">
              Your free day is active or saved to your cruush+ access.
            </p>
          ) : null}
          {welcomeDayError ? <p className="mt-2 text-xs text-red-200" role="alert">{welcomeDayError}</p> : null}
        </div>
        <form className="mt-5 flex gap-2" onSubmit={onSubmit}>
          <Input
            aria-label="Request a city"
            className="h-11 min-w-0 rounded-full border-white/14 bg-black/70 text-white placeholder:text-white/45"
            maxLength={120}
            onChange={(event) => onRequestedCityChange(event.target.value)}
            placeholder="Request a city"
            value={requestedCity}
          />
          <Button
            className="h-11 shrink-0 rounded-full"
            disabled={requestingCity || requestedCity.trim().length < 2 || !currentUserEmail}
            style={{ background: 'var(--cruush-gradient)' }}
            type="submit"
          >
            {requestingCity ? 'Sending...' : 'Send'}
          </Button>
        </form>
        {cityRequestNotice ? <p className="mt-3 text-sm text-white/72" role="status">{cityRequestNotice}</p> : null}
        {cityRequestError ? <p className="mt-3 text-sm text-destructive" role="alert">{cityRequestError}</p> : null}
      </div>
    </div>
  );
}
