import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import GhostModeSettings from './GhostModeSettings';

const { getMyPrivacySettings, saveMyPrivacySettings } = vi.hoisted(() => ({
  getMyPrivacySettings: vi.fn(),
  saveMyPrivacySettings: vi.fn(),
}));

vi.mock('../lib/privacyApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/privacyApi')>('../lib/privacyApi');

  return {
    ...actual,
    getMyPrivacySettings,
    saveMyPrivacySettings,
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

    getMyPrivacySettings.mockResolvedValue({
      ghostModeEnabled: false,
      preciseLocationVisibility: 'none',
    });
    saveMyPrivacySettings.mockImplementation((settings) => Promise.resolve(settings));
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
});
