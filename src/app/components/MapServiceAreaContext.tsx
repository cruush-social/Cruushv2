import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type MapServiceAreaContextValue = {
  outsideServiceArea: boolean;
  setOutsideServiceArea: (outside: boolean) => void;
};

const MapServiceAreaContext = createContext<MapServiceAreaContextValue | null>(null);

export function MapServiceAreaProvider({ children }: { children: ReactNode }) {
  const [outsideServiceArea, setOutsideServiceArea] = useState(false);
  const value = useMemo(() => ({ outsideServiceArea, setOutsideServiceArea }), [outsideServiceArea]);

  return <MapServiceAreaContext.Provider value={value}>{children}</MapServiceAreaContext.Provider>;
}

export function useMapServiceArea() {
  return useContext(MapServiceAreaContext) ?? {
    outsideServiceArea: false,
    setOutsideServiceArea: () => undefined,
  };
}
