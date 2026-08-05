import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { getMapPresence, saveMapPresence } from '../lib/privacyApi';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Slider } from './ui/slider';

export const DEFAULT_MAP_PRESENCE_DAYS = 7;
export const MIN_MAP_PRESENCE_DAYS = 1;
export const MAX_MAP_PRESENCE_DAYS = 30;

function describeDays(days: number) {
  if (days === 1) {
    return 'You stay on the map for 1 day after you were last active.';
  }

  return `You stay on the map for ${days} days after you were last active.`;
}

export default function MapPresenceSettings() {
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
        <div>
          <h1 className="text-xl">Map presence</h1>
          <p className="text-xs text-muted-foreground">How long you stay on the map after signing out</p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        <p className="text-sm text-muted-foreground">
          You keep appearing on the map for a while after your last activity, so people can still find you when
          you are not in the app. Shorten it to disappear sooner, or lengthen it to stay discoverable.
        </p>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading your setting...</p>
        ) : (
          <div className="space-y-4">
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
