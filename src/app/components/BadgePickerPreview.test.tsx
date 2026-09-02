import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HANKY_COLORS } from './HankyFrame';
import BadgePickerPreview, { BADGE_OPTIONS } from './BadgePickerPreview';
import { resolveSavedBadgeGlyph } from './SavedBadgeGlyphs';

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

  it('keeps removed groups and color labels out of the picker', async () => {
    render(
      <MemoryRouter>
        <BadgePickerPreview embedded />
      </MemoryRouter>
    );

    await screen.findByText('What this side says');
    const groupSelect = screen.getByRole('combobox', { name: 'Badge category' });
    expect(Array.from(groupSelect.querySelectorAll('option'), (option) => option.textContent)).not.toContain('Acts');
    fireEvent.change(groupSelect, { target: { value: 'Hanky code' } });
    const optionLabels = screen.getAllByRole('button').map((button) => button.textContent?.trim().toLowerCase());
    HANKY_COLORS.forEach((hanky) => {
      expect(optionLabels).not.toContain(hanky.label.toLowerCase());
    });
  });

  it('marks every Pride flag badge as full-frame artwork', () => {
    const flagIds = BADGE_OPTIONS.filter((option) => option.id.startsWith('flag-')).map((option) => option.id);

    expect(flagIds.length).toBeGreaterThan(10);
    flagIds.forEach((flagId) => expect(resolveSavedBadgeGlyph(flagId).fillsFrame).toBe(true));
  });
});
