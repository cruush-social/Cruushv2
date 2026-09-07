import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SideQuestPrompt, { sideQuestPromptStorageKey } from './SideQuestPrompt';
import { clearPersistentNoticeFlag } from '../lib/persistentNotice';
import { resetExclusivePopupsForTest } from '../lib/popupQueue';
import { getSideQuests } from '../lib/rewardsApi';

vi.mock('../lib/rewardsApi', () => ({ getSideQuests: vi.fn() }));

const mockedGetSideQuests = vi.mocked(getSideQuests);

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

function summary(quests: Array<{ completed: boolean; claimed: boolean; rewardKind: 'ping' | 'cruush_plus_day'; rewardAmount: number }>) {
  return {
    claimingAvailable: true,
    cruushPlusClaimsThisWeek: 0,
    cruushPlusWeeklyLimit: 2,
    claimedToday: false,
    quests: quests.map((quest, index) => ({
      key: `quest_${index}` as never,
      title: `Quest ${index}`,
      claimedAt: null,
      ...quest,
    })),
  };
}

describe('SideQuestPrompt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // The seen flag is kept in a cookie as well as localStorage, and jsdom
    // carries cookies from one test into the next.
    clearPersistentNoticeFlag(sideQuestPromptStorageKey('user-1'));
    resetExclusivePopupsForTest();
    vi.clearAllMocks();
  });

  it('takes you to rewards when you claim', async () => {
    mockedGetSideQuests.mockResolvedValue(summary([
      { completed: true, claimed: false, rewardKind: 'cruush_plus_day', rewardAmount: 1 },
    ]) as never);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <SideQuestPrompt userId="user-1" />
        <LocationProbe />
        <Routes><Route path="/rewards" element={<div>Rewards page</div>} /></Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('side-quest-prompt');
    fireEvent.click(screen.getByRole('button', { name: 'Claim now' }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rewards'));
  });

  it('offers to claim the quests already finished, naming the reward', async () => {
    mockedGetSideQuests.mockResolvedValue(summary([
      { completed: true, claimed: false, rewardKind: 'ping', rewardAmount: 2 },
      { completed: true, claimed: false, rewardKind: 'cruush_plus_day', rewardAmount: 1 },
      { completed: false, claimed: false, rewardKind: 'ping', rewardAmount: 5 },
    ]) as never);

    render(<MemoryRouter><SideQuestPrompt userId="user-1" /></MemoryRouter>);

    expect(await screen.findByTestId('side-quest-prompt')).toBeInTheDocument();
    expect(screen.getByText('2 Side Quests are ready to claim')).toBeInTheDocument();
    // The unfinished 5-Ping quest must not be counted into the promise.
    // The card names the reward itself rather than describing it in a
    // sentence: cruush+ on its own line, and no Pulse count beside it.
    expect(screen.getByText('cruush+')).toBeInTheDocument();
    expect(screen.queryByText('2 Pulses')).not.toBeInTheDocument();
  });

  it('stays quiet when nothing is waiting to be claimed', async () => {
    mockedGetSideQuests.mockResolvedValue(summary([
      { completed: true, claimed: true, rewardKind: 'ping', rewardAmount: 1 },
      { completed: false, claimed: false, rewardKind: 'ping', rewardAmount: 1 },
    ]) as never);

    render(<MemoryRouter><SideQuestPrompt userId="user-2" /></MemoryRouter>);

    await waitFor(() => expect(mockedGetSideQuests).toHaveBeenCalled());
    expect(screen.queryByTestId('side-quest-prompt')).not.toBeInTheDocument();
  });
});
