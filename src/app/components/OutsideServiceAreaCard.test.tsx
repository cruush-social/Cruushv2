import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OutsideServiceAreaCard from './OutsideServiceAreaCard';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup() {
  let visibleHeight = 800;
  let layoutHeight = 800;
  let frameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const viewport = Object.assign(new EventTarget(), { height: 800, scale: 1 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', layoutHeight);
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: true }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
    return this.dataset.testid === 'outside-service-area-card' ? 600 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.dataset.testid === 'outside-service-area-card-frame') {
      return { top: 128, bottom: visibleHeight - 192, height: visibleHeight - 320 } as DOMRect;
    }
    if (this.tagName === 'FORM') {
      const card = this.parentElement!;
      const scale = Number(card.style.transform.match(/scale\((.+)\)/)?.[1] ?? 1);
      const top = 128 + 530 * scale - card.parentElement!.scrollTop;
      return { top, bottom: top + 44 * scale, height: 44 * scale } as DOMRect;
    }
    return { top: 0, bottom: visibleHeight, height: visibleHeight } as DOMRect;
  });
  render(<OutsideServiceAreaCard
    currentUserEmail="member@cruush.local" onActivate={vi.fn()} onRequestedCityChange={vi.fn()}
    onSubmit={vi.fn()} requestedCity="Testing" requestingCity={false} cityRequestNotice={null}
    cityRequestError={null} welcomeDayStatus={null} claimingWelcomeDay={false}
    welcomeDayError={null} onClaimWelcomeDay={vi.fn()} hasCruushPlus={false}
  />);
  const frame = screen.getByTestId('outside-service-area-card-frame');
  const card = screen.getByTestId('outside-service-area-card');
  return {
    frame, card, input: screen.getByRole('textbox', { name: 'Request a city' }),
    resize(height: number, shrinkLayout = false) {
      visibleHeight = height;
      if (shrinkLayout) layoutHeight = height;
      vi.stubGlobal('innerHeight', layoutHeight);
      viewport.height = height;
      act(() => viewport.dispatchEvent(new Event('resize')));
      act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); });
    },
  };
}

describe('Purgatory city request keyboard fit', () => {
  it.each([false, true])('retains normal scale, reveals the city form and restores after keyboard close (layout shrinks: %s)', (shrinkLayout) => {
    const { frame, card, input, resize } = setup();
    expect(card).toHaveStyle({ transform: 'scale(0.8)' });
    act(() => input.focus());
    resize(400, shrinkLayout);

    expect(card).toHaveStyle({ transform: 'scale(0.8)' });
    expect(frame).toHaveStyle({ overflowY: 'auto' });
    expect(frame.scrollTop).toBeGreaterThan(0);
    const form = input.closest('form')!;
    expect(form.getBoundingClientRect().bottom).toBeLessThanOrEqual(frame.getBoundingClientRect().bottom);
    expect(form.getBoundingClientRect().top).toBeGreaterThanOrEqual(frame.getBoundingClientRect().top);
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on Mile High Club' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redeem free day' })).toBeInTheDocument();

    resize(800, shrinkLayout);
    expect(card).toHaveStyle({ transform: 'scale(0.8)' });
    expect(frame.style.overflowY).toBe('');
    expect(frame.scrollTop).toBe(0);
  });

  it('preserves ordinary fitting when no field is focused', () => {
    const { frame, card, resize } = setup();
    resize(400, true);
    expect(card.style.transform).toBe(`scale(${80 / 600})`);
    expect(frame.style.overflowY).toBe('');
  });

  it('retains the pre-keyboard scale after intermediate keyboard animation sizes', () => {
    const { frame, card, input, resize } = setup();
    act(() => input.focus());
    resize(740);
    expect(card).toHaveStyle({ transform: 'scale(0.7)' });
    expect(frame.style.overflowY).toBe('');

    resize(400);
    expect(card).toHaveStyle({ transform: 'scale(0.8)' });
    expect(frame).toHaveStyle({ overflowY: 'auto' });

    resize(740);
    resize(800);
    expect(card).toHaveStyle({ transform: 'scale(0.8)' });
    expect(frame.style.overflowY).toBe('');
    expect(frame.scrollTop).toBe(0);

    resize(400);
    expect(card).toHaveStyle({ transform: 'scale(0.8)' });
  });

  it('does not activate keyboard scrolling for small viewport changes', () => {
    const { frame, card, input, resize } = setup();
    act(() => input.focus());
    resize(740);
    expect(card).toHaveStyle({ transform: 'scale(0.7)' });
    expect(frame.style.overflowY).toBe('');
    fireEvent.blur(input);
  });
});
