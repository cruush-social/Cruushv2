import { describe, expect, it } from 'vitest';
import { excludeOwnerPinOverlaps, type PinFootprint } from './ownerPinExclusion';
const pin = (id: string, x = 200, y = 200, owner = false): PinFootprint => ({ id, x, y, owner, left: 62, right: 62, top: 54, bottom: 44 });
function intersects(a: PinFootprint, b: PinFootprint) {
  return a.x - a.left < b.x + b.right && a.x + a.right > b.x - b.left
    && a.y - a.top < b.y + b.bottom && a.y + a.bottom > b.y - b.top;
}
describe('owner pin exclusion', () => {
  it('keeps owners fixed and moves only colliding display positions by the actual footprint', () => {
    const pins = [pin('me', 200, 200, true), pin('near'), pin('clear', 600, 200)];
    const moved = excludeOwnerPinOverlaps(pins);
    expect([...moved.keys()]).toEqual(['near']);
    expect(moved.get('near')).toEqual({ x: 200, y: 96 });
    expect(pins[1]).toEqual(pin('near'));
  });
  it('clears both owner pins and other fan members for crowded coincident points deterministically', () => {
    const pins = [pin('me', 200, 200, true), pin('decoy', 350, 200, true), ...Array.from({ length: 12 }, (_, i) => pin(`fan-${i}`))];
    const moved = excludeOwnerPinOverlaps(pins, { width: 800, height: 800 });
    expect(excludeOwnerPinOverlaps([...pins].reverse(), { width: 800, height: 800 })).toEqual(moved);
    const placed = pins.map(p => ({ ...p, ...moved.get(p.id) }));
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      expect(intersects(placed[i], placed[j]), `${placed[i].id}/${placed[j].id}`).toBe(false);
    }
    expect(moved.has('me')).toBe(false);
    expect(moved.has('decoy')).toBe(false);
  });
  it.each([
    { dx: -300, dy: 0 }, { dx: 300, dy: 0 },
    { dx: 0, dy: -300 }, { dx: 0, dy: 500 },
    { dx: -255.333333, dy: -185.111111 }, { dx: 0.000031, dy: 0.000079 },
  ])('keeps owner and crowded fan offsets unchanged while panning across edges $dx/$dy', ({ dx, dy }) => {
    const pins = [pin('me', 200.25, 180.5, true), pin('other-owner', 360.25, 180.5, true),
      ...Array.from({ length: 6 }, (_, i) => pin(`fan-${i}`, 200.25 + i / 7, 180.5 + i / 11)),
      pin('clear-obstacle', 200.25, 60.5)];
    const viewport = { width: 390, height: 600 };
    const before = excludeOwnerPinOverlaps(pins, viewport);
    const translated = pins.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
    const after = excludeOwnerPinOverlaps(translated, viewport);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [id, position] of before) {
      expect(after.get(id)!.x - dx).toBeCloseTo(position.x, 6);
      expect(after.get(id)!.y - dy).toBeCloseTo(position.y, 6);
    }
    const placed = translated.map(p => ({ ...p, ...after.get(p.id) }));
    for (const owner of placed.filter(p => p.owner)) {
      for (const member of placed.filter(p => !p.owner)) expect(intersects(owner, member)).toBe(false);
    }
  });
  it('does not flip an owner-overlapping pin from above to below when the owner reaches the top edge', () => {
    const before = excludeOwnerPinOverlaps([pin('me', 195, 220, true), pin('peer', 195, 220)], { width: 390, height: 700 });
    const after = excludeOwnerPinOverlaps([pin('me', 195, 85, true), pin('peer', 195, 85)], { width: 390, height: 700 });
    expect(before.get('peer')!.y - 220).toBe(-104);
    expect(after.get('peer')!.y - 85).toBe(-104);
  });
  it('does nothing when no owner is present or a spiderfy point already clears the owner', () => {
    expect(excludeOwnerPinOverlaps([pin('a'), pin('b')]).size).toBe(0);
    expect(excludeOwnerPinOverlaps([pin('me', 200, 200, true), pin('fan', 400, 200)]).size).toBe(0);
  });
});
