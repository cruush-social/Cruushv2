import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapPingSheet from './MapPingSheet';

const availableStatus = {
  bonusCredits: 0,
  allowance: {
    limit: 5,
    used: 1,
    remaining: 4,
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

    expect(screen.getByRole('timer', { name: 'Pulse cooldown' })).toHaveTextContent('04:00:00');
    expect(screen.getByRole('button', { name: /next pulse in/i })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole('timer', { name: 'Pulse cooldown' })).toHaveTextContent('03:59:59');
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
    expect(screen.getByText('At the park')).toBeInTheDocument();
    expect(screen.getByText('4 of 5 Pulses available right now.')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([
      '1 mile',
      '3 miles',
      '5 miles',
      '10 miles',
      '15 miles',
    ]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('map-ping-sheet')).toHaveAttribute('data-window-mode', 'desktop-window');
    expect(screen.getByTestId('map-ping-sheet')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('map-ping-sheet-resize')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Pulse' }).closest('[data-slot="sheet-footer"]')).toHaveClass('shrink-0');
  });

  it('moves and resizes as a stable desktop window', async () => {
    const dispatchPointer = (
      target: Element,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      values: { button?: number; clientX: number; clientY: number; pointerId: number },
    ) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        button: { value: values.button ?? 0 },
        clientX: { value: values.clientX },
        clientY: { value: values.clientY },
        pointerId: { value: values.pointerId },
      });
      fireEvent(target, event);
    };

    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={availableStatus}
        loading={false}
        hasMapLocation
        signal="At the park"
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn()}
      />,
    );

    const sheet = await screen.findByTestId('map-ping-sheet');
    const resizeHandle = screen.getByTestId('map-ping-sheet-resize');
    Object.defineProperty(resizeHandle, 'setPointerCapture', { configurable: true, value: vi.fn() });
    Object.defineProperty(resizeHandle, 'hasPointerCapture', { configurable: true, value: vi.fn().mockReturnValue(false) });
    const startingWidth = Number.parseFloat(sheet.style.width);
    const startingHeight = Number.parseFloat(sheet.style.height);
    dispatchPointer(resizeHandle, 'pointerdown', { clientX: 600, clientY: 600, pointerId: 2 });
    dispatchPointer(resizeHandle, 'pointermove', { clientX: 640, clientY: 560, pointerId: 2 });
    dispatchPointer(resizeHandle, 'pointerup', { clientX: 640, clientY: 560, pointerId: 2 });

    expect(Number.parseFloat(sheet.style.width)).toBe(startingWidth + 40);
    expect(Number.parseFloat(sheet.style.height)).toBe(startingHeight - 40);

    const moveHandle = screen.getByTestId('map-ping-sheet-handle');
    Object.defineProperty(moveHandle, 'setPointerCapture', { configurable: true, value: vi.fn() });
    Object.defineProperty(moveHandle, 'hasPointerCapture', { configurable: true, value: vi.fn().mockReturnValue(false) });
    const startingLeft = Number.parseFloat(sheet.style.left);
    const startingTop = Number.parseFloat(sheet.style.top);
    dispatchPointer(moveHandle, 'pointerdown', { clientX: 200, clientY: 120, pointerId: 1 });
    dispatchPointer(moveHandle, 'pointermove', { clientX: 240, clientY: 140, pointerId: 1 });
    dispatchPointer(moveHandle, 'pointerup', { clientX: 240, clientY: 140, pointerId: 1 });

    expect(Number.parseFloat(sheet.style.left)).toBe(startingLeft + 40);
    expect(Number.parseFloat(sheet.style.top)).toBe(startingTop + 20);
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

    expect(screen.getByText('Basic includes 1 Pulse per rolling 24 hours.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get cruush+' }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('opens the separate Ping pack checkout from the Pulse menu', () => {
    const onBuyPingPacks = vi.fn();
    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={availableStatus}
        loading={false}
        hasMapLocation
        signal="At the park"
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn()}
        onBuyPingPacks={onBuyPingPacks}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Buy Pulse packs' }));
    expect(onBuyPingPacks).toHaveBeenCalledTimes(1);
  });

  it('shows extra Ping balance and preserves included-first guidance', () => {
    render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={{ ...availableStatus, bonusCredits: 10 }}
        loading={false}
        hasMapLocation
        signal="At the park"
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('10 extra Pulses ready. Your rolling allowance is used first.')).toBeInTheDocument();
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

  it('allows another Pulse while one is active when rolling allowance remains', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
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
        onSend={onSend}
      />,
    );

    const sendButton = screen.getByRole('button', { name: 'Send another Pulse' });
    expect(sendButton).toBeEnabled();
    fireEvent.click(sendButton);
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
