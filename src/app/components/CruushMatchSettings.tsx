import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { MapPin, MessageCircle } from 'lucide-react';
import { Switch } from './ui/switch';
import { Card, CardContent } from './ui/card';
import AppPageHeader from './AppPageHeader';
import {
  DEFAULT_CRUUSH_MATCH_SETTINGS,
  getCruushMatchSettings,
  saveCruushMatchSettings,
  type CruushMatchSettings as CruushMatchSettingsRecord,
  type MessageVisibility,
} from '../lib/cruushSettingsApi';
import {
  DEFAULT_PRIVACY_SETTINGS,
  getMyPrivacySettings,
  saveMyPrivacySettings,
  type PrivacySettings,
} from '../lib/privacyApi';

const visibilityOptions: Array<{
  value: MessageVisibility;
  label: string;
  description: string;
}> = [
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone who can see you in discovery may start a chat.',
  },
  {
    value: 'mutual_cruushes',
    label: 'Cruushes',
    description: 'Only cruushes can start a chat. This is the default.',
  },
  {
    value: 'mutual_crowds',
    label: 'Crowd',
    description: 'People who share one of your crowds can start a chat.',
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

export default function CruushMatchSettings({ embedded = false }: { embedded?: boolean } = {}) {
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
          setError(loadError instanceof Error ? loadError.message : 'Failed to load Message permissions.');
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
        messageVisibility: nextSettings.messageVisibility,
        nsfwMessageVisibility: nextSettings.nsfwMessageVisibility,
        nsfwSendVisibility: nextSettings.nsfwSendVisibility,
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save Message permissions.');
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
      setError(saveError instanceof Error ? saveError.message : 'Failed to save mutual rules.');
    } finally {
      setStatus('idle');
    }
  };

  const disabled = status === 'loading' || status === 'saving';

  return (
    <div className={embedded ? 'bg-transparent pb-2 text-white' : 'min-h-screen bg-background pb-20 text-white'}>
      {!embedded ? (
        <AppPageHeader
          title="Message settings"
          onBack={() => navigate(-1)}
          backLabel="Back to cruush"
          bugButtonTestId="cruush-match-settings-bug-button-slot"
        />
      ) : null}

      <main className="mx-auto max-w-2xl space-y-5 p-4">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <MessageCircle className="mt-1 h-5 w-5 text-primary" />
              <h3 className="text-base">Who can message me</h3>
            </div>
            <div className="mt-4 grid gap-2">
              {visibilityOptions.map((option) => (
                <ChoiceRow
                  key={option.value}
                  value={option}
                  selected={matchSettings.messageVisibility === option.value}
                  onSelect={() => void persistMatchSettings({
                    ...matchSettings,
                    messageVisibility: option.value,
                  })}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <MapPin className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base">Precise location for cruushes</h3>
                  <p className="mt-1 text-sm text-white/58">When on, cruushes may see precise live location instead of your Ghost location.</p>
                </div>
              </div>
              <Switch
                aria-label="Toggle precise location for cruushes"
                checked={privacySettings.preciseToMutualCruushes}
                disabled={disabled}
                onCheckedChange={(enabled) => void persistPrivacySettings({
                  ...privacySettings,
                  preciseToMutualCruushes: enabled,
                  preciseLocationVisibility: enabled ? 'mutual_cruushes' : 'none',
                })}
              />
            </div>
          </CardContent>
        </Card>

        {status === 'saving' ? (
          <p className="px-1 text-xs text-white/52">Saving...</p>
        ) : null}
      </main>
    </div>
  );
}
