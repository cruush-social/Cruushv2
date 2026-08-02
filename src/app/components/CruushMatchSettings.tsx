import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Eye, Image as ImageIcon, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import {
  DEFAULT_CRUUSH_MATCH_SETTINGS,
  getCruushMatchSettings,
  saveCruushMatchSettings,
  type CruushMatchSettings as CruushMatchSettingsRecord,
  type NsfwMessageVisibility,
} from '../lib/cruushSettingsApi';
import {
  DEFAULT_PRIVACY_SETTINGS,
  getMyPrivacySettings,
  saveMyPrivacySettings,
  type PrivacySettings,
} from '../lib/privacyApi';

const visibilityOptions: Array<{
  value: NsfwMessageVisibility;
  label: string;
  description: string;
}> = [
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone you can message may send NSFW photos.',
  },
  {
    value: 'mutual_cruushes',
    label: 'Mutual cruushes',
    description: 'Only mutual cruushes may exchange NSFW photos.',
  },
  {
    value: 'mutual_crowds',
    label: 'Mutual crowds',
    description: 'Only people who share one of your crowds may exchange NSFW photos.',
  },
  {
    value: 'none',
    label: 'No one',
    description: 'Block NSFW photo sends.',
  },
];

function ChoiceRow({
  value,
  selected,
  onSelect,
}: {
  value: typeof visibilityOptions[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-lg border p-3 text-left transition ${
        selected
          ? 'border-primary/45 bg-primary/14 text-white'
          : 'border-white/10 bg-white/[0.035] text-white/78 hover:bg-white/[0.06]'
      }`}
      onClick={onSelect}
      style={selected ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
    >
      <span className="block text-sm text-white">{value.label}</span>
      <span className="mt-1 block text-xs text-white/58">{value.description}</span>
    </button>
  );
}

export default function CruushMatchSettings() {
  const navigate = useNavigate();
  const [matchSettings, setMatchSettings] = useState<CruushMatchSettingsRecord>(DEFAULT_CRUUSH_MATCH_SETTINGS);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      getCruushMatchSettings().catch(() => DEFAULT_CRUUSH_MATCH_SETTINGS),
      getMyPrivacySettings().catch(() => DEFAULT_PRIVACY_SETTINGS),
    ])
      .then(([loadedMatchSettings, loadedPrivacySettings]) => {
        if (!active) {
          return;
        }

        setMatchSettings(loadedMatchSettings);
        setPrivacySettings(loadedPrivacySettings);
        setError(null);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load match settings.');
        }
      })
      .finally(() => {
        if (active) {
          setStatus('idle');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const persistMatchSettings = async (nextSettings: CruushMatchSettingsRecord) => {
    setMatchSettings(nextSettings);
    setStatus('saving');
    setError(null);

    try {
      setMatchSettings(await saveCruushMatchSettings({
        nsfwMessageVisibility: nextSettings.nsfwMessageVisibility,
        nsfwSendVisibility: nextSettings.nsfwSendVisibility,
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save match settings.');
    } finally {
      setStatus('idle');
    }
  };

  const persistPrivacySettings = async (nextSettings: PrivacySettings) => {
    setPrivacySettings(nextSettings);
    setStatus('saving');
    setError(null);

    try {
      setPrivacySettings(await saveMyPrivacySettings(nextSettings));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save mutual cruush rules.');
    } finally {
      setStatus('idle');
    }
  };

  const disabled = status === 'loading' || status === 'saving';

  return (
    <div className="min-h-screen bg-background pb-20 text-white">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-white/10 bg-background/88 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back to cruush">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl">mutual cruush settings</h2>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 p-4">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-card/80 p-4">
          <div className="flex items-start gap-3">
            <ImageIcon className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base">Who can send you NSFW photos</h3>
              <p className="mt-1 text-sm text-white/58">This controls who can send NSFW photos to you in messages.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {visibilityOptions.map((option) => (
              <ChoiceRow
                key={`receive-${option.value}`}
                value={option}
                selected={matchSettings.nsfwMessageVisibility === option.value}
                onSelect={() => void persistMatchSettings({
                  ...matchSettings,
                  nsfwMessageVisibility: option.value,
                })}
              />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-card/80 p-4">
          <div className="flex items-start gap-3">
            <Eye className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base">Who you can send NSFW photos to</h3>
              <p className="mt-1 text-sm text-white/58">This prevents accidental sends outside the boundaries you choose.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {visibilityOptions.map((option) => (
              <ChoiceRow
                key={`send-${option.value}`}
                value={option}
                selected={matchSettings.nsfwSendVisibility === option.value}
                onSelect={() => void persistMatchSettings({
                  ...matchSettings,
                  nsfwSendVisibility: option.value,
                })}
              />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-card/80 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h3 className="text-base">Precise location for mutual cruushes</h3>
                <p className="mt-1 text-sm text-white/58">When on, mutual cruushes may see precise live location instead of your Ghost location.</p>
              </div>
            </div>
            <Switch
              aria-label="Toggle precise location for mutual cruushes"
              checked={privacySettings.preciseToMutualCruushes}
              disabled={disabled}
              onCheckedChange={(enabled) => void persistPrivacySettings({
                ...privacySettings,
                preciseToMutualCruushes: enabled,
                preciseLocationVisibility: enabled ? 'mutual_cruushes' : 'none',
              })}
            />
          </div>
        </section>

        {status === 'saving' ? (
          <p className="px-1 text-xs text-white/52">Saving...</p>
        ) : null}
      </main>
    </div>
  );
}
