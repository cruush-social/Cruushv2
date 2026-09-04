import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';
import { CruushIcon } from './CruushIconImage';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import { resolveMediaUrl } from '../lib/apiClient';
import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import { getCruushMatchSettings, type CruushMatchSettings } from '../lib/cruushSettingsApi';
import {
  DEFAULT_PRIVACY_SETTINGS,
  getMyPrivacySettings,
  getPrivacyAudit,
  revokePrivacyAccess,
  type PrivacyAuditAccess,
  type PrivacySettings,
} from '../lib/privacyApi';

function formatAuditTime(value: number) {
  if (!value) {
    return 'Unknown';
  }

  return new Date(value).toLocaleString();
}

export default function PrivacyAudit() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PrivacyAuditAccess[]>([]);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [messageVisibility, setMessageVisibility] = useState<CruushMatchSettings['messageVisibility']>('mutual_cruushes');
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving'>('loading');
  const [error, setError] = useState<string | null>(null);
  const dlModeActive = useDlMode();

  useEffect(() => {
    let active = true;

    Promise.all([
      getPrivacyAudit(),
      getMyPrivacySettings().catch(() => DEFAULT_PRIVACY_SETTINGS),
      getCruushMatchSettings().catch(() => null),
    ])
      .then(([audit, loadedPrivacySettings, loadedMatchSettings]) => {
        if (active) {
          setItems(audit.exact_location_access);
          setPrivacySettings(loadedPrivacySettings);
          if (loadedMatchSettings) {
            setMessageVisibility(loadedMatchSettings.messageVisibility);
          }
          setError(null);
        }
      })
      .catch((auditError) => {
        if (active) {
          setError(auditError instanceof Error ? auditError.message : 'Failed to load Privacy Audit.');
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

  const revoke = async (item: PrivacyAuditAccess) => {
    setStatus('saving');
    setError(null);

    try {
      await revokePrivacyAccess(item.revoke_action_token);
      setItems((currentItems) => currentItems.filter((currentItem) => currentItem.revoke_action_token !== item.revoke_action_token));
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Failed to revoke access.');
    } finally {
      setStatus('idle');
    }
  };

  const visibleWhere = privacySettings.baseMode === 'STEALTH'
    ? 'Hidden from discovery while Dark Room is on'
    : privacySettings.ghostModeEnabled || privacySettings.baseMode === 'GHOST'
      ? `Visible, with a decoy pin moving inside ${privacySettings.ghostRadiusLabel}`
      : 'Live map location';
  const whoCanMessage = messageVisibility === 'public'
    ? 'Public'
    : messageVisibility === 'mutual_crowds'
      ? 'Crowd'
      : 'Mutuals';
  const precisePrivileges = [
    privacySettings.preciseToMutualCruushes ? 'Mutuals can receive precise location.' : 'Mutuals do not get precise location by default.',
    ...privacySettings.preciseToMutualCrowds
      .filter((policy) => policy.precisionEnabled && !policy.revokedAtMs)
      .map((policy) => `${policy.crowdId} crowd precise access is enabled.`),
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl">Privacy Audit</h2>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 p-6">
        <div className="rounded-lg border border-white/10 bg-card p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
            <div>
              <p>Privacy summary</p>
              <p className="text-sm text-muted-foreground">Where you are visible, who can message you, and the precise privileges you gave out.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-lg border border-white/10 bg-card p-4">
            <p className="text-sm font-semibold text-white">Where you are visible</p>
            <p className="mt-2 text-sm text-muted-foreground">{visibleWhere}</p>
          </section>
          <section className="rounded-lg border border-white/10 bg-card p-4">
            <p className="text-sm font-semibold text-white">Who can message you</p>
            <p className="mt-2 text-sm text-muted-foreground">{whoCanMessage}</p>
          </section>
          <section className="rounded-lg border border-white/10 bg-card p-4 sm:col-span-2">
            <p className="text-sm font-semibold text-white">Privileges you gave out</p>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {precisePrivileges.map((privilege) => <p key={privilege}>{privilege}</p>)}
            </div>
          </section>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {status === 'loading' ? (
          <LoadingCardSkeletons label="Loading access list" />
        ) : null}

        {status !== 'loading' && items.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-card p-6 text-center">
            <CruushIcon name="safety" className="mx-auto h-8 w-8 opacity-70" />
            <p className="mt-3">No exact-location grants</p>
            <p className="mt-1 text-sm text-muted-foreground">Mutuals without an exact grant will see your public precise or Ghost display policy.</p>
          </div>
        ) : null}

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.revoke_action_token} className="rounded-lg border border-white/10 bg-card p-4">
              <div className="flex items-start gap-3">
                {item.viewer.photo && !shouldMaskPhoto(dlModeActive, item.viewer.photoExplicit) ? (
                  <img alt="" className="h-12 w-12 rounded-full object-cover" src={resolveMediaUrl(item.viewer.photo)} />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--cruush-gradient)' }}>
                    <CruushIcon name="profile" className="h-6 w-6" variant="white" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p>{item.viewer.name}</p>
                  <p className="text-sm text-muted-foreground">{item.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Granted {formatAuditTime(item.granted_at_ms)}</p>
                </div>
                <Button
                  variant="outline"
                  disabled={status === 'saving'}
                  onClick={() => {
                    void revoke(item);
                  }}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
