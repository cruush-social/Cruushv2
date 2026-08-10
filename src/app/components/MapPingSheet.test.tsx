import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(screen.getByText('At the park')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 Pings available right now.')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([
      '1 mile',
      '3 miles',
      '5 miles',
      '10 miles',
      '15 miles',
    ]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
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
    fireEvent.click(screen.getByRole('button', { name: 'Send Ping' }));

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

    expect(screen.getByText('Add a signal to your profile before sending a Ping.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Ping' })).toBeDisabled();
  });

  it('prevents another Ping while one is active', () => {
    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={{
          ...availableStatus,
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

    expect(screen.getByRole('button', { name: 'Ping active' })).toBeDisabled();
  });
});
