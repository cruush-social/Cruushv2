import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapProfilePopup from './MapProfilePopup';

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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('MapProfilePopup', () => {
  beforeEach(() => {
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

  it('opens the full profile from a map preview', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route
            path="/map"
            element={(
              <>
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
                <LocationProbe />
              </>
            )}
          />
          <Route path="/profile/:userId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View profile' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile/user-1');
  });
});
