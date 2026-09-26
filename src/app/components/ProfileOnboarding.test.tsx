import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileOnboarding from './ProfileOnboarding';
import { readOnboardingDraft, writeOnboardingDraft } from '../lib/onboardingDraft';

const { acceptCodeOfConduct, attachReferralCode, getAuthSession, persistCurrentUser, saveMyProfile, uploadProfilePhoto } = vi.hoisted(() => ({
  acceptCodeOfConduct: vi.fn(),
  attachReferralCode: vi.fn(),
  getAuthSession: vi.fn(),
  persistCurrentUser: vi.fn(),
  saveMyProfile: vi.fn(),
  uploadProfilePhoto: vi.fn(),
}));

const { completeTwoFactorSetup, getRewardSummary, startTwoFactorSetup } = vi.hoisted(() => ({
  completeTwoFactorSetup: vi.fn(),
  getRewardSummary: vi.fn(),
  startTwoFactorSetup: vi.fn(),
}));

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('../lib/authApi', () => ({
  acceptCodeOfConduct,
  attachReferralCode,
  getAuthSession,
}));

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');

  return {
    ...actual,
    saveMyProfile,
    uploadProfilePhoto,
    toDefaultKinkInterest: (kink: string) => ({
      kink_id: kink.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      label: kink,
    }),
  };
});

vi.mock('../lib/sessionUser', () => ({
  persistCurrentUser,
}));

vi.mock('../lib/rewardsApi', () => ({
  completeTwoFactorSetup,
  getRewardSummary,
  startTwoFactorSetup,
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
  },
}));

const rewardSummary = {
  streak: {
    current: 0,
    longest: 0,
    todayQualified: false,
    nextRecurringInDays: 7,
    nextLongBonusInDays: 30,
    nextLoginBonusAtDays: 8,
  },
  promotionalAccess: {
    active: false,
    activeUntil: null,
    bankedDays: 0,
    effectiveCruushPlus: false,
  },
  referrals: {
    pending: 0,
    qualified: 0,
    underReview: 0,
    code: 'abcdefghijklmnop',
    link: 'https://cruush.test/?ref=abcdefghijklmnop',
  },
  recentGrants: [],
  timezone: 'America/New_York',
  rules: {
    recurringStreakDays: 7,
    recurringStreakRewardDays: 1,
    longStreakDays: 30,
    longStreakBonusDays: 7,
    referralRewardDays: 7,
    referralMinAccountAgeDays: 7,
    maxBankedPromotionalDays: 90,
  },
};

async function chooseMultiSelect(label: string, value: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: value }));
  fireEvent.click(screen.getByRole('button', { name: label }));
}

async function chooseVibe(group: 'Style' | 'Energy' | 'Scenes' | 'Archetypes' | 'Identity', value: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));
  fireEvent.click(await screen.findByRole('tab', { name: group }));
  fireEvent.click(await screen.findByRole('option', { name: value }));
  fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));
}

function chooseCrowd(value: string) {
  fireEvent.click(screen.getByRole('button', { name: value }));
}

function renderConductOnboarding(onComplete = vi.fn()) {
  const OnboardingWithConduct = ProfileOnboarding as ComponentType<{
    onComplete: () => void;
    needsCodeOfConduct: boolean;
    codeOfConductVersion: string;
  }>;

  render(
    <MemoryRouter>
      <OnboardingWithConduct
        onComplete={onComplete}
        needsCodeOfConduct
        codeOfConductVersion="2026-07-07"
      />
    </MemoryRouter>
  );

  return onComplete;
}

async function fillProfileRites() {
  fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  await chooseMultiSelect('Pronouns', 'they/them');

  await chooseMultiSelect('Gender Identity', 'nonbinary');
  await chooseMultiSelect('Sexuality', 'queer');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  chooseCrowd('Dyke');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  await chooseVibe('Scenes', 'Goth');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  fireEvent.change(screen.getByPlaceholderText('A little about you...'), { target: { value: 'Velvet trouble.' } });
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  expect(screen.getByText('name your role')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(screen.getByText('protect your key')).toBeInTheDocument();
  expect(screen.queryByText('dress your heart')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Badge category')).not.toBeInTheDocument();
}

async function reachFinalOath() {
  fireEvent.click(screen.getByRole('button', { name: /skip 2fa for now/i }));
  expect(await screen.findByText('summon your circle')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /next rite/i }));
  expect(await screen.findByText('take the oath')).toBeInTheDocument();
}

async function skipTwoFactorAndEnter() {
  fireEvent.click(screen.getByRole('button', { name: /skip 2fa for now/i }));
  expect(await screen.findByText('summon your circle')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /enter cruush/i }));
}

describe('ProfileOnboarding', () => {
  it('keeps the signed code of conduct full-size and scrollable from the top', () => {
    const view = render(
      <MemoryRouter>
        <ProfileOnboarding
          onComplete={vi.fn()}
          constrainedViewport
          signedCodeOfConductAt="2026-09-23T21:35:27.000Z"
        />
      </MemoryRouter>,
    );

    expect(view.container.firstElementChild).toHaveClass('justify-start');
    expect(view.container.firstElementChild).not.toHaveClass('justify-center');
    expect(screen.getByRole('checkbox', {
      name: /i have read and agree to the cruush code of conduct/i,
    })).toBeChecked();
  });

  it('completes the current rites in preview mode without saving account data', async () => {
    const onComplete = vi.fn();
    render(<MemoryRouter><ProfileOnboarding onComplete={onComplete} needsCodeOfConduct codeOfConductVersion="2026-07-07" previewMode /></MemoryRouter>);
    expect(screen.queryByText('JPEG, PNG, HEIC/HEIF, AVIF, WebP, TIFF, DNG, BMP or still GIF.')).not.toBeInTheDocument();
    await fillProfileRites();
    fireEvent.change(screen.getByLabelText('Friend invite code'), { target: { value: 'abcdefghijklmnop' } });
    await reachFinalOath();
    fireEvent.click(screen.getByRole('checkbox', { name: /i have read and agree to the cruush code of conduct/i }));
    fireEvent.click(screen.getByRole('button', { name: /enter cruush/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(saveMyProfile).not.toHaveBeenCalled();
    expect(uploadProfilePhoto).not.toHaveBeenCalled();
    expect(acceptCodeOfConduct).not.toHaveBeenCalled();
    expect(attachReferralCode).not.toHaveBeenCalled();
    expect(startTwoFactorSetup).not.toHaveBeenCalled();
    expect(completeTwoFactorSetup).not.toHaveBeenCalled();
    expect(persistCurrentUser).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    // Onboarding now keeps a draft, so each test has to start as a new arrival
    // rather than resuming the previous test's answers.
    window.localStorage.removeItem('cruush:onboarding-draft');
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    acceptCodeOfConduct.mockReset();
    attachReferralCode.mockReset();
    attachReferralCode.mockResolvedValue({ attached: true });
    getAuthSession.mockReset();
    completeTwoFactorSetup.mockReset();
    getRewardSummary.mockReset();
    persistCurrentUser.mockReset();
    saveMyProfile.mockReset();
    startTwoFactorSetup.mockReset();
    toastSuccess.mockReset();
    delete (navigator as Navigator & { share?: unknown }).share;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    saveMyProfile.mockResolvedValue({
      id: 'user-1',
      display_name: 'River',
      year_of_birth: 1998,
    });
    getRewardSummary.mockResolvedValue(rewardSummary);
    acceptCodeOfConduct.mockResolvedValue({
      needsCodeOfConduct: false,
      codeOfConductVersion: '2026-07-07',
      acceptedCodeOfConductVersion: '2026-07-07',
      codeOfConductAcceptedAt: '2026-07-07T15:00:00.000Z',
    });
    getAuthSession.mockResolvedValue({
      needsOnboarding: false,
      codeOfConductVersion: '2026-07-07',
      acceptedCodeOfConductVersion: '2026-07-07',
      codeOfConductAcceptedAt: '2026-07-07T15:00:00.000Z',
    });
    startTwoFactorSetup.mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/cruush:river',
      qrCodeDataUrl: 'data:image/png;base64,qr',
    });
  completeTwoFactorSetup.mockResolvedValue({
    enabled: true,
    recoveryCodes: ['alpha-111', 'beta-222'],
    promotionalDaysGranted: 0,
  });
  });

  it('blocks completion on the oath step until the code of conduct is checked', async () => {
    renderConductOnboarding();

    await fillProfileRites();
    await reachFinalOath();

    const enterButton = screen.getByRole('button', { name: /enter cruush/i });

    expect(screen.getByText('take the oath')).toBeInTheDocument();
    expect(enterButton).toBeDisabled();
    expect(saveMyProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', {
      name: /i have read and agree to the cruush code of conduct/i,
    }));

    expect(enterButton).not.toBeDisabled();
  });

  it('uses profile edit option menus and goes directly from Crowds to Vibes', async () => {
    renderConductOnboarding();

    expect(screen.getByText('speak your name')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('name your form')).toBeInTheDocument();
    expect(screen.getByText('Rite 2 of 9')).toBeInTheDocument();
    expect(screen.queryByLabelText('Friend invite code')).not.toBeInTheDocument();
    await chooseMultiSelect('Pronouns', 'they/them');
    await chooseMultiSelect('Gender Identity', 'nonbinary');
    await chooseMultiSelect('Sexuality', 'queer');
    expect(screen.getByRole('checkbox', { name: /^I am trans/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('find your crowd')).toBeInTheDocument();
    expect(screen.getByText('Choose your crowds.')).toBeInTheDocument();
    expect(screen.getByText(/Choosing crowds here does not turn it on/i)).toHaveTextContent(
      'Think of crowds like gay or dyke bars: shared social spaces, not identity labels. Pick up to 3. Find Crowd Mode in Map Controls > Visibility. Turn it on to be seen only by people in your selected crowds. Choosing crowds here does not turn it on.',
    );
    chooseCrowd('Gay');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.queryByText('declare your hunger')).not.toBeInTheDocument();
    expect(screen.getByText('reveal your aura')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));
    expect(await screen.findByRole('tablist', { name: 'Vibes categories' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Style' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Scenes' }));
    expect(screen.queryByRole('option', { name: 'Bear' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Archetypes' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Daddy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('leave your confession')).toBeInTheDocument();
  });

  it('offers trans man and trans woman while saving up to three gender identities', async () => {
    render(<MemoryRouter><ProfileOnboarding onComplete={vi.fn()} /></MemoryRouter>);

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await chooseMultiSelect('Pronouns', 'they/them');

    fireEvent.click(screen.getByRole('button', { name: 'Gender Identity' }));
    expect(await screen.findByRole('option', { name: 'trans man' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'trans woman' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'dyke' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'trans man' }));
    fireEvent.click(screen.getByRole('option', { name: 'trans woman' }));
    fireEvent.click(screen.getByRole('option', { name: 'nonbinary' }));
    fireEvent.click(screen.getByRole('option', { name: 'woman' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gender Identity' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^I am trans/ }));
    await chooseMultiSelect('Sexuality', 'queer');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    chooseCrowd('T4T');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // The vibes step states its own limit: "Select up to 3" became "Pick up to
    // 3" in 507bf0d and gained the optional prefix in a0d5651.
    expect(screen.getByText('reveal your aura')).toBeInTheDocument();
    expect(screen.getByText('Optional. Pick up to 3.')).toBeInTheDocument();
    await chooseVibe('Style', 'Alt');
    await chooseVibe('Style', 'Artsy');
    await chooseVibe('Energy', 'Chill');
    await chooseVibe('Scenes', 'Goth');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByPlaceholderText('A little about you...'), { target: { value: 'Velvet trouble.' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await skipTwoFactorAndEnter();

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      identities: ['trans woman', 'nonbinary', 'woman'],
      is_trans: true,
      crowds: ['T4T'],
      vibes: ['Artsy', 'Chill', 'Goth'],
    })));
  });

  it('only offers T4T during onboarding after the user marks that they are trans', async () => {
    render(<MemoryRouter><ProfileOnboarding onComplete={vi.fn()} /></MemoryRouter>);

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await chooseMultiSelect('Pronouns', 'they/them');
    await chooseMultiSelect('Gender Identity', 'nonbinary');
    await chooseMultiSelect('Sexuality', 'queer');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByRole('group', { name: 'Crowds' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'T4T' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^I am trans/ }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByRole('button', { name: 'T4T' })).toBeInTheDocument();
  });

  it('saves the profile, accepts the conduct version, then completes onboarding', async () => {
    const onComplete = renderConductOnboarding();

    await fillProfileRites();
    await reachFinalOath();
    fireEvent.click(screen.getByRole('checkbox', {
      name: /i have read and agree to the cruush code of conduct/i,
    }));
    fireEvent.click(screen.getByRole('button', { name: /enter cruush/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      needsCodeOfConduct: false,
    }), 'map', false);
    expect(saveMyProfile).toHaveBeenCalledTimes(1);
    expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      display_name: 'River',
      looking_for: [],
      crowds: ['Dyke'],
      vibes: ['Goth'],
      bio: 'Velvet trouble.',
      pronouns: ['they/them'],
      year_of_birth: null,
      identities: ['nonbinary'],
      availability: [],
      hosting_travel: [],
      presentation: [],
      sexuality: ['queer'],
      body_type: [],
      position: [],
      role: [],
      kinks: [],
      hiv_status: [],
      condoms: [],
      prep: [],
      doxypep: [],
      covid_vaccine: [],
      mpox_vaccine: [],
      substance_boundaries: [],
    }));
    expect(acceptCodeOfConduct).toHaveBeenCalledWith('2026-07-07');
    expect(saveMyProfile.mock.invocationCallOrder[0]).toBeLessThan(acceptCodeOfConduct.mock.invocationCallOrder[0]);
  });

  it('lets users share their affiliate link to contacts during onboarding', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    const onComplete = vi.fn();
    render(<MemoryRouter><ProfileOnboarding onComplete={onComplete} /></MemoryRouter>);

    await fillProfileRites();
    fireEvent.click(screen.getByRole('button', { name: /skip 2fa for now/i }));

    expect(await screen.findByText('summon your circle')).toBeInTheDocument();
    expect(await screen.findByLabelText('Affiliate link')).toHaveValue(rewardSummary.referrals.link);
    expect(screen.getByText(/You get 7/)).toHaveTextContent(
      'You get 7 cruush+ days after a trusted invite verifies 2FA.',
    );
    expect(screen.queryByText(/days old/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/complete their profile/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /share to contacts/i }));

    await waitFor(() => {
      expect(navigator.share).toHaveBeenCalledWith({
        title: 'Join me on cruush',
        text: 'Join me on cruush.',
        url: rewardSummary.referrals.link,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(rewardSummary.referrals.link);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Affiliate link copied.');

    fireEvent.click(screen.getByRole('button', { name: /enter cruush/i }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ needsOnboarding: false }), 'map', false);
  });

  it('lets users enable 2FA directly during onboarding before entering the map', async () => {
    let resolveInvite!: (value: { attached: true }) => void;
    attachReferralCode.mockReturnValueOnce(new Promise<{ attached: true }>((resolve) => {
      resolveInvite = resolve;
    }));
    completeTwoFactorSetup.mockResolvedValueOnce({
      enabled: true,
      recoveryCodes: ['alpha-111', 'beta-222'],
      promotionalDaysGranted: 1,
    });
    const onComplete = vi.fn();
    render(<MemoryRouter><ProfileOnboarding onComplete={onComplete} /></MemoryRouter>);

    await fillProfileRites();

    expect(screen.getByText('protect your key')).toBeInTheDocument();
    expect(screen.getByText('Optional. New accounts can receive one free day of cruush+ when 2FA is enabled.')).toBeInTheDocument();
    expect(screen.getByText('Use the same password you use to sign in. This is not a separate 2FA password.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Friend invite code'), {
      target: { value: 'https://cruush.test/join/abcdefghijklmnop' },
    });
    fireEvent.change(screen.getByLabelText(/cruush login password/i), {
      target: { value: 'current-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start 2fa setup/i }));

    expect(attachReferralCode).toHaveBeenCalledWith('abcdefghijklmnop');
    expect(startTwoFactorSetup).not.toHaveBeenCalled();
    expect(completeTwoFactorSetup).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Friend invite code')).toBeDisabled();
    expect(screen.getByRole('button', { name: /skip 2fa for now/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
    await act(async () => resolveInvite({ attached: true }));

    await waitFor(() => expect(startTwoFactorSetup).toHaveBeenCalledWith('current-password'));
    expect(attachReferralCode.mock.invocationCallOrder[0]).toBeLessThan(startTwoFactorSetup.mock.invocationCallOrder[0]);
    expect(await screen.findByAltText('2FA QR code')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Authenticator code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm and enable 2fa/i }));

    await waitFor(() => expect(completeTwoFactorSetup).toHaveBeenCalledWith('123456'));
    expect(attachReferralCode).toHaveBeenCalledTimes(1);
    expect(attachReferralCode.mock.invocationCallOrder[0]).toBeLessThan(completeTwoFactorSetup.mock.invocationCallOrder[0]);
    expect(await screen.findByText('2FA is active.')).toBeInTheDocument();
    expect(screen.getByText('One free day of cruush+ has been added to your account.')).toBeInTheDocument();
    expect(screen.getByText('alpha-111')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText('summon your circle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /enter cruush/i }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ needsOnboarding: false }), 'map', true);
  });

  it('keeps an invalid invite on the 2FA step and attaches a corrected code once before continuing', async () => {
    attachReferralCode
      .mockRejectedValueOnce(new Error('Referral code is invalid.'))
      .mockRejectedValueOnce(new Error('Referral code is invalid.'));
    const onComplete = vi.fn();
    render(<MemoryRouter><ProfileOnboarding onComplete={onComplete} /></MemoryRouter>);
    await fillProfileRites();

    fireEvent.change(screen.getByLabelText('Friend invite code'), { target: { value: 'invalid-code' } });
    fireEvent.change(screen.getByLabelText(/cruush login password/i), { target: { value: 'current-password' } });
    fireEvent.click(screen.getByRole('button', { name: /skip 2fa for now/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Referral code is invalid.');
    expect(screen.getByText('protect your key')).toBeInTheDocument();
    expect(screen.queryByText('summon your circle')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start 2fa setup/i }));
    await waitFor(() => expect(attachReferralCode).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent('Referral code is invalid.');
    expect(startTwoFactorSetup).not.toHaveBeenCalled();
    expect(completeTwoFactorSetup).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Friend invite code'), { target: { value: 'abcdefghijklmnop' } });
    fireEvent.click(screen.getByRole('button', { name: /start 2fa setup/i }));
    expect(await screen.findByAltText('2FA QR code')).toBeInTheDocument();
    expect(screen.getByText('Invite code attached.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(attachReferralCode).toHaveBeenCalledTimes(3);
    expect(attachReferralCode).toHaveBeenLastCalledWith('abcdefghijklmnop');
    expect(startTwoFactorSetup).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /skip 2fa for now/i }));
    expect(await screen.findByText('summon your circle')).toBeInTheDocument();
    expect(attachReferralCode).toHaveBeenCalledTimes(3);
    expect(completeTwoFactorSetup).not.toHaveBeenCalled();
  });

  it('keeps the user in onboarding when the server still requires a profile', async () => {
    getAuthSession.mockResolvedValueOnce({ needsOnboarding: true });
    const onComplete = vi.fn();
    render(<MemoryRouter><ProfileOnboarding onComplete={onComplete} /></MemoryRouter>);

    await fillProfileRites();
    await skipTwoFactorAndEnter();

    expect(await screen.findByText("We couldn't finish setting up your profile. Try again.")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not collect date of birth during onboarding', () => {
    render(<MemoryRouter><ProfileOnboarding onComplete={vi.fn()} /></MemoryRouter>);

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('name your form')).toBeInTheDocument();
    expect(screen.queryByText('prove you may enter')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Birth month')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Birth day')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Birth year')).not.toBeInTheDocument();
  });

  it('keeps the step and the answers when onboarding is remounted', () => {
    const first = render(<MemoryRouter><ProfileOnboarding onComplete={vi.fn()} /></MemoryRouter>);

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('name your form')).toBeInTheDocument();

    // A reload during onboarding used to drop people back to the first step
    // with an empty name.
    first.unmount();
    render(<MemoryRouter><ProfileOnboarding onComplete={vi.fn()} /></MemoryRouter>);

    expect(screen.getByText('name your form')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByPlaceholderText('Your name')).toHaveValue('River');
  });

  it('requires only name, gender and sexuality as profile information', async () => {
    const onComplete = vi.fn();
    render(<MemoryRouter><ProfileOnboarding onComplete={onComplete} previewMode needsCodeOfConduct /></MemoryRouter>);
    const next = () => screen.getByRole('button', { name: /next rite/i });
    expect(next()).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(next()); // No photo.
    expect(next()).toBeDisabled();
    await chooseMultiSelect('Gender Identity', 'nonbinary');
    expect(next()).toBeDisabled();
    await chooseMultiSelect('Sexuality', 'queer');
    expect(screen.queryByText('Optional · select up to 3, or leave empty')).not.toBeInTheDocument();
    expect(screen.queryByText('Optional · select up to 3')).not.toBeInTheDocument();
    expect(next()).not.toBeDisabled();
    fireEvent.click(next()); // Pronouns and trans checkbox remain empty.
    expect(next()).not.toBeDisabled();
    fireEvent.click(next()); // No Crowds.
    expect(screen.getByText('reveal your aura')).toBeInTheDocument();
    fireEvent.click(next()); // No Vibes.
    expect(screen.getByText('leave your confession')).toBeInTheDocument();
    fireEvent.click(next()); // No Bio or Signal.
    expect(screen.getByText('name your role')).toBeInTheDocument();
    expect(screen.getByText('Optional. This becomes your left badge.')).toBeInTheDocument();
    fireEvent.click(next()); // No Role or Position.
    expect(screen.getByText('protect your key')).toBeInTheDocument();
    await reachFinalOath(); // Skip 2FA without an invite code.
    const enter = screen.getByRole('button', { name: /enter cruush/i });
    expect(enter).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /i have read and agree to the cruush code of conduct/i }));
    fireEvent.click(enter);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(saveMyProfile).not.toHaveBeenCalled();
    expect(acceptCodeOfConduct).not.toHaveBeenCalled();
  });

  it('migrates old draft steps once, preserves Looking for answers and revisits missing required fields', () => {
    const profile = { name: 'River', pronouns: ['they/them'], identities: ['nonbinary'], sexuality: ['queer'], crowds: ['Dyke'], lookingFor: ['cruise'], sideBadges: { left: { badge_id: 'service-sub' }, right: null } };
    window.localStorage.setItem('cruush:onboarding-draft', JSON.stringify({ step: 5, profile }));
    const migrated = readOnboardingDraft<typeof profile>();
    expect(migrated).toEqual({ step: 3, profile });
    writeOnboardingDraft(migrated!);
    expect(readOnboardingDraft()).toEqual(migrated);
    const first = render(<MemoryRouter><ProfileOnboarding onComplete={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('reveal your aura')).toBeInTheDocument();
    expect(readOnboardingDraft<typeof profile>()?.profile.lookingFor).toEqual(['cruise']);
    first.unmount();
    for (const [version, savedStep, expectedStep] of [
      [1, 4, 3], // Removed Looking for resumes Vibes after both migrations.
      [1, 1, 1], // Removed Pronouns resumes the combined Gender step.
      [2, 1, 1],
      [2, 2, 1],
      [1, 8, 6], // Old badge selection resumes 2FA after all migrations.
      [2, 8, 6], // Existing 2FA drafts stay on 2FA.
      [3, 5, 5], // Role/Position stays in place.
      [3, 6, 6], // Removed badge selection resumes 2FA.
      [3, 7, 6], // 2FA stays on 2FA.
      [3, 8, 7], // Affiliate share stays on affiliate share.
      [3, 9, 8], // The final oath is not skipped.
      [4, 7, 7], // Current drafts are not migrated again.
    ]) {
      window.localStorage.setItem('cruush:onboarding-draft', JSON.stringify({ version, step: savedStep, profile }));
      expect(readOnboardingDraft()).toEqual({ step: expectedStep, profile });
      writeOnboardingDraft(readOnboardingDraft<typeof profile>()!);
      expect(readOnboardingDraft()).toEqual({ step: expectedStep, profile });
    }
    writeOnboardingDraft({ step: 6, profile: { ...profile, sexuality: [] } });
    const second = render(<MemoryRouter><ProfileOnboarding onComplete={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('name your form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next rite/i })).toBeDisabled();
    second.unmount();
    writeOnboardingDraft({ step: 6, profile: { ...profile, crowds: [], is_trans: false } });
    render(<MemoryRouter><ProfileOnboarding onComplete={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('protect your key')).toBeInTheDocument();
  });
});
