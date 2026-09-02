import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import EarnedCruushPlusCards from './EarnedCruushPlusCards';

const api = vi.hoisted(() => ({ getRewardGrant: vi.fn(), getRewardSummary: vi.fn() }));
vi.mock('../lib/rewardsApi', () => api);
vi.mock('./CruushPlusScratchCard', () => ({
  default: ({ card }: { card: { amount: string; unit: string } }) => <div role="dialog">{card.amount} {card.unit}</div>,
}));
vi.mock('../lib/persistentNotice', () => ({
  hasPersistentNoticeFlag: () => false, setPersistentNoticeFlag: vi.fn(),
}));
vi.mock('../lib/oneTimeDialogQueue', () => ({
  acquireOneTimeDialog: () => true,
  onOneTimeDialogReleased: () => () => {},
  releaseOneTimeDialog: vi.fn(),
}));

it('opens the exact confirmed reward without recent history and never opens a reversed grant', async () => {
  const grant = { id: 'old-owned-grant', days: 7, status: 'active' };
  api.getRewardGrant.mockResolvedValue(grant);
  const mount = () => render(
    <MemoryRouter initialEntries={['/rewards?rewardGrant=old-owned-grant&days=999']}>
      <EarnedCruushPlusCards userId="owner" />
    </MemoryRouter>,
  );
  const first = mount();
  expect(await screen.findByRole('dialog')).toHaveTextContent('7 days');
  expect(api.getRewardGrant).toHaveBeenCalledWith('old-owned-grant');
  expect(api.getRewardSummary).not.toHaveBeenCalled();
  first.unmount();

  api.getRewardGrant.mockResolvedValue({ ...grant, status: 'reversed' });
  const second = mount();
  await waitFor(() => expect(api.getRewardGrant).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  second.unmount();
});
