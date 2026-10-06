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
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        icons: url.includes('kink-')
          ? [{ id: 'kink-1', label: 'Leather boot', iconCategory: 'Clothing', file: 'kink-options-source/assets/boot.png' }]
          : [{ id: 'vibe-1', label: 'Disco ball', iconCategory: 'Objects', file: 'kink-options-source/assets/disco.png' }],
      }),
    })));
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
    for (const flagId of flagIds) {
      const Glyph = resolveSavedBadgeGlyph(flagId).icon;
      const { container, unmount } = render(<Glyph />);
      expect(container.querySelector('circle[stroke="currentColor"]')).toBeNull();
      unmount();
    }
  });

  it('uses the selected Kink pool without requiring profile Kinks and saves a short per-side title', async () => {
    render(
      <MemoryRouter>
        <BadgePickerPreview embedded />
      </MemoryRouter>
    );

    await screen.findByText('What this side says');
    fireEvent.change(screen.getByRole('combobox', { name: 'Badge category' }), { target: { value: 'Kinks' } });

    const search = await screen.findByRole('searchbox', { name: 'Search Kinks icons' });
    expect(screen.getByText('Leather boot')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'boot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Leather boot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit badge title' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Badge title' }), { target: { value: 'abcdefghijk' } });

    expect(screen.getByRole('textbox', { name: 'Badge title' })).toHaveValue('abcdefghij');
    expect(screen.getAllByLabelText('Selected')).toHaveLength(1);
  });

  it('keeps the classic Vibe icons alongside the new Vibe pool', async () => {
    render(
      <MemoryRouter>
        <BadgePickerPreview embedded />
      </MemoryRouter>
    );

    await screen.findByText('What this side says');
    fireEvent.change(screen.getByRole('combobox', { name: 'Badge category' }), { target: { value: 'Vibes' } });

    expect(await screen.findByRole('button', { name: 'Disco ball' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Doll' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bimbo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leather boot' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raver' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Doll' }).querySelector('span[style*="mask-image"]')).not.toBeNull();
  });
});
