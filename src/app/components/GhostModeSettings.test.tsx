import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import GhostModeSettings from './GhostModeSettings';
import { CRUUSH_PLUS_CHANGED_EVENT } from '../lib/billingApi';
import { DEBUG_CRUUSH_PLUS_EVENT } from '../lib/debugApi';

const {
  getMyBillingStatus,
  getMyPrivacySettings,
  saveMyPrivacySettings,
  getMyMapPresenceSettings,
  saveMyMapPresenceSettings,
} = vi.hoisted(() => ({
  getMyBillingStatus: vi.fn(),
  getMyPrivacySettings: vi.fn(),
  saveMyPrivacySettings: vi.fn(),
  getMyMapPresenceSettings: vi.fn(),
  saveMyMapPresenceSettings: vi.fn(),
}));

vi.mock('../lib/billingApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/billingApi')>('../lib/billingApi');

  return {
    ...actual,
    getMyBillingStatus,
  };
});

vi.mock('../lib/privacyApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/privacyApi')>('../lib/privacyApi');

  return {
    ...actual,
    getMyPrivacySettings,
    saveMyPrivacySettings,
    getMyMapPresenceSettings,
    saveMyMapPresenceSettings,
  };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('GhostModeSettings', () => {
  beforeEach(() => {
    getMyPrivacySettings.mockReset();
    getMyBillingStatus.mockReset();
    saveMyPrivacySettings.mockReset();
    getMyMapPresenceSettings.mockReset();
    saveMyMapPresenceSettings.mockReset();

    getMyPrivacySettings.mockResolvedValue({
      ghostModeEnabled: false,
      preciseLocationVisibility: 'none',
    });
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
    saveMyPrivacySettings.mockImplementation((settings) => Promise.resolve(settings));
    getMyMapPresenceSettings.mockResolvedValue({ days: 7, minDays: 1, maxDays: 30 });
    saveMyMapPresenceSettings.mockImplementation((days: number) => Promise.resolve({
      days,
      minDays: 1,
      maxDays: 30,
    }));
  });

  it('defaults map presence to seven days and saves a new duration', async () => {
    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Map presence')).toBeInTheDocument();
    expect(await screen.findByText('7 days after your last check-in')).toBeInTheDocument();
    expect(screen.getByText('How long your heart pin keeps showing on the map after you stop opening cruush. Seven days by default.')).toBeInTheDocument();

    const presenceControl = screen.getByTestId('map-presence-duration');
    const presenceSlider = within(presenceControl).getByRole('slider');

    await waitFor(() => expect(presenceSlider).not.toHaveAttribute('data-disabled'));
    fireEvent.keyDown(presenceSlider, { key: 'ArrowRight' });

    await waitFor(() => expect(saveMyMapPresenceSettings).toHaveBeenCalledWith(14));
    expect(await screen.findByText('14 days after your last check-in')).toBeInTheDocument();
  });

  it('persists Ghost Mode and precise mutual location settings from the dedicated page', async () => {
    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
          <Route path="/privacy/audit" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Ghost Mode' })).toBeInTheDocument();
    expect(screen.getByText('Other people see a shifting location inside your selected radius. You still see your own current map position.')).toBeInTheDocument();
    expect(screen.getByText('Larger radius gives you more cover; smaller radius keeps your public pin closer to where you are.')).toBeInTheDocument();

    const preciseSwitch = await screen.findByRole('switch', {
      name: 'Toggle precise location for mutuals',
    });
    const ghostSwitch = screen.getByRole('switch', {
      name: 'Toggle Ghost Mode',
    });
    expect(ghostSwitch).toHaveAttribute('data-tutorial-target', 'ghost');

    await waitFor(() => expect(preciseSwitch).not.toBeDisabled());
    fireEvent.click(preciseSwitch);

    await waitFor(() => expect(saveMyPrivacySettings).toHaveBeenCalledWith(expect.objectContaining({
      baseMode: 'PUBLIC_PRECISE',
      ghostModeEnabled: false,
      ghostRadiusMeters: 1609,
      preciseLocationVisibility: 'mutual_cruushes',
      preciseToMutualCruushes: true,
    })));

    await waitFor(() => expect(ghostSwitch).not.toBeDisabled());
    fireEvent.click(ghostSwitch);

    await waitFor(() => expect(saveMyPrivacySettings).toHaveBeenLastCalledWith(expect.objectContaining({
      baseMode: 'GHOST',
      ghostModeEnabled: true,
      ghostRadiusMeters: 1609,
      preciseLocationVisibility: 'mutual_cruushes',
      preciseToMutualCruushes: true,
    })));

    fireEvent.click(screen.getByRole('button', { name: /Privacy Audit/i }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/privacy/audit');
  });

  it('restores the saved Ghost Mode setting after a failed save', async () => {
    saveMyPrivacySettings.mockRejectedValueOnce(new Error('Upgrade to cruush+ to share precise location with mutuals.'));

    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
        </Routes>
      </MemoryRouter>
    );

    const preciseSwitch = await screen.findByRole('switch', {
      name: 'Toggle precise location for mutuals',
    });
    await waitFor(() => expect(preciseSwitch).not.toBeDisabled());

    fireEvent.click(preciseSwitch);

    expect(await screen.findByText('Upgrade to cruush+ to share precise location with mutuals.')).toBeInTheDocument();
    expect(preciseSwitch).not.toBeChecked();
  });

  it('keeps v1.2 Ghost Mode static without V2 heartbeat controls', async () => {
    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Ghost Mode' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', {
      name: 'Show a countdown before your pin moves',
    })).not.toBeInTheDocument();
    expect(screen.queryByText('Countdown before you move')).not.toBeInTheDocument();
    expect(screen.queryByText(/heart beats faster/i)).not.toBeInTheDocument();
  });

  it('shows a ticking server-authoritative rotation countdown only while Ghost Mode is active', async () => {
    const nowMs = new Date('2026-08-12T20:00:00.000Z').getTime();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(nowMs);
    const originalSetInterval = window.setInterval.bind(window);
    let tickCountdown: (() => void) | undefined;
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler, delay, ...args) => {
      if (delay === 1_000 && typeof handler === 'function') {
        tickCountdown = handler;
        return 1;
      }

      return originalSetInterval(handler, delay, ...args);
    });
    getMyPrivacySettings.mockResolvedValue({
      baseMode: 'GHOST',
      ghostModeEnabled: true,
      ghostRadiusMeters: 1609,
      ghostRadiusLabel: '1 mi',
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: [],
      preciseLocationVisibility: 'none',
      updatedAtMs: Date.now(),
      ghostRotationExpiresAtMs: nowMs + 62_000,
    });

    try {
      render(
        <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
          <Routes>
            <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('Location rotates in 01:02')).toBeInTheDocument();

      nowSpy.mockReturnValue(nowMs + 1_000);
      act(() => tickCountdown?.());
      expect(screen.getByText('Location rotates in 01:01')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('switch', { name: 'Toggle Ghost Mode' }));
      await waitFor(() => {
        expect(screen.queryByText(/Location rotates in/)).not.toBeInTheDocument();
      });
    } finally {
      intervalSpy.mockRestore();
      nowSpy.mockRestore();
    }
  });

  it('keeps Ghost Mode and precise sharing available to basic members while linking locked Stealth Mode to cruush+', async () => {
    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
          <Route path="/rewards" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    const ghostSwitch = await screen.findByRole('switch', { name: 'Toggle Ghost Mode' });
    const preciseSwitch = screen.getByRole('switch', { name: 'Toggle precise location for mutuals' });
    await waitFor(() => {
      expect(ghostSwitch).not.toBeDisabled();
      expect(preciseSwitch).not.toBeDisabled();
    });

    expect(screen.queryByRole('switch', { name: 'Toggle Stealth Mode' })).not.toBeInTheDocument();
    expect(screen.getByText('Browse the map without appearing on it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Stealth Mode with cruush+' }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/rewards');
  });

  it('lets cruush+ members enable Stealth Mode without changing precise sharing', async () => {
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: true,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });

    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
        </Routes>
      </MemoryRouter>
    );

    const stealthSwitch = await screen.findByRole('switch', { name: 'Toggle Stealth Mode' });
    await waitFor(() => expect(stealthSwitch).not.toBeDisabled());
    fireEvent.click(stealthSwitch);

    await waitFor(() => expect(saveMyPrivacySettings).toHaveBeenLastCalledWith(expect.objectContaining({
      baseMode: 'STEALTH',
      ghostModeEnabled: false,
      preciseToMutualCruushes: false,
    })));
  });

  it.each([
    DEBUG_CRUUSH_PLUS_EVENT,
    CRUUSH_PLUS_CHANGED_EVENT,
  ])('locks Stealth Mode when %s reports that cruush+ ended', async (eventName) => {
    getMyPrivacySettings.mockResolvedValue({
      baseMode: 'STEALTH',
      ghostModeEnabled: false,
      preciseLocationVisibility: 'none',
    });
    getMyBillingStatus
      .mockResolvedValueOnce({
        cruushPlus: true,
        expiresAt: null,
        badges: [],
        processor: 'fake',
        testCheckout: true,
      })
      .mockResolvedValueOnce({
        cruushPlus: false,
        expiresAt: null,
        badges: [],
        processor: 'fake',
        testCheckout: true,
      });

    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('switch', { name: 'Toggle Stealth Mode' })).toBeChecked();

    window.dispatchEvent(new CustomEvent(eventName));

    expect(await screen.findByRole('button', { name: 'Unlock Stealth Mode with cruush+' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Toggle Stealth Mode' })).not.toBeInTheDocument();
    expect(getMyBillingStatus).toHaveBeenCalledTimes(2);
    expect(getMyPrivacySettings).toHaveBeenCalledTimes(2);
  });
});
