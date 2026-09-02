import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileOnboarding from './ProfileOnboarding';

const { acceptCodeOfConduct, getAuthSession, persistCurrentUser, saveMyProfile, uploadProfilePhoto } = vi.hoisted(() => ({
  acceptCodeOfConduct: vi.fn(),
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
  getAuthSession,
}));

vi.mock('../lib/profileApi', () => ({
  saveMyProfile,
  uploadProfilePhoto,
  toDefaultKinkInterest: (kink: string) => ({
    kink_id: kink.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    label: kink,
  }),
}));

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

function renderConductOnboarding(onComplete = vi.fn()) {
  const OnboardingWithConduct = ProfileOnboarding as ComponentType<{
    onComplete: () => void;
    needsCodeOfConduct: boolean;
    codeOfConductVersion: string;
  }>;

  render(
    <OnboardingWithConduct
      onComplete={onComplete}
      needsCodeOfConduct
      codeOfConductVersion="2026-07-07"
    />
  );

  return onComplete;
}

async function fillProfileRites() {
  fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  await chooseMultiSelect('Pronouns', 'they/them');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  await chooseMultiSelect('Gender Identity', 'nonbinary');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  await chooseMultiSelect('Crowds', 'Dyke');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  await chooseMultiSelect('Looking For', 'cruise');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  await chooseMultiSelect('Vibes', 'Goth');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  fireEvent.change(screen.getByPlaceholderText('A little about you...'), { target: { value: 'Velvet trouble.' } });
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
}

async function skipTwoFactorAndEnter() {
  fireEvent.click(screen.getByRole('button', { name: /skip 2fa for now/i }));
  expect(await screen.findByText('summon your circle')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /enter cruush/i }));
}

describe('ProfileOnboarding', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    acceptCodeOfConduct.mockReset();
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

    const nextButton = screen.getByRole('button', { name: /next/i });

    expect(screen.getByText('take the oath')).toBeInTheDocument();
    expect(nextButton).toBeDisabled();
    expect(saveMyProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', {
      name: /i have read and agree to the cruush code of conduct/i,
    }));

    expect(nextButton).not.toBeDisabled();
  });

  it('keeps the same rites while using profile edit option menus', async () => {
    renderConductOnboarding();

    expect(screen.getByText('speak your name')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('choose your invocation')).toBeInTheDocument();
    await chooseMultiSelect('Pronouns', 'they/them');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('name your form')).toBeInTheDocument();
    await chooseMultiSelect('Gender Identity', 'nonbinary');
    expect(screen.getByRole('checkbox', { name: /^I am trans/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('find your crowd')).toBeInTheDocument();
    expect(screen.getByText('Choose your crowds.')).toBeInTheDocument();
    expect(screen.getByText(/Optional visibility rooms, not identity labels\./)).toBeInTheDocument();
    await chooseMultiSelect('Crowds', 'Gay');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('declare your hunger')).toBeInTheDocument();
    await chooseMultiSelect('Looking For', 'right now');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('reveal your aura')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));
    expect(await screen.findByRole('tablist', { name: 'Vibes categories' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Style & Energy' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Scenes' }));
    expect(screen.queryByRole('option', { name: 'Bear' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Archetypes' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Daddy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('leave your confession')).toBeInTheDocument();
  });

  it('offers trans man and trans woman while saving up to three gender identities', async () => {
    render(<ProfileOnboarding onComplete={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await chooseMultiSelect('Pronouns', 'they/them');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await chooseMultiSelect('Crowds', 'T4T');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await chooseMultiSelect('Looking For', 'cruise');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Select up to 3')).toBeInTheDocument();
    await chooseMultiSelect('Vibes', 'Alt');
    await chooseMultiSelect('Vibes', 'Artsy');
    await chooseMultiSelect('Vibes', 'Chill');
    await chooseMultiSelect('Vibes', 'Goth');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByPlaceholderText('A little about you...'), { target: { value: 'Velvet trouble.' } });
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
    render(<ProfileOnboarding onComplete={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await chooseMultiSelect('Pronouns', 'they/them');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await chooseMultiSelect('Gender Identity', 'nonbinary');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Crowds' }));
    expect(screen.queryByRole('option', { name: 'T4T' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Crowds' }));

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^I am trans/ }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Crowds' }));
    expect(await screen.findByRole('option', { name: 'T4T' })).toBeInTheDocument();
  });

  it('saves the profile, accepts the conduct version, then completes onboarding', async () => {
    const onComplete = renderConductOnboarding();

    await fillProfileRites();
    fireEvent.click(screen.getByRole('checkbox', {
      name: /i have read and agree to the cruush code of conduct/i,
    }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await skipTwoFactorAndEnter();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      needsCodeOfConduct: false,
    }), 'map');
    expect(saveMyProfile).toHaveBeenCalledTimes(1);
    expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      display_name: 'River',
      looking_for: ['cruise'],
      crowds: ['Dyke'],
      vibes: ['Goth'],
      bio: 'Velvet trouble.',
      pronouns: ['they/them'],
      year_of_birth: null,
      identities: ['nonbinary'],
      availability: [],
      hosting_travel: [],
      presentation: [],
      sexuality: [],
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
    render(<ProfileOnboarding onComplete={onComplete} />);

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
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ needsOnboarding: false }), 'map');
  });

  it('lets users enable 2FA directly during onboarding before entering the map', async () => {
    completeTwoFactorSetup.mockResolvedValueOnce({
      enabled: true,
      recoveryCodes: ['alpha-111', 'beta-222'],
      promotionalDaysGranted: 1,
    });
    const onComplete = vi.fn();
    render(<ProfileOnboarding onComplete={onComplete} />);

    await fillProfileRites();

    expect(screen.getByText('protect your key')).toBeInTheDocument();
    expect(screen.getByText('Optional. New accounts can receive one free day of cruush+ when 2FA is enabled.')).toBeInTheDocument();
    expect(screen.getByText('Use the same password you use to sign in. This is not a separate 2FA password.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/cruush login password/i), {
      target: { value: 'current-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start 2fa setup/i }));

    await waitFor(() => expect(startTwoFactorSetup).toHaveBeenCalledWith('current-password'));
    expect(await screen.findByAltText('2FA QR code')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Authenticator code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm and enable 2fa/i }));

    await waitFor(() => expect(completeTwoFactorSetup).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText('2FA is active.')).toBeInTheDocument();
    expect(screen.getByText('One free day of cruush+ has been added to your account.')).toBeInTheDocument();
    expect(screen.getByText('alpha-111')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText('summon your circle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /enter cruush/i }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ needsOnboarding: false }), 'map');
  });

  it('keeps the user in onboarding when the server still requires a profile', async () => {
    getAuthSession.mockResolvedValueOnce({ needsOnboarding: true });
    const onComplete = vi.fn();
    render(<ProfileOnboarding onComplete={onComplete} />);

    await fillProfileRites();
    await skipTwoFactorAndEnter();

    expect(await screen.findByText("We couldn't finish setting up your profile. Try again.")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not collect date of birth during onboarding', () => {
    render(<ProfileOnboarding onComplete={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('choose your invocation')).toBeInTheDocument();
    expect(screen.queryByText('prove you may enter')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Birth month')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Birth day')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Birth year')).not.toBeInTheDocument();
  });
});
