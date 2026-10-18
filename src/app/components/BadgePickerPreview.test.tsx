import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HANKY_COLORS } from './HankyFrame';
import BadgePickerPreview, { BADGE_OPTIONS } from './BadgePickerPreview';
import { createSavedMapMarkerBadge, createMapMarkerRoleBadge } from '../lib/mapMarkers';
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

  it('does not render a role fallback when no badge was explicitly saved', () => {
    expect(createSavedMapMarkerBadge(null, createMapMarkerRoleBadge(['switch']))).toBeNull();
    expect(createSavedMapMarkerBadge({ badge_id: 'switch', intent: 'none', frame: 'circle' }, null)?.badgeId).toBe('switch');
  });

  it('does not preselect profile role or position, but restores explicit saved badges', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');
    getMyProfile.mockResolvedValue({ ...emptyProfilePayload, role: ['switch'], position: ['top'] });
    const view = render(<MemoryRouter><BadgePickerPreview embedded /></MemoryRouter>);
    await waitFor(() => expect(getMyProfile).toHaveBeenCalled());
    await screen.findByText('What this side says');
    expect(screen.queryByRole('img', { name: /^switch$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^top$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^dominant$/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Empty')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Role', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Position', exact: true })).toBeInTheDocument();
    view.unmount();
    getMyProfile.mockResolvedValue({ ...emptyProfilePayload, side_badges: { left: { badge_id: 'switch', intent: 'none', frame: 'circle' }, right: null } });
    render(<MemoryRouter><BadgePickerPreview embedded /></MemoryRouter>);
    expect(await screen.findByRole('img', { name: /^switch$/i })).toBeInTheDocument();
  });

  it('keeps removed groups and color labels out of the picker', async () => {
    render(
      <MemoryRouter>
        <BadgePickerPreview embedded />
      </MemoryRouter>
    );

    await screen.findByText('What this side says');
    expect(screen.queryByRole('combobox', { name: 'Badge category' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hanky code' }));
    const optionLabels = screen.getAllByRole('button').map((button) => button.textContent?.trim().toLowerCase());
    HANKY_COLORS.forEach((hanky) => {
      expect(optionLabels).not.toContain(hanky.label.toLowerCase());
    });
  });

  it('masks an explicit profile photo in the badge heart when DL Mode is active', async () => {
    const { emptyProfilePayload, emptySideBadges } = await import('../lib/profileApi');
    getMyProfile.mockResolvedValue({
      ...emptyProfilePayload,
      id: 'user-1',
      photos: ['/nsfw-profile-photo.jpg'],
      photo_metadata: [{ url: '/nsfw-profile-photo.jpg', explicit: true }],
      side_badges: emptySideBadges,
    });

    render(
      <MemoryRouter>
        <BadgePickerPreview embedded dlModeActive />
      </MemoryRouter>
    );

    const placeholder = await screen.findByTestId('dl-mode-photo-placeholder');
    const heart = placeholder.closest('svg');
    expect(heart).not.toBeNull();
    expect(heart?.querySelector('pattern image')).toBeNull();
  });

  it('keeps every Pride flag badge at the normal icon scale', () => {
    const flagIds = BADGE_OPTIONS.filter((option) => option.id.startsWith('flag-')).map((option) => option.id);

    expect(flagIds.length).toBeGreaterThan(10);
    flagIds.forEach((flagId) => expect(resolveSavedBadgeGlyph(flagId).fillsFrame).toBe(false));
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
    fireEvent.click(screen.getByRole('button', { name: 'Kinks' }));

    const search = await screen.findByRole('searchbox', { name: 'Search Kinks icons' });
    expect(screen.getByText('Leather boot')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'boot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Leather boot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit left badge title' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Badge label' }), { target: { value: 'abcdefghijk' } });

    expect(screen.getByRole('textbox', { name: 'Badge label' })).toHaveValue('abcdefghij');
    expect(screen.queryByLabelText('Selected')).not.toBeInTheDocument();
  });

  it('lists every available Vibe pool icon once with its label', async () => {
    render(
      <MemoryRouter>
        <BadgePickerPreview embedded />
      </MemoryRouter>
    );

    await screen.findByText('What this side says');
    fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));

    expect(await screen.findByRole('button', { name: 'Disco ball' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Doll' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bimbo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leather boot' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Raver' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Disco ball' })).toHaveTextContent('Disco ball');
  });

  it('keeps the requested pool labels while omitting removed icon choices', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        icons: url.includes('kink-')
          ? [
              { id: 'cock', label: 'Penis', iconCategory: 'Body', file: 'cock.png' },
              { id: 'boobs', label: 'Breast', iconCategory: 'Body', file: 'boobs.png' },
              { id: 'clamp', label: 'Clamp', iconCategory: 'Gear', file: 'clamp.png' },
              { id: 'bodysuit', label: 'Bodysuit / catsuit reference', iconCategory: 'Gear', file: 'bodysuit.png' },
            ]
          : [
              { id: 'handcuffs', label: 'Handcuffs sex police', iconCategory: 'Objects', file: 'handcuffs.png' },
              { id: 'duplicate-handcuffs', label: 'Handcuffs sex police', iconCategory: 'Objects', file: 'handcuffs-duplicate.png' },
              { id: 'clamp', label: 'Clamp', iconCategory: 'Objects', file: 'clamp.png' },
            ],
      }),
    })));

    render(
      <MemoryRouter>
        <BadgePickerPreview embedded />
      </MemoryRouter>
    );

    await screen.findByText('What this side says');
    fireEvent.click(screen.getByRole('button', { name: 'Kinks' }));
    expect(await screen.findByRole('button', { name: 'Cock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Boobs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clamp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bodysuit / catsuit reference' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));
    expect(await screen.findByRole('button', { name: 'Handcuffs' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Handcuffs' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Clamp' })).not.toBeInTheDocument();
  });
});
