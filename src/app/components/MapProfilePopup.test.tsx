import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapProfilePopup from './MapProfilePopup';
import { saveDistancePreferences } from '../lib/distancePreferences';

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
    expect(screen.getByText('~0.5 mi')).toBeInTheDocument();
    act(() => saveDistancePreferences({ mode: 'precise' }));
    expect(screen.getByText('0.4 mi')).toBeInTheDocument();
    act(() => saveDistancePreferences({ mode: 'approximate' }));
    expect(screen.getByText('~0.5 mi')).toBeInTheDocument();
  });

  it('updates the desktop own-profile preview immediately after an embedded save', async () => {
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
    expect(await screen.findByText('Updated River')).toBeInTheDocument();
    expect(screen.getByText('he/him')).toBeInTheDocument();
  });
});
