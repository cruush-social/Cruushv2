import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import AlphaBugButton from './AlphaBugButton';
import CruushActivity from './CruushActivity';
import { emitCruushChanged } from '../lib/cruushEvents';

const { getMyCruushActivity, sendCruush } = vi.hoisted(() => ({
  getMyCruushActivity: vi.fn(),
  sendCruush: vi.fn(),
}));

const { openConversationOrInbox } = vi.hoisted(() => ({
  openConversationOrInbox: vi.fn(),
}));

const { dismissUserNotice, getUserNoticeDismissal } = vi.hoisted(() => ({
  dismissUserNotice: vi.fn(),
  getUserNoticeDismissal: vi.fn(),
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

vi.mock('../lib/userNoticesApi', () => ({
  dismissUserNotice,
  getUserNoticeDismissal,
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

function expectHeartPreviewSize(label: string) {
  expect(screen.getByRole('img', { name: label }).parentElement).toHaveClass('w-16');
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
    dismissUserNotice.mockReset();
    getUserNoticeDismissal.mockReset();
    getMyCruushActivity.mockResolvedValue(activityFixture);
    sendCruush.mockResolvedValue({
      id: 'cruush-return',
      fromUserId: 'me',
      toUserId: 'user-luna',
      createdAt: '2026-04-29T12:05:00.000Z',
      mutual: true,
    });
    dismissUserNotice.mockResolvedValue({ dismissed: true, dismissedAt: null });
    getUserNoticeDismissal.mockResolvedValue({ dismissed: true, dismissedAt: null });
  });

  it('docks the alpha bug reporter in the Activity header instead of the count grid', async () => {
    render(
      <MemoryRouter initialEntries={['/cruush']}>
        <CruushActivity />
        <AlphaBugButton enabled />
      </MemoryRouter>,
    );

    await screen.findByText('luna');

    const header = screen.getByTestId('cruush-activity-header');
    const slot = screen.getByTestId('cruush-activity-bug-button-slot');
    const reportButton = screen.getByRole('button', { name: 'Report alpha bug' });

    expect(header).toContainElement(reportButton);
    expect(slot).toContainElement(reportButton);
    expect(reportButton).not.toHaveClass('fixed', 'z-20');
    expect(screen.getByTestId('cruush-count-grid')).not.toContainElement(reportButton);
    expect(screen.getByTestId('cruush-tab-grid')).not.toContainElement(reportButton);
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
    expect(container.firstElementChild).toHaveClass('min-h-screen');
    expect(container.firstElementChild).not.toHaveClass('h-dvh');
    expect(container.firstElementChild).not.toHaveClass('overflow-y-scroll');
    expect(container.firstElementChild).not.toHaveClass('[scrollbar-gutter:stable]');
    expect(screen.getByTestId('cruush-activity-header')).toHaveClass('sticky', 'top-0');
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(container.querySelector('img[src*="cruush-logo.svg"]')).not.toBeInTheDocument();
    expect(screen.getByTestId('cruush-count-grid')).toHaveClass('grid-cols-[repeat(4,minmax(0,1fr))]');
    expect(screen.getByTestId('cruush-count-grid').children[0]).toHaveClass('min-w-0');
    expect(screen.getByTestId('cruush-tab-grid')).toHaveClass('grid-cols-[repeat(4,minmax(0,1fr))]');
    expect(screen.queryByText('your cruushes')).not.toBeInTheDocument();
    expect(screen.queryByText('relationships, interest & activity')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'incoming' })).toHaveClass('min-w-0');
    expect(screen.getByRole('tab', { name: 'incoming' })).toHaveTextContent(/^incoming$/);
    expect(screen.getByRole('tab', { name: 'sent' })).toHaveClass('min-w-0');
    expect(screen.getByRole('tab', { name: 'sent' })).toHaveTextContent(/^sent$/);
    expect(screen.getByRole('tab', { name: 'mutual' })).toHaveClass('min-w-0');
    expect(screen.getByRole('tab', { name: 'mutual' })).toHaveTextContent(/^mutual$/);
    expect(screen.getByRole('tab', { name: 'views' })).toHaveClass('min-w-0');
    expect(screen.getByRole('tab', { name: 'views' })).toHaveTextContent(/^views$/);
    expect(screen.getByText('Someone new')).toBeInTheDocument();
    expect(screen.getByText('Upgrade to view')).toBeInTheDocument();
    expectHeartPreviewSize('luna preview');
    expectHeartPreviewSize('Locked incoming cruush');

    fireEvent.click(screen.getByRole('button', { name: 'cruush luna back' }));
    await waitFor(() => expect(sendCruush).toHaveBeenCalledWith('user-luna', expect.objectContaining({
      name: 'luna',
    })));

    selectTab(/sent/i);
    expect(await screen.findByText('jay')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expectHeartPreviewSize('jay preview');

    selectTab(/mutual/i);
    await waitFor(() => expect(screen.getByText('river')).toBeInTheDocument());
    expect(screen.queryByText('your mutual cruushes')).not.toBeInTheDocument();
    expect(screen.queryByText('People you are mutually into.')).not.toBeInTheDocument();
    expect(screen.getByText('river')).toBeInTheDocument();
    expect(screen.getByText('0.4 mi away')).toBeInTheDocument();
    expectHeartPreviewSize('river preview');

    fireEvent.click(screen.getByRole('button', { name: 'Message river' }));
    expect(openConversationOrInbox).toHaveBeenCalledWith(expect.any(Function), 'user-river');

    fireEvent.click(screen.getByRole('button', { name: 'Open river on map' }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map?mode=mutuals&focusUserId=user-river');

    expect(screen.queryByRole('button', { name: /^Map$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /See mutual cruushes on the map/i })).not.toBeInTheDocument();
  }, 10000);

  it('offers direct and group chat choices from the cruush plus menu', async () => {
    render(
      <MemoryRouter initialEntries={['/cruush']}>
        <Routes>
          <Route path="/cruush" element={<><CruushActivity /><LocationProbe /></>} />
          <Route path="/messages" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('luna')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New cruush chat' }));
    expect(screen.getByRole('button', { name: /^Start chat with mutual/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Create group message/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Start chat with mutual/ }));
    fireEvent.click(screen.getByRole('button', { name: /river/ }));
    expect(openConversationOrInbox).toHaveBeenCalledWith(expect.any(Function), 'user-river');

    fireEvent.click(screen.getByRole('button', { name: 'New cruush chat' }));
    fireEvent.click(screen.getByRole('button', { name: /^Create group message/ }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/messages?compose=group');
  });

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
    expectHeartPreviewSize('indigo preview');
    expectHeartPreviewSize('Locked profile view');
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
