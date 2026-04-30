import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileView from './ProfileView';

const { getMyProfile, getProfileById } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  getProfileById: vi.fn(),
}));

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');

  return {
    ...actual,
    getMyProfile,
    getProfileById,
  };
});

describe('ProfileView', () => {
  beforeEach(() => {
    getMyProfile.mockReset();
    getProfileById.mockReset();

    getProfileById.mockResolvedValue({
      id: 'user-1',
      display_name: 'Jordan',
      photos: [],
      bio: 'Out and about tonight.',
      pronouns: ['they/them'],
      custom_pronouns: '',
      year_of_birth: 1998,
      ethnicity: 'Latinx',
      identities: ['Non-binary'],
      presentation: ['Femme'],
      sexuality: ['Queer'],
      body_type: ['Athletic'],
      height: "5'8\"",
      weight: '155 lbs',
      position: ['Vers'],
      availability: ['Now'],
      hosting_travel: ['Hosting'],
      kinks: ['Leather'],
      vibes: ['Playful'],
      hobbies: ['Hiking'],
      custom_hobby: '',
      looking_for: ['Dates'],
      hiv_status: ['Negative'],
      custom_hiv_status: '',
      condoms: ['Always'],
      custom_condoms: '',
      prep: ['Daily'],
      custom_prep: '',
      doxypep: [],
      custom_doxypep: '',
      covid_vaccine: [],
      custom_covid_vaccine: '',
      mpox_vaccine: ['Vaccinated'],
      custom_mpox_vaccine: '',
      smoking: ['Never'],
      custom_smoking: '',
      drinking: ['Socially'],
      custom_drinking: '',
      drugs: ['No'],
      custom_drugs: '',
      weed: ['Occasionally'],
      custom_weed: '',
      updated_at: '2026-04-29T12:00:00.000Z',
    });
  });

  it('uses a 4:5 hero and exposes Basics, Intimacy, and Health tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('profile-hero-media')).toHaveStyle({ aspectRatio: '4 / 5' });
    expect(screen.getByRole('tab', { name: 'Basics' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Intimacy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Health' })).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(getProfileById).toHaveBeenCalledWith('user-1');
  });
});
