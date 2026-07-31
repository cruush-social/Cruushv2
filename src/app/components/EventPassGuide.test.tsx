import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventPassGuide from './EventPassGuide';

const { getEventPassGuide } = vi.hoisted(() => ({
  getEventPassGuide: vi.fn(),
}));

vi.mock('../lib/eventsApi', () => ({
  getEventPassGuide,
}));

describe('EventPassGuide', () => {
  beforeEach(() => {
    getEventPassGuide.mockReset();
  });

  it('shows the current door icon and hourly guide for staff', async () => {
    getEventPassGuide.mockResolvedValue({
      eventSlug: 'the-chocolate-factory-launch',
      venueName: 'The Chocolate Factory',
      startsAt: '2026-07-31T04:00:00.000Z',
      endsAt: '2026-08-01T09:00:00.000Z',
      current: {
        iconName: 'notifications',
        validFrom: '2026-08-01T02:00:00.000Z',
        validUntil: '2026-08-01T03:00:00.000Z',
        hourIndex: 22,
      },
      guide: [
        {
          iconName: 'camera',
          validFrom: '2026-07-31T04:00:00.000Z',
          validUntil: '2026-07-31T05:00:00.000Z',
          hourIndex: 0,
        },
        {
          iconName: 'cruush',
          validFrom: '2026-07-31T05:00:00.000Z',
          validUntil: '2026-07-31T06:00:00.000Z',
          hourIndex: 1,
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/events/the-chocolate-factory-launch/pass-guide']}>
        <Routes>
          <Route path="/events/:eventId/pass-guide" element={<EventPassGuide />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Current icon')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'notifications' })).toBeInTheDocument();
    expect(screen.getByText('The Chocolate Factory')).toBeInTheDocument();
    expect(screen.getByText('camera')).toBeInTheDocument();
    expect(screen.getByText('Hour 1')).toBeInTheDocument();
    expect(getEventPassGuide).toHaveBeenCalledWith('the-chocolate-factory-launch');
  });
});
