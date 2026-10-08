import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import AlphaBugButton from './AlphaBugButton';
import CruushActivity from './CruushActivity';
import { emitCruushChanged } from '../lib/cruushEvents';

const { getMyCruushActivity, revokeMutualCruush, revokeSentCruush, sendCruush } = vi.hoisted(() => ({
  getMyCruushActivity: vi.fn(),
  revokeMutualCruush: vi.fn(),
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
    revokeMutualCruush,
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
    incoming: 1,
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
      sideBadges: {
        left: { badge_id: 'dominant', frame: 'circle', intent: 'give' },
        right: { badge_id: 'top', frame: 'circle', intent: 'receive' },
      },
    },
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
    revokeMutualCruush.mockReset();
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
    revokeMutualCruush.mockResolvedValue({ revoked: true });
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

  it('docks the alpha bug reporter into the Activity header line', async () => {
    // Design rule: title, back button, header actions and the bug button
    // always share one line. The header registers a slot and the button sits
    // inside it, after the settings control.
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
    expect(slot.parentElement?.lastElementChild).toBe(slot);
    expect(reportButton).not.toHaveClass('fixed');
    expect(screen.getByTestId('cruush-count-grid')).not.toContainElement(reportButton);
    expect(screen.getByTestId('cruush-tab-grid')).not.toContainElement(reportButton);
  });

  it('reads the activity again when the app comes back to the foreground', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      render(
        <MemoryRouter initialEntries={['/cruush']}>
          <CruushActivity />
        </MemoryRouter>,
      );

      await screen.findByText('luna');
      expect(getMyCruushActivity).toHaveBeenCalledTimes(1);

      // The panel stays mounted while the phone is in a pocket, so views and
      // incoming cruushes sat frozen at whatever they were on the last open.
      await vi.advanceTimersByTimeAsync(61_000);
      document.dispatchEvent(new Event('visibilitychange'));

      await waitFor(() => expect(getMyCruushActivity).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not read the activity again on a resume moments after the last read', async () => {
    render(
      <MemoryRouter initialEntries={['/cruush']}>
        <CruushActivity />
      </MemoryRouter>,
    );

    await screen.findByText('luna');
    expect(getMyCruushActivity).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));

    expect(getMyCruushActivity).toHaveBeenCalledTimes(1);
  });

  it('renders incoming cruushes, mutual actions, and list-only cruushes for basic users', async () => {
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
    expect(screen.getByTestId('cruush-activity-header-content')).toHaveClass('max-w-2xl', 'px-4');
    expect(screen.getByTestId('cruush-stats-tabs')).toHaveClass('mx-auto', 'max-w-[38rem]', 'flex-col', 'items-center', 'text-center');
    expect(screen.getByTestId('cruush-count-grid')).toHaveClass('w-full');
    expect(container.querySelector('main')).toHaveClass('mx-auto', 'max-w-2xl');
    expect(screen.getByRole('heading', { name: 'Cruushes' })).toBeInTheDocument();
    expect(container.querySelector('img[src*="cruush-logo.svg"]')).not.toBeInTheDocument();
    expect(screen.getByTestId('cruush-count-grid')).toHaveClass('grid-cols-[repeat(4,minmax(0,1fr))]');
    expect(screen.getByTestId('cruush-count-grid').children[0]).toHaveClass('min-w-0');
    expect(screen.getByTestId('cruush-tab-grid')).toHaveClass('grid-cols-[repeat(4,minmax(0,1fr))]');
    expect(screen.getByTestId('cruush-tab-grid')).toHaveClass('rounded-lg', 'border-white/10', 'bg-background/25', 'p-1');
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
    expect(screen.queryByText('Upgrade to view')).not.toBeInTheDocument();
    expectHeartPreviewSize('luna preview');

    expect(screen.getByTestId('activity-side-badges')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /left badge:.*dominant/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /right badge:.*top/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'luna preview' }).querySelector('path')).toHaveAttribute('stroke', '#FF0072');
    const incomingIdentity = screen.getByText('luna').closest('button');
    expect(incomingIdentity).toHaveClass('min-w-0', 'text-left');
    expect(screen.getByText('luna').parentElement).toHaveTextContent('lunathey/them');
    const incomingMeta = screen.getByText('Nearby').closest('p');
    expect(incomingMeta).toHaveClass('flex', 'h-11', 'flex-col', 'justify-center');
    expect(incomingMeta).not.toHaveClass('sm:flex-row');
    expect(incomingMeta?.closest('button')).toHaveClass('min-w-0', 'text-left');
    expect(within(incomingMeta!).getByText('Nearby')).toHaveClass('block');
    expect(within(incomingMeta!).getByText('Nearby')).not.toHaveClass('sm:inline');
    const incomingCruushButton = screen.getByRole('button', { name: 'Send cruush to luna' });
    // They already cruushed you, so the control wears the double heart.
    expect(incomingCruushButton.querySelector('img')?.getAttribute('src')).toContain('safety-white');
    fireEvent.click(incomingCruushButton);
    await waitFor(() => expect(sendCruush).toHaveBeenCalledWith('user-luna', expect.objectContaining({
      name: 'luna',
    })));

    selectTab(/sent/i);
    expect(await screen.findByText('jay')).toBeInTheDocument();
    // A sent cruush carries no Pending label any more (414b93a, issue #280);
    // the card itself says the state.
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
    expectHeartPreviewSize('jay preview');
    expect(screen.getByRole('button', { name: 'jay preview' }).querySelector('path')).toHaveAttribute('stroke', '#FF0072');

    selectTab(/mutual/i);
    await waitFor(() => expect(screen.getByText('river')).toBeInTheDocument());
    expect(screen.queryByText('your cruushes')).not.toBeInTheDocument();
    expect(screen.queryByText('People you are mutually into.')).not.toBeInTheDocument();
    expect(screen.getByText('river')).toBeInTheDocument();
    // Distance labels are approximate unless both members choose precise, so
    // the mutual row reads Nearby instead of a mileage (cb5de40).
    const riverRow = screen.getByRole('button', { name: 'river preview' }).closest('[data-testid]')?.parentElement;
    expect(riverRow?.textContent).toContain('Nearby');
    expect(riverRow?.textContent).not.toMatch(/\d+(\.\d+)?\s*mi/);
    expectHeartPreviewSize('river preview');
    expect(screen.getByRole('button', { name: 'river preview' }).querySelector('path')).toHaveAttribute('stroke', '#6F00FF');
    // Cruushes rows use the Feed card layout: the identity takes the full
    // width and the actions drop to their own row, instead of sitting beside
    // the name and squeezing it.
    expect(screen.getByTestId('profile-action-trio').parentElement).toHaveClass('col-start-3', 'row-start-2');

    fireEvent.click(screen.getByRole('button', { name: 'Message river' }));
    expect(openConversationOrInbox).toHaveBeenCalledWith(expect.any(Function), 'user-river', undefined);

    expect(screen.getByRole('button', { name: 'river does not share their precise location' })).toBeDisabled();

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

  it('uses the one-line app header without a Message permissions tagline', async () => {
    render(
      <MemoryRouter>
        <CruushActivity />
      </MemoryRouter>,
    );

    expect(await screen.findByText('luna')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Message permissions' }));

    const dialog = screen.getByRole('dialog', { name: 'Message permissions' });
    expect(within(dialog).getByText('Message permissions', { selector: 'h1' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close Message permissions' })).toBeInTheDocument();
    expect(within(dialog).getByTestId('message-permissions-bug-button-slot')).toBeInTheDocument();
    expect(within(dialog).queryByText('Choose who can start a chat with you.')).not.toBeInTheDocument();
    expect(await within(dialog).findByRole('switch', { name: 'Toggle precise location for cruushes' })).toBeEnabled();
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

    const cruushButton = screen.getByRole('button', { name: 'Send cruush to indigo' });
    expect(cruushButton.querySelector('img')?.getAttribute('src')).toContain('safety-white');
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

  it('uses a dark selected state and lets a mutual incoming row become unmutual', async () => {
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
    const mutualButton = screen.getByRole('button', { name: 'Uncruush luna' });
    expect(mutualButton).toBeEnabled();
    expect(mutualButton).toHaveAttribute('data-cruush-state', 'mutual');
    expect(mutualButton).toHaveStyle({ background: 'var(--cruush-gradient-soft-28)' });

    fireEvent.click(mutualButton);
    await waitFor(() => expect(revokeMutualCruush).toHaveBeenCalledWith('user-luna'));
    expect(sendCruush).not.toHaveBeenCalled();
  });
});
