import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SideQuestPrompt from './SideQuestPrompt';
import { getSideQuests } from '../lib/rewardsApi';

vi.mock('../lib/rewardsApi', () => ({ getSideQuests: vi.fn() }));

const mockedGetSideQuests = vi.mocked(getSideQuests);

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
    vi.clearAllMocks();
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
    expect(screen.getByText('Claim to scratch off 2 Pings and 1 day of cruush+.')).toBeInTheDocument();
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
