import { useLayoutEffect, useRef, useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useCanChoosePopupLayout, getDesktopPageLayout, addDesktopPageLayoutChangedListener } from '../lib/desktopPageLayoutPreferences';

/** One window-sized app frame; page content scrolls inside it. */
export default function AppViewport({ children }: { children: ReactNode }) {
  const canChooseLayout = useCanChoosePopupLayout();
  const [layout, setLayout] = useState(getDesktopPageLayout);
  useEffect(() => addDesktopPageLayoutChangedListener(setLayout), []);
  const fullscreen = !canChooseLayout || layout === 'fullscreen';
  const location = useLocation();
  const content = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    document.documentElement.dataset.cruushPageFraming = fullscreen ? 'fullscreen' : 'desktop';
    return () => { delete document.documentElement.dataset.cruushPageFraming; };
  }, [fullscreen]);

  useLayoutEffect(() => { content.current?.scrollTo(0, 0); }, [location.pathname]);

  const onMap = location.pathname.startsWith('/map');

  useEffect(() => {
    const isMapGesture = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('[data-map-gesture-surface]'));
    const swallowPageGesture = (event: Event) => {
      if (!isMapGesture(event.target)) {
        event.preventDefault();
      }
    };
    const swallowPageMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1 && !isMapGesture(event.target)) {
        event.preventDefault();
      }
    };

    document.addEventListener('gesturestart', swallowPageGesture, { passive: false });
    document.addEventListener('gesturechange', swallowPageGesture, { passive: false });
    document.addEventListener('gestureend', swallowPageGesture, { passive: false });
    document.addEventListener('touchmove', swallowPageMultiTouch, { passive: false });

    return () => {
      document.removeEventListener('gesturestart', swallowPageGesture);
      document.removeEventListener('gesturechange', swallowPageGesture);
      document.removeEventListener('gestureend', swallowPageGesture);
      document.removeEventListener('touchmove', swallowPageMultiTouch);
    };
  }, []);

  return (
    // A pinch belongs to the map when it starts on the map; elsewhere the page itself never zooms.
    <div data-testid="app-viewport" className="fixed inset-0 overflow-hidden bg-background text-foreground" style={{ touchAction: 'pan-x pan-y' }}>
      <div ref={content} data-testid="app-page-content" className="scrollbar-hide absolute inset-0 overflow-y-auto overscroll-contain" style={{ bottom: onMap ? 0 : 'var(--cruush-nav-clearance, 6rem)' }}>
        {children}
      </div>
    </div>
  );
}
