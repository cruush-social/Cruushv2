import { useLayoutEffect, useRef, useState } from 'react';

/** Fit the full Signal while preserving its parent's existing line box. */
export default function SingleLineSignal({ children }: { children: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const text = textRef.current;
    const frame = text?.parentElement;
    if (!text || !frame) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const frameStyle = window.getComputedStyle(frame);
      const padding = parseFloat(frameStyle.paddingLeft) + parseFloat(frameStyle.paddingRight);
      const border = parseFloat(frameStyle.borderLeftWidth) + parseFloat(frameStyle.borderRightWidth);
      const width = parseFloat(frameStyle.width);
      const availableWidth = Number.isFinite(width)
        ? width - (frameStyle.boxSizing === 'border-box' ? padding + border : 0)
        : frame.clientWidth - padding;
      // Computed width stays at the natural text width after a transform.
      const naturalWidth = parseFloat(window.getComputedStyle(text).width) || text.scrollWidth;
      if (availableWidth <= 0 || naturalWidth <= 0) return;
      const nextScale = Math.min(1, availableWidth / naturalWidth);
      setScale(current => current === nextScale ? current : nextScale);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(frame);
    observer?.observe(text);
    window.addEventListener('resize', measure);
    const fonts = document.fonts;
    fonts?.addEventListener('loadingdone', measure);
    void fonts?.ready.then(measure);
    measure();
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      fonts?.removeEventListener('loadingdone', measure);
    };
  }, [children]);

  return (
    <span
      ref={textRef}
      className="inline-block w-max whitespace-nowrap align-baseline"
      style={{ transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: 'left center' }}
    >
      {children}
    </span>
  );
}
