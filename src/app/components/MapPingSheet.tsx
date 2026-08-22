import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import PulseLedIcon from './PulseLedIcon';
import HeartPhoto from './HeartPhoto';
import { ApiClientError } from '../lib/apiClient';
import {
  MAP_PING_RADII_MILES,
  type MapPingRadiusMiles,
  type MapPingStatus,
} from '../lib/mapPingsApi';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
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
          {/* What a Pulse does, shown rather than described: the same heart the
              map draws, running the same animation it runs when a Pulse is on. */}
          <div className="flex items-center gap-4 rounded-xl border border-[#c8ff31]/45 bg-black/45 p-3">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-visible">
              <span
                className="cruush-map-ping-heart block origin-center"
                data-testid="map-ping-preview-heart"
                style={{ animation: 'cruush-map-ping-heart-pulse 1.35s ease-in-out infinite' }}
              >
                <HeartPhoto
                  className="w-16"
                  label="Your heart while a Pulse is running"
                  masked={false}
                  photo={null}
                  theme="current"
                  userId="pulse-preview"
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
              <p className="text-xs uppercase tracking-[0.14em] text-white/48">Your signal</p>
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
                <Textarea
                  aria-label="Your signal"
                  className="min-h-[64px] bg-input-background"
                  maxLength={140}
                  onChange={(event) => setSignalDraft(event.target.value)}
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

          <p aria-live="polite" className="text-sm text-white/65">
            {!normalizedSignal
              ? 'Your Ping uses the signal saved on your profile.'
              : hasMapLocation
                ? statusText
                : 'Share your map location before sending a Pulse.'}
          </p>
          {cooldownCountdown && status?.allowance.nextEligibleAt ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#c8ff31]/60 bg-black/45 px-3 py-2.5 text-sm">
              <span className="text-white/65">Next Pulse in</span>
              <time
                aria-label="Ping cooldown"
                aria-live="off"
                className="font-mono font-semibold tabular-nums text-white"
                dateTime={status.allowance.nextEligibleAt}
                role="timer"
              >
                {cooldownCountdown}
              </time>
            </div>
          ) : null}
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
            style={{ background: sendDisabled ? undefined : '#c8ff31' }}
          >
            <PulseLedIcon className="mr-2 h-7 w-7 text-[#0B1200]" fill="none" />
            {sending ? 'Sending Ping...' : activePing ? 'Ping active' : 'Send Ping'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
