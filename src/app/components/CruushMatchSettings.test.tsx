import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      messageVisibility: 'mutual_cruushes',
      nsfwMessageVisibility: 'public',
      nsfwSendVisibility: 'public',
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

  it('renders and saves message permission options', async () => {
    render(
      <MemoryRouter>
        <CruushMatchSettings />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'message settings' })).toBeInTheDocument();
    expect(screen.getByText('Mutuals')).toBeInTheDocument();
    expect(screen.getByText('Only mutual cruushes can start a chat. This is the default.')).toBeInTheDocument();
    expect(screen.getByText('Crowd')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Crowd').closest('button') as HTMLButtonElement);

    await waitFor(() => expect(saveCruushMatchSettings).toHaveBeenCalledWith({
      messageVisibility: 'mutual_crowds',
      nsfwMessageVisibility: 'public',
      nsfwSendVisibility: 'public',
    }));
  });

  it('keeps the latest message visibility selection when save responses resolve out of order', async () => {
    const resolveQueue: Array<() => void> = [];
    saveCruushMatchSettings.mockImplementation((settings) => new Promise((resolve) => {
      resolveQueue.push(() => resolve({
        ...settings,
        updatedAt: '2026-07-31T05:57:00.000Z',
      }));
    }));

    render(
      <MemoryRouter>
        <CruushMatchSettings />
      </MemoryRouter>,
    );

    const publicButton = await screen.findByRole('button', { name: /^Public/i });
    const crowdButton = screen.getByRole('button', { name: /^Crowd/i });

    fireEvent.click(publicButton);
    fireEvent.click(crowdButton);

    expect(resolveQueue).toHaveLength(2);

    await act(async () => {
      resolveQueue[1]();
    });

    await waitFor(() => expect(crowdButton).toHaveClass('border-primary/45'));

    await act(async () => {
      resolveQueue[0]();
    });

    await waitFor(() => {
      expect(crowdButton).toHaveClass('border-primary/45');
      expect(publicButton).not.toHaveClass('border-primary/45');
    });
  });
});
