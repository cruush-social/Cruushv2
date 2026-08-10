import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import GhostModeSettings from './GhostModeSettings';

const {
  getMyPrivacySettings,
  saveMyPrivacySettings,
  getMyMapPresenceSettings,
  saveMyMapPresenceSettings,
  getMyGhostPulseSettings,
  saveMyGhostPulseSettings,
} = vi.hoisted(() => ({
  getMyPrivacySettings: vi.fn(),
  saveMyPrivacySettings: vi.fn(),
  getMyMapPresenceSettings: vi.fn(),
  saveMyMapPresenceSettings: vi.fn(),
  getMyGhostPulseSettings: vi.fn(),
  saveMyGhostPulseSettings: vi.fn(),
}));

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
    saveMyPrivacySettings.mockReset();
    getMyMapPresenceSettings.mockReset();
    saveMyMapPresenceSettings.mockReset();
    getMyGhostPulseSettings.mockReset();
    saveMyGhostPulseSettings.mockReset();

    getMyPrivacySettings.mockResolvedValue({
      ghostModeEnabled: false,
      preciseLocationVisibility: 'none',
    });
    saveMyPrivacySettings.mockImplementation((settings) => Promise.resolve(settings));
    getMyMapPresenceSettings.mockResolvedValue({ days: 7, minDays: 1, maxDays: 30 });
    saveMyMapPresenceSettings.mockImplementation((days: number) => Promise.resolve({
      days,
      minDays: 1,
      maxDays: 30,
    }));
    getMyGhostPulseSettings.mockResolvedValue({ enabled: true });
    saveMyGhostPulseSettings.mockImplementation((enabled: boolean) => Promise.resolve({ enabled }));
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
      name: 'Toggle precise location for mutual cruushes',
    });
    const ghostSwitch = screen.getByRole('switch', {
      name: 'Toggle Ghost Mode',
    });

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

  it('loads the V2 heartbeat countdown on by default and saves its independent toggle', async () => {
    render(
      <MemoryRouter initialEntries={['/privacy/ghost-mode']}>
        <Routes>
          <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
        </Routes>
      </MemoryRouter>
    );

    const pulseSwitch = await screen.findByRole('switch', {
      name: 'Show a countdown before your pin moves',
    });

    await waitFor(() => expect(pulseSwitch).toBeChecked());
    expect(screen.getByText('Others can see your last minute')).toBeInTheDocument();
    fireEvent.click(pulseSwitch);

    await waitFor(() => expect(saveMyGhostPulseSettings).toHaveBeenCalledWith(false));
    expect(await screen.findByText('Your pin moves without warning')).toBeInTheDocument();
  });
});
