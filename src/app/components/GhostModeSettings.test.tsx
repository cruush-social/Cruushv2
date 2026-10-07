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
  getMyGhostPulseSettings,
  saveMyGhostPulseSettings,
} = vi.hoisted(() => ({
  getMyBillingStatus: vi.fn(),
  getMyPrivacySettings: vi.fn(),
  saveMyPrivacySettings: vi.fn(),
  getMyMapPresenceSettings: vi.fn(),
  saveMyMapPresenceSettings: vi.fn(),
  getMyGhostPulseSettings: vi.fn(),
  saveMyGhostPulseSettings: vi.fn(),
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
    getMyGhostPulseSettings,
    saveMyGhostPulseSettings,
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
    getMyGhostPulseSettings.mockReset();
    saveMyGhostPulseSettings.mockReset();

    getMyGhostPulseSettings.mockResolvedValue({ enabled: true });
    saveMyGhostPulseSettings.mockImplementation((enabled: boolean) => Promise.resolve({ enabled }));

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

  it('sends map presence to its own page instead of repeating the control', async () => {
    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
          <Route path="/privacy/map-presence" element={<p>Map presence page</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Map presence')).toBeInTheDocument();
    expect(screen.queryByTestId('map-presence-duration')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('map-presence-link'));

    expect(await screen.findByText('Map presence page')).toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { name: /Dark Room Mode/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Your real pin is hidden\. Only a decoy pin is visible/)).toBeInTheDocument();
    expect(screen.getByText(/visible decoy pin moves around in/)).toBeInTheDocument();

    expect(screen.getByText('Who can see my precise location?')).toBeInTheDocument();
    expect(screen.queryByText('Precise location for mutual crowds')).not.toBeInTheDocument();

    const mutualsButton = await screen.findByRole('button', { name: 'Cruushes' });
    const ghostSwitch = screen.getByRole('switch', {
      name: 'Toggle Ghost Mode',
    });
    expect(ghostSwitch).toHaveAttribute('data-tutorial-target', 'ghost');

    await waitFor(() => expect(mutualsButton).not.toBeDisabled());
    fireEvent.click(mutualsButton);

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

  it('shows live Ghost radius save progress and only reports Saved after confirmation', async () => {
    let resolveSave: ((value: unknown) => void) | undefined;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    saveMyPrivacySettings.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));

    try {
      render(
        <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
          <Routes>
            <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
          </Routes>
        </MemoryRouter>
      );

      const radiusSlider = await screen.findByRole('slider');
      await waitFor(() => expect(radiusSlider).not.toBeDisabled());
      expect(screen.queryByText('Saved')).not.toBeInTheDocument();

      fireEvent.keyDown(radiusSlider, { key: 'ArrowRight', code: 'ArrowRight' });

      expect(await screen.findByText('Saving…')).toBeInTheDocument();
      expect(saveMyPrivacySettings).toHaveBeenCalledWith(expect.objectContaining({
        ghostRadiusMeters: 4828,
        ghostRadiusLabel: '3 mi',
      }));

      act(() => resolveSave?.({
        baseMode: 'PUBLIC_PRECISE',
        ghostModeEnabled: false,
        ghostRadiusMeters: 4828,
        ghostRadiusLabel: '3 mi',
        preciseToMutualCruushes: false,
        preciseToMutualCrowds: [],
        preciseLocationVisibility: 'none',
        updatedAtMs: Date.now(),
      }));

      expect(await screen.findByText('Saved')).toBeInTheDocument();
      expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1_800);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('asks before turning off Ghost Mode for Public precise location', async () => {
    getMyPrivacySettings.mockResolvedValue({
      baseMode: 'GHOST',
      ghostModeEnabled: true,
      ghostRadiusMeters: 1609,
      ghostRadiusLabel: '1 mi',
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: [],
      preciseLocationVisibility: 'none',
      updatedAtMs: Date.now(),
    });

    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
        </Routes>
      </MemoryRouter>
    );

    const publicButton = await screen.findByRole('button', { name: 'Public' });
    await waitFor(() => expect(publicButton).not.toBeDisabled());
    fireEvent.click(publicButton);

    let dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Turn off Ghost Mode?' })).toBeInTheDocument();
    expect(within(dialog).getByText('Public means your precise location appears on the public map.')).toBeInTheDocument();
    expect(saveMyPrivacySettings).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep Ghost Mode' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(saveMyPrivacySettings).not.toHaveBeenCalled();

    fireEvent.click(publicButton);
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off Ghost Mode' }));

    await waitFor(() => expect(saveMyPrivacySettings).toHaveBeenCalledWith(expect.objectContaining({
      baseMode: 'PUBLIC_PRECISE',
      ghostModeEnabled: false,
    })));
  });

  it('restores the saved Ghost Mode setting after a failed save', async () => {
    saveMyPrivacySettings.mockRejectedValueOnce(new Error('Upgrade to cruush+ to share precise location with cruushes.'));

    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
        </Routes>
      </MemoryRouter>
    );

    const mutualsButton = await screen.findByRole('button', { name: 'Cruushes' });
    await waitFor(() => expect(mutualsButton).not.toBeDisabled());

    fireEvent.click(mutualsButton);

    expect(await screen.findByText('Upgrade to cruush+ to share precise location with cruushes.')).toBeInTheDocument();
    expect(mutualsButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers the pin countdown as an opt-out that starts on', async () => {
    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Ghost Mode' })).toBeInTheDocument();
    expect(screen.getByText('Countdown animation')).toBeInTheDocument();

    const countdownToggle = await screen.findByRole('switch', {
      name: 'Show a countdown before your pin moves',
    });

    // The countdown announces "this profile is about to relocate", so it is a
    // setting rather than fixed behaviour, and it is on unless someone opts out.
    await waitFor(() => expect(countdownToggle).toBeChecked());

    fireEvent.click(countdownToggle);

    await waitFor(() => expect(saveMyGhostPulseSettings).toHaveBeenCalledWith(false));
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

  it('keeps Ghost Mode and precise sharing available to basic members while linking locked Dark Room to cruush+', async () => {
    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
          <Route path="/rewards" element={<LocationProbe />} />
          <Route path="/store" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    const ghostSwitch = await screen.findByRole('switch', { name: 'Toggle Ghost Mode' });
    const mutualsButton = screen.getByRole('button', { name: 'Cruushes' });
    await waitFor(() => {
      expect(ghostSwitch).not.toBeDisabled();
      expect(mutualsButton).not.toBeDisabled();
    });

    expect(screen.queryByRole('switch', { name: 'Toggle Dark Room' })).not.toBeInTheDocument();
    expect(screen.getByText('Browse the map without appearing on it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Dark Room with cruush+' }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/store');
  });

  it('lets cruush+ members enable Dark Room without changing precise sharing', async () => {
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

    const stealthSwitch = await screen.findByRole('switch', { name: 'Toggle Dark Room' });
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
  ])('locks Dark Room when %s reports that cruush+ ended', async (eventName) => {
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

    expect(await screen.findByRole('switch', { name: 'Toggle Dark Room' })).toBeChecked();

    window.dispatchEvent(new CustomEvent(eventName));

    expect(await screen.findByRole('button', { name: 'Unlock Dark Room with cruush+' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Toggle Dark Room' })).not.toBeInTheDocument();
    expect(getMyBillingStatus).toHaveBeenCalledTimes(2);
    expect(getMyPrivacySettings).toHaveBeenCalledTimes(2);
  });
});
