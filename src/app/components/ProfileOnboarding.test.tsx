import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileOnboarding from './ProfileOnboarding';

const { acceptCodeOfConduct, persistCurrentUser, saveMyProfile } = vi.hoisted(() => ({
  acceptCodeOfConduct: vi.fn(),
  persistCurrentUser: vi.fn(),
  saveMyProfile: vi.fn(),
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
    persistCurrentUser.mockReset();
    saveMyProfile.mockReset();
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
  });

  it('blocks completion on the oath step until the code of conduct is checked', async () => {
    renderConductOnboarding();

    await fillProfileRites();

    const enterButton = screen.getByRole('button', { name: /i agree and enter/i });

    expect(screen.getByText('take the oath')).toBeInTheDocument();
    expect(enterButton).toBeDisabled();
    expect(saveMyProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', {
      name: /i have read and agree to the cruush code of conduct/i,
    }));

    expect(enterButton).not.toBeDisabled();
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
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await chooseMultiSelect('Looking For', 'cruise');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await chooseMultiSelect('Vibes', 'Goth');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByPlaceholderText('A little about you...'), { target: { value: 'Velvet trouble.' } });
    fireEvent.click(screen.getByRole('button', { name: /enter cruush/i }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      identities: ['trans man', 'trans woman', 'nonbinary'],
    })));
  });

  it('saves the profile, accepts the conduct version, then completes onboarding', async () => {
    const onComplete = renderConductOnboarding();

    await fillProfileRites();
    fireEvent.click(screen.getByRole('checkbox', {
      name: /i have read and agree to the cruush code of conduct/i,
    }));
    fireEvent.click(screen.getByRole('button', { name: /i agree and enter/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(saveMyProfile).toHaveBeenCalledTimes(1);
    expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      display_name: 'River',
      looking_for: ['cruise'],
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
