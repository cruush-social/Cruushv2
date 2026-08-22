import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  clearMyTravelPin,
  getMyTravelPin,
  saveMyTravelPin,
  type TravelPin,
} from '../lib/privacyApi';
import { Button } from './ui/button';
import { TravelPinGlyph } from './BadgeGlyphs';

/** What Travel Mode does and does not allow, stated before it is turned on. */
const TRAVEL_MODE_TERMS = [
  'Your pin sits where you drop it, and the map shows you there instead of your device location.',
  'The pin can be moved once every 3 hours, so it cannot be swept across a city.',
  'You can browse, cruush, and message the same as anywhere else.',
  'Pulse is off while you are travelling. A Pulse calls people to a place you are not standing in.',
  'Kelpie Mode is off while you are travelling. A borrowed location and an unseen viewer is not a pair we allow.',
  'Ghost Mode still works, and it fuzzes the travel pin the same way it fuzzes home.',
];

function formatCountdown(untilMs: number, nowMs: number) {
  const remaining = Math.max(0, untilMs - nowMs);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.ceil((remaining % 3_600_000) / 60_000);

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function TravelModeSection() {
  const [pin, setPin] = useState<TravelPin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const nowMs = Date.now();

  useEffect(() => {
    let active = true;

    getMyTravelPin()
      .then((result) => {
        if (active) {
          setPin(result.pin);
          setLabel(result.pin?.label ?? '');
        }
      })
      .catch(() => {
        if (active) {
          setPin(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const dropPin = () => {
    setSaving(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        saveMyTravelPin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: label.trim(),
        })
          .then((result) => {
            setPin(result.pin);
            setShowTerms(false);
            toast.success('Travel Mode is on.');
          })
          .catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : 'Could not drop your travel pin.');
          })
          .finally(() => setSaving(false));
      },
      () => {
        setError('cruush needs your location to drop a travel pin.');
        setSaving(false);
      },
    );
  };

  const turnOff = () => {
    setSaving(true);
    setError('');
    clearMyTravelPin()
      .then(() => {
        setPin(null);
        toast.success('Travel Mode is off.');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not turn off Travel Mode.');
      })
      .finally(() => setSaving(false));
  };

  const canMove = pin ? nowMs >= pin.movableAtMs : true;

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="flex min-w-0 items-center gap-2">
        <TravelPinGlyph className="h-5 w-5 shrink-0 text-white" />
        <h2 className="min-w-0 flex-1 text-base text-white">Travel Mode</h2>
        {pin ? (
          <Button
            className="rounded-full"
            disabled={saving}
            onClick={turnOff}
            size="sm"
            type="button"
            variant="outline"
          >
            Turn off
          </Button>
        ) : (
          <Button
            className="rounded-full"
            disabled={loading || saving}
            onClick={() => setShowTerms((open) => !open)}
            size="sm"
            type="button"
            variant="outline"
          >
            {showTerms ? 'Close' : 'Turn on'}
          </Button>
        )}
      </div>

      {pin ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="text-white">{pin.label || 'Travelling'}</p>
          <p>
            {canMove
              ? 'Your pin can be moved now.'
              : `Your pin can be moved again in ${formatCountdown(pin.movableAtMs, nowMs)}.`}
          </p>
        </div>
      ) : null}

      {!pin && showTerms ? (
        <div className="space-y-3">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {TRAVEL_MODE_TERMS.map((term) => (
              <li className="flex gap-2" key={term}>
                <span aria-hidden="true" className="text-white/40">-</span>
                <span>{term}</span>
              </li>
            ))}
          </ul>
          <input
            aria-label="Where you are visiting"
            className="w-full rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-white/35"
            maxLength={60}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Where are you visiting?"
            value={label}
          />
          <Button
            className="w-full rounded-full text-white"
            disabled={saving}
            onClick={dropPin}
            style={{ background: 'var(--cruush-gradient)' }}
            type="button"
          >
            {saving ? 'Dropping your pin...' : 'Drop my pin here'}
          </Button>
        </div>
      ) : null}

      {pin && canMove ? (
        <Button
          className="w-full rounded-full"
          disabled={saving}
          onClick={dropPin}
          type="button"
          variant="outline"
        >
          Move my pin to where I am now
        </Button>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export default function TravelModeSettings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/88 px-4 py-3 backdrop-blur-md">
        <button
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/55"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg text-white">Travel Mode</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
        <TravelModeSection />
      </main>
    </div>
  );
}
