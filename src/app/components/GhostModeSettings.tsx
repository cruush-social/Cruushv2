import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { CruushIcon } from './CruushIconImage';
import {
  CROWDS,
} from '../lib/profileOptions';
import {
  DEFAULT_PRIVACY_SETTINGS,
  GHOST_RADIUS_OPTIONS,
  getMyPrivacySettings,
  saveMyPrivacySettings,
  type CrowdPrecisionPolicy,
  type PrivacySettings,
} from '../lib/privacyApi';

export default function GhostModeSettings() {
  const navigate = useNavigate();
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [privacyStatus, setPrivacyStatus] = useState<'idle' | 'loading' | 'saving'>('loading');
  const [privacyError, setPrivacyError] = useState<string | null>(null);

  const normalizePrivacySettings = (settings: Partial<PrivacySettings>): PrivacySettings => ({
    ...DEFAULT_PRIVACY_SETTINGS,
    ...settings,
    baseMode: settings.baseMode ?? (settings.ghostModeEnabled ? 'GHOST' : 'PUBLIC_PRECISE'),
    ghostModeEnabled: settings.ghostModeEnabled ?? settings.baseMode === 'GHOST',
    ghostRadiusMeters: settings.ghostRadiusMeters ?? DEFAULT_PRIVACY_SETTINGS.ghostRadiusMeters,
    ghostRadiusLabel: settings.ghostRadiusLabel ?? DEFAULT_PRIVACY_SETTINGS.ghostRadiusLabel,
    preciseToMutualCruushes: settings.preciseToMutualCruushes ?? settings.preciseLocationVisibility === 'mutual_cruushes',
    preciseLocationVisibility: settings.preciseLocationVisibility ?? (settings.preciseToMutualCruushes ? 'mutual_cruushes' : 'none'),
    preciseToMutualCrowds: settings.preciseToMutualCrowds ?? [],
    updatedAtMs: settings.updatedAtMs ?? 0,
  });

  const upsertCrowdPolicy = (crowdId: CrowdPrecisionPolicy['crowdId'], enabled: boolean): CrowdPrecisionPolicy[] => {
    const remainingPolicies = privacySettings.preciseToMutualCrowds.filter((policy) => policy.crowdId !== crowdId);

    if (!enabled) {
      return remainingPolicies;
    }

    return [
      ...remainingPolicies,
      {
        crowdId,
        precisionEnabled: true,
        mutualityRequired: true,
        minimumTrustLevel: 'MEMBER',
        createdAtMs: Date.now(),
        revokedAtMs: null,
      },
    ];
  };

  useEffect(() => {
    let active = true;

    getMyPrivacySettings()
      .then((settings) => {
        if (active) {
          setPrivacySettings(normalizePrivacySettings(settings));
          setPrivacyError(null);
        }
      })
      .catch((error) => {
        if (active) {
          setPrivacyError(error instanceof Error ? error.message : 'Failed to load Ghost Mode settings.');
        }
      })
      .finally(() => {
        if (active) {
          setPrivacyStatus('idle');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const persistPrivacySettings = async (nextSettings: PrivacySettings) => {
    setPrivacySettings(nextSettings);
    setPrivacyStatus('saving');
    setPrivacyError(null);

    try {
      const savedSettings = await saveMyPrivacySettings(nextSettings);
      setPrivacySettings(normalizePrivacySettings(savedSettings));
    } catch (error) {
      setPrivacyError(error instanceof Error ? error.message : 'Failed to save Ghost Mode settings.');
    } finally {
      setPrivacyStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <CruushIcon name="ghost" variant={privacySettings.ghostModeEnabled ? 'colored' : 'white'} className="h-7 w-7" />
          <div>
            <h2 className="text-xl">Ghost Mode</h2>
            <p className="text-xs text-muted-foreground">Location privacy settings</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-5">
          {privacyError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {privacyError}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CruushIcon name="ghost" variant={privacySettings.ghostModeEnabled ? 'colored' : 'white'} className="mt-1 h-5 w-5 opacity-80" />
              <div>
                <p>Ghost Mode</p>
                <p className="text-sm text-muted-foreground">Stay discoverable while public pins render as a nearby protected location.</p>
              </div>
            </div>
            <Switch
              aria-label="Toggle Ghost Mode"
              checked={privacySettings.ghostModeEnabled}
              disabled={privacyStatus === 'loading' || privacyStatus === 'saving'}
              onCheckedChange={(ghostModeEnabled) => {
                void persistPrivacySettings({
                  ...privacySettings,
                  baseMode: ghostModeEnabled ? 'GHOST' : 'PUBLIC_PRECISE',
                  ghostModeEnabled,
                });
              }}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p>Ghost radius</p>
                <p className="text-sm text-muted-foreground">{privacySettings.ghostRadiusLabel}</p>
              </div>
              <span className="text-xs uppercase tracking-[0.16em] text-white/48">
                {privacySettings.ghostModeEnabled ? 'Active' : 'Saved'}
              </span>
            </div>
            <Slider
              aria-label="Ghost radius"
              min={0}
              max={GHOST_RADIUS_OPTIONS.length - 1}
              step={1}
              value={[Math.max(0, GHOST_RADIUS_OPTIONS.findIndex((option) => option.meters === privacySettings.ghostRadiusMeters))]}
              disabled={privacyStatus === 'loading' || privacyStatus === 'saving'}
              onValueChange={([index]) => {
                const option = GHOST_RADIUS_OPTIONS[index] ?? GHOST_RADIUS_OPTIONS[3];
                void persistPrivacySettings({
                  ...privacySettings,
                  ghostRadiusMeters: option.meters,
                  ghostRadiusLabel: option.label,
                });
              }}
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              {GHOST_RADIUS_OPTIONS.map((option) => (
                <span key={option.label}>{option.label}</span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CruushIcon name="map" className="mt-1 h-5 w-5 opacity-65" />
              <div>
                <p>Precise location for mutual cruushes</p>
                <p className="text-sm text-muted-foreground">Off by default. When on, mutual cruushes can receive an exact live display token.</p>
              </div>
            </div>
            <Switch
              aria-label="Toggle precise location for mutual cruushes"
              checked={privacySettings.preciseToMutualCruushes}
              disabled={privacyStatus === 'loading' || privacyStatus === 'saving'}
              onCheckedChange={(enabled) => {
                void persistPrivacySettings({
                  ...privacySettings,
                  preciseToMutualCruushes: enabled,
                  preciseLocationVisibility: enabled ? 'mutual_cruushes' : 'none',
                });
              }}
            />
          </div>

          <div className="space-y-3">
            <div>
              <p>Precise location for mutual crowds</p>
              <p className="text-sm text-muted-foreground">Each crowd still requires mutual eligibility and can be revoked per person.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {CROWDS.map((crowd) => {
                const selected = privacySettings.preciseToMutualCrowds.some((policy) => policy.crowdId === crowd && policy.precisionEnabled);

                return (
                  <button
                    key={crowd}
                    type="button"
                    aria-pressed={selected}
                    className={[
                      'flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                      selected
                        ? 'border-white/15 text-white'
                        : 'border-white/10 bg-white/[0.035] text-white/72 hover:bg-white/[0.065]',
                    ].join(' ')}
                    disabled={privacyStatus === 'loading' || privacyStatus === 'saving'}
                    onClick={() => {
                      void persistPrivacySettings({
                        ...privacySettings,
                        preciseToMutualCrowds: upsertCrowdPolicy(crowd as CrowdPrecisionPolicy['crowdId'], !selected),
                      });
                    }}
                    style={selected ? { background: 'var(--cruush-gradient)' } : undefined}
                  >
                    <span>{crowd}</span>
                    <span className="text-xs">{selected ? 'On' : 'Off'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/privacy/audit')}
            className="w-full rounded-lg border border-white/10 p-4 text-left transition-colors hover:bg-accent"
          >
            <span className="flex items-center gap-3">
              <CruushIcon name="safety" className="h-5 w-5 opacity-65" />
              <span className="flex-1">
                <span className="block">Privacy Audit</span>
                <span className="block text-sm text-muted-foreground">Review and revoke exact-location access.</span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </span>
          </button>

          {privacyStatus === 'saving' ? (
            <p className="text-xs text-muted-foreground">Saving Ghost Mode settings...</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
