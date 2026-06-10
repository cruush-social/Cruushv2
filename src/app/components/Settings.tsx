import { useNavigate } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, HelpCircle, LogOut, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { CruushIcon, type CruushIconName } from './CruushIconImage';
import { DEFAULT_PRIVACY_SETTINGS, GHOST_RADIUS_OPTIONS, getMyPrivacySettings, saveMyPrivacySettings, type CrowdPrecisionPolicy, type PrivacySettings } from '../lib/privacyApi';
import { sendVerificationEmail, signOut } from '../lib/authApi';
import { CROWDS } from '../lib/profileOptions';
import {
  clearCurrentUser,
  getStoredCurrentUser,
  getVerificationPreviewUrl,
  setVerificationPreviewUrl,
} from '../lib/sessionUser';

export default function Settings() {
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [privacyStatus, setPrivacyStatus] = useState<'idle' | 'loading' | 'saving'>('loading');
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const storedUser = useMemo(() => getStoredCurrentUser(), []);
  const [previewUrl, setPreviewUrlState] = useState(() => getVerificationPreviewUrl());
  const isEmailVerified = Boolean(storedUser?.email_verified_at);
  const displayName = storedUser?.display_name ?? storedUser?.name ?? 'Cruush user';
  const age = storedUser?.age ?? null;

  const settingsSections = [
    {
      title: 'Account',
      items: [
        { iconName: 'profile' as const, label: 'Edit Profile', action: () => navigate('/profile/edit') },
        { iconName: 'notifications' as const, label: 'Notifications', action: () => {} },
        { iconName: 'safety' as const, label: 'Privacy & Safety', action: () => navigate('/safety') },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: HelpCircle, label: 'Help & Support', action: () => {} },
      ],
    },
  ];

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
          setPrivacyError(error instanceof Error ? error.message : 'Failed to load privacy settings.');
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
      setPrivacyError(error instanceof Error ? error.message : 'Failed to save privacy settings.');
    } finally {
      setPrivacyStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Settings</h2>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div className="flex items-center gap-4 p-6 bg-card rounded-2xl border border-border">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
            style={{
              background: 'var(--cruush-gradient)',
            }}
          >
            A
          </div>
          <div className="flex-1">
            <h3 className="text-xl">{displayName}</h3>
            <p className="text-sm text-muted-foreground">{age ? `${age}` : 'Profile in progress'}</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/profile/edit')}>
            Edit
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm text-muted-foreground px-2">Email</h3>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <div className="flex items-start gap-3">
              {isEmailVerified ? (
                <CruushIcon name="notifications" className="mt-0.5 h-5 w-5" variant="colored" />
              ) : (
                <CruushIcon name="notifications" className="mt-0.5 h-5 w-5 opacity-75" />
              )}
              <div className="flex-1 space-y-1">
                <p>{isEmailVerified ? 'Email verified' : 'Email verification pending'}</p>
                <p className="text-sm text-muted-foreground">
                  {isEmailVerified
                    ? 'Your account is verified.'
                    : 'We send verification after onboarding. You can resend the link from here.'}
                </p>
              </div>
            </div>

            {verificationError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {verificationError}
              </div>
            ) : null}

            {verificationNotice ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                {verificationNotice}
              </div>
            ) : null}

            {!isEmailVerified ? (
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={isResendingVerification}
                  onClick={async () => {
                    setVerificationError(null);
                    setVerificationNotice(null);
                    setIsResendingVerification(true);

                    try {
                      const delivery = await sendVerificationEmail();
                      setVerificationPreviewUrl(delivery.previewUrl);
                      setPreviewUrlState(delivery.previewUrl);
                      setVerificationNotice(
                        delivery.alreadyVerified
                          ? 'This account is already verified.'
                          : 'Verification email sent.',
                      );
                    } catch (error) {
                      setVerificationError(
                        error instanceof Error ? error.message : 'Failed to send verification email.',
                      );
                    } finally {
                      setIsResendingVerification(false);
                    }
                  }}
                >
                  {isResendingVerification ? 'Sending...' : 'Resend email'}
                </Button>

                {previewUrl ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      window.location.href = previewUrl;
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open dev link
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {settingsSections.map((section) => (
          <div key={section.title} className="space-y-2">
            <h3 className="text-sm text-muted-foreground px-2">{section.title}</h3>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {section.items.map((item, index) => {
                const Icon = 'icon' in item ? item.icon : null;
                return (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className={`w-full p-4 flex items-center gap-3 hover:bg-accent transition-colors ${
                      index !== section.items.length - 1 ? 'border-b border-border' : ''
                    }`}
                  >
                    {'iconName' in item ? (
                      <CruushIcon name={item.iconName as CruushIconName} className="h-5 w-5 opacity-65" />
                    ) : Icon ? (
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    ) : null}
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <h3 className="text-sm text-muted-foreground px-2">Privacy & Location</h3>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            {privacyError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {privacyError}
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <CruushIcon name="visibility" className="mt-1 h-5 w-5 opacity-65" />
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
            <div className="flex items-center justify-between">
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
              <p className="text-xs text-muted-foreground">Saving privacy settings...</p>
            ) : null}
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
          disabled={isSigningOut}
          onClick={async () => {
            setIsSigningOut(true);
            try {
              await signOut();
            } finally {
              clearCurrentUser();
              window.location.href = '/';
            }
          }}
        >
          <LogOut className="w-4 h-4 mr-2" />
          {isSigningOut ? 'Signing Out...' : 'Sign Out'}
        </Button>

        <div className="text-center space-y-2 pt-8">
          <p
            className="cruush-logo-text text-2xl"
          >
            cruush
          </p>
          <p className="text-xs text-muted-foreground">Version 1.0.0</p>
          <div className="flex justify-center gap-4 text-xs text-muted-foreground">
            <button className="hover:text-foreground">Terms</button>
            <button className="hover:text-foreground">Privacy</button>
            <button className="hover:text-foreground">Support</button>
          </div>
        </div>
      </div>
    </div>
  );
}
