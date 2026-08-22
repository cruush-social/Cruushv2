import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { getMapPresence, saveMapPresence } from '../lib/privacyApi';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { saveDistancePreferences, useDistancePreferences, type DistanceDisplayMode } from '../lib/distancePreferences';

export const DEFAULT_MAP_PRESENCE_DAYS = 7;
export const MIN_MAP_PRESENCE_DAYS = 1;
export const MAX_MAP_PRESENCE_DAYS = 30;

function describeDays(days: number) {
  const hours = days * 24;
  const window = days === 1 ? '1 day' : `${days} days`;

  return `You stay on the map for ${window}, ${hours} hours, after you were last active. People can still find you while you are out of the app.`;
}

// Every setting reads both ways, and the stricter of two people's settings wins.
const DISTANCE_LABEL_OPTIONS: { value: DistanceDisplayMode; label: string; description: string }[] = [
  {
    value: 'off',
    label: 'No labels',
    description: 'You see no distances and nobody sees one for you.',
  },
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
  const [days, setDays] = useState(DEFAULT_MAP_PRESENCE_DAYS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMapPresence();
      setDays(data.days ?? DEFAULT_MAP_PRESENCE_DAYS);
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
      const data = await saveMapPresence(days);
      setDays(data.days ?? days);
      toast.success('Map presence updated.');
    } catch {
      setError('Could not save your map presence setting.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <Button variant="ghost" size="icon" aria-label="Return to settings" onClick={() => navigate('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl">Map presence</h1>
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
                  onClick={() => saveDistancePreferences({ mode: option.value })}
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
          Your privacy settings keep applying while you are away. Ghost Mode still fuzzes your pin, stealth still
          hides you completely, and any audiences you hid yourself from stay hidden until you change them.
        </p>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading your setting...</p>
        ) : (
          <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <Label htmlFor="map-presence-days">Stay on the map for</Label>
            <Slider
              id="map-presence-days"
              aria-label="Days to stay on the map"
              value={[days]}
              min={MIN_MAP_PRESENCE_DAYS}
              max={MAX_MAP_PRESENCE_DAYS}
              step={1}
              onValueChange={([nextDays]) => setDays(nextDays)}
            />
            <p className="text-sm text-muted-foreground">{describeDays(days)}</p>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={saving || days === DEFAULT_MAP_PRESENCE_DAYS}
                onClick={() => setDays(DEFAULT_MAP_PRESENCE_DAYS)}
              >
                Reset to {DEFAULT_MAP_PRESENCE_DAYS} days
              </Button>
              <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
