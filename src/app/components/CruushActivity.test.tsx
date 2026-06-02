import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import CruushActivity from './CruushActivity';
import { emitCruushChanged } from '../lib/cruushEvents';

const { getMyCruushActivity, sendCruush } = vi.hoisted(() => ({
  getMyCruushActivity: vi.fn(),
  sendCruush: vi.fn(),
}));

const { openConversationOrInbox } = vi.hoisted(() => ({
  openConversationOrInbox: vi.fn(),
}));

vi.mock('../lib/cruushApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/cruushApi')>('../lib/cruushApi');

  return {
    ...actual,
    getMyCruushActivity,
    sendCruush,
  };
});

vi.mock('../lib/openConversation', () => ({
  openConversationOrInbox,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function selectTab(name: RegExp) {
  const tab = screen.getByRole('tab', { name });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
  fireEvent.keyDown(tab, { key: 'Enter', code: 'Enter' });
}

const activityFixture = {
  entitlement: {
    cruushPlus: false,
    expiresAt: null,
  },
  counts: {
    incoming: 2,
    sent: 1,
    mutual: 1,
    views: 2,
  },
  incoming: [{
    id: 'incoming-1',
    createdAt: '2026-04-29T12:00:00.000Z',
    mutual: false,
    locked: false,
    user: {
      id: 'user-luna',
      name: 'luna',
      pronouns: 'they/them',
      photo: null,
    },
  }, {
    id: 'incoming-locked',
    createdAt: '2026-04-29T10:00:00.000Z',
    mutual: false,
    locked: true,
    user: null,
  }],
  sent: [{
    id: 'sent-1',
    createdAt: '2026-04-28T12:00:00.000Z',
    mutual: false,
    locked: false,
    user: {
      id: 'user-jay',
      name: 'jay',
      pronouns: 'he/they',
      photo: null,
    },
  }],
  mutual: [{
    id: 'match-1',
    matchId: 'match-1',
    createdAt: '2026-04-28T13:00:00.000Z',
    locked: false,
    user: {
      id: 'user-river',
      name: 'river',
      pronouns: 'they/them',
      photo: null,
    },
    mutualCrowds: ['T4T'],
    vibes: ['Goth'],
    distance: '0.4 mi away',
    lastActive: 'Active now',
    canMessage: true,
    canRevealPreciseLocation: true,
    coordinates: {
      lat: 40.731,
      lng: -73.991,
      precision: 'precise',
    },
  }],
  views: [{
    id: 'view-1',
    createdAt: '2026-04-29T11:30:00.000Z',
    viewedAt: '2026-04-29T11:30:00.000Z',
    locked: false,
    user: {
      id: 'user-indigo',
      name: 'indigo',
      pronouns: 'she/they',
      photo: null,
    },
  }, {
    id: 'view-locked',
    createdAt: '2026-04-29T09:00:00.000Z',
    viewedAt: '2026-04-29T09:00:00.000Z',
    locked: true,
    user: null,
  }],
};

describe('CruushActivity', () => {
  beforeEach(() => {
    getMyCruushActivity.mockReset();
    sendCruush.mockReset();
    openConversationOrInbox.mockReset();
    getMyCruushActivity.mockResolvedValue(activityFixture);
    sendCruush.mockResolvedValue({
      id: 'cruush-return',
      fromUserId: 'me',
      toUserId: 'user-luna',
      createdAt: '2026-04-29T12:05:00.000Z',
      mutual: true,
    });
  });

  it('renders locked free rows, mutual actions, and list-only mutual cruushes', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/cruush']}>
        <Routes>
          <Route path="/cruush" element={<><CruushActivity /><LocationProbe /></>} />
          <Route path="/map" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('luna')).toBeInTheDocument();
    expect(container.querySelector('img[src*="cruush-logo.svg"]')).toHaveClass('h-[4.375rem]');
    expect(screen.getByRole('tab', { name: /incoming/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /sent/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /mutual/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /views/i })).toBeInTheDocument();
    expect(screen.getByText('Someone new')).toBeInTheDocument();
    expect(screen.getByText('Upgrade to view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cruush luna back' }));
    await waitFor(() => expect(sendCruush).toHaveBeenCalledWith('user-luna', expect.objectContaining({
      name: 'luna',
    })));

    selectTab(/sent/i);
    expect(await screen.findByText('jay')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();

    selectTab(/mutual/i);
    expect(await screen.findByText('your mutual cruushes')).toBeInTheDocument();
    expect(screen.getByText('river')).toBeInTheDocument();
    expect(screen.getByText('0.4 mi away')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Message river' }));
    expect(openConversationOrInbox).toHaveBeenCalledWith(expect.any(Function), 'user-river');

    fireEvent.click(screen.getByRole('button', { name: 'Open river on map' }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map?mode=mutuals&focusUserId=user-river');

    expect(screen.queryByRole('button', { name: /^Map$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /See mutual cruushes on the map/i })).not.toBeInTheDocument();
  }, 10000);

  it('shows locked profile views for free users', async () => {
    render(
      <MemoryRouter>
        <CruushActivity />
      </MemoryRouter>
    );

    expect(await screen.findByText('luna')).toBeInTheDocument();
    selectTab(/views/i);

    expect(await screen.findByText('indigo')).toBeInTheDocument();
    expect(screen.getByText(/Viewed your profile/)).toBeInTheDocument();
    expect(screen.getByText('Someone new')).toBeInTheDocument();
    expect(screen.getByText('Upgrade to view')).toBeInTheDocument();
  });

  it('refreshes activity when cruush state changes elsewhere', async () => {
    render(
      <MemoryRouter>
        <CruushActivity />
      </MemoryRouter>
    );

    expect(await screen.findByText('luna')).toBeInTheDocument();
    expect(getMyCruushActivity).toHaveBeenCalledTimes(1);

    emitCruushChanged({
      targetUserId: 'user-jay',
      mutual: true,
    });

    await waitFor(() => expect(getMyCruushActivity).toHaveBeenCalledTimes(2));
  });

  it('does not offer a repeat cruush action for mutual incoming rows', async () => {
    getMyCruushActivity.mockResolvedValue({
      ...activityFixture,
      incoming: [{
        ...activityFixture.incoming[0],
        mutual: true,
      }],
      counts: {
        ...activityFixture.counts,
        incoming: 1,
      },
    });

    render(
      <MemoryRouter>
        <CruushActivity />
      </MemoryRouter>
    );

    expect(await screen.findByText('luna')).toBeInTheDocument();
    const mutualButton = screen.getByRole('button', { name: 'Already mutual with luna' });
    expect(mutualButton).toBeDisabled();

    fireEvent.click(mutualButton);
    expect(sendCruush).not.toHaveBeenCalled();
  });
});
