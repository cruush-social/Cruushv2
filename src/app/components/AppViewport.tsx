import { useLayoutEffect, useRef, useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useCanChoosePopupLayout, getDesktopPageLayout, addDesktopPageLayoutChangedListener } from '../lib/desktopPageLayoutPreferences';

/** One window-sized app frame; page content scrolls inside it. */
export default function AppViewport({ children, topBanner }: { children: ReactNode; topBanner?: ReactNode }) {
  const canChooseLayout = useCanChoosePopupLayout();
  const [layout, setLayout] = useState(getDesktopPageLayout);
  useEffect(() => addDesktopPageLayoutChangedListener(setLayout), []);
  const fullscreen = !canChooseLayout || layout === 'fullscreen';
  const location = useLocation();
  const content = useRef<HTMLDivElement>(null);
  const banner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = banner.current;
    if (!node) return;
    const measure = () => {
      const height = `${node.getBoundingClientRect().height}px`;
      if (document.documentElement.style.getPropertyValue('--cruush-sale-banner-height') !== height) {
        document.documentElement.style.setProperty('--cruush-sale-banner-height', height);
        window.dispatchEvent(new Event('cruush:sale-banner-height-changed'));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--cruush-sale-banner-height');
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.cruushPageFraming = fullscreen ? 'fullscreen' : 'desktop';
    return () => { delete document.documentElement.dataset.cruushPageFraming; };
  }, [fullscreen]);

  useLayoutEffect(() => { content.current?.scrollTo(0, 0); }, [location.pathname]);

  const onMap = location.pathname.startsWith('/map');
  const [dmKeyboardViewport, setDmKeyboardViewport] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      // iOS may pan the layout viewport to the focused textarea. Match only
      // the active DM keyboard's visual viewport so its header stays visible.
      if (document.documentElement.dataset.cruushDmKeyboardOpen !== 'true' || !viewport) {
        setDmKeyboardViewport(null);
        return;
      }
      setDmKeyboardViewport({ top: viewport.offsetTop, height: viewport.height });
    };
    update();
    window.addEventListener('cruush:dm-keyboard-changed', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('cruush:dm-keyboard-changed', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, []);



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
    <div data-testid="app-viewport" className="fixed inset-0 overflow-hidden bg-background text-foreground" style={{ touchAction: 'pan-x pan-y', ...(dmKeyboardViewport ? { top: dmKeyboardViewport.top, height: dmKeyboardViewport.height, bottom: 'auto' } : {}) }}>
      <div ref={banner} className="absolute inset-x-0 top-0 z-30">{topBanner}</div>
      <div ref={content} data-testid="app-page-content" className={`scrollbar-hide absolute inset-0 overflow-y-auto overscroll-contain${onMap ? '' : ' cruush-app-page-content'}`} style={{ top: 'var(--cruush-sale-banner-height, 0px)', bottom: onMap ? 0 : 'var(--cruush-nav-clearance, 6rem)' }}>
        {children}
      </div>
    </div>
  );
}
