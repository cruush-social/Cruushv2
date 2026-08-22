import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapPingSheet from './MapPingSheet';

const availableStatus = {
  allowance: {
    limit: 3,
    used: 1,
    remaining: 2,
    nextEligibleAt: null,
  },
  activePing: null,
  receivedPings: [],
};

describe('MapPingSheet', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a live cooldown counter while the next Ping is unavailable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T12:00:00.000Z'));

    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={{
          ...availableStatus,
          allowance: {
            limit: 3,
            used: 1,
            remaining: 2,
            nextEligibleAt: '2026-08-11T16:00:00.000Z',
          },
        }}
        loading={false}
        hasMapLocation
        signal="At the park"
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByRole('timer', { name: 'Ping cooldown' })).toHaveTextContent('04:00:00');
    expect(screen.getByRole('button', { name: 'Send Pulse' })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole('timer', { name: 'Ping cooldown' })).toHaveTextContent('03:59:59');
  });

  it('refreshes the allowance when the cooldown reaches zero', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T12:00:00.000Z'));
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={{
          ...availableStatus,
          allowance: {
            limit: 1,
            used: 1,
            remaining: 0,
            nextEligibleAt: '2026-08-11T12:00:02.000Z',
          },
        }}
        loading={false}
        hasMapLocation
        signal="At the park"
        onRefresh={onRefresh}
        onSend={vi.fn()}
      />,
    );

    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(2050);
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('shows every radius, current signal, and remaining allowance', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={availableStatus}
        loading={false}
        hasMapLocation
        signal="At the park"
        onRefresh={onRefresh}
        onSend={vi.fn()}
      />,
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // The signal reads twice: once on the demonstration heart, once in the
    // field you edit.
    expect(screen.getAllByText('At the park')).toHaveLength(2);
    expect(screen.getByText('2 of 3 Pulses available right now.')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([
      '1 mile',
      '3 miles',
      '5 miles',
      '10 miles',
      '15 miles',
    ]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('links a basic member with no remaining Pings to cruush+', () => {
    const onUpgrade = vi.fn();
    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={{
          ...availableStatus,
          allowance: { limit: 1, used: 1, remaining: 0, nextEligibleAt: null },
        }}
        loading={false}
        hasMapLocation
        hasCruushPlus={false}
        signal="At the park"
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn()}
        onUpgrade={onUpgrade}
      />,
    );

    expect(screen.getByText('Basic includes 1 Ping every 24 hours.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get cruush+' }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('sends the selected radius', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);

    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={availableStatus}
        loading={false}
        hasMapLocation
        signal="At the park"
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={onSend}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: '10 miles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send Pulse' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith(10));
  });

  it('requires a profile signal before sending', () => {
    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={availableStatus}
        loading={false}
        hasMapLocation
        signal=""
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('Add a signal to your profile before sending a Pulse.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Pulse' })).toBeDisabled();
  });

  it('prevents another Ping while one is active', () => {
    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={{
          ...availableStatus,
          allowance: {
            ...availableStatus.allowance,
            nextEligibleAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
          },
          activePing: {
            id: 'ping-1',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }}
        loading={false}
        hasMapLocation
        signal="At the park"
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Pulse active' })).toBeDisabled();
    expect(screen.getByRole('timer', { name: 'Ping cooldown' })).toBeInTheDocument();
  });
});
