import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CruushMatchSettings from './CruushMatchSettings';

const {
  getCruushMatchSettings,
  saveCruushMatchSettings,
  getMyPrivacySettings,
  saveMyPrivacySettings,
} = vi.hoisted(() => ({
  getCruushMatchSettings: vi.fn(),
  saveCruushMatchSettings: vi.fn(),
  getMyPrivacySettings: vi.fn(),
  saveMyPrivacySettings: vi.fn(),
}));

vi.mock('../lib/cruushSettingsApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/cruushSettingsApi')>('../lib/cruushSettingsApi');

  return {
    ...actual,
    getCruushMatchSettings,
    saveCruushMatchSettings,
  };
});

vi.mock('../lib/privacyApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/privacyApi')>('../lib/privacyApi');

  return {
    ...actual,
    getMyPrivacySettings,
    saveMyPrivacySettings,
  };
});

describe('CruushMatchSettings', () => {
  beforeEach(() => {
    getCruushMatchSettings.mockReset();
    saveCruushMatchSettings.mockReset();
    getMyPrivacySettings.mockReset();
    saveMyPrivacySettings.mockReset();

    getCruushMatchSettings.mockResolvedValue({
      nsfwMessageVisibility: 'mutual_cruushes',
      nsfwSendVisibility: 'mutual_cruushes',
      updatedAt: null,
    });
    saveCruushMatchSettings.mockImplementation((settings) => Promise.resolve({
      ...settings,
      updatedAt: '2026-07-31T05:57:00.000Z',
    }));
    getMyPrivacySettings.mockResolvedValue({
      baseMode: 'PUBLIC_PRECISE',
      ghostModeEnabled: false,
      ghostRadiusMeters: 1609,
      ghostRadiusLabel: '1 mi',
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: [],
      preciseLocationVisibility: 'none',
      updatedAtMs: 0,
    });
    saveMyPrivacySettings.mockImplementation((settings) => Promise.resolve(settings));
  });

  it('renders and saves mutual crowd NSFW options', async () => {
    render(
      <MemoryRouter>
        <CruushMatchSettings />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'cruush match settings' })).toBeInTheDocument();
    expect(screen.getAllByText('Mutual crowds')).toHaveLength(2);
    expect(screen.getAllByText('Only people who share one of your crowds may exchange NSFW photos.')).toHaveLength(2);

    fireEvent.click(screen.getAllByText('Mutual crowds')[0].closest('button') as HTMLButtonElement);

    await waitFor(() => expect(saveCruushMatchSettings).toHaveBeenCalledWith({
      nsfwMessageVisibility: 'mutual_crowds',
      nsfwSendVisibility: 'mutual_cruushes',
      updatedAt: null,
    }));
  });
});
