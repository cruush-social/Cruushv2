import type { MapPingStatus } from './mapPingsApi';

/**
 * A Pulse runs for its full duration on the server, so nothing a refresh
 * reports may end it early. Leaving the app, a dropped request or a stale read
 * used to look exactly like the Pulse stopping, because the next response
 * simply replaced what the map was showing.
 *
 * A Pulse we already know about is kept until its own expiry passes, whatever
 * a later response says. Once it has expired the response wins, so a Pulse
 * never outlives its real end either.
 */
export function holdRunningPulse(
  currentStatus: MapPingStatus | null,
  nextStatus: MapPingStatus,
  nowMs = Date.now(),
): MapPingStatus {
  const knownPing = currentStatus?.activePing;
  if (!knownPing) {
    return nextStatus;
  }

  const stillRunning = Date.parse(knownPing.expiresAt) > nowMs;
  return stillRunning && !nextStatus.activePing
    ? { ...nextStatus, activePing: knownPing }
    : nextStatus;
}
