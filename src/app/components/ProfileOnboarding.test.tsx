import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileOnboarding from './ProfileOnboarding';

const { acceptCodeOfConduct, persistCurrentUser, saveMyProfile } = vi.hoisted(() => ({
  acceptCodeOfConduct: vi.fn(),
  persistCurrentUser: vi.fn(),
  saveMyProfile: vi.fn(),
}));

const { completeTwoFactorSetup, startTwoFactorSetup } = vi.hoisted(() => ({
  completeTwoFactorSetup: vi.fn(),
  startTwoFactorSetup: vi.fn(),
}));

vi.mock('../lib/authApi', () => ({
  acceptCodeOfConduct,
}));

vi.mock('../lib/profileApi', () => ({
  saveMyProfile,
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
  startTwoFactorSetup,
}));

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

  fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: '1998-06-15' } });
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

describe('ProfileOnboarding', () => {
  beforeEach(() => {
    acceptCodeOfConduct.mockReset();
    completeTwoFactorSetup.mockReset();
    persistCurrentUser.mockReset();
    saveMyProfile.mockReset();
    startTwoFactorSetup.mockReset();
    saveMyProfile.mockResolvedValue({
      id: 'user-1',
      display_name: 'River',
      year_of_birth: 1998,
    });
    acceptCodeOfConduct.mockResolvedValue({
      needsCodeOfConduct: false,
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

    expect(screen.getByText('prove you may enter')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: '1998-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('choose your invocation')).toBeInTheDocument();
    await chooseMultiSelect('Pronouns', 'they/them');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('name your form')).toBeInTheDocument();
    await chooseMultiSelect('Gender Identity', 'nonbinary');
    expect(screen.getByRole('checkbox', { name: 'I am trans' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('find your crowd')).toBeInTheDocument();
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
    expect(await screen.findByRole('option', { name: 'Bear' })).toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: '1998-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await chooseMultiSelect('Pronouns', 'they/them');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Gender Identity' }));
    expect(await screen.findByRole('option', { name: 'trans man' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'trans woman' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'trans man' }));
    fireEvent.click(screen.getByRole('option', { name: 'trans woman' }));
    fireEvent.click(screen.getByRole('option', { name: 'nonbinary' }));
    fireEvent.click(screen.getByRole('option', { name: 'woman' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gender Identity' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'I am trans' }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await chooseMultiSelect('Crowds', 'T4T');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await chooseMultiSelect('Looking For', 'cruise');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await chooseMultiSelect('Vibes', 'Goth');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByPlaceholderText('A little about you...'), { target: { value: 'Velvet trouble.' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip 2fa for now/i }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      identities: ['trans man', 'trans woman', 'nonbinary'],
      is_trans: true,
      crowds: ['T4T'],
    })));
  });

  it('only offers T4T during onboarding after the user marks that they are trans', async () => {
    render(<ProfileOnboarding onComplete={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: '1998-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await chooseMultiSelect('Pronouns', 'they/them');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await chooseMultiSelect('Gender Identity', 'nonbinary');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Crowds' }));
    expect(screen.queryByRole('option', { name: 'T4T' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Crowds' }));

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'I am trans' }));
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
    fireEvent.click(screen.getByRole('button', { name: /skip 2fa for now/i }));

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
      date_of_birth: '1998-06-15',
      year_of_birth: 1998,
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

  it('lets users enable 2FA directly during onboarding before entering the map', async () => {
    const onComplete = vi.fn();
    render(<ProfileOnboarding onComplete={onComplete} />);

    await fillProfileRites();

    expect(screen.getByText('protect your key')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password'), {
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
    expect(screen.getByText('alpha-111')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /enter cruush/i }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(undefined, 'map');
  });

  it('requires a complete adult date of birth before continuing', () => {
    render(<ProfileOnboarding onComplete={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'River' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(screen.getByLabelText('Date of Birth')).toHaveAttribute('type', 'date');
    expect(nextButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: '2012-06-15' } });

    expect(screen.getByText('You must be at least 18 to use this app.')).toBeInTheDocument();
    expect(nextButton).toBeDisabled();
  });
});
