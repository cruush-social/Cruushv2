export type PinFootprint = {
  id: string;
  owner: boolean;
  x: number;
  y: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const GAP = 6;
const GEOMETRY_EPSILON = 1e-7;
function overlaps(a: PinFootprint, b: PinFootprint) {
  return a.x - a.left < b.x + b.right + GAP - GEOMETRY_EPSILON && a.x + a.right > b.x - b.left - GAP + GEOMETRY_EPSILON
    && a.y - a.top < b.y + b.bottom + GAP - GEOMETRY_EPSILON && a.y + a.bottom > b.y - b.top - GAP + GEOMETRY_EPSILON;
}

/** Relocate owner overlaps relative to pins, never relative to viewport edges. */
export function excludeOwnerPinOverlaps(pins: PinFootprint[], _viewport?: { width: number; height: number }) {
  const owners = pins.filter(pin => pin.owner);
  const positions = new Map(pins.map(pin => [pin.id, pin]));
  const moved = new Map<string, { x: number; y: number }>();
  for (const original of [...pins].sort((a, b) => a.id.localeCompare(b.id))) {
    if (original.owner || !owners.some(owner => overlaps(original, owner))) continue;
    const obstacles = [...positions.values()].filter(pin => pin.id !== original.id).sort((a, b) => a.id.localeCompare(b.id));
    const pending = [original];
    const visited = new Set<string>();
    let chosen: PinFootprint | undefined;
    // Boundary candidates find the nearest free pocket without moving unrelated pins.
    for (let attempt = 0; pending.length && attempt < 256; attempt += 1) {
      pending.sort((a, b) => {
        const distance = Math.hypot(a.x - original.x, a.y - original.y)
          - Math.hypot(b.x - original.x, b.y - original.y);
        // Panning must not flip equal-distance pockets at floating-point ties.
        return Math.abs(distance) > GEOMETRY_EPSILON ? distance : a.y - b.y || a.x - b.x;
      });
      const candidate = pending.shift()!;
      const key = `${candidate.x.toFixed(3)}:${candidate.y.toFixed(3)}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const blocker = obstacles.find(pin => overlaps(candidate, pin));
      if (!blocker) { chosen = candidate; break; }
      pending.push(
        { ...candidate, x: blocker.x - blocker.left - candidate.right - GAP },
        { ...candidate, x: blocker.x + blocker.right + candidate.left + GAP },
        { ...candidate, y: blocker.y - blocker.top - candidate.bottom - GAP },
        { ...candidate, y: blocker.y + blocker.bottom + candidate.top + GAP },
      );
    }
    // A finite, deterministic escape for an exceptionally crowded candidate set.
    chosen ??= { ...original, x: Math.max(...obstacles.map(pin => pin.x + pin.right)) + original.left + GAP };
    positions.set(original.id, chosen);
    moved.set(original.id, { x: chosen.x, y: chosen.y });
  }
  return moved;
}
