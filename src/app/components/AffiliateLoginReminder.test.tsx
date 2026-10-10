import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetExclusivePopupsForTest, useExclusivePopup } from '../lib/popupQueue';

const { getRewardSummary } = vi.hoisted(() => ({ getRewardSummary: vi.fn() }));
vi.mock('../lib/rewardsApi', () => ({ getRewardSummary }));
import AffiliateLoginReminder, { affiliateReminderDay, affiliateReminderKey } from './AffiliateLoginReminder';

function Earlier({ pending }: { pending: boolean }) {
  useExclusivePopup('purgatory-info', pending);
  return null;
}
const view = (userId = 'member', pending = false) => <MemoryRouter>
  <Earlier pending={pending} />
  <AffiliateLoginReminder userId={userId} />
  <Routes><Route path="/rewards" element={<p>Rewards destination</p>} /><Route path="*" element={null} /></Routes>
</MemoryRouter>;

describe('AffiliateLoginReminder', () => {
  beforeEach(() => {
    localStorage.clear();
    resetExclusivePopupsForTest();
    getRewardSummary.mockReset();
    getRewardSummary.mockResolvedValue({ referrals: { link: 'https://example.test/invite' }, rules: { referralRewardDays: 7 } });
  });

  it('shows server-owned reward terms once daily and opens Rewards', async () => {
    const first = render(view());
    expect(await screen.findByRole('dialog', { name: 'Affiliate program' })).toBeInTheDocument();
    expect(screen.getByText('You receive 7 cruush+ days once they verify 2FA.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveFocus();
    expect(localStorage.getItem(affiliateReminderKey('member'))).toBe(affiliateReminderDay());
    fireEvent.click(screen.getByRole('button', { name: 'View rewards' }));
    expect(screen.getByText('Rewards destination')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    first.unmount();
    await act(async () => { render(view()); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getRewardSummary).toHaveBeenCalledTimes(1);
  });

  it('reappears at a later-day login and can be dismissed', async () => {
    localStorage.setItem(affiliateReminderKey('member'), '2000-1-1');
    render(view());
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(affiliateReminderKey('member'))).toBe(affiliateReminderDay());
  });

  it('waits for earlier prompts without consuming the daily reminder', async () => {
    const rendered = render(view('member', true));
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(affiliateReminderKey('member'))).toBeNull();
    rendered.rerender(view('member', false));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('keeps separate daily state for different accounts', async () => {
    localStorage.setItem(affiliateReminderKey('other'), affiliateReminderDay());
    render(view());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('does not show made-up terms when the summary fails', async () => {
    getRewardSummary.mockRejectedValue(new Error('offline'));
    await act(async () => { render(view()); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(affiliateReminderKey('member'))).toBeNull();
  });
});
