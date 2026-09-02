import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
import { useIsMobile } from './ui/use-mobile';
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
  /** Dark Room keeps you off the map, so a Pulse cannot go out. */
  lurkerActive?: boolean;
};

type PulseDesktopGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PulseDragState = {
  pointerId: number;
  mode: 'desktop-move' | 'desktop-resize';
  originX: number;
  originY: number;
  desktopStart: PulseDesktopGeometry;
};

const PULSE_DESKTOP_STORAGE_KEY = 'cruush.pulse.desktopGeometry';
const PULSE_DESKTOP_EDGE_GAP = 10;
const PULSE_DESKTOP_BOTTOM_CLEARANCE = 110;
const PULSE_DESKTOP_MIN_WIDTH = 360;
const PULSE_DESKTOP_MIN_HEIGHT = 420;
const PULSE_DESKTOP_DEFAULT_WIDTH = 448;
const PULSE_DESKTOP_DEFAULT_HEIGHT = 600;

function pulseTopClearance() {
  if (typeof window === 'undefined') {
    return 90;
  }

  const configured = Number.parseFloat(
    window.getComputedStyle(document.documentElement).getPropertyValue('--cruush-map-top-clearance'),
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 90;
}

function clampPulseDesktopGeometry(geometry: PulseDesktopGeometry): PulseDesktopGeometry {
  if (typeof window === 'undefined') {
    return geometry;
  }

  const minimumY = pulseTopClearance();
  const maxWidth = Math.max(PULSE_DESKTOP_MIN_WIDTH, window.innerWidth - PULSE_DESKTOP_EDGE_GAP * 2);
  const maxHeight = Math.max(1, window.innerHeight - minimumY - PULSE_DESKTOP_BOTTOM_CLEARANCE);
  const width = Math.min(Math.max(geometry.width, PULSE_DESKTOP_MIN_WIDTH), maxWidth);
  const effectiveMinHeight = Math.min(PULSE_DESKTOP_MIN_HEIGHT, maxHeight);
  const height = Math.min(Math.max(geometry.height, effectiveMinHeight), maxHeight);
  const x = Math.min(
    Math.max(geometry.x, PULSE_DESKTOP_EDGE_GAP),
    Math.max(PULSE_DESKTOP_EDGE_GAP, window.innerWidth - width - PULSE_DESKTOP_EDGE_GAP),
  );
  const y = Math.min(
    Math.max(geometry.y, minimumY),
    Math.max(minimumY, window.innerHeight - height - PULSE_DESKTOP_BOTTOM_CLEARANCE),
  );

  return { x, y, width, height };
}

function defaultPulseDesktopGeometry(): PulseDesktopGeometry {
  if (typeof window === 'undefined') {
    return { x: PULSE_DESKTOP_EDGE_GAP, y: 90, width: PULSE_DESKTOP_DEFAULT_WIDTH, height: PULSE_DESKTOP_DEFAULT_HEIGHT };
  }

  const width = Math.min(PULSE_DESKTOP_DEFAULT_WIDTH, window.innerWidth - PULSE_DESKTOP_EDGE_GAP * 2);
  const minimumY = pulseTopClearance();
  return clampPulseDesktopGeometry({
    x: Math.round((window.innerWidth - width) / 2),
    y: minimumY + 12,
    width,
    height: PULSE_DESKTOP_DEFAULT_HEIGHT,
  });
}

function readPulseDesktopGeometry(): PulseDesktopGeometry | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PULSE_DESKTOP_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PulseDesktopGeometry>;
    if (
      typeof parsed.x !== 'number'
      || typeof parsed.y !== 'number'
      || typeof parsed.width !== 'number'
      || typeof parsed.height !== 'number'
    ) {
      return null;
    }
    return { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height };
  } catch {
    return null;
  }
}

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

  return 'Pulse could not send. Try again.';
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
  lurkerActive = false,
  onUpgrade,
}: MapPingSheetProps) {
  const isMobile = useIsMobile();
  const [radiusMiles, setRadiusMiles] = useState<MapPingRadiusMiles>(3);
  const [sending, setSending] = useState(false);
  const [editingSignal, setEditingSignal] = useState(false);
  const [signalDraft, setSignalDraft] = useState('');
  const [savingSignal, setSavingSignal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [desktopGeometry, setDesktopGeometry] = useState<PulseDesktopGeometry>(() => {
    const stored = readPulseDesktopGeometry();
    return stored ? clampPulseDesktopGeometry(stored) : defaultPulseDesktopGeometry();
  });

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
  // A Pulse asks people to look at you, which is the opposite of being off the
  // map, so it stays shut while Dark Room is on.
  const sendDisabled = loading || sending || !status || !hasMapLocation || activePing ||
    !normalizedSignal || status.allowance.remaining === 0 || cooldownActive || lurkerActive;
  const statusText = useMemo(() => {
    if (activePing && status?.activePing) {
      return `Your Pulse is active until ${formatTime(status.activePing.expiresAt)}.`;
    }

    if (cooldownActive && status?.allowance.nextEligibleAt) {
      return `Your next Pulse is ready at ${formatTime(status.allowance.nextEligibleAt)}.`;
    }

    if (status) {
      if (status.allowance.unlimited) {
        return 'Unlimited Pulses with a 3-hour cooldown.';
      }
      return `${status.allowance.remaining} of ${status.allowance.limit} Pulses available right now.`;
    }

    return 'Checking your Pulse allowance...';
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

  const dragStateRef = useRef<PulseDragState | null>(null);

  useEffect(() => {
    if (isMobile) {
      return undefined;
    }

    const handleResize = () => setDesktopGeometry((current) => clampPulseDesktopGeometry(current));
    window.addEventListener('resize', handleResize);
    setDesktopGeometry((current) => clampPulseDesktopGeometry(current));
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) {
      return;
    }

    try {
      window.localStorage.setItem(PULSE_DESKTOP_STORAGE_KEY, JSON.stringify(desktopGeometry));
    } catch {
      // Window geometry is a convenience. Ignore storage failures.
    }
  }, [desktopGeometry, isMobile]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, mode: 'move' | 'resize' = 'move') => {
    if (isMobile || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    dragStateRef.current = {
      pointerId: event.pointerId,
      mode: mode === 'resize' ? 'desktop-resize' : 'desktop-move',
      originX: event.clientX,
      originY: event.clientY,
      desktopStart: desktopGeometry,
    };
  };

  const continueDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.mode === 'desktop-move') {
      setDesktopGeometry(clampPulseDesktopGeometry({
        ...dragState.desktopStart,
        x: dragState.desktopStart.x + (event.clientX - dragState.originX),
        y: dragState.desktopStart.y + (event.clientY - dragState.originY),
      }));
      return;
    }

    if (dragState.mode === 'desktop-resize') {
      setDesktopGeometry(clampPulseDesktopGeometry({
        ...dragState.desktopStart,
        width: dragState.desktopStart.width + (event.clientX - dragState.originX),
        height: dragState.desktopStart.height + (event.clientY - dragState.originY),
      }));
    }
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

  const sheetStyle: CSSProperties = isMobile
    ? {
      bottom: 'calc(6.25rem + env(safe-area-inset-bottom))',
      maxHeight: 'calc(100dvh - var(--cruush-map-top-clearance) - 6.75rem - env(safe-area-inset-bottom))',
      top: 'auto',
      transform: 'translate(-50%, 0)',
      left: '50%',
      width: 'min(28rem, calc(100vw - 1.5rem))',
    }
    : {
      bottom: 'auto',
      height: `${desktopGeometry.height}px`,
      left: `${desktopGeometry.x}px`,
      maxHeight: 'none',
      right: 'auto',
      top: `${desktopGeometry.y}px`,
      transform: 'none',
      width: `${desktopGeometry.width}px`,
    };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        overlayClassName="!z-[24]"
        className="!z-[25] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-background/96 pb-3 backdrop-blur-xl sm:max-w-lg lg:max-w-none"
        data-testid="map-ping-sheet"
        data-window-mode={isMobile ? 'mobile-sheet' : 'desktop-window'}
        style={sheetStyle}
      >
        <SheetHeader
          className={`shrink-0 pb-2 pr-10 pt-3 ${isMobile ? '' : 'cursor-grab active:cursor-grabbing'}`}
          data-testid="map-ping-sheet-handle"
          onPointerDown={isMobile ? undefined : beginDrag}
          onPointerMove={isMobile ? undefined : continueDrag}
          onPointerUp={isMobile ? undefined : endDrag}
          onPointerCancel={isMobile ? undefined : endDrag}
        >
          <div className="flex items-center gap-3">
            <PulseLedIcon className="h-8 w-8 shrink-0 text-[#c8ff31]" />
            <div>
              <SheetTitle>Send a Pulse</SheetTitle>
              <SheetDescription>Light up your heart for people nearby.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="scrollbar-hide min-h-0 space-y-2.5 overflow-y-auto px-4">
          <div className="flex items-center gap-3 rounded-xl border border-[#c8ff31]/45 bg-black/45 p-2.5">
            {/* The real marker, running the real Pulse state, so this is what
                people actually see rather than an approximation of it. */}
            <span className="flex h-24 w-20 shrink-0 items-end justify-center overflow-visible">
              <span className="block origin-bottom scale-[0.62]" data-testid="map-ping-preview-heart">
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
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-white">Your heart beats for 30 minutes</p>
              <p className="text-xs leading-snug text-white/62">
                Eligible people inside your radius see it beat, your saved signal posts to Feed, and your pin does not move. Phone alerts go only to mutuals, with no repeat alert from you to the same person for 24 hours.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-2.5">
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
                className="mt-1.5 grid grid-cols-5 gap-1.5"
              onValueChange={(value) => setRadiusMiles(Number(value) as MapPingRadiusMiles)}
              value={String(radiusMiles)}
            >
              {MAP_PING_RADII_MILES.map((radius) => (
                <label
                  className="flex min-h-10 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.035] px-1 py-1 text-center text-xs text-white/72 has-[[data-state=checked]]:border-[#c8ff31] has-[[data-state=checked]]:text-white"
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
              {lurkerActive
                ? 'Turn off Dark Room to send a Pulse.'
                : !normalizedSignal
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
              description="Basic includes 1 Pulse every 24 hours."
              onUpgrade={onUpgrade}
            />
          ) : null}
          {error ? (
            <p className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white/85" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <SheetFooter className="shrink-0 bg-background/96 pb-[env(safe-area-inset-bottom)] pt-2">
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
              : lurkerActive
                ? 'Dark Room is on'
                : activePing
                  ? 'Pulse active'
                  : cooldownCountdown
                    ? `Next Pulse in ${cooldownCountdown}`
                    : 'Send Pulse'}
          </Button>
        </SheetFooter>

        {!isMobile ? (
          <div
            aria-label="Resize Pulse panel"
            className="absolute bottom-0 right-0 z-40 h-7 w-7 cursor-nwse-resize"
            data-testid="map-ping-sheet-resize"
            onPointerCancel={endDrag}
            onPointerDown={(event) => beginDrag(event, 'resize')}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
          >
            <span className="absolute bottom-2 right-2 block h-2.5 w-2.5 rounded-[3px] border-b-2 border-r-2 border-white/70" />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
