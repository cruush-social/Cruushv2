import { describe, expect, it } from 'vitest';
import { holdRunningPulse } from './pulseHold';
import type { MapPingStatus } from './mapPingsApi';

const NOW = Date.parse('2026-09-05T12:00:00.000Z');

function status(activePing: MapPingStatus['activePing']): MapPingStatus {
  return { activePing } as MapPingStatus;
}

describe('holdRunningPulse', () => {
  const running = { id: 'ping-1', expiresAt: '2026-09-05T12:20:00.000Z' };
  const expired = { id: 'ping-0', expiresAt: '2026-09-05T11:40:00.000Z' };

  it('keeps a running Pulse when a refresh comes back without one', () => {
    // Leaving the app, a dropped request or a stale read all look like this,
    // and none of them mean the Pulse stopped.
    const held = holdRunningPulse(status(running), status(null), NOW);

    expect(held.activePing).toEqual(running);
  });

  it('lets a Pulse end once its own expiry has passed', () => {
    const held = holdRunningPulse(status(expired), status(null), NOW);

    expect(held.activePing).toBeNull();
  });

  it('takes a newer Pulse from the server over the one it was holding', () => {
    const newer = { id: 'ping-2', expiresAt: '2026-09-05T12:30:00.000Z' };

    const held = holdRunningPulse(status(running), status(newer), NOW);

    expect(held.activePing).toEqual(newer);
  });

  it('has nothing to hold when no Pulse was running', () => {
    const held = holdRunningPulse(status(null), status(null), NOW);

    expect(held.activePing).toBeNull();
  });
});
