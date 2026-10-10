import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaleBanner } from './SaleCampaignBanner';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('sale countdown', () => {
  it('counts down to the shared deadline and hides at expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T03:58:58Z'));
    render(<SaleBanner percentOff={50} endsAt="2026-10-12T03:59:00Z" onClick={() => {}} />);
    expect(screen.getByLabelText('Sale countdown')).toHaveTextContent('00:00:02');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByLabelText('Sale countdown')).toHaveTextContent('00:00:01');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('hides exactly at expiry even when mounted between second ticks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T03:58:59.750Z'));
    render(<SaleBanner percentOff={50} endsAt="2026-10-12T03:59:00Z" onClick={() => {}} />);
    act(() => { vi.advanceTimersByTime(249); });
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it.each(['focus', 'visibilitychange'])('removes expired sale on %s after suspended timers', (event) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T03:58:00Z'));
    render(<SaleBanner percentOff={50} endsAt="2026-10-12T03:59:00Z" onClick={() => {}} />);
    vi.setSystemTime(new Date('2026-10-12T04:00:00Z'));
    act(() => { (event === 'focus' ? window : document).dispatchEvent(new Event(event)); });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('keeps hours above 24 and resumes from the deadline after remount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T03:59:00Z'));
    const view = render(<SaleBanner percentOff={50} endsAt="2026-10-12T03:59:00Z" onClick={() => {}} />);
    expect(screen.getByLabelText('Sale countdown')).toHaveTextContent('48:00:00');
    view.unmount();
    vi.setSystemTime(new Date('2026-10-11T03:59:00Z'));
    render(<SaleBanner percentOff={50} endsAt="2026-10-12T03:59:00Z" onClick={() => {}} />);
    expect(screen.getByLabelText('Sale countdown')).toHaveTextContent('24:00:00');
  });

  it.each(['invalid', '2026-10-01T00:00:00Z'])('does not advertise an invalid or expired deadline: %s', endsAt => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T00:00:00Z'));
    render(<SaleBanner percentOff={50} endsAt={endsAt} onClick={() => {}} />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
