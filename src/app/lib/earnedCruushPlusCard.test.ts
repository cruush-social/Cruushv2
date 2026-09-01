import { describe, expect, it, vi } from 'vitest';
import { cardForReward, EARNED_CRUUSH_PLUS_CARD_EVENT, showEarnedCruushPlusCard } from './earnedCruushPlusCard';

describe('earned cruush+ card presentation', () => {
  it('uses the confirmed grant duration, including a one-day Side Quest', () => {
    expect(cardForReward({ id: 'quest-grant', days: 1 })).toEqual({
      id: 'grant:quest-grant', amount: '1', unit: 'day', format: 'default',
    });
    expect(cardForReward({ id: 'month', days: 30 })).toMatchObject({ amount: '30', unit: 'days', format: 'compact' });
    expect(cardForReward({ id: 'empty', days: 0 })).toBeNull();
    expect(cardForReward({ id: 'invalid', days: NaN })).toBeNull();
  });

  it('dispatches the confirmed reward as a presentation event', () => {
    const receive = vi.fn();
    window.addEventListener(EARNED_CRUUSH_PLUS_CARD_EVENT, receive);
    try {
      showEarnedCruushPlusCard({ id: 'confirmed', days: 7 });
      expect(receive).toHaveBeenCalledOnce();
      expect(receive.mock.calls[0][0].detail).toMatchObject({ id: 'grant:confirmed', amount: '7' });
    } finally {
      window.removeEventListener(EARNED_CRUUSH_PLUS_CARD_EVENT, receive);
    }
  });
});
