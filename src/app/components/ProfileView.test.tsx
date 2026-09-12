import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileView from './ProfileView';

const { revokeMutualCruush, revokeSentCruush, sendCruush } = vi.hoisted(() => ({
  revokeMutualCruush: vi.fn(),
  revokeSentCruush: vi.fn(),
  sendCruush: vi.fn(),
}));

const { getMyProfile, getProfileById } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  getProfileById: vi.fn(),
}));

const { blockUser } = vi.hoisted(() => ({
  blockUser: vi.fn(),
}));

const { createReport } = vi.hoisted(() => ({
  createReport: vi.fn(),
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
    revokeMutualCruush,
    revokeSentCruush,
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

vi.mock('../lib/blockApi', () => ({
  blockUser,
}));

vi.mock('../lib/reportApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/reportApi')>('../lib/reportApi');
  return { ...actual, createReport };
});

function createProfileFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    display_name: 'Jordan',
    photos: [],
    bio: 'Out and about tonight.',
    signal: '',
    pronouns: ['they/them'],
    custom_pronouns: '',
    year_of_birth: 1998,
    ethnicity: 'Latinx',
    identities: ['Non-binary'],
    presentation: ['Femme'],
    sexuality: ['Queer'],
    zodiac: ['Leo'],
    body_type: ['Athletic'],
    height: "5'8\"",
    weight: '155 lbs',
    is_trans: null,
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
    revokeMutualCruush.mockReset();
    revokeSentCruush.mockReset();
    sendCruush.mockReset();
    getMyProfile.mockReset();
    getProfileById.mockReset();
    blockUser.mockReset();
    createReport.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    toastInfo.mockReset();

    revokeMutualCruush.mockResolvedValue({ revoked: true });
    revokeSentCruush.mockResolvedValue({
      revoked: true,
      mutualRevoked: false,
    });
    getProfileById.mockResolvedValue(createProfileFixture());
    blockUser.mockResolvedValue({
      userId: 'user-1',
      blocked: true,
    });
    createReport.mockResolvedValue({
      id: 'report-1',
      status: 'open',
      createdAt: '2026-07-11T12:00:00.000Z',
    });
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

  it('uses a viewport-fitted 4:5 hero and exposes Basics, Intimacy, and Health tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('profile-gallery-frame')).toHaveStyle({
      width: 'min(100%, 30rem)',
    });
    const heroMedia = screen.getByTestId('profile-hero-media');
    expect(heroMedia).toHaveStyle({
      aspectRatio: '4 / 5',
    });
    expect(heroMedia.getAttribute('style')).not.toContain('64vh');
    const basicsTab = screen.getByRole('tab', { name: 'Basics' });
    expect(basicsTab).toHaveAttribute('aria-selected', 'true');
    expect(basicsTab).toHaveClass('rounded-full', 'hover:bg-white/[0.08]', 'data-[state=active]:bg-white/[0.10]');
    expect(basicsTab.className).not.toContain('data-[state=active]:text-primary');
    expect(screen.getByRole('tab', { name: 'Intimacy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Health' })).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Zodiac')).toBeInTheDocument();
    expect(screen.getByText('Leo')).toBeInTheDocument();
    expect(screen.queryByText('Crowds')).not.toBeInTheDocument();
    const intimacyTab = screen.getByRole('tab', { name: 'Intimacy' });
    fireEvent.pointerDown(intimacyTab, { button: 0, ctrlKey: false });
    fireEvent.click(intimacyTab);
    await waitFor(() => expect(intimacyTab).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Switch')).toBeInTheDocument();
    expect(getProfileById).toHaveBeenCalledWith('user-1');
  });

  it('shows the distance and last online the profile carries, with no route state', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      distance_label: '2.4 mi',
      last_active: '10m ago',
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>,
    );

    // Opened from a deep link rather than the map, so nothing was handed over
    // in route state and the line has to come from the profile itself.
    // The default distance display is approximate, so 2.4 mi reads as ~2 mi.
    expect(await screen.findByText(/~2 mi away/)).toBeInTheDocument();
    expect(screen.getByText(/10m ago/)).toBeInTheDocument();
  });

  it('shows the relationship status the editor already saved', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      relationship_status: ['Partnered', 'Open'],
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>,
    );

    // The editor takes it under Intimacy, so the profile shows it back there.
    fireEvent.click(await screen.findByRole('tab', { name: 'Intimacy' }));

    expect(await screen.findByText('Relationship status')).toBeInTheDocument();
    expect(screen.getByText('Partnered')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('keeps the age outside the clipped name span', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      display_name: 'A very long profile name that needs truncation',
      year_of_birth: new Date().getFullYear() - 36,
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>,
    );

    const heading = await screen.findByRole('heading', { name: /A very long profile name that needs truncation/ });
    const age = within(heading).getByText(', 36');

    expect(heading).toHaveClass('overflow-visible', 'pb-1', 'leading-tight');
    expect(age).toHaveClass('shrink-0', 'whitespace-nowrap', 'pr-1');
    expect(age).not.toHaveClass('truncate', 'overflow-hidden');
  });

  it('shows the saved profile signal on the profile page', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      signal: 'Looking for late-night art kids near the venue.',
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    // The signal reads on the photo itself rather than in a card under it.
    expect(await screen.findByTestId('profile-overlay-signal')).toHaveTextContent('Looking for late-night art kids near the venue.');
    // It reads there once. A second copy under the photo only pushed the rest
    // of the profile down, and the same goes for the vibe capsules. The
    // Identities check keeps the two below honest: without it they would still
    // pass if the tab body never rendered at all.
    expect(screen.getByRole('heading', { name: 'Gender Identity' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Signal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vibes' })).not.toBeInTheDocument();
  });

  it('shows the Mile High Club plane beside the name for a travelling profile', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      travelling: true,
      travelLabel: 'In from Chicago',
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    const name = await screen.findByRole('heading', { name: /Jordan/ });
    const badge = within(name).getByRole('img', { name: 'Mile High Club' });
    expect(badge).toHaveAttribute('title', 'Mile High Club: In from Chicago');
    expect(badge).toHaveClass('ml-2', 'shrink-0');
    expect(badge.getAttribute('src')).toContain('Mile%20High%20Club%20White');
    expect(badge.getAttribute('src')).toContain('M0,-13');
    expect(badge.getAttribute('src')).toContain('plane-width-shade');
    expect(badge.getAttribute('src')).toContain('plane-length-shade');
  });

  it('shows the same Mile High Club plane beside the name on the travelling member’s own profile', async () => {
    getMyProfile.mockResolvedValue(createProfileFixture({
      travelling: true,
      travelLabel: 'In from Chicago',
    }));

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    const name = await screen.findByRole('heading', { name: /Jordan/ });
    const badge = within(name).getByRole('img', { name: 'Mile High Club' });
    expect(badge).toHaveAttribute('title', 'Mile High Club: In from Chicago');
    expect(badge.getAttribute('src')).toContain('plane-width-shade');
    expect(getMyProfile).toHaveBeenCalledTimes(1);
  });

  it('shows the launch party hat without a circle treatment', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      attendingLaunchParty: true,
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    const launchPartyButton = await screen.findByRole('button', { name: 'Center map on launch party' });

    expect(launchPartyButton).toHaveClass('border-0', 'bg-transparent', 'p-0');
    expect(launchPartyButton.className).not.toContain('rounded-full');
    expect(launchPartyButton.className).not.toContain('bg-black');
  });

  it('shows HIV status and the Protections a member selected', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      hiv_status: ['Negative'],
      protections: ['Condoms', 'PrEP'],
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    const healthTab = await screen.findByRole('tab', { name: 'Health' });
    fireEvent.click(healthTab);

    // HIV Status has its own capsule, matching the other health fields.
    const healthHeading = screen.getAllByText('HIV Status').find((node) => node.tagName.toLowerCase() === 'h2');
    expect(healthHeading).toBeDefined();
    const healthGroup = healthHeading?.parentElement as HTMLElement;
    expect(healthGroup).toHaveClass('rounded-2xl', 'border', 'border-border', 'bg-card/60', 'p-3');
    expect(within(healthGroup).getByText('Negative')).toBeInTheDocument();
    expect(within(healthGroup).queryByText('Not shared')).not.toBeInTheDocument();

    // The vaccine and condom answers are one Protections list now.
    const protectionsHeading = screen.getAllByText('Protections').find((node) => node.tagName.toLowerCase() === 'h2');
    const protectionsSection = protectionsHeading?.closest('section') as HTMLElement;
    expect(within(protectionsSection).getByText('Condoms')).toBeInTheDocument();
    expect(within(protectionsSection).getByText('PrEP')).toBeInTheDocument();
  });

  it('renders heart previews and swaps the active profile photo without saving order', async () => {
    window.localStorage.setItem('cruush:dl-mode-enabled', 'false');
    getProfileById.mockResolvedValue(createProfileFixture({
      photos: [
        'https://example.com/main.jpg',
        'https://example.com/two.jpg',
        'https://example.com/three.jpg',
        'https://example.com/four.jpg',
      ],
      photo_metadata: [
        { url: 'https://example.com/main.jpg', explicit: false },
        { url: 'https://example.com/two.jpg', explicit: false },
        { url: 'https://example.com/three.jpg', explicit: false },
        { url: 'https://example.com/four.jpg', explicit: false },
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
    const fourthPreview = screen.getByRole('button', { name: 'Show profile photo 4' });
    expect(fourthPreview).toHaveStyle({
      height: 'clamp(3.25rem, 10.5dvh, 4.75rem)',
      width: 'clamp(3.25rem, 10.5dvh, 4.75rem)',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show profile photo 3' }));

    expect(within(hero).getByAltText('Jordan')).toHaveAttribute('src', 'https://example.com/three.jpg');
    expect(screen.getByRole('button', { name: 'Show profile photo 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show profile photo 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show profile photo 4' })).toBeInTheDocument();
  });

  it('keeps full-photo report and close controls clear of the global bug button', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      photos: ['https://example.com/main.jpg'],
      photo_metadata: [{ url: 'https://example.com/main.jpg', explicit: false }],
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: "Show Jordan's photo full screen" }));

    expect(screen.getByTestId('profile-photo-viewer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report this profile photo' })).toBeInTheDocument();
    expect(screen.getByTestId('profile-photo-viewer-actions')).toHaveClass(
      'right-[calc(4rem+env(safe-area-inset-right))]',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close photo' }));
    expect(screen.queryByTestId('profile-photo-viewer')).not.toBeInTheDocument();
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

  it('shows trans beside gender identity only when selected', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      is_trans: true,
      identities: ['Non-binary', 'Trans'],
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Gender Identity');

    const identitiesSection = screen.getByText('Gender Identity').closest('section');
    expect(identitiesSection).not.toBeNull();
    expect(within(identitiesSection as HTMLElement).getByText('Non-binary')).toBeInTheDocument();
    expect(within(identitiesSection as HTMLElement).getAllByText('trans')).toHaveLength(1);
    expect(within(identitiesSection as HTMLElement).queryByText('Trans')).not.toBeInTheDocument();
    expect(screen.queryByText('Trans status')).not.toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole('button', { name: 'send cruush' }));

    await waitFor(() => expect(sendCruush).toHaveBeenCalledWith('user-1', expect.objectContaining({
      name: 'Jordan',
    })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'remove mutual' })).toBeEnabled());
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

    const cruushButton = await screen.findByRole('button', { name: 'send cruush' });
    fireEvent.click(cruushButton);
    fireEvent.click(cruushButton);

    expect(sendCruush).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'sending cruush' })).toBeDisabled();

    resolveCruush({
      id: 'cruush-1',
      fromUserId: 'me',
      toUserId: 'user-1',
      createdAt: '2026-04-29T12:00:00.000Z',
      mutual: false,
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'unsend cruush' })).toBeEnabled());
  });

  it('unsends a persisted outgoing non-mutual', async () => {
    getProfileById.mockResolvedValueOnce(createProfileFixture({
      viewer_relationship: {
        match_id: null,
        mutual_cruush: false,
        outgoing_cruush: true,
        can_message: false,
        can_reveal_precise_location: false,
      },
    })).mockResolvedValue(createProfileFixture({
      viewer_relationship: {
        match_id: null,
        mutual_cruush: false,
        outgoing_cruush: false,
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

    const cruushButton = await screen.findByRole('button', { name: 'unsend cruush' });

    expect(cruushButton).toBeEnabled();
    expect(cruushButton).toHaveTextContent('unsend');
    expect(screen.queryByRole('button', { name: 'mutual' })).not.toBeInTheDocument();

    fireEvent.click(cruushButton);
    await waitFor(() => expect(revokeSentCruush).toHaveBeenCalledWith('user-1'));
    expect(sendCruush).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Unsent your cruush to Jordan.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'send cruush' })).toBeEnabled());
  });

  it('removes profile sharing and revokes an existing mutual by tapping', async () => {
    getProfileById
      .mockResolvedValueOnce(createProfileFixture({
        viewer_relationship: {
          match_id: 'match-1',
          mutual_cruush: true,
          outgoing_cruush: true,
          can_message: true,
          can_reveal_precise_location: false,
        },
      }))
      .mockResolvedValueOnce(createProfileFixture({
        viewer_relationship: {
          match_id: null,
          mutual_cruush: false,
          outgoing_cruush: false,
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

    expect(await screen.findByTestId('profile-hero-media')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share profile' })).not.toBeInTheDocument();
    const cruushButton = screen.getByRole('button', { name: 'remove mutual' });

    expect(cruushButton).toBeEnabled();
    expect(cruushButton).toHaveTextContent('remove mutual');

    fireEvent.click(cruushButton);

    await waitFor(() => expect(revokeMutualCruush).toHaveBeenCalledWith('user-1'));
    expect(sendCruush).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Removed mutual with Jordan.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'send cruush' })).toBeEnabled());
  });

  it('does not allow sending a duplicate cruush for an existing mutual', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      viewer_relationship: {
        match_id: 'match-1',
        mutual_cruush: true,
        outgoing_cruush: true,
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
    const cruushButton = screen.getByRole('button', { name: 'remove mutual' });

    expect(cruushButton).toBeEnabled();

    fireEvent.click(cruushButton);
    await waitFor(() => expect(revokeMutualCruush).toHaveBeenCalledWith('user-1'));
    expect(sendCruush).not.toHaveBeenCalled();
  });

  it('confirms before blocking another profile and hides it after success', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Block Jordan' }));

    expect(screen.getByText('Block Jordan?')).toBeInTheDocument();
    expect(screen.getByText(/They will no longer be able to interact with you/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() => expect(blockUser).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(screen.getByText('That profile is unavailable.')).toBeInTheDocument());
    expect(toastSuccess).toHaveBeenCalledWith('Jordan blocked.');
  });

  it('keeps the profile visible and shows a generic error when blocking fails', async () => {
    blockUser.mockRejectedValue(new Error('backend details'));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    expect((await screen.findAllByText('Jordan')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Block Jordan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() => expect(blockUser).toHaveBeenCalledWith('user-1'));
    expect(toastError).toHaveBeenCalledWith('Unable to block this user right now.');
    expect(screen.getAllByText('Jordan').length).toBeGreaterThan(0);
  });

  it('reports another profile from the profile safety action', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Report profile' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'minor_safety' } });
    fireEvent.change(screen.getByLabelText('Additional details (optional)'), {
      target: { value: 'The profile says they are under 18.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(createReport).toHaveBeenCalledWith({
      targetType: 'profile',
      targetId: 'user-1',
      reason: 'minor_safety',
      details: 'The profile says they are under 18.',
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Report submitted.');
  });

  it('does not render reporting controls for the current user profile', async () => {
    getMyProfile.mockResolvedValue(createProfileFixture());

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Edit Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Report profile' })).not.toBeInTheDocument();
  });
});
