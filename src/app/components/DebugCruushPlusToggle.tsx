import { useEffect, useState } from 'react';
import { CruushIcon } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import { DEBUG_CRUUSH_PLUS_EVENT, getDebugCruushPlus, setDebugCruushPlus } from '../lib/debugApi';
import type { CruushEntitlement } from '../lib/cruushApi';

// DEBUG ONLY: delete this component, its App import, and server/src/routes/dev.ts when this test control is no longer needed.
export default function DebugCruushPlusToggle() {
  const debugEnabled = import.meta.env.DEV;
  const [entitlement, setEntitlement] = useState<CruushEntitlement | null>(null);
  const [loading, setLoading] = useState(debugEnabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!debugEnabled) {
      return undefined;
    }

    let active = true;

    getDebugCruushPlus()
      .then((nextEntitlement) => {
        if (active) {
          setEntitlement(nextEntitlement);
        }
      })
      .catch((error) => {
        console.error('Debug cruush+ toggle unavailable:', error);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [debugEnabled]);

  if (!debugEnabled || loading || !entitlement) {
    return null;
  }

  const enabled = entitlement.cruushPlus;

  const handleToggle = async () => {
    setSaving(true);
    try {
      const nextEntitlement = await setDebugCruushPlus(!enabled);
      setEntitlement(nextEntitlement);
      window.dispatchEvent(new CustomEvent(DEBUG_CRUUSH_PLUS_EVENT, {
        detail: nextEntitlement,
      }));
    } catch (error) {
      console.error('Error toggling debug cruush+ entitlement:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      aria-label={`Debug cruush+ ${enabled ? 'enabled' : 'disabled'}`}
      aria-pressed={enabled}
      disabled={saving}
      onClick={handleToggle}
      className={[
        'fixed left-1/2 top-[4.5rem] z-[60] hidden h-9 -translate-x-1/2 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold uppercase tracking-[0.12em] shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition sm:inline-flex',
        enabled
          ? 'border-primary/50 bg-primary/20 text-primary'
          : 'border-white/15 bg-black/55 text-white/70',
        saving ? 'opacity-60' : 'hover:bg-primary/24 hover:text-primary',
      ].join(' ')}
    >
      <CruushIcon name="lucky" className="h-3.5 w-3.5" variant={enabled ? 'colored' : 'white'} />
      DEV <CruushPlusWord /> {enabled ? 'ON' : 'OFF'}
    </button>
  );
}
