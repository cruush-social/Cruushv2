import type { FormEvent } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { WelcomeDayStatus } from '../lib/rewardsApi';
import CruushPlusButton from './CruushPlusButton';

interface OutsideServiceAreaCardProps {
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
  onOpenCruushPlus: () => void;
  hasCruushPlus: boolean;
}

export default function OutsideServiceAreaCard({
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
  onOpenCruushPlus,
  hasCruushPlus,
}: OutsideServiceAreaCardProps) {
  const welcomeDayActive = welcomeDayStatus?.claimed === true
    && (!welcomeDayStatus.activeUntil || Date.parse(welcomeDayStatus.activeUntil) > Date.now());
  const canUseMileHighClub = hasCruushPlus || welcomeDayActive;

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center px-4 pb-28 pt-32">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[color:var(--cruush-black-glass)] p-6 text-center text-white shadow-[0_24px_80px_rgba(0,0,0,0.68)] backdrop-blur-[var(--cruush-black-glass-blur)]">
        <h2 className="text-2xl font-semibold">NYC open beta</h2>
        <p className="mt-3 text-sm text-white/72">
          cruush is testing its open beta within 100 miles of the center of New York.
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
        <CruushPlusButton className="mt-3 w-full" onClick={onOpenCruushPlus} />
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
