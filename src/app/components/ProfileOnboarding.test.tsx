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

function chooseMultiSelect(label: string, value: string) {
  const container = screen.getByText(label).closest('div');
  const select = container?.querySelector('select');

  if (!select) {
    throw new Error(`Unable to find ${label} select.`);
  }

  for (const option of Array.from(select.options)) {
    option.selected = option.value === value;
  }

  fireEvent.change(select);
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

  fireEvent.change(screen.getByPlaceholderText('e.g. 2000'), { target: { value: '1998' } });
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  chooseMultiSelect('Pronouns', 'they/them');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  chooseMultiSelect('Gender Identity', 'nonbinary');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  chooseMultiSelect('Looking For', 'cruise');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  chooseMultiSelect('Vibes', 'Goth');
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

  it('saves the profile, accepts the conduct version, then completes onboarding', async () => {
    const onComplete = renderConductOnboarding();

    await fillProfileRites();
    fireEvent.click(screen.getByRole('checkbox', {
      name: /i have read and agree to the cruush code of conduct/i,
    }));
    fireEvent.click(screen.getByRole('button', { name: /i agree and enter/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(saveMyProfile).toHaveBeenCalledTimes(1);
    expect(acceptCodeOfConduct).toHaveBeenCalledWith('2026-07-07');
    expect(saveMyProfile.mock.invocationCallOrder[0]).toBeLessThan(acceptCodeOfConduct.mock.invocationCallOrder[0]);
  });
});
