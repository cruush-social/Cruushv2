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

  return (
    <div data-testid="app-viewport" className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <div ref={content} data-testid="app-page-content" className="scrollbar-hide absolute inset-0 overflow-y-auto overscroll-contain" style={{ bottom: location.pathname.startsWith('/map') ? 0 : 'var(--cruush-nav-clearance, 6rem)' }}>
        {children}
      </div>
    </div>
  );
}
