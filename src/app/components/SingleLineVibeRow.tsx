import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Shrink the existing capsule composition only when its natural row is too wide. */
export default function SingleLineVibeRow({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height?: number }>({ scale: 1 });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const row = rowRef.current;
    if (!frame || !row) return;
    const measure = () => {
      if (frame.clientWidth <= 0 || row.scrollWidth <= 0) return;
      const scale = Math.min(1, frame.clientWidth / row.scrollWidth);
      const height = row.offsetHeight * scale;
      setFit(current => current.scale === scale && current.height === height ? current : { scale, height });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(frame);
    observer?.observe(row);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  return (
    <div ref={frameRef} className="min-w-0 w-full overflow-hidden" style={{ height: fit.height }}>
      <div
        ref={rowRef}
        data-testid="activity-vibes"
        className="flex w-max flex-nowrap items-center gap-1.5"
        style={{ transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  );
}
