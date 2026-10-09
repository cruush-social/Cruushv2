import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getProfilePinServiceAreaAccess, MAP_SERVICE_AREA_ACCESS_CHANGED } from '../lib/mapServiceAreaAccess';

type MapServiceAreaContextValue = {
  outsideServiceArea: boolean;
  setOutsideServiceArea: (outside: boolean, preview?: boolean) => void;
  profilePinsAllowed: boolean;
};

const MapServiceAreaContext = createContext<MapServiceAreaContextValue | null>(null);

export function MapServiceAreaProvider({ children }: { children: ReactNode }) {
  const [outsideServiceArea, setOutside] = useState(false);
  const [resolved, setResolved] = useState(false);
  const revision = useRef(0);
  const previewOutside = useRef(false);
  const refreshRef = useRef<() => void>(() => undefined);
  const setOutsideServiceArea = useCallback((outside: boolean, preview = false) => {
    revision.current += 1;
    previewOutside.current = preview && outside;
    setOutside(outside);
    setResolved(false);
    // Discovery can deny immediately, but an allowance must also carry the
    // server's MHC expiry before profile pins become actionable.
    if (!outside) refreshRef.current();
  }, []);

  useEffect(() => {
    let active = true;
    let expiryTimer: number | undefined;
    const refresh = () => {
      window.clearTimeout(expiryTimer);
      if (previewOutside.current) return;
      const requestedRevision = ++revision.current;
      setResolved(false);
      void getProfilePinServiceAreaAccess().then(({ profilePinsAllowed, accessExpiresAtMs }) => {
        if (!active || requestedRevision !== revision.current) return;
        const remainingMs = accessExpiresAtMs === null ? null : accessExpiresAtMs - Date.now();
        const allowed = profilePinsAllowed === true && (remainingMs === null || remainingMs > 0);
        setOutside(!allowed);
        setResolved(true);
        if (allowed && remainingMs !== null) {
          expiryTimer = window.setTimeout(refresh, remainingMs);
        }
      }).catch(() => {
        // Unknown eligibility must never activate a profile pin on cold entry.
        if (active && requestedRevision === revision.current) setResolved(false);
      });
    };
    refreshRef.current = refresh;
    refresh();
    window.addEventListener(MAP_SERVICE_AREA_ACCESS_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.clearTimeout(expiryTimer);
      refreshRef.current = () => undefined;
      window.removeEventListener(MAP_SERVICE_AREA_ACCESS_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const value = useMemo(() => ({
    outsideServiceArea,
    setOutsideServiceArea,
    profilePinsAllowed: resolved && !outsideServiceArea,
  }), [outsideServiceArea, resolved, setOutsideServiceArea]);

  return <MapServiceAreaContext.Provider value={value}>{children}</MapServiceAreaContext.Provider>;
}

export function useMapServiceArea() {
  return useContext(MapServiceAreaContext) ?? {
    outsideServiceArea: false,
    setOutsideServiceArea: () => undefined,
    profilePinsAllowed: true,
  };
}
