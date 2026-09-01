import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { CruushIcon } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import { CRUUSH_PLUS_CHANGED_EVENT, getMyBillingStatus } from '../lib/billingApi';
import { DEBUG_CRUUSH_PLUS_EVENT } from '../lib/debugApi';
import {
  CROWDS,
} from '../lib/profileOptions';
import {
  DEFAULT_GHOST_PULSE_SETTINGS,
  DEFAULT_MAP_PRESENCE_SETTINGS,
  DEFAULT_PRIVACY_SETTINGS,
  GHOST_RADIUS_OPTIONS,
  MAP_PRESENCE_OPTIONS,
  getMyGhostPulseSettings,
  getMyMapPresenceSettings,
  getMyPrivacySettings,
  saveMyGhostPulseSettings,
  saveMyMapPresenceSettings,
  saveMyPrivacySettings,
  type CrowdPrecisionPolicy,
  type MapPresenceSettings,
  type PrivacySettings,
} from '../lib/privacyApi';

function formatCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function GhostModeSettings() {
  const navigate = useNavigate();
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [privacyStatus, setPrivacyStatus] = useState<'idle' | 'loading' | 'saving'>('loading');
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [mapPresence, setMapPresence] = useState<MapPresenceSettings>(DEFAULT_MAP_PRESENCE_SETTINGS);
  const [mapPresenceSaving, setMapPresenceSaving] = useState(false);
  const [hasCruushPlus, setHasCruushPlus] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const refreshedRotationDeadlineRef = useRef<number | null>(null);
  const [ghostPulseEnabled, setGhostPulseEnabled] = useState(DEFAULT_GHOST_PULSE_SETTINGS.enabled);
  const [ghostPulseSaving, setGhostPulseSaving] = useState(false);

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
    ghostRotationExpiresAtMs: settings.ghostRotationExpiresAtMs ?? null,
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

    const loadBillingStatus = () => {
      void getMyBillingStatus()
        .then((status) => {
          if (active) {
            setHasCruushPlus(status.cruushPlus === true);
          }
        })
        .catch(() => {
          if (active) {
            setHasCruushPlus(false);
          }
        });
    };

    const loadPrivacySettings = () => {
      void getMyPrivacySettings()
        .then((settings) => {
          if (active) {
            setPrivacySettings(normalizePrivacySettings(settings));
            setPrivacyError(null);
            setNowMs(Date.now());
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
    };

    const loadEntitlementState = () => {
      loadBillingStatus();
      loadPrivacySettings();
    };

    loadPrivacySettings();

    getMyMapPresenceSettings()
      .then((settings) => {
        if (active) {
          setMapPresence({ ...DEFAULT_MAP_PRESENCE_SETTINGS, ...settings });
        }
      })
      .catch(() => {
        if (active) {
          setMapPresence(DEFAULT_MAP_PRESENCE_SETTINGS);
        }
      });

    loadBillingStatus();
    window.addEventListener(DEBUG_CRUUSH_PLUS_EVENT, loadEntitlementState);
    window.addEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadEntitlementState);
    getMyGhostPulseSettings()
      .then((settings) => {
        if (active) {
          setGhostPulseEnabled(settings.enabled !== false);
        }
      })
      .catch(() => {
        if (active) {
          setGhostPulseEnabled(DEFAULT_GHOST_PULSE_SETTINGS.enabled);
        }
      });

    return () => {
      active = false;
      window.removeEventListener(DEBUG_CRUUSH_PLUS_EVENT, loadEntitlementState);
      window.removeEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadEntitlementState);
    };
  }, []);

  useEffect(() => {
    if (privacySettings.baseMode !== 'GHOST' || !privacySettings.ghostRotationExpiresAtMs) {
      return undefined;
    }

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [privacySettings.baseMode, privacySettings.ghostRotationExpiresAtMs]);

  useEffect(() => {
    if (
      privacySettings.baseMode !== 'GHOST' ||
      !privacySettings.ghostRotationExpiresAtMs ||
      nowMs < privacySettings.ghostRotationExpiresAtMs
    ) {
      return;
    }

    if (refreshedRotationDeadlineRef.current === privacySettings.ghostRotationExpiresAtMs) {
      return;
    }

    refreshedRotationDeadlineRef.current = privacySettings.ghostRotationExpiresAtMs;

    void getMyPrivacySettings()
      .then((settings) => {
        setPrivacySettings(normalizePrivacySettings(settings));
        setPrivacyError(null);
        setNowMs(Date.now());
      })
      .catch(() => undefined);
  }, [nowMs, privacySettings.baseMode, privacySettings.ghostRotationExpiresAtMs]);
  const persistGhostPulse = async (enabled: boolean) => {
    const previousEnabled = ghostPulseEnabled;

    setGhostPulseEnabled(enabled);
    setGhostPulseSaving(true);

    try {
      const saved = await saveMyGhostPulseSettings(enabled);
      setGhostPulseEnabled(saved.enabled !== false);
      setPrivacyError(null);
    } catch (error) {
      setGhostPulseEnabled(previousEnabled);
      setPrivacyError(error instanceof Error ? error.message : 'Failed to save the pin countdown setting.');
    } finally {
      setGhostPulseSaving(false);
    }
  };

  const persistMapPresenceDays = async (days: number) => {
    const previousPresence = mapPresence;

    setMapPresence({ ...mapPresence, days });
    setMapPresenceSaving(true);

    try {
      const savedPresence = await saveMyMapPresenceSettings(days);
      setMapPresence({ ...DEFAULT_MAP_PRESENCE_SETTINGS, ...savedPresence });
      setPrivacyError(null);
    } catch (error) {
      setMapPresence(previousPresence);
      setPrivacyError(error instanceof Error ? error.message : 'Failed to save map presence duration.');
    } finally {
      setMapPresenceSaving(false);
    }
  };

  const persistPrivacySettings = async (nextSettings: PrivacySettings) => {
    const previousPrivacySettings = privacySettings;

    setPrivacySettings(nextSettings);
    setPrivacyStatus('saving');
    setPrivacyError(null);

    try {
      const savedSettings = await saveMyPrivacySettings(nextSettings);
      refreshedRotationDeadlineRef.current = null;
      setPrivacySettings(normalizePrivacySettings(savedSettings));
      setNowMs(Date.now());
    } catch (error) {
      setPrivacySettings(previousPrivacySettings);
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
          <CruushIcon
            name="ghost"
            variant={privacySettings.baseMode === 'STEALTH' ? 'stealth' : privacySettings.ghostModeEnabled ? 'colored' : 'white'}
            className="h-7 w-7"
          />
          <div>
            <h2 className="text-xl">Ghost Mode</h2>
            <p className="text-xs text-muted-foreground">Shifting public map location</p>
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
                <p className="text-sm text-muted-foreground">Other people see a shifting location inside your selected radius. You still see your own current map position.</p>
                {privacySettings.baseMode === 'GHOST' && privacySettings.ghostRotationExpiresAtMs ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Location rotates in {formatCountdown(privacySettings.ghostRotationExpiresAtMs - nowMs)}
                  </p>
                ) : null}
              </div>
            </div>
            <Switch
              aria-label="Toggle Ghost Mode"
              checked={privacySettings.ghostModeEnabled}
              data-tutorial-target="ghost"
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

          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <CruushIcon name="ghost" variant={privacySettings.baseMode === 'STEALTH' ? 'stealth' : 'white'} className="mt-1 h-5 w-5 opacity-80" />
                <div>
                  <p>Dark Room</p>
                  <p className="text-sm text-muted-foreground">Browse the map without appearing on it.</p>
                </div>
              </div>
              {hasCruushPlus ? (
                <Switch
                  aria-label="Toggle Dark Room"
                  checked={privacySettings.baseMode === 'STEALTH'}
                  disabled={privacyStatus === 'loading' || privacyStatus === 'saving'}
                  onCheckedChange={(enabled) => {
                    void persistPrivacySettings({
                      ...privacySettings,
                      baseMode: enabled ? 'STEALTH' : 'PUBLIC_PRECISE',
                      ghostModeEnabled: false,
                    });
                  }}
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  aria-label="Unlock Dark Room with cruush+"
                  onClick={() => navigate('/rewards')}
                >
                  <CruushPlusWord />
                </Button>
              )}
            </div>
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
            <p className="text-sm text-muted-foreground">Larger radius gives you more cover; smaller radius keeps your public pin closer to where you are.</p>
          </div>

          <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.025] p-4" data-testid="ghost-pulse-setting">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p>Countdown animation</p>
                <p className="text-sm text-muted-foreground">
                  {ghostPulseEnabled ? 'Others can see your last minute' : 'Your pin moves without warning'}
                </p>
              </div>
              <Switch
                aria-label="Show a countdown before your pin moves"
                checked={ghostPulseEnabled}
                disabled={privacyStatus === 'loading' || ghostPulseSaving}
                onCheckedChange={(checked) => {
                  void persistGhostPulse(checked === true);
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Your pin beats like a heartbeat through its last minute before moving, so people know to say something before you go.
            </p>
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.025] p-4 text-left transition hover:bg-white/[0.05]"
            data-testid="map-presence-link"
            onClick={() => navigate('/privacy/map-presence')}
          >
            <div>
              <p>Map presence</p>
              <p className="text-sm text-muted-foreground">
                How long your heart pin keeps showing after your last check-in. Set it on the map presence page.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/60" />
          </button>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CruushIcon name="map" className="mt-1 h-5 w-5 opacity-65" />
              <div>
                <p>Precise location for mutuals</p>
                <p className="text-sm text-muted-foreground">Off by default. When on, mutuals can see your precise live location instead of your Ghost location.</p>
              </div>
            </div>
            <Switch
              aria-label="Toggle precise location for mutuals"
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
              <p className="text-sm text-muted-foreground">Selected mutual crowds can see your precise location. Everyone else still sees your public or Ghost location.</p>
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
