import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BetaLaunchCruushPlusOffer from './BetaLaunchCruushPlusOffer';

const offerCss = readFileSync('src/app/components/BetaLaunchCruushPlusOffer.css', 'utf8');

const rewardsApi = vi.hoisted(() => ({
  claimBetaLaunchCruushPlus: vi.fn(),
}));

const userNoticesApi = vi.hoisted(() => ({
  dismissUserNotice: vi.fn(),
  getUserNoticeDismissal: vi.fn(),
}));

vi.mock('../lib/rewardsApi', () => rewardsApi);
vi.mock('../lib/userNoticesApi', () => userNoticesApi);

function clearCookies() {
  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0]?.trim();

    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  });
}

describe('BetaLaunchCruushPlusOffer', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearCookies();
    rewardsApi.claimBetaLaunchCruushPlus.mockReset();
    userNoticesApi.dismissUserNotice.mockReset();
    userNoticesApi.getUserNoticeDismissal.mockReset();
    userNoticesApi.dismissUserNotice.mockResolvedValue({ dismissed: true, dismissedAt: '2026-08-01T00:00:00.000Z' });
    userNoticesApi.getUserNoticeDismissal.mockResolvedValue({ dismissed: false, dismissedAt: null });
    rewardsApi.claimBetaLaunchCruushPlus.mockResolvedValue({
      activeUntil: '2026-08-07T04:00:00.000Z',
      bankedDays: 0,
      effectiveCruushPlus: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('opens the login cruush+ trial as a moire access card', async () => {
    render(<BetaLaunchCruushPlusOffer userId="user-123" />);

    const trialHeading = await screen.findByRole('heading', { name: /7-day cruush\+ trial/i });
    const trialDescription = screen.getByText(/Claim one free week of/i);
    expect(trialHeading).toBeInTheDocument();
    expect(trialDescription).toHaveTextContent('cruush+');

    const trialCard = screen.getByTestId('beta-launch-cruush-plus-card');
    const activateButton = screen.getByRole('button', { name: 'OK, activate cruush+' });
    expect(trialCard).toHaveClass('beta-launch-plus-card');
    expect(screen.getByTestId('beta-launch-cruush-plus-card-label')).toHaveTextContent('cruush+');
    expect(trialHeading.querySelector('.beta-launch-plus-dialog__inline-word')).toHaveTextContent('cruush+');
    expect(trialDescription.querySelector('.beta-launch-plus-dialog__inline-word')).toHaveTextContent('cruush+');
    expect(activateButton.querySelector('.beta-launch-plus-dialog__inline-word')).toHaveTextContent('cruush+');
    expect(activateButton.querySelector('.beta-launch-plus-dialog__button-word')).toHaveTextContent('cruush+');
  });

  it('uses the map label font for the rest of the offer text', () => {
    expect(offerCss).toContain("font-family: 'Cormorant Garamond', serif;");
    expect(offerCss).toContain('.beta-launch-plus-dialog__footer button');
    expect(offerCss).toContain('.beta-launch-plus-dialog__inline-word');
  });

  it('keeps the existing claim action wired to the rewards API', async () => {
    render(<BetaLaunchCruushPlusOffer userId="user-123" />);

    fireEvent.click(await screen.findByRole('button', { name: 'OK, activate cruush+' }));

    await waitFor(() => {
      expect(rewardsApi.claimBetaLaunchCruushPlus).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByRole('heading', { name: /cruush\+ activated/i })).toBeInTheDocument();
    expect(screen.getByText('Your beta launch week is active. Press Done to close this card.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /cruush\+ activated/i })).not.toBeInTheDocument();
    });
  });
});
