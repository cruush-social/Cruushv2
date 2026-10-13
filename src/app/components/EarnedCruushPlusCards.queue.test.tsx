import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import EarnedCruushPlusCards from './EarnedCruushPlusCards';
import PurgatoryInfoPrompt from './PurgatoryInfoPrompt';
import { resetExclusivePopupsForTest, usePopupQueueIdle } from '../lib/popupQueue';
import { acquireOneTimeDialog, releaseOneTimeDialog } from '../lib/oneTimeDialogQueue';

const api = vi.hoisted(() => ({ getRewardGrant: vi.fn(), getMyProfile: vi.fn() }));
vi.mock('../lib/rewardsApi', () => ({ getRewardGrant: api.getRewardGrant }));
vi.mock('../lib/profileApi', () => ({ getMyProfile: api.getMyProfile, PROFILE_CHANGED_EVENT: 'cruush:profile-changed' }));
// Only canvas painting is stubbed; the two prompt components, real dialog
// portals, and both scheduling queues remain intact.
vi.mock('../lib/cruushScratchInteraction', () => ({ attachCruushScratchInteraction: () => () => {} }));

afterEach(() => { cleanup(); resetExclusivePopupsForTest(); vi.unstubAllGlobals(); });

it('queues an earned reward behind an already-open first-entry prompt', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  localStorage.removeItem('cruush:first-entry-purgatory:v1:queue-fixture');
  resetExclusivePopupsForTest();
  api.getMyProfile.mockResolvedValue({ outOfSight: true, travelling: false });
  let resolveGrant!: (grant: { id: string; days: number; status: string }) => void;
  api.getRewardGrant.mockImplementation(() => new Promise(resolve => { resolveGrant = resolve; }));
  render(<MemoryRouter initialEntries={['/map?rewardGrant=synthetic-queue-grant']}>
    <PurgatoryInfoPrompt userId="queue-fixture" />
    <EarnedCruushPlusCards userId="queue-fixture" />
  </MemoryRouter>);
  expect(await screen.findByRole('dialog', { name: 'Purgatory' })).toBeInTheDocument();
  await act(async () => { resolveGrant({ id: 'synthetic-queue-grant', days: 1, status: 'active' }); });
  expect(document.querySelectorAll('[role="dialog"][data-state="open"]')).toHaveLength(1);
  expect(document.querySelector('.cruush-scratch-dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
  expect(await screen.findByRole('dialog', { name: 'cruush+ reward' })).toBeInTheDocument();
  expect(document.querySelectorAll('[role="dialog"][data-state="open"]')).toHaveLength(1);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.querySelectorAll('[role="dialog"][data-state="open"]')).toHaveLength(0);
  render(<QueueIdleProbe />);
  // The existing login-popup cooldown remains active after Purgatory closes.
  expect(screen.getByText('queue busy')).toBeInTheDocument();
  expect(acquireOneTimeDialog('queue-dismissal-probe')).toBe(true);
  releaseOneTimeDialog('queue-dismissal-probe');
});

function QueueIdleProbe() {
  return <output>{usePopupQueueIdle() ? 'queue idle' : 'queue busy'}</output>;
}

it('releases both queues when an earned card unmounts and ignores a late grant response', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  api.getRewardGrant.mockResolvedValueOnce({ id: 'synthetic-ready-grant', days: 1, status: 'active' });
  const active = render(<MemoryRouter initialEntries={['/map?rewardGrant=synthetic-ready-grant']}>
    <EarnedCruushPlusCards userId="queue-fixture" />
  </MemoryRouter>);
  expect(await screen.findByRole('dialog', { name: 'cruush+ reward' })).toBeInTheDocument();
  active.unmount();
  const probe = render(<QueueIdleProbe />);
  expect(screen.getByText('queue idle')).toBeInTheDocument();
  expect(acquireOneTimeDialog('queue-cleanup-probe')).toBe(true);
  releaseOneTimeDialog('queue-cleanup-probe');
  probe.unmount();

  let resolveGrant!: (grant: { id: string; days: number; status: string }) => void;
  api.getRewardGrant.mockImplementationOnce(() => new Promise(resolve => { resolveGrant = resolve; }));
  const pending = render(<MemoryRouter initialEntries={['/map?rewardGrant=synthetic-late-grant']}>
    <EarnedCruushPlusCards userId="queue-fixture" />
  </MemoryRouter>);
  pending.unmount();
  await act(async () => { resolveGrant({ id: 'synthetic-late-grant', days: 1, status: 'active' }); });
  render(<QueueIdleProbe />);
  expect(screen.getByText('queue idle')).toBeInTheDocument();
  expect(document.querySelectorAll('[role="dialog"][data-state="open"]')).toHaveLength(0);
  expect(acquireOneTimeDialog('queue-cleanup-probe')).toBe(true);
  releaseOneTimeDialog('queue-cleanup-probe');
});

it('does not occupy either queue when a grant cannot be loaded', async () => {
  api.getRewardGrant.mockRejectedValueOnce(new Error('synthetic grant unavailable'));
  await act(async () => {
    render(<MemoryRouter initialEntries={['/map?rewardGrant=synthetic-failed-grant']}>
      <EarnedCruushPlusCards userId="queue-fixture" />
      <QueueIdleProbe />
    </MemoryRouter>);
  });
  expect(screen.getByText('queue idle')).toBeInTheDocument();
  expect(document.querySelectorAll('[role="dialog"][data-state="open"]')).toHaveLength(0);
  expect(acquireOneTimeDialog('queue-failure-probe')).toBe(true);
  releaseOneTimeDialog('queue-failure-probe');
});
