import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from '../lib/toast';
import { getMapPresence, saveMapPresence } from '../lib/privacyApi';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { saveDistancePreferences, useDistancePreferences, type DistanceDisplayMode } from '../lib/distancePreferences';
import { MAP_PRESENCE_OPTIONS } from '../lib/privacyApi';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import BugButtonSlot from './BugButtonSlot';

export const DEFAULT_MAP_PRESENCE_HOURS = 168;

function formatPresenceWindow(hours: number) {
  return hours <= 48
    ? `${hours} ${hours === 1 ? 'hour' : 'hours'}`
    : `${hours / 24} ${hours === 24 ? 'day' : 'days'}`;
}

function describeHours(hours: number) {
  return `You stay on the map for ${formatPresenceWindow(hours)} after you were last active.`;
}

// Every setting reads both ways, and the stricter of two people's settings wins.
const DISTANCE_LABEL_OPTIONS: { value: DistanceDisplayMode; label: string; description: string }[] = [
  {
    value: 'approximate',
    label: 'Approximate',
    description: 'Both sides see a rough distance rather than a number.',
  },
  {
    value: 'precise',
    label: 'Precise',
    description: 'Both sides see the miles, unless Ghost Mode is on and they are not allowed your precise location.',
  },
];

export default function MapPresenceSettings() {
  const distancePreferences = useDistancePreferences();
  const navigate = useNavigate();
  const [hours, setHours] = useState(DEFAULT_MAP_PRESENCE_HOURS);
  const [savedHours, setSavedHours] = useState(DEFAULT_MAP_PRESENCE_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMapPresence();
      const nextHours = data.hours ?? DEFAULT_MAP_PRESENCE_HOURS;
      setHours(nextHours);
      setSavedHours(nextHours);
    } catch {
      setError('Could not load your map presence setting.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const data = await saveMapPresence(hours);
      const nextHours = data.hours ?? hours;
      setHours(nextHours);
      setSavedHours(nextHours);
      toast.success('Map presence updated.');
    } catch {
      setError('Could not save your map presence setting.');
    } finally {
      setSaving(false);
    }
  };

  const selectedIndex = Math.max(
    0,
    MAP_PRESENCE_OPTIONS.findIndex((option) => option.hours === hours),
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-[color:var(--cruush-black-glass)] px-4 py-3 backdrop-blur-[var(--cruush-black-glass-blur)]">
        <Button variant="ghost" size="icon" aria-label="Return to settings" onClick={() => navigate('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl">Map presence</h1>
      
        <BugButtonSlot testId="map-presence-settings-bug-button-slot" />
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.035] p-3">
          <Label>Distance labels</Label>
          <div className="grid gap-2">
            {DISTANCE_LABEL_OPTIONS.map((option) => {
              const selected = distancePreferences.mode === option.value;

              return (
                <button
                  aria-pressed={selected}
                  className={`rounded-lg border p-3 text-left transition ${
                    selected
                      ? 'border-primary/45 text-white'
                      : 'border-white/10 bg-white/[0.035] text-white/72 hover:bg-white/[0.06]'
                  }`}
                  key={option.value}
                  onClick={() => {
                    setError(null);
                    void saveDistancePreferences({ mode: option.value }).catch(() => setError('Could not save your map presence setting.'));
                  }}
                  style={selected ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
                  type="button"
                >
                  <span className="block text-sm text-white">{option.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-muted-foreground">
          Your privacy settings keep applying while you are away. Ghost Mode still fuzzes your pin, Dark Room still
          hides you completely, and any audiences you hid yourself from stay hidden until you change them.
        </p>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <LoadingCardSkeletons count={2} label="Loading map presence settings" />
        ) : (
          <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <Label htmlFor="map-presence-days">Stay on the map for</Label>
            <p aria-live="polite" className="text-lg text-white">{formatPresenceWindow(hours)}</p>
            <Slider
              id="map-presence-days"
              aria-label="Time to stay on the map"
              value={[selectedIndex]}
              min={0}
              max={MAP_PRESENCE_OPTIONS.length - 1}
              step={1}
              onValueChange={([nextIndex]) => setHours(MAP_PRESENCE_OPTIONS[nextIndex]?.hours ?? DEFAULT_MAP_PRESENCE_HOURS)}
            />
            <div className="flex justify-between gap-0.5">
              {MAP_PRESENCE_OPTIONS.map((option) => (
                <button
                  aria-label={`Set map presence to ${formatPresenceWindow(option.hours)}`}
                  className={`min-w-0 flex-1 text-center text-[10px] ${option.hours === hours ? 'text-white' : 'text-muted-foreground'}`}
                  key={option.hours}
                  onClick={() => setHours(option.hours)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{describeHours(hours)}</p>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={saving || hours === DEFAULT_MAP_PRESENCE_HOURS}
                onClick={() => setHours(DEFAULT_MAP_PRESENCE_HOURS)}
              >
                Reset to 7 days
              </Button>
              <Button type="button" disabled={saving || hours === savedHours} onClick={() => void handleSave()}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
