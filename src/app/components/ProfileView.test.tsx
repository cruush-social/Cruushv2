import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileView from './ProfileView';

const { sendCruush } = vi.hoisted(() => ({
  sendCruush: vi.fn(),
}));

const { getMyProfile, getProfileById } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  getProfileById: vi.fn(),
}));

const { toastSuccess, toastError, toastInfo } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
    info: toastInfo,
  },
}));

vi.mock('../lib/cruushApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/cruushApi')>('../lib/cruushApi');

  return {
    ...actual,
    sendCruush,
  };
});

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');

  return {
    ...actual,
    getMyProfile,
    getProfileById,
  };
});

function createProfileFixture(overrides: Record<string, unknown> = {}) {
  return {
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
    role: ['Switch'],
    crowds: [],
    availability: ['Now'],
    hosting_travel: ['Hosting'],
    kinks: ['Leather'],
    kink_interests: [{
      kink_id: 'leather',
      label: 'Leather',
    }],
    kinks_visibility: 'public',
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
    substance_boundaries: ['No alcohol involved', "Let's discuss"],
    updated_at: '2026-04-29T12:00:00.000Z',
    ...overrides,
  };
}

describe('ProfileView', () => {
  beforeEach(() => {
    sendCruush.mockReset();
    getMyProfile.mockReset();
    getProfileById.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    toastInfo.mockReset();

    getProfileById.mockResolvedValue(createProfileFixture());
    sendCruush.mockResolvedValue({
      id: 'cruush-1',
      fromUserId: 'me',
      toUserId: 'user-1',
      createdAt: '2026-04-29T12:00:00.000Z',
      mutual: true,
      permissions: {
        matchId: 'match-1',
        canMessage: true,
        canRevealPreciseLocation: false,
      },
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
    expect(screen.queryByText('Crowds')).not.toBeInTheDocument();
    const intimacyTab = screen.getByRole('tab', { name: 'Intimacy' });
    fireEvent.pointerDown(intimacyTab, { button: 0, ctrlKey: false });
    fireEvent.click(intimacyTab);
    await waitFor(() => expect(intimacyTab).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Switch')).toBeInTheDocument();
    expect(getProfileById).toHaveBeenCalledWith('user-1');
  });

  it('renders heart previews and swaps the active profile photo without saving order', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      photos: [
        'https://example.com/main.jpg',
        'https://example.com/two.jpg',
        'https://example.com/three.jpg',
        'https://example.com/four.jpg',
      ],
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    const hero = await screen.findByTestId('profile-hero-media');
    expect(within(hero).getByAltText('Jordan')).toHaveAttribute('src', 'https://example.com/main.jpg');
    expect(screen.getByRole('button', { name: 'Show profile photo 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show profile photo 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show profile photo 4' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show profile photo 3' }));

    expect(within(hero).getByAltText('Jordan')).toHaveAttribute('src', 'https://example.com/three.jpg');
    expect(screen.getByRole('button', { name: 'Show profile photo 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show profile photo 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show profile photo 4' })).toBeInTheDocument();
  });

  it('shows visible shared crowds when another profile includes them', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      crowds: ['T4T'],
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Crowds')).toBeInTheDocument();
    expect(screen.getByText('T4T')).toBeInTheDocument();
  });

  it('emits cruush changes, refreshes the profile, and avoids browser alerts', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const eventListener = vi.fn();
    window.addEventListener('cruush:changed', eventListener);

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Send cruush' }));

    await waitFor(() => expect(sendCruush).toHaveBeenCalledWith('user-1', expect.objectContaining({
      name: 'Jordan',
    })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mutual cruush' })).toBeDisabled());
    await waitFor(() => expect(getProfileById).toHaveBeenCalledTimes(2));

    expect(eventListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        targetUserId: 'user-1',
        mutual: true,
      }),
    }));
    expect(toastSuccess).toHaveBeenCalledWith("It's mutual. You and Jordan have a cruush on each other.");
    expect(alertSpy).not.toHaveBeenCalled();

    window.removeEventListener('cruush:changed', eventListener);
    alertSpy.mockRestore();
  });

  it('locks the profile cruush action while the request is pending', async () => {
    let resolveCruush: (value: unknown) => void = () => {};
    sendCruush.mockReturnValue(new Promise((resolve) => {
      resolveCruush = resolve;
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    const cruushButton = await screen.findByRole('button', { name: 'Send cruush' });
    fireEvent.click(cruushButton);
    fireEvent.click(cruushButton);

    expect(sendCruush).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sending cruush' })).toBeDisabled();

    resolveCruush({
      id: 'cruush-1',
      fromUserId: 'me',
      toUserId: 'user-1',
      createdAt: '2026-04-29T12:00:00.000Z',
      mutual: false,
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cruush sent' })).toBeDisabled());
  });

  it('shows a persisted sent state for outgoing non-mutual cruushes', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      viewer_relationship: {
        match_id: null,
        mutual_cruush: false,
        outgoing_cruush: true,
        can_message: false,
        can_reveal_precise_location: false,
      },
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    const cruushButton = await screen.findByRole('button', { name: 'Cruush sent' });

    expect(cruushButton).toBeDisabled();
    expect(cruushButton).toHaveTextContent('sent');
    expect(screen.queryByRole('button', { name: 'Mutual cruush' })).not.toBeInTheDocument();

    fireEvent.click(cruushButton);
    expect(sendCruush).not.toHaveBeenCalled();
  });

  it('removes profile sharing and disables cruushing an existing mutual', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      viewer_relationship: {
        match_id: 'match-1',
        mutual_cruush: true,
        can_message: true,
        can_reveal_precise_location: false,
      },
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('profile-hero-media')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share profile' })).not.toBeInTheDocument();
    const cruushButton = screen.getByRole('button', { name: 'Mutual cruush' });

    expect(cruushButton).toBeDisabled();
    expect(cruushButton).toHaveTextContent('mutual cruush');

    fireEvent.click(cruushButton);
    expect(sendCruush).not.toHaveBeenCalled();
  });
});
