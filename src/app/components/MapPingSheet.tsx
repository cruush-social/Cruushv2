import { useTrustRestrictions } from '../lib/trustRestrictions';
import TrustRestrictionNotice from './TrustRestrictionNotice';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { SIGNAL_MAX_LENGTH } from '../lib/profileLimits';
import PulseLedIcon from './PulseLedIcon';
import BugButtonSlot from './BugButtonSlot';
import { MapMarkerPin } from './MapView';
import { ApiClientError } from '../lib/apiClient';
import {
  MAP_PING_RADII_MILES,
  type MapPingRadiusMiles,
  type MapPingStatus,
} from '../lib/mapPingsApi';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import CruushPlusGateNotice from './CruushPlusGateNotice';
import { useIsMobile } from './ui/use-mobile';
import {
  Sheet,
  SheetContent,
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
  /** Opens the Pulse pack checkout. The sheet closes first, the same way the
      cruush+ gate hands navigation back to the map. */
  onGetPulses?: () => void;
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
  onGetPulses,
}: MapPingSheetProps) {
  const isMobile = useIsMobile();
  const trust = useTrustRestrictions(open);
  const [radiusMiles, setRadiusMiles] = useState<MapPingRadiusMiles>(3);
  const [sending, setSending] = useState(false);
  const [editingSignal, setEditingSignal] = useState(false);
  const [signalDraft, setSignalDraft] = useState('');
  const [savingSignal, setSavingSignal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [desktopHeightResized, setDesktopHeightResized] = useState(false);
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
  const sendDisabled = trust.restricted('map_pings') || loading || sending || !status || !hasMapLocation ||
    !normalizedSignal || status.allowance.remaining === 0 || cooldownActive || lurkerActive;
  const statusText = !status
    ? 'Checking your Pulse allowance...'
    : status.allowance.unlimited || status.allowance.remaining === null
      ? 'Unlimited Pulses'
      : `${status.allowance.remaining} ${status.allowance.remaining === 1 ? 'Pulse' : 'Pulses'} left`;

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
    if (mode === 'move' && event.target instanceof Element && event.target.closest('[data-cruush-bug-slot]')) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const renderedHeight = event.currentTarget.closest('[data-testid="map-ping-sheet"]')?.getBoundingClientRect().height;
    const desktopStart = !desktopHeightResized && renderedHeight
      ? { ...desktopGeometry, height: renderedHeight }
      : desktopGeometry;
    if (mode === 'resize') {
      setDesktopHeightResized(true);
      setDesktopGeometry(desktopStart);
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      mode: mode === 'resize' ? 'desktop-resize' : 'desktop-move',
      originX: event.clientX,
      originY: event.clientY,
      desktopStart,
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
    if (trust.restricted('map_pings')) return;
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
      height: desktopHeightResized ? `${desktopGeometry.height}px` : 'auto',
      left: `${desktopGeometry.x}px`,
      maxHeight: desktopHeightResized ? 'none' : `${Math.max(1, window.innerHeight - desktopGeometry.y - PULSE_DESKTOP_BOTTOM_CLEARANCE)}px`,
      right: 'auto',
      top: `${desktopGeometry.y}px`,
      transform: 'none',
      width: `${desktopGeometry.width}px`,
    };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        overlayClassName="!z-[1600]"
        className={`!z-[1601] flex flex-col overflow-hidden rounded-2xl border border-white/25 bg-black/48 pb-3 backdrop-blur-xl backdrop-saturate-150 sm:max-w-lg lg:max-w-none ${isMobile ? 'gap-2' : ''}`}
        data-testid="map-ping-sheet"
        data-window-mode={isMobile ? 'mobile-sheet' : 'desktop-window'}
        style={sheetStyle}
      >
        <SheetHeader
          className={`shrink-0 pl-14 pr-4 ${isMobile ? 'pb-1 pt-2' : 'pb-2 pt-3 cursor-grab active:cursor-grabbing'}`}
          data-testid="map-ping-sheet-handle"
          onPointerDown={isMobile ? undefined : beginDrag}
          onPointerMove={isMobile ? undefined : continueDrag}
          onPointerUp={isMobile ? undefined : endDrag}
          onPointerCancel={isMobile ? undefined : endDrag}
        >
          <div className="flex min-w-0 items-center gap-3">
            <PulseLedIcon className="h-8 w-8 shrink-0 text-[#c8ff31]" />
            <SheetTitle className="min-w-0 flex-1 truncate pr-7">Send a Pulse</SheetTitle>
            <BugButtonSlot testId="pulse-bug-button-slot" />
          </div>
        </SheetHeader>

        <div className={`scrollbar-hide min-h-0 overflow-y-auto ${isMobile ? 'space-y-2 px-3' : 'space-y-2.5 px-4'}`}>
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
                People in your radius see it beat and your signal posts to Feed. Your pin does not move. Alerts go to cruushes only, at most one every 4 hours.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs uppercase tracking-[0.14em] text-white/48">
                Your signal <span className="text-white/32">{SIGNAL_MAX_LENGTH} max</span>
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
            {/* A slider in the Pulse colour, rather than a row of radio chips
                that could not hold the wider range. */}
            <div className="mt-1.5 space-y-2">
              <p aria-live="polite" className="text-sm text-white">
                {radiusMiles} {radiusMiles === 1 ? 'mile' : 'miles'}
              </p>
              <Slider
                aria-label="Pulse radius"
                className="[&_[data-slot=slider-range]]:bg-[#c8ff31] [&_[data-slot=slider-thumb]]:border-[#c8ff31] [&_[data-slot=slider-thumb]]:bg-[#c8ff31]"
                max={MAP_PING_RADII_MILES.length - 1}
                min={0}
                onValueChange={([index]) => setRadiusMiles(MAP_PING_RADII_MILES[index] ?? MAP_PING_RADII_MILES[0])}
                step={1}
                value={[Math.max(0, MAP_PING_RADII_MILES.indexOf(radiusMiles))]}
              />
              <div className="flex justify-between text-[11px] text-white/50">
                <span>{MAP_PING_RADII_MILES[0]} mi</span>
                <span>{MAP_PING_RADII_MILES[MAP_PING_RADII_MILES.length - 1]} mi</span>
              </div>
            </div>
          </fieldset>

          {/* How many are left and when the next one lands, on one line. */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <p aria-live="polite" className="min-w-0 text-white/65">
              {statusText}
            </p>
            {onGetPulses ? (
              <button
                type="button"
                className="shrink-0 rounded-full border border-[#c8ff31] bg-[#c8ff31] px-4 py-2 text-sm font-bold text-black shadow-[0_0_22px_rgba(200,255,49,0.38)] transition hover:brightness-110"
                onClick={() => {
                  onOpenChange(false);
                  onGetPulses();
                }}
              >
                Get Pulses
              </button>
            ) : null}
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
              surface="map_pulse"
              benefit="more_pulses"
              onUpgrade={onUpgrade}
            />
          ) : null}
          {error ? (
            <p className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white/85" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <SheetFooter className={`shrink-0 bg-background/96 pb-[env(safe-area-inset-bottom)] pt-2 ${isMobile ? 'mt-0' : ''}`}>
          <TrustRestrictionNotice message={trust.message('map_pings', 'Pulse')} />
          <Button
            type="button"
            className={`cruush-action-sheen h-11 rounded-full font-semibold text-[#0B1200] disabled:text-white/45 ${trust.restricted('map_pings') ? 'grayscale' : ''}`}
            disabled={sendDisabled}
            onClick={() => void handleSend()}
            style={{ background: sendDisabled ? '#151a0b' : '#c8ff31' }}
          >
            <PulseLedIcon className="mr-2 h-7 w-7 text-[#0B1200]" fill="none" />
            {sending
              ? 'Sending Pulse...'
              : lurkerActive
                ? 'Dark Room is on'
                : activePing && status?.allowance.remaining === 0
                  ? 'Pulse active'
                  : activePing
                    ? 'Send another Pulse'
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
