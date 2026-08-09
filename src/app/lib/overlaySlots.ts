// Every floating overlay in the app is declared here, in one place, with the screen space
// it occupies. Components still write literal Tailwind classes (the JIT compiler needs
// them literal), but the geometry is recorded here and `overlaySlots.test.ts` fails when
// two overlays that can appear at the same time claim overlapping space.
//
// This exists because the bug report button shipped three times underneath something
// else: behind the map header row, inside the Recently Active panel, and under the
// install prompt. Each was found by a user rather than by a test.
//
// Adding a new floating overlay means adding it here. If the test fails, the two overlays
// really do collide on a real screen — move one, do not widen the tolerance.
//
// Blocking modals are deliberately absent: they are centred, they dim the whole screen and
// nothing can be used behind them, so "does it overlap" is not a question worth asking.
// Only things that float over a usable page belong here.

export type OverlayBox = {
  // Distances from the named viewport edge, in rem. Give either an edge pair
  // (left + right) or an edge plus a size.
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  width?: number;
  height?: number;
};

export type OverlaySlot = {
  id: string;
  // Source file that renders it, used by the drift test below.
  source: string;
  // Tailwind z-index. Recorded so a collision report can say which one wins.
  z: number;
  // Overlays that can never be on screen at the same time as this one. Pairs listed
  // here are skipped by the collision check.
  exclusiveWith?: string[];
  // A dismissible prompt or coach mark that is meant to sit on top of the page for a
  // moment. Transient overlays may cover a lower-z slot; permanent controls may not.
  // The bug this file exists to prevent is a permanent control being buried, not a
  // notice briefly covering a panel.
  transient?: boolean;
  mobile: OverlayBox;
  desktop: OverlayBox;
};

// Reference viewports, in rem at a 16px root. Mobile matches the iPhone frame the app is
// designed against; desktop matches the `sm` breakpoint and up.
export const MOBILE_VIEWPORT = { width: 23.4375, height: 50.75 };
export const DESKTOP_VIEWPORT = { width: 80, height: 50 };

export const OVERLAY_SLOTS: OverlaySlot[] = [
  {
    id: 'map-header-row',
    source: 'src/app/components/MapHome.tsx',
    z: 40,
    // The wrapper spans the full width but is pointer-events-none; only the right-hand
    // icon cluster is actually painted and clickable, so that is what is modelled.
    mobile: { top: 0.5, right: 0.5, width: 12, height: 2.75 },
    desktop: { top: 0.75, right: 0.75, width: 14, height: 2.75 },
  },
  {
    id: 'map-zoom-stack',
    source: 'src/app/components/MapHome.tsx',
    z: 40,
    mobile: { top: 3.5, right: 0.75, width: 2.75, height: 9 },
    desktop: { top: 4, right: 1, width: 2.75, height: 9 },
  },
  {
    id: 'recently-active-panel',
    source: 'src/app/components/MapHome.tsx',
    z: 30,
    mobile: { bottom: 6.25, left: 0, right: 1, height: 7 },
    desktop: { bottom: 6.25, right: 1, width: 29.5, height: 7 },
  },
  {
    id: 'bottom-nav',
    source: 'src/app/components/BottomNav.tsx',
    z: 50,
    // The nav wrapper is full width and pointer-events-none. Inside it, one mx-auto row
    // (max-w-[26rem]) holds the pill and, at its right end, the docked bug button. This
    // box is the PILL only - the button has its own slot below, so the collision check
    // proves the pill gave up enough width for it instead of the two stacking.
    mobile: { bottom: 0.75, left: 0.75, right: 4, height: 4 },
    desktop: { bottom: 0.75, left: 27, right: 30.25, height: 4 },
  },
  {
    id: 'alpha-bug-button',
    source: 'src/app/components/AlphaBugButton.tsx',
    z: 50,
    // Docked inside the bottom-nav row on every screen that renders the nav, which is
    // every signed-in route. It is laid out by that row rather than positioned over the
    // page, so it cannot land on top of a card, a photo tile or a delete button the way
    // a fixed floating button did. The band the nav occupies is the one strip every page
    // already reserves and never draws content into.
    mobile: { bottom: 1.15, right: 0.75, width: 2.75, height: 2.75 },
    desktop: { bottom: 1.15, right: 27, width: 2.75, height: 2.75 },
  },
];

export type ResolvedRect = { left: number; right: number; top: number; bottom: number };

export function resolveBox(box: OverlayBox, viewport: { width: number; height: number }): ResolvedRect {
  const left = box.left ?? (box.right !== undefined && box.width !== undefined
    ? viewport.width - box.right - box.width
    : 0);
  const right = box.right !== undefined
    ? viewport.width - box.right
    : left + (box.width ?? viewport.width);
  const top = box.top ?? (box.bottom !== undefined && box.height !== undefined
    ? viewport.height - box.bottom - box.height
    : 0);
  const bottom = box.bottom !== undefined
    ? viewport.height - box.bottom
    : top + (box.height ?? viewport.height);

  return { left, right, top, bottom };
}

export function rectsOverlap(a: ResolvedRect, b: ResolvedRect) {
  const horizontal = a.left < b.right && b.left < a.right;
  const vertical = a.top < b.bottom && b.top < a.bottom;

  return horizontal && vertical;
}
