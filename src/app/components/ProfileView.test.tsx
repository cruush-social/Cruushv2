import { refreshContentVisibility } from '../lib/contentVisibilityRevision';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileView, { profileRecordToProfileView } from './ProfileView';
import { emptyProfilePayload, ProfileApiError, type ProfileRecord } from '../lib/profileApi';
import mileHighClubWhite from '../assets/ui-icons/mile-high-club-white.svg';

const { serviceArea } = vi.hoisted(() => ({ serviceArea: { profilePinsAllowed: false } }));
vi.mock('./MapServiceAreaContext', () => ({ useMapServiceArea: () => serviceArea }));

const { revokeMutualCruush, revokeSentCruush, sendCruush, getMutualCruushMap } = vi.hoisted(() => ({
  revokeMutualCruush: vi.fn(),
  revokeSentCruush: vi.fn(),
  sendCruush: vi.fn(),
  getMutualCruushMap: vi.fn(),
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
    getMutualCruushMap,
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
  it('keeps fresh server distance decisions ahead of stale navigation labels', () => {
    const profile = { ...emptyProfilePayload, ...createProfileFixture(), distance_label: 'Among sinners' } as ProfileRecord;
    const preview = { distance: '2 mi', lastActive: 'now' };
    expect(profileRecordToProfileView(profile, preview).distance).toBe('Among sinners');
    expect(profileRecordToProfileView({ ...profile, distance_label: 'Far far away' }, preview).distance).toBe('Far far away');
    expect(profileRecordToProfileView({ ...profile, distance_label: 'New York, NY' }, preview).distance).toBe('New York, NY');
    expect(profileRecordToProfileView({ ...profile, distance_label: 'Holmdel, NJ' }, preview).distance).toBe('Holmdel, NJ');
    expect(profileRecordToProfileView({ ...profile, distance_label: '3 mi' }, preview).distance).toBe('3 mi');
    expect(profileRecordToProfileView({ ...profile, distance_label: '1.2 mi' }, { distance: 'Nearby' }).distance).toBe('1.2 mi');
    expect(profileRecordToProfileView({ ...profile, distance_label: 'Nearby' }, preview).distance).toBe('Nearby');
    expect(profileRecordToProfileView({ ...profile, distance_label: null }, preview).distance).toBeNull();
    expect(profileRecordToProfileView({ ...profile, distance_label: undefined }, preview).distance).toBe('2 mi');
    expect(profileRecordToProfileView({ ...profile, distance_label: null, outOfSight: true }, preview).distance).toBeNull();
    expect(profileRecordToProfileView({ ...profile, distance_label: null }, preview, true).distance).toBeNull();
  });

  it.each([
    { label: 'Among sinners', outOfSight: false },
    { label: 'Far far away', outOfSight: true },
    { label: 'New York, NY', outOfSight: false },
    { label: 'Holmdel, NJ', outOfSight: true },
  ])('renders the server coarse label $label verbatim', async ({ label, outOfSight }) => {
    getProfileById.mockResolvedValue(createProfileFixture({ distance_label: label, outOfSight }));
    render(
      <MemoryRouter initialEntries={[{ pathname: '/profile/user-1', state: { distance: '2 mi' } }]}>
        <Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText(`${label} away`)).not.toBeInTheDocument();
    expect(screen.queryByText('2 mi away')).not.toBeInTheDocument();
  });

  it('preserves the server-owned current OOS status in the full profile model', () => {
    const profile = { ...emptyProfilePayload, ...createProfileFixture(), outOfSight: true } as ProfileRecord;
    expect(profileRecordToProfileView(profile).outOfSight).toBe(true);
    expect(profileRecordToProfileView({ ...profile, outOfSight: false }).outOfSight).toBe(false);
    expect(profileRecordToProfileView({ ...profile, outOfSight: undefined }).outOfSight).toBe(false);
  });

  beforeEach(() => {
    serviceArea.profilePinsAllowed = false;
    getMutualCruushMap.mockReset();
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

  it('gates a verified mutual profile pin OOS and restores it inside service area', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({ viewer_relationship: { mutual_cruush: true, can_reveal_precise_location: true, location_mode: 'PRECISE' } }));
    getMutualCruushMap.mockResolvedValue([{ user: { id: 'user-1' }, canRevealPreciseLocation: true, coordinates: { precision: 'precise' } }]);
    const profileRoute = () => <MemoryRouter initialEntries={['/profile/user-1']}><Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes></MemoryRouter>;
    const { rerender } = render(profileRoute());
    const blocked = await screen.findByRole('button', { name: 'Map location unavailable' });
    await waitFor(() => expect(getMutualCruushMap).toHaveBeenCalled());
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAttribute('title', 'Map location unavailable');
    expect(blocked).toHaveStyle({ background: 'var(--cruush-gradient)' });
    expect(blocked.style.getPropertyValue('--profile-center-pin-mobile-background')).toBe('var(--cruush-gradient)');

    serviceArea.profilePinsAllowed = true;
    rerender(profileRoute());
    expect(await screen.findByRole('button', { name: 'Center the map on Jordan' })).toBeEnabled();
  });

  it('uses a viewport-fitted 4:5 hero and exposes Basics, Intimacy, and Health tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('profile-gallery-frame')).toHaveClass('w-full', 'max-w-2xl');
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

  it('keeps the Tags capsule visible when no tags have been entered', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({ tags: [] }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>,
    );

    const tagsSection = (await screen.findByRole('heading', { name: 'Tags' })).closest('section');
    expect(tagsSection).not.toBeNull();
    expect(within(tagsSection as HTMLElement).getByText('Nothing listed yet.')).toBeInTheDocument();
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
    // The default distance display is approximate, and cb5de40 made approximate
    // strictly nonnumeric: 2.4 mi reads as Nearby, never a rounded ~2 mi.
    expect(await screen.findByText('Nearby')).toBeInTheDocument();
    expect(screen.queryByText(/\d\s*mi\b/i)).not.toBeInTheDocument();
    expect(screen.getByText(/10m ago/)).toBeInTheDocument();
  });

  it('shows permitted last activity without a distance or a location icon', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      distance_label: null,
      last_active: '10m ago',
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>,
    );

    const activity = await screen.findByText('10m ago', { exact: true });
    expect(activity.parentElement?.textContent).toBe('10m ago');
    expect(activity.parentElement?.children).toHaveLength(1);
  });

  it.each([
    { serverActivity: 'Online', cardActivity: '5m ago' },
    { serverActivity: '12m ago', cardActivity: 'Online' },
    { serverActivity: null, cardActivity: 'Online' },
  ])('uses Dark Room profile activity $serverActivity ahead of card activity $cardActivity', async ({ serverActivity, cardActivity }) => {
    serviceArea.profilePinsAllowed = true;
    getProfileById.mockResolvedValue(createProfileFixture({
      distance_label: null,
      last_active: serverActivity,
      viewer_relationship: { location_mode: 'STEALTH', can_reveal_precise_location: false },
    }));
    render(
      <MemoryRouter initialEntries={[{ pathname: '/profile/user-1', state: { lastActive: cardActivity } }]}>
        <Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /Jordan/ });
    if (serverActivity) expect(screen.getByText(serverActivity, { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(cardActivity, { exact: true })).not.toBeInTheDocument();
    const pin = screen.getByRole('button', { name: 'Jordan does not share a precise location with you' });
    expect(pin).toBeDisabled();
    expect(pin).toHaveAttribute('title', 'Dark Room');
    expect(getMutualCruushMap).not.toHaveBeenCalled();
  });

  it('preserves card activity precedence on profiles outside Dark Room', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      last_active: 'Online',
      viewer_relationship: { location_mode: 'GHOST' },
    }));
    render(
      <MemoryRouter initialEntries={[{ pathname: '/profile/user-1', state: { lastActive: '5m ago' } }]}>
        <Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('5m ago', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Online', { exact: true })).not.toBeInTheDocument();
  });

  it('does not invent activity when the profile supplies neither distance nor activity', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      distance_label: null,
      last_active: null,
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /Jordan/ });
    expect(screen.queryByText(/ago|last active|online now/i)).not.toBeInTheDocument();
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

    expect(await screen.findByText('Relationship Status')).toBeInTheDocument();
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
    expect((await screen.findByTestId('profile-overlay-signal')).textContent).toBe('Looking for late-night art kids nea');
    // It reads there once. A second copy under the photo only pushed the rest
    // of the profile down, and the same goes for the vibe capsules. The
    // Identities check keeps the two below honest: without it they would still
    // pass if the tab body never rendered at all.
    expect(screen.getByRole('heading', { name: 'Gender Identity' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Signal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vibes' })).not.toBeInTheDocument();
  });

  it('keeps full-profile Vibe capsules prominent while retaining truncation', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({
      vibes: ['A deliberately lengthy nightlife vibe'],
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>,
    );

    const vibe = await screen.findByText('A deliberately lengthy nightlife vibe');
    expect(vibe).toHaveClass('text-[11px]', 'px-2', 'py-0.5', 'truncate');
  });

  it('uses the mobile-readable text floor throughout the full profile', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({ zodiac: [] }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('they/them');
    expect(screen.getByRole('tablist')).toHaveClass('text-base');
    expect(screen.getByRole('tab', { name: 'Basics' })).toHaveClass('text-base');

    const identities = screen.getByRole('heading', { name: 'Gender Identity' }).closest('section');
    expect(identities).not.toBeNull();
    expect(within(identities as HTMLElement).getByText('Non-binary')).toHaveClass('text-base');
    const zodiac = screen.getByRole('heading', { name: 'Zodiac' }).closest('section');
    expect(zodiac).not.toBeNull();
    expect(within(zodiac as HTMLElement).getByText('Nothing listed yet.')).toHaveClass('text-base');
    const ethnicity = screen.getByRole('heading', { name: 'Ethnicity' }).closest('section');
    expect(ethnicity).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Ethnicity' })).toHaveClass('text-lg');
    expect(within(ethnicity as HTMLElement).getByText('Latinx')).toHaveClass('text-base');
  });

  it('shows a large DL Mode icon and label on a masked full-profile photo', async () => {
    window.localStorage.setItem('cruush:dl-mode-enabled', 'true');
    getProfileById.mockResolvedValue(createProfileFixture({
      photos: ['/explicit-profile.jpg'],
      photo_metadata: [{ url: '/explicit-profile.jpg', explicit: true }],
    }));

    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>,
    );

    const placeholder = await screen.findByTestId('dl-mode-photo-placeholder');
    expect(placeholder).toHaveClass('w-36');
    expect(placeholder.querySelector('text')).toHaveTextContent('DL MODE ON');
  });

  it('shows Purgatory and opens its explanation when MHC is inactive', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({ outOfSight: true, travelling: false }));
    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes>
      </MemoryRouter>,
    );
    const badge = await screen.findByRole('button', { name: 'This is a Purgatory member.' });
    fireEvent.click(badge);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('currently outside the Sinner’s Map service area');
  });

  it('shows Purgatory when a visibility refresh wins the initial profile request', async () => {
    let finishInitial!: (value: ProfileRecord) => void;
    const member = { ...emptyProfilePayload, ...createProfileFixture({ outOfSight: true, travelling: false }) } as ProfileRecord;
    getProfileById.mockImplementationOnce(() => new Promise(resolve => { finishInitial = resolve; }));
    getProfileById.mockResolvedValue(member);
    render(<MemoryRouter initialEntries={['/profile/user-1']}><Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes></MemoryRouter>);
    await act(async () => { refreshContentVisibility(); });
    expect(await screen.findByRole('button', { name: 'This is a Purgatory member.' })).toBeInTheDocument();
    await act(async () => { finishInitial({ ...member, outOfSight: false }); });
    expect(screen.getByRole('button', { name: 'This is a Purgatory member.' })).toBeInTheDocument();
  });

  it('does not let an older cruush refresh overwrite authoritative Purgatory membership', async () => {
    const member = createProfileFixture({ outOfSight: true, travelling: false });
    getProfileById.mockResolvedValue(member);
    render(<MemoryRouter initialEntries={['/profile/user-1']}><Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes></MemoryRouter>);
    await screen.findByRole('button', { name: 'This is a Purgatory member.' });
    let finishCruush!: (value: ProfileRecord) => void;
    getProfileById.mockImplementationOnce(() => new Promise(resolve => { finishCruush = resolve; }));
    act(() => { window.dispatchEvent(new CustomEvent('cruush:changed', { detail: { targetUserId: 'user-1', mutual: false } })); });
    await act(async () => { refreshContentVisibility(); });
    await act(async () => { finishCruush({ ...member, outOfSight: false }); });
    expect(screen.getByRole('button', { name: 'This is a Purgatory member.' })).toBeInTheDocument();
  });

  it('does not let an older cruush event overwrite the latest cruush refresh', async () => {
    const member = createProfileFixture({ outOfSight: true, travelling: false });
    getProfileById.mockResolvedValue(member);
    render(<MemoryRouter initialEntries={['/profile/user-1']}><Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes></MemoryRouter>);
    await screen.findByRole('button', { name: 'This is a Purgatory member.' });
    let finishOlder!: (value: ProfileRecord) => void;
    getProfileById.mockImplementationOnce(() => new Promise(resolve => { finishOlder = resolve; }));
    act(() => { window.dispatchEvent(new CustomEvent('cruush:changed', { detail: { targetUserId: 'user-1', mutual: false } })); });
    await act(async () => { window.dispatchEvent(new CustomEvent('cruush:changed', { detail: { targetUserId: 'user-1', revoked: true } })); });
    await act(async () => { finishOlder({ ...member, outOfSight: false }); });
    expect(screen.getByRole('button', { name: 'This is a Purgatory member.' })).toBeInTheDocument();
  });

  it('reports a failed authoritative refresh without accepting stale initial data and recovers on retry', async () => {
    let finishInitial!: (value: ProfileRecord) => void;
    const member = createProfileFixture({ outOfSight: true, travelling: false });
    getProfileById.mockImplementationOnce(() => new Promise(resolve => { finishInitial = resolve; }));
    getProfileById.mockRejectedValueOnce(new Error('Failed to load profile.'));
    getProfileById.mockResolvedValue(member);
    render(<MemoryRouter initialEntries={['/profile/user-1']}><Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes></MemoryRouter>);
    await act(async () => { refreshContentVisibility(); });
    expect(await screen.findByText('Failed to load profile.')).toBeInTheDocument();
    await act(async () => { finishInitial({ ...member, outOfSight: false }); });
    expect(screen.getByText('Failed to load profile.')).toBeInTheDocument();
    await act(async () => { refreshContentVisibility(); });
    expect(await screen.findByRole('button', { name: 'This is a Purgatory member.' })).toBeInTheDocument();
    expect(screen.queryByText('Failed to load profile.')).not.toBeInTheDocument();
  });

  it('does not restore a profile from a cruush refresh started during an authoritative 404', async () => {
    const member = createProfileFixture({ outOfSight: true, travelling: false });
    getProfileById.mockResolvedValue(member);
    render(<MemoryRouter initialEntries={['/profile/user-1']}><Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes></MemoryRouter>);
    await screen.findByRole('button', { name: 'This is a Purgatory member.' });
    let rejectVisibility!: (error: Error) => void;
    let finishCruush!: (value: ProfileRecord) => void;
    getProfileById.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectVisibility = reject; }));
    await act(async () => { refreshContentVisibility(); });
    getProfileById.mockImplementationOnce(() => new Promise(resolve => { finishCruush = resolve; }));
    act(() => { window.dispatchEvent(new CustomEvent('cruush:changed', { detail: { targetUserId: 'user-1', mutual: false } })); });
    await act(async () => { rejectVisibility(new ProfileApiError(404, 'not_found', 'Profile not found.')); });
    expect(screen.queryByRole('button', { name: 'This is a Purgatory member.' })).not.toBeInTheDocument();
    await act(async () => { finishCruush(member); });
    expect(screen.queryByRole('button', { name: 'This is a Purgatory member.' })).not.toBeInTheDocument();
  });

  it('shows MHC instead of Purgatory while an MHC pin is active', async () => {
    getProfileById.mockResolvedValue(createProfileFixture({ outOfSight: true, travelling: true }));
    render(<MemoryRouter initialEntries={['/profile/user-1']}><Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'This is a Mile High Club member.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'This is a Purgatory member.' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('purgatory-heart-overlay')).not.toBeInTheDocument();
  });

  it('does not carry Purgatory membership into another profile while its request is pending', async () => {
    getProfileById.mockResolvedValueOnce(createProfileFixture({ outOfSight: true }));
    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Link to="/profile/user-2">Next member</Link>
        <Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'This is a Purgatory member.' });
    let resolveProfile!: (profile: ProfileRecord) => void;
    getProfileById.mockReturnValueOnce(new Promise<ProfileRecord>((resolve) => { resolveProfile = resolve; }));
    fireEvent.click(screen.getByRole('link', { name: 'Next member' }));
    expect(screen.queryByRole('button', { name: 'This is a Purgatory member.' })).not.toBeInTheDocument();
    resolveProfile(createProfileFixture({ id: 'user-2', display_name: 'River', outOfSight: false }));
    await screen.findByRole('heading', { name: /River/ });
    expect(screen.queryByRole('button', { name: 'This is a Purgatory member.' })).not.toBeInTheDocument();
  });

  it.each([false, undefined])('does not infer Purgatory from a travel pin when status is %s', async (outOfSight) => {
    getProfileById.mockResolvedValue(createProfileFixture({ outOfSight, travelling: true }));
    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes><Route path="/profile/:userId" element={<ProfileView />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'This is a Mile High Club member.' });
    expect(screen.queryByRole('button', { name: 'This is a Purgatory member.' })).not.toBeInTheDocument();
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
    const mileHighButton = within(name).getByRole('button', { name: 'This is a Mile High Club member.' });
    expect(mileHighButton).toHaveClass('pointer-events-auto', 'ml-2', 'shrink-0');
    expect(badge).toHaveClass('h-14', 'w-14');
    expect(badge).toHaveAttribute('src', mileHighClubWhite);
    expect(mileHighButton).not.toHaveAttribute('title');
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
    expect(within(name).getByRole('button', { name: 'This is a Mile High Club member.' })).toBeInTheDocument();
    expect(badge).toHaveAttribute('src', mileHighClubWhite);
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
    expect(healthGroup).toHaveClass('rounded-2xl', 'border', 'border-border', 'bg-card/60', 'p-4');
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

  it('never shows another profile’s crowds publicly, even when it carries them', async () => {
    // ee9d870 removed the Crowds section from every public profile view.
    // Crowds stay editable in Profile Edit and still drive Visibility Controls,
    // but no viewer sees which crowds someone belongs to.
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

    // Wait for the loaded profile before asserting an absence.
    expect(await screen.findByText('About')).toBeInTheDocument();
    expect(screen.queryByText('Crowds')).not.toBeInTheDocument();
    expect(screen.queryByText('T4T')).not.toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'uncruush' })).toBeEnabled());
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
    const cruushButton = screen.getByRole('button', { name: 'uncruush' });

    expect(cruushButton).toBeEnabled();
    expect(cruushButton).toHaveTextContent('uncruush');

    fireEvent.click(cruushButton);

    await waitFor(() => expect(revokeMutualCruush).toHaveBeenCalledWith('user-1'));
    expect(sendCruush).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Uncruushed Jordan.');
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
    const cruushButton = screen.getByRole('button', { name: 'uncruush' });

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

    const blockButton = await screen.findByRole('button', { name: 'Block Jordan' });
    expect(blockButton).toHaveClass('p-0');
    fireEvent.click(blockButton);

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
    fireEvent.click(screen.getByRole('combobox', { name: 'Reason' }));
    const reason = await screen.findByRole('option', { name: 'Underage user concern' });
    fireEvent.pointerDown(reason, { button: 0, pointerType: 'touch' });
    fireEvent.pointerUp(reason, { button: 0, pointerType: 'touch' });
    fireEvent.click(reason);
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
