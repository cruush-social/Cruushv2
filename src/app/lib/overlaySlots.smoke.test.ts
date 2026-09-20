import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  OVERLAY_SLOTS,
  rectsOverlap,
  resolveBox,
} from './overlaySlots';

function pairs<T>(items: T[]): [T, T][] {
  return items.flatMap((item, index) => items.slice(index + 1).map((other): [T, T] => [item, other]));
}

function canCoexist(a: { id: string; exclusiveWith?: string[] }, b: { id: string; exclusiveWith?: string[] }) {
  return !(a.exclusiveWith ?? []).includes(b.id) && !(b.exclusiveWith ?? []).includes(a.id);
}

// A dismissible notice is allowed to sit on top of something permanent. The failure this
// guards against is the reverse: a permanent control ending up underneath anything.
function coveringIsAllowed(
  a: { z: number; transient?: boolean },
  b: { z: number; transient?: boolean },
) {
  const [upper, lower] = a.z >= b.z ? [a, b] : [b, a];

  return Boolean(upper.transient) && upper.z > lower.z;
}

describe('smoke: floating overlays do not cover each other', () => {
  for (const [label, viewport, key] of [
    ['mobile', MOBILE_VIEWPORT, 'mobile'],
    ['desktop', DESKTOP_VIEWPORT, 'desktop'],
  ] as const) {
    it(`keeps every ${label} overlay clear of the others`, () => {
      const collisions = pairs(OVERLAY_SLOTS)
        .filter(([a, b]) => canCoexist(a, b))
        .filter(([a, b]) => !coveringIsAllowed(a, b))
        .filter(([a, b]) => rectsOverlap(
          resolveBox(a[key], viewport),
          resolveBox(b[key], viewport),
        ))
        .map(([a, b]) => `${a.id} (z-${a.z}) overlaps ${b.id} (z-${b.z})`);

      expect(collisions).toEqual([]);
    });
  }

  it('never lets the bug reporter sit on top of another control', () => {
    // No transient exemption, no z-index excuse: the bug button and its coach mark must
    // be clear of every other overlay on both viewports.
    const reporter = OVERLAY_SLOTS.filter((slot) => slot.id.includes('alpha-bug-'));
    const others = OVERLAY_SLOTS.filter((slot) => !slot.id.includes('alpha-bug-'));

    const collisions = reporter.flatMap((mine) => others
      .filter((other) => canCoexist(mine, other))
      .flatMap((other) => (
      ([['mobile', MOBILE_VIEWPORT], ['desktop', DESKTOP_VIEWPORT]] as const)
        .filter(([, viewport], index) => rectsOverlap(
          resolveBox(index === 0 ? mine.mobile : mine.desktop, viewport),
          resolveBox(index === 0 ? other.mobile : other.desktop, viewport),
        ))
        .map(([label]) => `${label}: ${mine.id} covers ${other.id}`)
    )));

    expect(collisions).toEqual([]);
  });

  it('keeps the bug report button geometry declared separately from map chrome', () => {
    const bugButton = OVERLAY_SLOTS.find((slot) => slot.id === 'alpha-bug-button');
    const mapChrome = OVERLAY_SLOTS.filter((slot) => slot.source.endsWith('MapHome.tsx'));

    expect(bugButton).toBeDefined();

    // The button owns one universal viewport corner while this assertion protects the
    // registry entry from being folded into map-only geometry again.
    for (const slot of mapChrome) {
      expect(bugButton!.source).not.toBe(slot.source);
    }
  });

  it('keeps an 8px gap between the map top bar and right-side controls', () => {
    const header = OVERLAY_SLOTS.find((slot) => slot.id === 'map-header-row');
    const rightActions = OVERLAY_SLOTS.find((slot) => slot.id === 'map-right-actions');

    expect(header).toBeDefined();
    expect(rightActions).toBeDefined();

    for (const [viewport, key] of [
      [MOBILE_VIEWPORT, 'mobile'],
      [DESKTOP_VIEWPORT, 'desktop'],
    ] as const) {
      const headerRect = resolveBox(header![key], viewport);
      const rightActionsRect = resolveBox(rightActions![key], viewport);

      expect(rightActionsRect.top - headerRect.bottom).toBe(0.5);
    }
  });
});

describe('smoke: declared overlay geometry matches the components', () => {
  // The registry is only useful while it tells the truth. These assertions fail if
  // someone edits a position class without updating the slot beside it.
  const expectations: [string, string, string[]][] = [
    [
      'alpha-bug-button',
      'src/app/components/AlphaBugButton.tsx',
      ['right-[calc(0.75rem+env(safe-area-inset-right))]', 'top-[calc(0.75rem+env(safe-area-inset-top))]', 'z-[1500]'],
    ],
    [
      'alpha-bug-tip',
      'src/app/components/AlphaBugButton.tsx',
      ['right-[calc(0.75rem+env(safe-area-inset-right))]', 'top-[calc(4.5rem+env(safe-area-inset-top))]', 'fixed z-[1200]'],
    ],
    [
      'map-alpha-bug-tip',
      'src/app/components/AlphaBugButton.tsx',
      ['top-[calc(20.125rem+env(safe-area-inset-top))]', 'sm:top-[calc(9.25rem+env(safe-area-inset-top))]', 'fixed z-[1200]'],
    ],
    [
      'map-right-actions',
      'src/app/components/MapControls.tsx',
      [
        'right-3 top-[4.625rem]',
        'sm:right-4 sm:top-[5.375rem]',
        'lg:right-3 lg:top-16',
        'data-testid="map-right-actions"',
      ],
    ],
    [
      'mobile-install-prompt',
      'src/app/components/MobileInstallPrompt.tsx',
      ['bottom-24', 'right-[4.5rem]', 'sm:right-4', 'z-[90]'],
    ],
    [
      'bottom-nav',
      'src/app/components/BottomNav.tsx',
      ['fixed bottom-0', 'z-[60]'],
    ],
  ];

  for (const [slotId, source, needles] of expectations) {
    it(`${slotId} still renders the classes its slot declares`, () => {
      const contents = readFileSync(source, 'utf8');
      const missing = needles.filter((needle) => !contents.includes(needle));

      expect(missing).toEqual([]);
    });
  }
});
