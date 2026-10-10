import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getBillingPlans, getMyBillingStatus, navigate } = vi.hoisted(() => ({
  getBillingPlans: vi.fn(), getMyBillingStatus: vi.fn(), navigate: vi.fn(),
}));
vi.mock('../lib/billingApi', () => ({
  CRUUSH_PLUS_CHANGED_EVENT: 'cruush-plus-changed', getBillingPlans, getMyBillingStatus,
}));
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
import GlobalSaleBanner from './GlobalSaleBanner';

const sale = { id: 'cruush-plus-50', percentOff: 50, endsAt: null, couponStacking: false };
const banner = () => screen.queryByRole('complementary', { name: 'cruush+ sale' });
const refresh = () => act(() => { window.dispatchEvent(new Event('cruush-plus-changed')); });

describe('GlobalSaleBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBillingPlans.mockReset().mockResolvedValue({ sale });
    getMyBillingStatus.mockReset().mockResolvedValue({ cruushPlus: false });
  });

  it('shows the existing offer to a loaded basic account and opens checkout', async () => {
    render(<GlobalSaleBanner userId="basic" />);
    expect(banner()).not.toBeInTheDocument();
    expect(await screen.findByRole('complementary', { name: 'cruush+ sale' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Purgatory Sacrifical Offering 50% off this weekend' }));
    expect(navigate).toHaveBeenCalledWith('/store');
  });

  it.each([
    { billing: { cruushPlus: true }, catalog: { sale } },
    { billing: { cruushPlus: false }, catalog: { sale: null } },
  ])('hides for paid accounts or an inactive sale: %j', async ({ billing, catalog }) => {
    getMyBillingStatus.mockResolvedValue(billing);
    getBillingPlans.mockResolvedValue(catalog);
    await act(async () => { render(<GlobalSaleBanner userId="member" />); });
    expect(banner()).not.toBeInTheDocument();
  });

  it('refreshes membership and hides the offer when that refresh fails', async () => {
    render(<GlobalSaleBanner userId="member" />);
    await screen.findByRole('complementary', { name: 'cruush+ sale' });
    getMyBillingStatus.mockResolvedValue({ cruushPlus: true });
    refresh();
    await waitFor(() => expect(getMyBillingStatus).toHaveBeenCalledTimes(2));
    expect(banner()).not.toBeInTheDocument();
    getMyBillingStatus.mockResolvedValue({ cruushPlus: false });
    refresh();
    await screen.findByRole('complementary', { name: 'cruush+ sale' });
    getBillingPlans.mockRejectedValue(new Error('Unavailable'));
    refresh();
    await act(async () => {});
    expect(banner()).not.toBeInTheDocument();
  });

  it('ignores an older basic response after a newer paid response', async () => {
    let resolveOld!: (value: { cruushPlus: boolean }) => void;
    getMyBillingStatus.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    render(<GlobalSaleBanner userId="member" />);
    getMyBillingStatus.mockResolvedValue({ cruushPlus: true });
    refresh();
    await act(async () => { resolveOld({ cruushPlus: false }); });
    expect(banner()).not.toBeInTheDocument();
  });

  it('ignores a pending response after unmount and removes its refresh listener', async () => {
    let resolveOld!: (value: { cruushPlus: boolean }) => void;
    getMyBillingStatus.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const view = render(<GlobalSaleBanner userId="member" />);
    view.unmount();
    await act(async () => { resolveOld({ cruushPlus: false }); });
    refresh();
    expect(getMyBillingStatus).toHaveBeenCalledTimes(1);
    expect(banner()).not.toBeInTheDocument();
  });
});
