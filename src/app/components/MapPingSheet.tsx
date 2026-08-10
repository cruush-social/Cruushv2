import { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import { ApiClientError } from '../lib/apiClient';
import {
  MAP_PING_RADII_MILES,
  type MapPingRadiusMiles,
  type MapPingStatus,
} from '../lib/mapPingsApi';
import { Button } from './ui/button';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
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
}: MapPingSheetProps) {
  const [radiusMiles, setRadiusMiles] = useState<MapPingRadiusMiles>(3);
  const [sending, setSending] = useState(false);
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
      return `${status.allowance.remaining} of ${status.allowance.limit} Pings available right now.`;
    }

    return 'Checking your Ping allowance...';
  }, [activePing, cooldownActive, status]);

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
        className="max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl border-white/10 bg-background/96 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:left-1/2 sm:bottom-4 sm:max-w-lg sm:-translate-x-1/2 sm:rounded-2xl sm:border"
        data-testid="map-ping-sheet"
      >
        <SheetHeader className="pr-10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/12 text-primary">
              <Radio aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <SheetTitle>Send a Ping</SheetTitle>
              <SheetDescription>Light up your heart for people nearby.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 px-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-white/48">Your signal</p>
            <p className="mt-1 text-sm text-white">
              {normalizedSignal || 'Add a signal to your profile before sending a Ping.'}
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-white">Ping radius</legend>
            <RadioGroup
              aria-label="Ping radius"
              className="mt-2 grid grid-cols-5 gap-2"
              onValueChange={(value) => setRadiusMiles(Number(value) as MapPingRadiusMiles)}
              value={String(radiusMiles)}
            >
              {MAP_PING_RADII_MILES.map((radius) => (
                <label
                  className="flex min-h-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.035] px-1 py-2 text-center text-xs text-white/72 has-[[data-state=checked]]:border-primary/70 has-[[data-state=checked]]:bg-primary/12 has-[[data-state=checked]]:text-white"
                  key={radius}
                >
                  <RadioGroupItem value={String(radius)} aria-label={`${radius} ${radius === 1 ? 'mile' : 'miles'}`} />
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
                : 'Share your map location before sending a Ping.'}
          </p>
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <SheetFooter>
          <Button
            type="button"
            className="h-11 rounded-full text-white"
            disabled={sendDisabled}
            onClick={() => void handleSend()}
            style={{ background: sendDisabled ? undefined : 'var(--cruush-gradient)' }}
          >
            <Radio aria-hidden="true" className="mr-2 h-4 w-4" />
            {sending ? 'Sending Ping...' : activePing ? 'Ping active' : 'Send Ping'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
