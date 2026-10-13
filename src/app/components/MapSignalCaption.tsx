import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Fit Signal text to the map width while keeping it centered above its pin. */
export default function MapSignalCaption({ children, active, pulsing, enabled = true }: {
  children: ReactNode;
  active: boolean;
  pulsing: boolean;
  enabled?: boolean;
}) {
  const captionRef = useRef<HTMLSpanElement>(null);
  const wasActive = useRef(false);
  const originalTextStyle = useRef<{ node: HTMLElement; fontSize: string } | null>(null);

  useLayoutEffect(() => {
    const caption = captionRef.current;
    const settling = wasActive.current;
    wasActive.current = active;
    if (!caption || !enabled || (!active && !settling)) return;
    const stack = caption.parentElement;
    const marker = caption.closest<HTMLElement>('[data-map-marker-pin]');
    const text = caption.querySelector<HTMLElement>('[data-map-signal-text]');
    if (!stack || !marker || !text) return;
    if (originalTextStyle.current?.node !== text) {
      originalTextStyle.current = { node: text, fontSize: text.style.fontSize };
    }
    const originalFontSize = originalTextStyle.current.fontSize;
    const settleUntil = performance.now() + 180;
    let frame = 0;
    let disposed = false;
    let needsNaturalSize = true;
    let baseFontSize = 15;
    let naturalTextWidth = 0;
    let capsuleChromeWidth = 0;
    let observedMap: HTMLElement | null = null;

    const schedule = () => {
      if (!disposed && !frame && (active || performance.now() < settleUntil)) {
        frame = requestAnimationFrame(measure);
      }
    };
    const sizeChanged = () => {
      needsNaturalSize = true;
      schedule();
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sizeChanged);
    const measure = () => {
      frame = 0;
      if (disposed || !caption.isConnected) return;
      const map = caption.closest<HTMLElement>('.cruush-map');
      if (!map) return;
      if (observedMap !== map) {
        if (observedMap) resizeObserver?.unobserve(observedMap);
        resizeObserver?.observe(map);
        observedMap = map;
      }
      const mapRect = map.getBoundingClientRect();
      const appRect = map.closest<HTMLElement>('[data-testid="app-viewport"]')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = Math.max(mapRect.left, appRect?.left ?? 0, viewport?.offsetLeft ?? 0);
      const top = Math.max(mapRect.top, appRect?.top ?? 0, viewport?.offsetTop ?? 0);
      const right = Math.min(mapRect.right, appRect?.right ?? window.innerWidth,
        viewport ? viewport.offsetLeft + viewport.width : window.innerWidth);
      const bottom = Math.min(mapRect.bottom, appRect?.bottom ?? window.innerHeight,
        viewport ? viewport.offsetTop + viewport.height : window.innerHeight);
      if (right <= left || bottom <= top || !stack.offsetWidth || !stack.offsetHeight
        || getComputedStyle(stack).visibility === 'hidden') return;

      if (needsNaturalSize) {
        text.style.fontSize = originalFontSize;
        const naturalRect = stack.getBoundingClientRect();
        const ancestorScale = naturalRect.width / stack.offsetWidth;
        if (!(ancestorScale > 0)) return;
        baseFontSize = parseFloat(getComputedStyle(text).fontSize);
        naturalTextWidth = text.getBoundingClientRect().width / ancestorScale;
        capsuleChromeWidth = Math.max(0, stack.offsetWidth - naturalTextWidth);
        needsNaturalSize = false;
      }

      const before = stack.getBoundingClientRect();
      const scaleX = before.width / stack.offsetWidth;
      if (!(scaleX > 0) || !(naturalTextWidth > 0) || !(baseFontSize > 0)) return;
      // The border and padding retain their size. Only overflowing text shrinks.
      const fit = Math.min(1, Math.max(0, ((right - left) / scaleX - capsuleChromeWidth) / naturalTextWidth));
      const fontSize = fit === 1 ? originalFontSize : `${Math.max(1, baseFontSize * fit)}px`;
      if (text.style.fontSize !== fontSize) text.style.fontSize = fontSize;

      // Measure the unchanged outer stack, so a previous caption translation
      // cannot feed back into this frame's fit or move the marker itself.
      const rect = stack.getBoundingClientRect();
      const localScaleY = rect.height / stack.offsetHeight;
      const y = Math.min(Math.max(rect.top, top), Math.max(top, bottom - rect.height)) - rect.top;
      const transform = y ? `translateY(${y / localScaleY}px)` : '';
      if (caption.style.transform !== transform) caption.style.transform = transform;
      // Parent hover transitions are finite; Pulse is the only continuous
      // animation. Hidden idle captions do not keep an animation-frame loop.
      if ((active && pulsing) || performance.now() < settleUntil) schedule();
    };

    const positionObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    positionObserver?.observe(marker, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', sizeChanged);
    window.visualViewport?.addEventListener('resize', sizeChanged);
    window.visualViewport?.addEventListener('scroll', schedule);
    document.fonts?.addEventListener('loadingdone', sizeChanged);
    void document.fonts?.ready.then(sizeChanged);
    // React renders a marker before MapLibre attaches it. The first frame can
    // find the real map; later previews can fit synchronously before painting.
    if (caption.isConnected) measure();
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      positionObserver?.disconnect();
      window.removeEventListener('resize', sizeChanged);
      window.visualViewport?.removeEventListener('resize', sizeChanged);
      window.visualViewport?.removeEventListener('scroll', schedule);
      document.fonts?.removeEventListener('loadingdone', sizeChanged);
    };
  }, [active, pulsing, enabled, children]);

  return <span ref={captionRef} className="flex w-max flex-col items-center">{children}</span>;
}
