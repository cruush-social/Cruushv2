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

    expect(screen.getByRole('timer', { name: 'Pulse cooldown' })).toHaveTextContent('04:00:00');
    expect(screen.getByTestId('map-ping-sheet')).toHaveClass('!z-[1601]');
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toHaveClass('!z-[1600]');
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
    expect(screen.getByText('2 Pulses left')).toBeInTheDocument();
    // The radius is a slider now, so the range is read off its ends.
    const radiusSlider = screen.getByRole('slider', { name: 'Pulse radius' });
    expect(radiusSlider).toHaveAttribute('aria-valuemin', '0');
    expect(radiusSlider).toHaveAttribute('aria-valuemax', '6');
    expect(screen.getByText('1 mi')).toBeInTheDocument();
    expect(screen.getByText('50 mi')).toBeInTheDocument();
    expect(screen.getByText('3 miles')).toBeInTheDocument();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('map-ping-sheet')).toHaveAttribute('data-window-mode', 'desktop-window');
    expect(screen.getByTestId('map-ping-sheet')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('map-ping-sheet-resize')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Pulse' }).closest('[data-slot="sheet-footer"]')).toHaveClass('shrink-0');
  });

  it('shows the total including saved Pulses beside Get Pulses even without a signal', async () => {
    const { rerender } = render(
      <MapPingSheet open onOpenChange={vi.fn()} status={{ ...availableStatus,
        bonusCredits: 7, allowance: { ...availableStatus.allowance, limit: 10, remaining: 9 },
      }} loading={false} hasMapLocation signal="" onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn()} onGetPulses={vi.fn()} />,
    );
    const count = await screen.findByText('9 Pulses left');
    const getPulses = screen.getByRole('button', { name: 'Get Pulses' });
    expect(count.parentElement).toContainElement(getPulses);
    expect(getPulses).toHaveClass('bg-[#c8ff31]', 'text-black', 'font-bold');
    expect(screen.queryByText('Your Pulse uses the signal saved on your profile.')).not.toBeInTheDocument();
    rerender(<MapPingSheet open onOpenChange={vi.fn()} status={{ ...availableStatus,
      bonusCredits: 0, allowance: { ...availableStatus.allowance, remaining: 1 },
    }} loading={false} hasMapLocation signal="" onRefresh={vi.fn().mockResolvedValue(undefined)}
      onSend={vi.fn()} onGetPulses={vi.fn()} />);
    expect(screen.getByText('1 Pulse left')).toBeInTheDocument();
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
    expect(sheet.style.height).toBe('auto');
    const startingHeight = JSON.parse(window.localStorage.getItem('cruush.pulse.desktopGeometry')!).height;
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

    expect(screen.getByText('Basic includes 1 Pulse every 24 hours.')).toBeInTheDocument();
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

    const radiusSlider = screen.getByRole('slider', { name: 'Pulse radius' });
    radiusSlider.focus();
    // 3 miles is index 1; three steps right lands on 15 miles.
    fireEvent.keyDown(radiusSlider, { key: 'ArrowRight' });
    fireEvent.keyDown(radiusSlider, { key: 'ArrowRight' });
    fireEvent.keyDown(radiusSlider, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Send Pulse' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith(15));
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

  it('prevents another Pulse while one is active and the cooldown is running', () => {
    const activePing = {
      id: 'ping-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const nextEligibleAt = new Date(Date.now() + 4 * 60 * 60_000).toISOString();

    const { rerender } = render(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={{
          ...availableStatus,
          allowance: {
            ...availableStatus.allowance,
            nextEligibleAt,
          },
          activePing,
        }}
        loading={false}
        hasMapLocation
        signal="At the park"
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn()}
      />,
    );

    // The raised allowance offers another Pulse, but the cooldown still blocks it.
    expect(screen.getByRole('button', { name: 'Send another Pulse' })).toBeDisabled();
    expect(screen.getByRole('timer', { name: 'Pulse cooldown' })).toBeInTheDocument();

    rerender(
      <MapPingSheet
        open
        onOpenChange={vi.fn()}
        status={{
          ...availableStatus,
          allowance: {
            ...availableStatus.allowance,
            used: availableStatus.allowance.limit,
            remaining: 0,
            nextEligibleAt,
          },
          activePing,
        }}
        loading={false}
        hasMapLocation
        signal="At the park"
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Pulse active' })).toBeDisabled();
    expect(screen.getByRole('timer', { name: 'Pulse cooldown' })).toBeInTheDocument();
  });
});
