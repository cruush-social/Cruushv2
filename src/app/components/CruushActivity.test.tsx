import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import AlphaBugButton from './AlphaBugButton';
import CruushActivity from './CruushActivity';
import { emitCruushChanged } from '../lib/cruushEvents';

const { getMyCruushActivity, revokeSentCruush, sendCruush } = vi.hoisted(() => ({
  getMyCruushActivity: vi.fn(),
  revokeSentCruush: vi.fn(),
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
    revokeSentCruush,
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
  expect(screen.getByRole('img', { name: label }).parentElement).toHaveClass('w-20');
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
      vibes: ['Artsy', 'Chill', 'Goth', 'Extra'],
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
      vibes: ['Punk', 'Geek', 'Leather'],
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
      vibes: ['Goth', 'Alt', 'Artsy'],
    },
    mutualCrowds: ['T4T'],
    vibes: ['Goth', 'Alt', 'Artsy', 'Extra'],
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
      vibes: ['Soft', 'Chill', 'Artsy'],
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
    revokeSentCruush.mockReset();
    sendCruush.mockReset();
    openConversationOrInbox.mockReset();
    dismissUserNotice.mockReset();
    getUserNoticeDismissal.mockReset();
    getMyCruushActivity.mockResolvedValue(activityFixture);
    revokeSentCruush.mockResolvedValue({
      revoked: true,
      mutualRevoked: false,
    });
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

  it('keeps the fixed alpha bug reporter outside the Activity header', async () => {
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

    expect(header).not.toContainElement(reportButton);
    expect(slot).not.toContainElement(reportButton);
    expect(reportButton).toHaveClass(
      'fixed',
      'right-[calc(0.75rem+env(safe-area-inset-right))]',
      'top-[calc(0.75rem+env(safe-area-inset-top))]',
      'z-[70]',
    );
    expect(screen.getByTestId('cruush-count-grid')).not.toContainElement(reportButton);
    expect(screen.getByTestId('cruush-tab-grid')).not.toContainElement(reportButton);
  });

  it('renders locked free rows, mutual actions, and list-only mutuals', async () => {
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
    expect(screen.getByTestId('cruush-count-grid')).toHaveClass('mx-auto', 'max-w-2xl');
    expect(container.querySelector('main')).toHaveClass('mx-auto', 'max-w-2xl');
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

    const incomingVibes = screen.getByTestId('activity-vibes');
    expect(within(incomingVibes).getAllByText(/Artsy|Chill|Goth/)).toHaveLength(3);
    expect(within(incomingVibes).queryByText('Extra')).not.toBeInTheDocument();
    const incomingCruushButton = screen.getByRole('button', { name: 'Send cruush to luna' });
    expect(incomingCruushButton.querySelector('img')?.getAttribute('src')).toContain('cruush-white');
    fireEvent.click(incomingCruushButton);
    await waitFor(() => expect(sendCruush).toHaveBeenCalledWith('user-luna', expect.objectContaining({
      name: 'luna',
    })));

    selectTab(/sent/i);
    expect(await screen.findByText('jay')).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expectHeartPreviewSize('jay preview');
    expect(screen.getByTestId('activity-vibes')).toHaveTextContent('PunkGeekLeather');

    selectTab(/mutual/i);
    await waitFor(() => expect(screen.getByText('river')).toBeInTheDocument());
    expect(screen.queryByText('your mutuals')).not.toBeInTheDocument();
    expect(screen.queryByText('People you are mutually into.')).not.toBeInTheDocument();
    expect(screen.getByText('river')).toBeInTheDocument();
    expect(screen.getByText('0.4 mi away')).toBeInTheDocument();
    expectHeartPreviewSize('river preview');
    expect(screen.getByTestId('activity-vibes')).toHaveTextContent('GothAltArtsy');
    expect(within(screen.getByTestId('activity-vibes')).queryByText('Extra')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Message river' }));
    expect(openConversationOrInbox).toHaveBeenCalledWith(expect.any(Function), 'user-river');

    fireEvent.click(screen.getByRole('button', { name: 'Center the map on river' }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map?mode=mutuals&focusUserId=user-river');

    expect(screen.queryByRole('button', { name: /^Map$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /See mutuals on the map/i })).not.toBeInTheDocument();
  }, 10000);

  it('offers a back control instead of a new chat control in the header', async () => {
    render(
      <MemoryRouter initialEntries={['/cruush']}>
        <Routes>
          <Route path="/cruush" element={<><CruushActivity /><LocationProbe /></>} />
          <Route path="/messages" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('luna')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'New cruush chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('unsends a pending cruush from the sent activity list', async () => {
    getMyCruushActivity
      .mockResolvedValueOnce(activityFixture)
      .mockResolvedValue({
        ...activityFixture,
        counts: {
          ...activityFixture.counts,
          sent: 0,
        },
        sent: [],
      });

    render(
      <MemoryRouter>
        <CruushActivity />
      </MemoryRouter>
    );

    expect(await screen.findByText('luna')).toBeInTheDocument();
    selectTab(/sent/i);

    const unsendButton = await screen.findByRole('button', { name: 'Unsend cruush to jay' });
    expect(unsendButton).toBeEnabled();
    fireEvent.click(unsendButton);

    await waitFor(() => expect(revokeSentCruush).toHaveBeenCalledWith('user-jay'));
    await waitFor(() => expect(screen.queryByText('jay')).not.toBeInTheDocument());
    expect(screen.getByText('No sent cruushes yet.')).toBeInTheDocument();
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
    expect(screen.getByTestId('activity-vibes')).toHaveTextContent('SoftChillArtsy');

    const cruushButton = screen.getByRole('button', { name: 'Send cruush to indigo' });
    expect(cruushButton.querySelector('img')?.getAttribute('src')).toContain('cruush-white');
    fireEvent.click(cruushButton);
    await waitFor(() => expect(sendCruush).toHaveBeenCalledWith('user-indigo', expect.objectContaining({
      name: 'indigo',
    })));
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
    const mutualButton = screen.getByRole('button', { name: 'Mutual with luna' });
    expect(mutualButton).toBeDisabled();

    fireEvent.click(mutualButton);
    expect(sendCruush).not.toHaveBeenCalled();
  });
});
