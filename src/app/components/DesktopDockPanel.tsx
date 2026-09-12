import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

export type DesktopDockSlot = 'left' | 'right';
export type DesktopDockLayer = 'panel' | 'modal';

type DockDragMode = 'move' | 'resize-top-right' | 'resize-bottom-right';

type DockGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DesktopDockPanelProps = {
  slot: DesktopDockSlot;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  minWidth?: number;
  minHeight?: number;
  layer?: DesktopDockLayer;
  /** Profile previews can extend closer to, while still clearing, the bottom navigation. */
  bottomClearance?: number;
};

const EDGE_GAP = 10;
function bottomFloatingControlsClearance() {
  if (typeof window === 'undefined') {
    return 146;
  }

  // Recently Active sits above the fixed bottom-navigation pill. Panels end
  // 10px above that control at both desktop responsive breakpoints so neither
  // centered map control can be hidden or intercept pointer input.
  return window.innerWidth >= 1024 ? 146 : 138;
}
// Panels share one stacking counter. Pressing anywhere on a panel raises it, so
// an overlapped panel is never left unclickable behind another one.
// Panels stack among themselves but always sit under the top chrome and page
// dialogs. Transient map surfaces stay below these panels.
const BASE_Z: Record<DesktopDockLayer, number> = {
  panel: 200,
  modal: 1600,
};
const topZ: Record<DesktopDockLayer, number> = { ...BASE_Z };
const DEFAULT_WIDTH = 416;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 420;

function storageKey(slot: DesktopDockSlot) {
  return `cruush.desktopDock.${slot}`;
}

function topChromeClearance(slot: DesktopDockSlot) {
  if (typeof window === 'undefined') {
    return EDGE_GAP;
  }

  if (window.innerWidth >= 1024) {
    return slot === 'right' ? 136 : 90;
  }

  if (window.innerWidth >= 640) {
    return slot === 'right' ? 132 : 86;
  }

  return 74;
}

function clampGeometry(slot: DesktopDockSlot, geometry: DockGeometry, minWidth: number, minHeight: number, bottomClearance = bottomFloatingControlsClearance()): DockGeometry {
  if (typeof window === 'undefined') {
    return geometry;
  }

  const minimumY = topChromeClearance(slot);
  // Right-side popups can travel to the edge without sitting flush against it.
  // This small inset keeps the popup's own Close control fully visible and does
  // not reserve any internal space for the independent Bug Fix control.
  const rightClearance = EDGE_GAP;
  const hasRoomForRightHalf = slot === 'right'
    && window.innerWidth >= minWidth * 2 + EDGE_GAP * 2;
  const minimumX = hasRoomForRightHalf
    ? Math.floor(window.innerWidth / 2)
    : EDGE_GAP;
  const maxWidth = Math.max(1, window.innerWidth - minimumX - rightClearance);
  const maxHeight = Math.max(1, window.innerHeight - minimumY - bottomClearance);
  const effectiveMinWidth = Math.min(minWidth, maxWidth);
  const width = Math.min(Math.max(geometry.width, effectiveMinWidth), maxWidth);
  const effectiveMinHeight = Math.min(minHeight, maxHeight);
  const height = Math.min(Math.max(geometry.height, effectiveMinHeight), maxHeight);
  const x = Math.min(
    Math.max(geometry.x, minimumX),
    Math.max(minimumX, window.innerWidth - width - rightClearance),
  );
  const y = Math.min(
    Math.max(geometry.y, minimumY),
    Math.max(minimumY, window.innerHeight - height - bottomClearance),
  );

  return { x, y, width, height };
}

function defaultGeometry(slot: DesktopDockSlot, minWidth: number, minHeight: number, bottomClearance = bottomFloatingControlsClearance()): DockGeometry {
  if (typeof window === 'undefined') {
    return { x: EDGE_GAP, y: EDGE_GAP, width: DEFAULT_WIDTH, height: minHeight };
  }

  const width = Math.max(minWidth, Math.min(DEFAULT_WIDTH, window.innerWidth - EDGE_GAP * 2));
  const height = Math.max(minHeight, window.innerHeight - EDGE_GAP * 2);
  const x = slot === 'left' ? EDGE_GAP : Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP);

  return clampGeometry(slot, { x, y: topChromeClearance(slot), width, height }, minWidth, minHeight, bottomClearance);
}

function readStoredGeometry(slot: DesktopDockSlot): DockGeometry | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey(slot));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<DockGeometry>;
    if (
      typeof parsed.x !== 'number'
      || typeof parsed.y !== 'number'
      || typeof parsed.width !== 'number'
      || typeof parsed.height !== 'number'
      || ![parsed.x, parsed.y, parsed.width, parsed.height].every(Number.isFinite)
    ) {
      return null;
    }

    return { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height };
  } catch {
    return null;
  }
}

export default function DesktopDockPanel({
  slot,
  ariaLabel,
  children,
  className,
  minWidth = MIN_WIDTH,
  minHeight = MIN_HEIGHT,
  layer = 'panel',
  bottomClearance,
}: DesktopDockPanelProps) {
  const [geometry, setGeometry] = useState<DockGeometry>(() => {
    const stored = readStoredGeometry(slot);
    return stored
      ? clampGeometry(slot, stored, minWidth, minHeight, bottomClearance)
      : defaultGeometry(slot, minWidth, minHeight, bottomClearance);
  });
  const dragStateRef = useRef<{ pointerId: number; mode: DockDragMode; originX: number; originY: number; start: DockGeometry } | null>(null);
  const [zIndex, setZIndex] = useState(() => {
    topZ[layer] += 1;
    return topZ[layer];
  });

  const raise = useCallback(() => {
    setZIndex((current) => {
      if (current === topZ[layer]) {
        return current;
      }

      topZ[layer] += 1;
      return topZ[layer];
    });
  }, [layer]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => setGeometry((current) => clampGeometry(slot, current, minWidth, minHeight, bottomClearance));
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [bottomClearance, minHeight, minWidth, slot]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(storageKey(slot), JSON.stringify(geometry));
    } catch {
      // Position is a convenience. Ignore storage failures.
    }
  }, [geometry, slot]);

  const beginDrag = useCallback((event: ReactPointerEvent<HTMLElement>, mode: DockDragMode) => {
    if (event.button !== 0) {
      return;
    }

    raise();

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      start: geometry,
    };
  }, [geometry, raise]);

  const continueDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.originX;
    const deltaY = event.clientY - dragState.originY;

    if (dragState.mode === 'move') {
      setGeometry(clampGeometry(slot,
        { ...dragState.start, x: dragState.start.x + deltaX, y: dragState.start.y + deltaY },
        minWidth,
        minHeight,
        bottomClearance,
      ));
      return;
    }

    if (dragState.mode === 'resize-bottom-right') {
      setGeometry(clampGeometry(slot,
        {
          ...dragState.start,
          width: dragState.start.width + deltaX,
          height: dragState.start.height + deltaY,
        },
        minWidth,
        minHeight,
        bottomClearance,
      ));
      return;
    }

    // Top right grip: the panel grows to the right and upward, so the bottom
    // edge stays put and y follows the height change.
    const bottom = dragState.start.y + dragState.start.height;
    const maxHeight = Math.max(1, bottom - topChromeClearance(slot));
    const height = Math.min(
      Math.max(dragState.start.height - deltaY, Math.min(minHeight, maxHeight)),
      maxHeight,
    );
    setGeometry(clampGeometry(slot,
      {
        x: dragState.start.x,
        y: dragState.start.y + (dragState.start.height - height),
        width: dragState.start.width + deltaX,
        height,
      },
      minWidth,
      minHeight,
      bottomClearance,
    ));
  }, [bottomClearance, minHeight, minWidth, slot]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
  }, []);

  const panelStyle: CSSProperties = {
    left: `${geometry.x}px`,
    top: `${geometry.y}px`,
    width: `${geometry.width}px`,
    height: `${geometry.height}px`,
    zIndex,
  };

  return (
    <aside
      aria-label={ariaLabel}
      data-dock-slot={slot}
      data-testid={`desktop-dock-${slot}`}
      className={`fixed flex flex-col overflow-hidden rounded-[28px] border border-white/12 bg-[color:var(--cruush-black-glass)] shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-[var(--cruush-black-glass-blur)] ${className ?? ''}`}
      style={panelStyle}
      onPointerDownCapture={raise}
    >
      {/* Keep the grab strip narrow so the panel's own corner controls stay clickable. */}
      <div
        data-testid={`desktop-dock-${slot}-handle`}
        aria-label={`Move ${ariaLabel}`}
        className="absolute left-1/2 top-0 z-[60] h-8 w-24 -translate-x-1/2 touch-none cursor-grab active:cursor-grabbing"
        onLostPointerCapture={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={(event) => beginDrag(event, 'move')}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
      >
        <span className="mx-auto mt-1.5 block h-1.5 w-12 rounded-full border border-black/35 bg-white/55 shadow-[0_1px_8px_rgba(0,0,0,0.55)]" />
      </div>

      <div className="min-h-0 flex-1">{children}</div>

      <div
        data-testid={`desktop-dock-${slot}-resize-top`}
        aria-label={`Resize ${ariaLabel} from the top right`}
        className="absolute right-0 top-0 z-[60] h-7 w-7 touch-none cursor-nesw-resize"
        onLostPointerCapture={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={(event) => beginDrag(event, 'resize-top-right')}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
      >
        <span className="absolute right-2 top-2 block h-2.5 w-2.5 rounded-[3px] border-r-2 border-t-2 border-white/70" />
      </div>

      <div
        data-testid={`desktop-dock-${slot}-resize`}
        aria-label={`Resize ${ariaLabel}`}
        className="absolute bottom-0 right-0 z-[60] h-7 w-7 touch-none cursor-nwse-resize"
        onLostPointerCapture={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={(event) => beginDrag(event, 'resize-bottom-right')}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
      >
        <span className="absolute bottom-2 right-2 block h-2.5 w-2.5 rounded-[3px] border-b-2 border-r-2 border-white/70" />
      </div>
    </aside>
  );
}
