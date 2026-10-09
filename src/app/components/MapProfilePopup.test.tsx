import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapProfilePopup from './MapProfilePopup';

const { serviceArea } = vi.hoisted(() => ({ serviceArea: { profilePinsAllowed: false } }));
vi.mock('./MapServiceAreaContext', () => ({ useMapServiceArea: () => serviceArea }));
import {
  DISTANCE_PREFERENCES_CHANGED_EVENT,
  DISTANCE_PREFERENCES_STORAGE_KEY,
  type DistanceDisplayMode,
} from '../lib/distancePreferences';

// cb5de40 made a precise preference wait for server acceptance before it is
// cached, so a unit test cannot reach the precise label through
// saveDistancePreferences. This mirrors what the module does once the server
// has accepted a mode, which is what the display actually reacts to.
function applyAcceptedDistanceMode(mode: DistanceDisplayMode) {
  window.localStorage.setItem(DISTANCE_PREFERENCES_STORAGE_KEY, JSON.stringify({ mode }));
  window.dispatchEvent(new CustomEvent(DISTANCE_PREFERENCES_CHANGED_EVENT, { detail: { mode } }));
}

const { embeddedSavedProfile } = vi.hoisted(() => ({
  embeddedSavedProfile: {
    current: null as any,
  },
}));

const { getMyProfile, getProfileById } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  getProfileById: vi.fn(),
}));

const { sendCruush } = vi.hoisted(() => ({
  sendCruush: vi.fn(),
}));

const { openConversationOrInbox } = vi.hoisted(() => ({
  openConversationOrInbox: vi.fn(),
}));

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');

  return {
    ...actual,
    getMyProfile,
    getProfileById,
  };
});

vi.mock('../lib/cruushApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/cruushApi')>('../lib/cruushApi');

  return {
    ...actual,
    sendCruush,
  };
});

vi.mock('../lib/openConversation', () => ({
  openConversationOrInbox,
}));

vi.mock('./ProfileEdit', () => ({
  default: ({ onSaved }: { onSaved?: (profile: any) => void }) => (
    <button type="button" onClick={() => onSaved?.(embeddedSavedProfile.current)}>
      Save embedded edit
    </button>
  ),
}));

describe('MapProfilePopup', () => {
  beforeEach(() => {
    serviceArea.profilePinsAllowed = false;
    window.localStorage.removeItem('cruush:distance-preference');
    getMyProfile.mockReset();
    getProfileById.mockReset();
    sendCruush.mockReset();
    openConversationOrInbox.mockReset();

    getProfileById.mockResolvedValue({
      id: 'user-1',
      display_name: 'River',
      photos: [],
      bio: '',
      pronouns: ['they/them'],
      year_of_birth: 1998,
      identities: ['Queer'],
      presentation: [],
      sexuality: [],
      body_type: [],
      height: '',
      weight: '',
      is_trans: null,
      crowds: [],
      position: [],
      role: [],
      looking_for: [],
      availability: [],
      hosting_travel: [],
      vibes: [],
      scenes: [],
      archetypes: [],
      kinks: [],
      hobbies: [],
      condoms: [],
      prep: [],
      doxypep: [],
      hiv_status: [],
      mpox_vaccine: [],
      substance_boundaries: [],
      viewer_relationship: {
        match_id: null,
        mutual_cruush: false,
        outgoing_cruush: false,
        can_message: false,
        can_reveal_precise_location: false,
      },
    });
  });

  it('shows the server-owned Purgatory badge beside the existing MHC badge', async () => {
    const profile = await getProfileById();
    getProfileById.mockResolvedValue({ ...profile, outOfSight: true, travelling: true });
    render(<MemoryRouter><MapProfilePopup user={{ id: 'user-1', name: 'River' }} onClose={vi.fn()} /></MemoryRouter>);
    const badge = await screen.findByRole('button', { name: 'This is a Purgatory member.' });
    expect(screen.getByRole('img', { name: 'Mile High Club' })).toBeInTheDocument();
    fireEvent.click(badge);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('currently outside cruush’s service area');
  });

  it('does not carry Purgatory membership into the next popup while its profile loads', async () => {
    const profile = await getProfileById();
    getProfileById.mockResolvedValueOnce({ ...profile, outOfSight: true });
    const props = { user: { id: 'user-1', name: 'River' }, onClose: vi.fn() };
    const { rerender } = render(<MemoryRouter><MapProfilePopup {...props} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'This is a Purgatory member.' });
    let resolveProfile!: (resolvedProfile: typeof profile) => void;
    getProfileById.mockReturnValueOnce(new Promise((resolve) => { resolveProfile = resolve; }));
    rerender(<MemoryRouter><MapProfilePopup {...props} user={{ id: 'user-2', name: 'Jordan' }} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'This is a Purgatory member.' })).not.toBeInTheDocument();
    await act(async () => { resolveProfile({ ...profile, id: 'user-2', outOfSight: false }); });
    expect(screen.queryByRole('button', { name: 'This is a Purgatory member.' })).not.toBeInTheDocument();
  });

  it('keeps a mutually permitted popup pin dark on mobile OOS and restores it in service area', async () => {
    const profile = await getProfileById();
    getProfileById.mockResolvedValue({ ...profile, viewer_relationship: { ...profile.viewer_relationship, mutual_cruush: true, can_reveal_precise_location: true } });
    const props = { user: { id: 'user-1', name: 'River', relationship: { mutualCruush: true } }, onClose: vi.fn() };
    const { rerender } = render(<MemoryRouter><MapProfilePopup {...props} /></MemoryRouter>);
    const blocked = await screen.findByRole('button', { name: 'Map location unavailable' });
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAttribute('title', 'Map location unavailable');
    expect(blocked).toHaveStyle({ background: 'var(--cruush-gradient-soft-28), #0A0A12' });
    expect(blocked.style.getPropertyValue('--profile-center-pin-mobile-background')).toBe('var(--cruush-gradient-soft-28), #0A0A12');

    serviceArea.profilePinsAllowed = true;
    rerender(<MemoryRouter><MapProfilePopup {...props} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Center the map on River' })).toBeEnabled();
  });

  it('keeps desktop profile tabs in normal flow without a redundant full-profile button', async () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapProfilePopup
          user={{
            id: 'user-1',
            name: 'River',
            age: 28,
            pronouns: 'they/them',
            distance: '0.4 mi',
            lastActive: 'now',
            photo: null,
            badges: [],
            relationship: {
              canMessage: false,
            },
          }}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'View profile' })).not.toBeInTheDocument();
    const tabs = await screen.findByRole('tablist');
    expect(tabs.parentElement?.parentElement).toHaveClass('[&_[role=tablist]]:static', '[&_[role=tablist]]:z-auto');
    expect(tabs.parentElement?.parentElement).toHaveClass('[&_[id$=-content-intimacy]>.grid]:grid-cols-1');
    // cb5de40 made the approximate label strictly nonnumeric, so 0.4 mi reads
    // as Nearby rather than a rounded ~0.5 mi. Precise still shows the number.
    expect(screen.getByText('Nearby')).toBeInTheDocument();
    expect(screen.queryByText('0.4 mi')).not.toBeInTheDocument();
    act(() => applyAcceptedDistanceMode('precise'));
    expect(screen.getByText('0.4 mi')).toBeInTheDocument();
    act(() => applyAcceptedDistanceMode('approximate'));
    expect(screen.getByText('Nearby')).toBeInTheDocument();
    expect(screen.queryByText('0.4 mi')).not.toBeInTheDocument();
  });

  it('updates the own-profile data without closing the embedded editor after save', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');
    const onProfileSaved = vi.fn();
    const initialProfile = {
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'River',
      pronouns: ['they/them'],
      year_of_birth: 1998,
      photos: [],
      photo_metadata: [],
      updated_at: '2026-07-31T05:00:00.000Z',
    };
    const savedProfile = {
      ...initialProfile,
      display_name: 'Updated River',
      pronouns: ['he/him'],
      year_of_birth: 1996,
    };
    embeddedSavedProfile.current = savedProfile;
    getMyProfile.mockResolvedValue(initialProfile);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapProfilePopup
          user={{
            id: 'user-1',
            name: 'River',
            age: 28,
            pronouns: 'they/them',
            distance: 'You',
            lastActive: 'Now',
            photo: null,
            badges: [],
            isCurrentUser: true,
          }}
          onClose={vi.fn()}
          isOwnProfile
          onProfileSaved={onProfileSaved}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('River')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save embedded edit' }));

    expect(onProfileSaved).toHaveBeenCalledWith(expect.objectContaining({
      id: 'user-1',
      display_name: 'Updated River',
    }));
    expect(screen.getByRole('button', { name: 'Save embedded edit' })).toBeInTheDocument();
  });
});
