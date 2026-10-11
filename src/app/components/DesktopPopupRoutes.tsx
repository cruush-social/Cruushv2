import { cloneElement, Suspense, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Route, Routes, useLocation, useNavigate, type Location } from 'react-router';
import { addDesktopPageLayoutChangedListener, getDesktopPageLayout, useCanChoosePopupLayout } from '../lib/desktopPageLayoutPreferences';
import { PopupRouteContext } from '../lib/popupRouteContext';
import DesktopDockPanel from './DesktopDockPanel';
import LoadingCardSkeletons from './LoadingCardSkeletons';

type MapProps = { routePopupActive?: boolean; routePopupSlot?: 'left' | 'right'; onReturnToMap?: () => void };

/** Keep the map mounted while ordinary app routes use the existing desktop dock. */
export default function DesktopPopupRoutes({ children, mapElement }: { children: ReactNode; mapElement: ReactElement<MapProps> }) {
  const location = useLocation();
  const navigate = useNavigate();
  const canChoose = useCanChoosePopupLayout();
  const [layout, setLayout] = useState(getDesktopPageLayout);
  useEffect(() => addDesktopPageLayoutChangedListener(setLayout), []);
  const enabled = canChoose && layout === 'popups';
  const onMap = location.pathname === '/map';
  const mapLocation = useRef<Location>({ pathname: '/map', search: '', hash: '', state: null, key: 'popup-map' });
  if (onMap) mapLocation.current = location;
  const close = useCallback(() => navigate(`${mapLocation.current.pathname}${mapLocation.current.search}`, { state: null }), [navigate]);
  // The map replay is itself a map, not a page to put inside another map.
  const mapReplay = location.pathname === '/settings/outside-service-area-test';
  if (!enabled || mapReplay) return <Routes>{children}</Routes>;
  const slot = location.pathname.startsWith('/profile') ? 'left' : 'right';
  return (
    <>
      <Routes location={mapLocation.current}>
        <Route path="*" element={cloneElement(mapElement, { routePopupActive: !onMap, routePopupSlot: onMap ? undefined : slot, onReturnToMap: close })} />
      </Routes>
      {!onMap ? (
        <DesktopDockPanel key={slot} slot={slot} ariaLabel="Side panel">
          <PopupRouteContext.Provider value={{ onClose: close }}>
            <div key={location.pathname} className="profile-card-scroll h-full overflow-y-auto" data-testid="popup-route-content">
              <Suspense fallback={<LoadingCardSkeletons className="px-4 py-6" count={3} label="Loading side panel" />}>
                <Routes>{children}</Routes>
              </Suspense>
            </div>
          </PopupRouteContext.Provider>
        </DesktopDockPanel>
      ) : null}
    </>
  );
}
