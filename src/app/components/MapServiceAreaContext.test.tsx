import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapServiceAreaProvider, useMapServiceArea } from './MapServiceAreaContext';
import { MAP_SERVICE_AREA_ACCESS_CHANGED } from '../lib/mapServiceAreaAccess';
import type { ProfilePinServiceAreaAccess } from '../lib/mapServiceAreaAccess';

const access = (profilePinsAllowed: boolean, accessExpiresAtMs: number | null = null): ProfilePinServiceAreaAccess => ({ profilePinsAllowed, accessExpiresAtMs });

const { getProfilePinServiceAreaAccess } = vi.hoisted(() => ({ getProfilePinServiceAreaAccess: vi.fn() }));
vi.mock('../lib/mapServiceAreaAccess', () => ({
  getProfilePinServiceAreaAccess,
  MAP_SERVICE_AREA_ACCESS_CHANGED: 'cruush:map-service-area-access-changed',
}));

function Probe() {
  const { profilePinsAllowed, outsideServiceArea, setOutsideServiceArea } = useMapServiceArea();
  return <>
    <output data-testid="access">{profilePinsAllowed ? 'allowed' : 'denied'}</output>
    <output data-testid="area">{outsideServiceArea ? 'outside' : 'inside'}</output>
    <button onClick={() => setOutsideServiceArea(true, true)}>Enter OOS preview</button>
    <button onClick={() => setOutsideServiceArea(false)}>Enter service area</button>
  </>;
}

describe('profile pin service-area access', () => {
  beforeEach(() => {
    getProfilePinServiceAreaAccess.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps pins inactive on a cold direct entry until server eligibility resolves', async () => {
    let resolve!: (value: ProfilePinServiceAreaAccess) => void;
    getProfilePinServiceAreaAccess.mockImplementation(() => new Promise<ProfilePinServiceAreaAccess>(r => { resolve = r; }));
    render(<MapServiceAreaProvider><Probe /></MapServiceAreaProvider>);
    expect(screen.getByTestId('access')).toHaveTextContent('denied');
    await act(async () => resolve(access(false)));
    expect(screen.getByTestId('access')).toHaveTextContent('denied');
    expect(screen.getByTestId('area')).toHaveTextContent('outside');
  });

  it('allows effective in-area MHC access and disables pins again when MHC is cleared', async () => {
    getProfilePinServiceAreaAccess.mockResolvedValueOnce(access(true)).mockResolvedValueOnce(access(false));
    render(<MapServiceAreaProvider><Probe /></MapServiceAreaProvider>);
    await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('allowed'));
    act(() => window.dispatchEvent(new Event(MAP_SERVICE_AREA_ACCESS_CHANGED)));
    expect(screen.getByTestId('access')).toHaveTextContent('denied');
    await waitFor(() => expect(screen.getByTestId('area')).toHaveTextContent('outside'));
  });

  it('keeps unknown eligibility disabled after an API failure', async () => {
    getProfilePinServiceAreaAccess.mockRejectedValue(new Error('offline'));
    render(<MapServiceAreaProvider><Probe /></MapServiceAreaProvider>);
    await waitFor(() => expect(getProfilePinServiceAreaAccess).toHaveBeenCalledOnce());
    expect(screen.getByTestId('access')).toHaveTextContent('denied');
  });

  it('does not let an older access response reopen pins after a newer OOS map result', async () => {
    let resolve!: (value: ProfilePinServiceAreaAccess) => void;
    getProfilePinServiceAreaAccess.mockImplementation(() => new Promise<ProfilePinServiceAreaAccess>(r => { resolve = r; }));
    render(<MapServiceAreaProvider><Probe /></MapServiceAreaProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Enter OOS preview' }));
    await act(async () => resolve(access(true)));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(getProfilePinServiceAreaAccess).toHaveBeenCalledOnce();
    expect(screen.getByTestId('access')).toHaveTextContent('denied');
    expect(screen.getByTestId('area')).toHaveTextContent('outside');
  });

  it('disables expired MHC access immediately while rechecking the server', async () => {
    vi.useFakeTimers();
    getProfilePinServiceAreaAccess
      .mockResolvedValueOnce(access(true, Date.now() + 1000))
      .mockImplementationOnce(() => new Promise(() => undefined));
    render(<MapServiceAreaProvider><Probe /></MapServiceAreaProvider>);
    await act(async () => {});
    expect(screen.getByTestId('access')).toHaveTextContent('allowed');
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('access')).toHaveTextContent('denied');
    expect(getProfilePinServiceAreaAccess).toHaveBeenCalledTimes(2);
  });

  it('does not use an expired allowance returned by the server', async () => {
    getProfilePinServiceAreaAccess.mockResolvedValue(access(true, Date.now() - 1));
    render(<MapServiceAreaProvider><Probe /></MapServiceAreaProvider>);
    await waitFor(() => expect(screen.getByTestId('area')).toHaveTextContent('outside'));
    expect(screen.getByTestId('access')).toHaveTextContent('denied');
  });

  it('rechecks the allowance when discovery enters the service area', async () => {
    getProfilePinServiceAreaAccess.mockResolvedValueOnce(access(false)).mockResolvedValueOnce(access(true));
    render(<MapServiceAreaProvider><Probe /></MapServiceAreaProvider>);
    await waitFor(() => expect(screen.getByTestId('area')).toHaveTextContent('outside'));
    fireEvent.click(screen.getByRole('button', { name: 'Enter service area' }));
    expect(screen.getByTestId('access')).toHaveTextContent('denied');
    await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('allowed'));
  });
});
