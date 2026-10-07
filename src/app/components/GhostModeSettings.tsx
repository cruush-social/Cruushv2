import { ghostSettingsBodyClassName, ghostSettingsCardClassName, ghostSettingsChoiceClassName, ghostSettingsSelectedChoiceClassName, ghostSettingsIdleChoiceClassName } from './ghostSettingsStyles';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { CruushIcon } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import DarkRoomMark from './DarkRoomMark';
import BugButtonSlot from './BugButtonSlot';
import { CRUUSH_PLUS_CHANGED_EVENT, getMyBillingStatus } from '../lib/billingApi';
import { DEBUG_CRUUSH_PLUS_EVENT } from '../lib/debugApi';
import {
  CROWDS,
} from '../lib/profileOptions';
import {
  DEFAULT_GHOST_PULSE_SETTINGS,
  DEFAULT_PRIVACY_SETTINGS,
  GHOST_RADIUS_OPTIONS,
  GHOST_ROTATION_OPTIONS,
  getMyGhostPulseSettings,
  getMyPrivacySettings,
  saveMyGhostPulseSettings,
  saveMyPrivacySettings,
  type CrowdPrecisionPolicy,
  type PrivacySettings,
} from '../lib/privacyApi';
import { buildCruushPlusStorePath } from '../lib/cruushPlusConversion';
import { trackCruushPlusConversion } from '../lib/posthog';

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
  const [privacyJustSaved, setPrivacyJustSaved] = useState(false);
  const [publicPreciseConfirmationOpen, setPublicPreciseConfirmationOpen] = useState(false);
  const privacySavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const privacySavePendingRef = useRef(false);
  const [hasCruushPlus, setHasCruushPlus] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const refreshedRotationDeadlineRef = useRef<number | null>(null);
  const [ghostPulseEnabled, setGhostPulseEnabled] = useState(DEFAULT_GHOST_PULSE_SETTINGS.enabled);
  const [ghostPulseSaving, setGhostPulseSaving] = useState(false);

  useEffect(() => () => {
    if (privacySavedTimerRef.current) clearTimeout(privacySavedTimerRef.current);
  }, []);

  const normalizePrivacySettings = (settings: Partial<PrivacySettings>): PrivacySettings => ({
    ...DEFAULT_PRIVACY_SETTINGS,
    ...settings,
    baseMode: settings.baseMode ?? (settings.ghostModeEnabled ? 'GHOST' : 'PUBLIC_PRECISE'),
    ghostModeEnabled: settings.ghostModeEnabled ?? settings.baseMode === 'GHOST',
    ghostRadiusMeters: settings.ghostRadiusMeters ?? DEFAULT_PRIVACY_SETTINGS.ghostRadiusMeters,
    ghostRadiusLabel: settings.ghostRadiusLabel ?? DEFAULT_PRIVACY_SETTINGS.ghostRadiusLabel,
    ghostRotationMinutes: settings.ghostRotationMinutes ?? 15,
    preciseToMutualCruushes: settings.preciseToMutualCruushes ?? settings.preciseLocationVisibility === 'mutual_cruushes',
    preciseLocationVisibility: settings.preciseLocationVisibility ?? (settings.preciseToMutualCruushes ? 'mutual_cruushes' : 'none'),
    preciseToMutualCrowds: settings.preciseToMutualCrowds ?? [],
    darkRoomDistanceLabel: settings.darkRoomDistanceLabel === true,
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

  const persistPrivacySettings = async (nextSettings: PrivacySettings) => {
    if (privacySavePendingRef.current) return;
    privacySavePendingRef.current = true;
    const previousPrivacySettings = privacySettings;

    setPrivacySettings(nextSettings);
    setPrivacyStatus('saving');
    setPrivacyJustSaved(false);
    if (privacySavedTimerRef.current) clearTimeout(privacySavedTimerRef.current);
    setPrivacyError(null);

    try {
      const savedSettings = await saveMyPrivacySettings(nextSettings);
      refreshedRotationDeadlineRef.current = null;
      setPrivacySettings(normalizePrivacySettings(savedSettings));
      setNowMs(Date.now());
      setPrivacyJustSaved(true);
      privacySavedTimerRef.current = setTimeout(() => {
        setPrivacyJustSaved(false);
        privacySavedTimerRef.current = null;
      }, 1_800);
    } catch (error) {
      setPrivacySettings(previousPrivacySettings);
      setPrivacyJustSaved(false);
      setPrivacyError(error instanceof Error ? error.message : 'Failed to save Ghost Mode settings.');
    } finally {
      privacySavePendingRef.current = false;
      setPrivacyStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-xl">Ghost Mode</h2>
        </div>
      
        <BugButtonSlot testId="ghost-mode-settings-bug-button-slot" />
      </header>

      <div className={ghostSettingsBodyClassName}>
        <div className={ghostSettingsCardClassName}>
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
                <p className="text-sm text-muted-foreground">Your real pin is hidden. Only a decoy pin is visible, hopping inside the radius you choose while you still see your real position.</p>
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
                <DarkRoomMark active={privacySettings.baseMode === 'STEALTH'} className="mt-1 h-5 w-5 text-white opacity-80" />
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
                  onClick={() => {
                    trackCruushPlusConversion('cruush_plus_upgrade_clicked', {
                      surface: 'dark_room',
                      benefit: 'dark_room',
                    });
                    navigate(buildCruushPlusStorePath('dark_room', 'dark_room'));
                  }}
                >
                  <CruushPlusWord />
                </Button>
              )}
            </div>
            {privacySettings.baseMode === 'STEALTH' ? (
              <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
                <p>Show Dark Room instead of a distance label across the app</p>
                <Switch
                  aria-label="Show Dark Room instead of a distance label across the app"
                  checked={privacySettings.darkRoomDistanceLabel}
                  disabled={privacyStatus === 'loading' || privacyStatus === 'saving'}
                  onCheckedChange={(enabled) => {
                    void persistPrivacySettings({
                      ...privacySettings,
                      darkRoomDistanceLabel: enabled === true,
                    });
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p>Ghost radius</p>
                <p className="text-sm text-muted-foreground">{privacySettings.ghostRadiusLabel}</p>
              </div>
              <span aria-live="polite" className="min-w-16 text-right text-xs uppercase tracking-[0.16em] text-white/48">
                {privacyStatus === 'saving' ? 'Saving…' : privacyJustSaved ? 'Saved' : null}
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
            <p className="text-sm text-muted-foreground">This is the area your visible decoy pin moves around in. A larger radius puts the decoy further from your hidden real pin.</p>
          </div>

          <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.025] p-4">
            <p id="ghost-rotation-label">Rotation interval</p>
            <Select
              value={String(privacySettings.ghostRotationMinutes ?? 15)}
              disabled={privacyStatus === 'loading' || privacyStatus === 'saving'}
              onValueChange={(value) => {
                void persistPrivacySettings({ ...privacySettings, ghostRotationMinutes: Number(value) });
              }}
            >
              <SelectTrigger aria-labelledby="ghost-rotation-label" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GHOST_ROTATION_OPTIONS.map((option) => (
                  <SelectItem key={option.minutes} value={String(option.minutes)}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                How long your heart pin keeps showing after your last check-in.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/60" />
          </button>

          <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center gap-3">
              <CruushIcon name="map" className="h-5 w-5 opacity-65" />
              <p>Who can see my precise location?</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                type="button"
                aria-label="Public"
                aria-pressed={privacySettings.baseMode === 'PUBLIC_PRECISE'}
                className={[
                  ghostSettingsChoiceClassName,
                  privacySettings.baseMode === 'PUBLIC_PRECISE'
                    ? ghostSettingsSelectedChoiceClassName
                    : ghostSettingsIdleChoiceClassName,
                ].join(' ')}
                disabled={privacyStatus === 'loading' || privacyStatus === 'saving'}
                onClick={() => {
                  if (privacySettings.baseMode === 'GHOST') {
                    setPublicPreciseConfirmationOpen(true);
                    return;
                  }

                  if (privacySettings.baseMode !== 'PUBLIC_PRECISE') {
                    void persistPrivacySettings({
                      ...privacySettings,
                      baseMode: 'PUBLIC_PRECISE',
                      ghostModeEnabled: false,
                    });
                  }
                }}
                style={privacySettings.baseMode === 'PUBLIC_PRECISE' ? { background: 'var(--cruush-gradient)' } : undefined}
              >
                <span>Public</span>
                <span className="text-xs">{privacySettings.baseMode === 'PUBLIC_PRECISE' ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                aria-label="Cruushes"
                aria-pressed={privacySettings.preciseToMutualCruushes}
                className={[
                  ghostSettingsChoiceClassName,
                  privacySettings.preciseToMutualCruushes
                    ? ghostSettingsSelectedChoiceClassName
                    : ghostSettingsIdleChoiceClassName,
                ].join(' ')}
                disabled={privacyStatus === 'loading' || privacyStatus === 'saving'}
                onClick={() => {
                  const enabled = !privacySettings.preciseToMutualCruushes;
                  void persistPrivacySettings({
                    ...privacySettings,
                    preciseToMutualCruushes: enabled,
                    preciseLocationVisibility: enabled ? 'mutual_cruushes' : 'none',
                  });
                }}
                style={privacySettings.preciseToMutualCruushes ? { background: 'var(--cruush-gradient)' } : undefined}
              >
                <span>Cruushes</span>
                <span className="text-xs">{privacySettings.preciseToMutualCruushes ? 'On' : 'Off'}</span>
              </button>

              {CROWDS.map((crowd) => {
                const selected = privacySettings.preciseToMutualCrowds.some((policy) => policy.crowdId === crowd && policy.precisionEnabled);

                return (
                  <button
                    key={crowd}
                    type="button"
                    aria-pressed={selected}
                    className={[
                      ghostSettingsChoiceClassName,
                      selected
                        ? ghostSettingsSelectedChoiceClassName
                        : ghostSettingsIdleChoiceClassName,
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

      <AlertDialog open={publicPreciseConfirmationOpen} onOpenChange={setPublicPreciseConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off Ghost Mode?</AlertDialogTitle>
            <AlertDialogDescription>Public means your precise location appears on the public map.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Ghost Mode</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void persistPrivacySettings({
                  ...privacySettings,
                  baseMode: 'PUBLIC_PRECISE',
                  ghostModeEnabled: false,
                });
              }}
            >
              Turn off Ghost Mode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
