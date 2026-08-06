import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';
import { CruushIcon } from './CruushIconImage';
import { resolveMediaUrl } from '../lib/apiClient';
import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import { getPrivacyAudit, revokePrivacyAccess, type PrivacyAuditAccess } from '../lib/privacyApi';

function formatAuditTime(value: number) {
  if (!value) {
    return 'Unknown';
  }

  return new Date(value).toLocaleString();
}

export default function PrivacyAudit() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PrivacyAuditAccess[]>([]);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving'>('loading');
  const [error, setError] = useState<string | null>(null);
  const dlModeActive = useDlMode();

  useEffect(() => {
    let active = true;

    getPrivacyAudit()
      .then((audit) => {
        if (active) {
          setItems(audit.exact_location_access);
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
              <p>Exact location access</p>
              <p className="text-sm text-muted-foreground">People listed here can receive precise live display tokens while the grant remains valid.</p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {status === 'loading' ? (
          <div className="rounded-lg border border-white/10 bg-card p-4 text-sm text-muted-foreground">
            Loading access list...
          </div>
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
