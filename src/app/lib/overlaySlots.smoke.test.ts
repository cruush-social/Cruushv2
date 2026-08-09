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
    const reporter = OVERLAY_SLOTS.filter((slot) => slot.id.startsWith('alpha-bug-'));
    const others = OVERLAY_SLOTS.filter((slot) => !slot.id.startsWith('alpha-bug-'));

    const collisions = reporter.flatMap((mine) => others.flatMap((other) => (
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

    // The button deliberately lives in the left-side chrome now; the collision check
    // above protects that separation while this assertion protects the registry entry.
    for (const slot of mapChrome) {
      expect(bugButton!.source).not.toBe(slot.source);
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
      ['top-[calc(4rem+env(safe-area-inset-top))]', 'lg:left-5', 'fixed z-20'],
    ],
    [
      'alpha-bug-tip',
      'src/app/components/AlphaBugButton.tsx',
      ['top-[calc(7.25rem+env(safe-area-inset-top))]', 'lg:left-5', 'fixed z-30'],
    ],
    [
      'mobile-install-prompt',
      'src/app/components/MobileInstallPrompt.tsx',
      ['bottom-24', 'right-[4.5rem]', 'sm:right-4', 'z-40'],
    ],
    [
      'bottom-nav',
      'src/app/components/BottomNav.tsx',
      ['fixed bottom-0', 'z-50'],
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
