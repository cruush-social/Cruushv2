import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { SIGNAL_MAX_LENGTH } from '../lib/profileLimits';
import PulseLedIcon from './PulseLedIcon';
import { MapMarkerPin } from './MapView';
import { ApiClientError } from '../lib/apiClient';
import {
  MAP_PING_RADII_MILES,
  type MapPingRadiusMiles,
  type MapPingStatus,
} from '../lib/mapPingsApi';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import CruushPlusGateNotice from './CruushPlusGateNotice';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';

type MapPingSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: MapPingStatus | null;
  loading: boolean;
  hasMapLocation: boolean;
  signal: string | null | undefined;
  onRefresh: () => Promise<void>;
  onSend: (radiusMiles: MapPingRadiusMiles) => Promise<void>;
  onSaveSignal?: (signal: string) => Promise<void>;
  hasCruushPlus?: boolean;
  onUpgrade?: () => void;
  /** Your own photo, so the demonstration is your pin and not a placeholder. */
  photo?: string | null;
};

function formatTime(value: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return 'soon';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

function formatCountdown(targetTimestamp: number, currentTimestamp: number) {
  const totalSeconds = Math.max(0, Math.ceil((targetTimestamp - currentTimestamp) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function resolvePingErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.message) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Ping could not send. Try again.';
}

export default function MapPingSheet({
  open,
  onOpenChange,
  status,
  loading,
  hasMapLocation,
  signal,
  photo,
  onRefresh,
  onSend,
  onSaveSignal,
  hasCruushPlus = false,
  onUpgrade,
}: MapPingSheetProps) {
  const [radiusMiles, setRadiusMiles] = useState<MapPingRadiusMiles>(3);
  const [sending, setSending] = useState(false);
  const [editingSignal, setEditingSignal] = useState(false);
  const [signalDraft, setSignalDraft] = useState('');
  const [savingSignal, setSavingSignal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    void onRefresh().catch((refreshError) => {
      setError(resolvePingErrorMessage(refreshError));
    });

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [onRefresh, open]);

  const nextEligibleTimestamp = status?.allowance.nextEligibleAt
    ? Date.parse(status.allowance.nextEligibleAt)
    : null;
  const cooldownActive = nextEligibleTimestamp !== null &&
    Number.isFinite(nextEligibleTimestamp) &&
    nextEligibleTimestamp > now;
  const cooldownCountdown = cooldownActive && nextEligibleTimestamp !== null
    ? formatCountdown(nextEligibleTimestamp, now)
    : null;
  const activePingTimestamp = status?.activePing?.expiresAt
    ? Date.parse(status.activePing.expiresAt)
    : null;
  const activePing = Boolean(
    status?.activePing &&
    activePingTimestamp !== null &&
    Number.isFinite(activePingTimestamp) &&
    activePingTimestamp > now,
  );
  const normalizedSignal = signal?.trim() ?? '';
  const sendDisabled = loading || sending || !status || !hasMapLocation || activePing ||
    !normalizedSignal || status.allowance.remaining < 1 || cooldownActive;
  const statusText = useMemo(() => {
    if (activePing && status?.activePing) {
      return `Your Ping is active until ${formatTime(status.activePing.expiresAt)}.`;
    }

    if (cooldownActive && status?.allowance.nextEligibleAt) {
      return `Your next Ping is ready at ${formatTime(status.allowance.nextEligibleAt)}.`;
    }

    if (status) {
      return `${status.allowance.remaining} of ${status.allowance.limit} Pulses available right now.`;
    }

    return 'Checking your Ping allowance...';
  }, [activePing, cooldownActive, status]);

  useEffect(() => {
    if (!open || nextEligibleTimestamp === null || !Number.isFinite(nextEligibleTimestamp)) {
      return;
    }

    const delay = nextEligibleTimestamp - Date.now();
    if (delay <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNow(Date.now());
      void onRefresh().catch((refreshError) => {
        setError(resolvePingErrorMessage(refreshError));
      });
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [nextEligibleTimestamp, onRefresh, open]);

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<{ pointerId: number; originX: number; originY: number; start: { x: number; y: number } } | null>(null);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      start: dragOffset,
    };
  };

  const continueDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    setDragOffset({
      x: dragState.start.x + (event.clientX - dragState.originX),
      y: dragState.start.y + (event.clientY - dragState.originY),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);

    try {
      await onSend(radiusMiles);
    } catch (sendError) {
      setError(resolvePingErrorMessage(sendError));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="z-[80] max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-2xl border border-white/10 bg-background/96 pb-4 backdrop-blur-xl sm:left-1/2 sm:max-w-lg"
        data-testid="map-ping-sheet"
        style={{
          // The sheet always opens just above the bottom nav, and stays where it
          // is dragged.
          bottom: `calc(6.25rem + env(safe-area-inset-bottom))`,
          top: 'auto',
          transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)`,
          left: '50%',
          width: 'min(28rem, calc(100vw - 1.5rem))',
        }}
      >
        <SheetHeader
          className="cursor-grab pr-10 active:cursor-grabbing"
          data-testid="map-ping-sheet-handle"
          onPointerDown={beginDrag}
          onPointerMove={continueDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="flex items-center gap-3">
            <PulseLedIcon className="h-10 w-10 shrink-0 text-[#c8ff31]" />
            <div>
              <SheetTitle>Send a Pulse</SheetTitle>
              <SheetDescription>Light up your heart for people nearby.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 px-4">
          <div className="flex items-center gap-4 rounded-xl border border-[#c8ff31]/45 bg-black/45 p-3">
            {/* The real marker, running the real Pulse state, so this is what
                people actually see rather than an approximation of it. */}
            <span className="flex h-[9.5rem] w-36 shrink-0 items-end justify-center overflow-hidden pb-0">
              <span className="block origin-bottom scale-[0.72]" data-testid="map-ping-preview-heart">
                <MapMarkerPin
                  marker={{
                    id: 'pulse-preview',
                    kind: 'person',
                    displayName: 'You',
                    userId: 'pulse-preview',
                    signal: 'Pulse sample',
                    approximateLatitude: 0,
                    approximateLongitude: 0,
                    photo: photo ?? null,
                    isCurrentUser: true,
                    activePing: { id: 'pulse-preview', expiresAt: '' },
                  }}
                  previewed
                />
              </span>
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-white">Your heart beats for 30 minutes</p>
              <p className="text-xs leading-relaxed text-white/62">
                Everyone inside your radius sees it beat, your pin rises above the others,
                you come up more in the carousel, and your signal posts to the feed. Your pin
                does not move.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.14em] text-white/48">
                Your signal <span className="text-white/32">{SIGNAL_MAX_LENGTH} characters max</span>
              </p>
              {onSaveSignal && !editingSignal ? (
                <button
                  type="button"
                  className="text-xs uppercase tracking-[0.12em] text-[#c8ff31] transition hover:brightness-110"
                  onClick={() => {
                    setSignalDraft(normalizedSignal);
                    setEditingSignal(true);
                  }}
                >
                  Edit
                </button>
              ) : null}
            </div>

            {editingSignal && onSaveSignal ? (
              <div className="mt-2 space-y-2">
                {/* One line only. A signal never wraps, so the field never
                    accepts a second line. */}
                <Input
                  aria-label="Your signal"
                  className="bg-input-background"
                  maxLength={SIGNAL_MAX_LENGTH}
                  onChange={(event) => setSignalDraft(event.target.value.replace(/\s+/g, ' '))}
                  value={signalDraft}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-full border-white/15 bg-black/45 text-white hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
                    disabled={savingSignal}
                    onClick={() => setEditingSignal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="h-9 rounded-full border border-[#c8ff31]/70 bg-black/45 font-semibold text-white hover:border-[#c8ff31] hover:bg-[#c8ff31]/10 hover:text-white"
                    disabled={savingSignal}
                    onClick={() => {
                      setSavingSignal(true);
                      setError(null);
                      void onSaveSignal(signalDraft.trim())
                        .then(() => setEditingSignal(false))
                        .catch((saveError) => setError(resolvePingErrorMessage(saveError)))
                        .finally(() => setSavingSignal(false));
                    }}
                  >
                    {savingSignal ? 'Saving...' : 'Save signal'}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-white">
                {normalizedSignal || 'Add a signal to your profile before sending a Pulse.'}
              </p>
            )}
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-white">Pulse radius</legend>
            <RadioGroup
              aria-label="Pulse radius"
              className="mt-2 grid grid-cols-5 gap-2"
              onValueChange={(value) => setRadiusMiles(Number(value) as MapPingRadiusMiles)}
              value={String(radiusMiles)}
            >
              {MAP_PING_RADII_MILES.map((radius) => (
                <label
                  className="flex min-h-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.035] px-1 py-2 text-center text-xs text-white/72 has-[[data-state=checked]]:border-[#c8ff31] has-[[data-state=checked]]:text-white"
                  key={radius}
                >
                  <RadioGroupItem className="border-[#c8ff31]/55 text-[#c8ff31] focus-visible:ring-[#c8ff31]/40 [&_svg]:fill-[#c8ff31]" value={String(radius)} aria-label={`${radius} ${radius === 1 ? 'mile' : 'miles'}`} />
                  <span>{radius} mi</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          {/* How many are left and when the next one lands, on one line. */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <p aria-live="polite" className="min-w-0 text-white/65">
              {!normalizedSignal
                ? 'Your Pulse uses the signal saved on your profile.'
                : hasMapLocation
                  ? statusText
                  : 'Share your map location before sending a Pulse.'}
            </p>
            {cooldownCountdown && status?.allowance.nextEligibleAt ? (
              <time
                aria-label="Pulse cooldown"
                aria-live="off"
                className="shrink-0 rounded-full border border-[#c8ff31]/60 px-2.5 py-1 font-mono font-semibold tabular-nums text-white"
                dateTime={status.allowance.nextEligibleAt}
                role="timer"
              >
                {cooldownCountdown}
              </time>
            ) : null}
          </div>
          {!hasCruushPlus && status?.allowance.remaining === 0 && onUpgrade ? (
            <CruushPlusGateNotice
              description="Basic includes 1 Ping every 24 hours."
              onUpgrade={onUpgrade}
            />
          ) : null}
          {error ? (
            <p className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white/85" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <SheetFooter>
          <Button
            type="button"
            className="cruush-action-sheen h-11 rounded-full font-semibold text-[#0B1200] disabled:text-white/45"
            disabled={sendDisabled}
            onClick={() => void handleSend()}
            style={{ background: sendDisabled ? '#151a0b' : '#c8ff31' }}
          >
            <PulseLedIcon className="mr-2 h-7 w-7 text-[#0B1200]" fill="none" />
            {sending
              ? 'Sending Pulse...'
              : activePing
                ? 'Pulse active'
                : cooldownCountdown
                  ? `Next Pulse in ${cooldownCountdown}`
                  : 'Send Pulse'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
