import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HANKY_COLORS } from './HankyFrame';
import BadgePickerPreview from './BadgePickerPreview';

const { getMyPrivacySettings, getMyProfile, saveMySideBadges } = vi.hoisted(() => ({
  getMyPrivacySettings: vi.fn(),
  getMyProfile: vi.fn(),
  saveMySideBadges: vi.fn(),
}));

vi.mock('../lib/privacyApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/privacyApi')>('../lib/privacyApi');
  return { ...actual, getMyPrivacySettings };
});

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');
  return { ...actual, getMyProfile, saveMySideBadges };
});

describe('BadgePickerPreview', () => {
  beforeEach(async () => {
    const { DEFAULT_PRIVACY_SETTINGS } = await import('../lib/privacyApi');
    const { emptyProfilePayload, emptySideBadges } = await import('../lib/profileApi');
    getMyPrivacySettings.mockResolvedValue(DEFAULT_PRIVACY_SETTINGS);
    getMyProfile.mockResolvedValue({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      side_badges: emptySideBadges,
    });
    saveMySideBadges.mockResolvedValue(emptySideBadges);
  });

  it('keeps removed and color labels out of the picker', async () => {
    render(
      <MemoryRouter>
        <BadgePickerPreview embedded />
      </MemoryRouter>
    );

    await screen.findByText('What this side says');
    fireEvent.click(screen.getByRole('button', { name: 'Acts' }));
    expect(screen.getByText('Frotting')).toBeInTheDocument();
    expect(screen.queryByText('Frottage')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hanky code' }));
    const optionLabels = screen.getAllByRole('button').map((button) => button.textContent?.trim().toLowerCase());
    HANKY_COLORS.forEach((hanky) => {
      expect(optionLabels).not.toContain(hanky.label.toLowerCase());
    });
  });
});
