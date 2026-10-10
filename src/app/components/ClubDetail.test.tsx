import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClubDetail from './ClubDetail';

const { getClub, requestClubJoin } = vi.hoisted(() => ({
  getClub: vi.fn(),
  requestClubJoin: vi.fn(),
}));

vi.mock('../lib/clubsApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/clubsApi')>('../lib/clubsApi')),
  getClub,
  requestClubJoin,
}));

describe('ClubDetail', () => {
  beforeEach(() => {
    getClub.mockReset();
    requestClubJoin.mockReset();
  });

  it('sends every current member directly into the Club chat', async () => {
    getClub.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Brooklyn techno',
      summary: 'A Club for local dancers.',
      tags: ['leather', 'techno'],
      currentUserRole: 'owner',
      conversationId: '44444444-4444-4444-8444-444444444444',
      memberCount: 8,
      joinRequestStatus: 'member',
    });

    render(
      <MemoryRouter initialEntries={['/clubs/22222222-2222-4222-8222-222222222222']}>
        <Routes>
          <Route path="/clubs/:clubId" element={<ClubDetail />} />
          <Route path="/chat/:conversationId" element={<div>Club chat route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Club chat route')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Coven' })).not.toBeInTheDocument();
  });

  it.each([true, undefined])('keeps public detail, sharing, and approval requests when approval is %s', async (requiresJoinApproval) => {
    getClub.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Brooklyn techno',
      summary: 'A Club for local dancers.',
      tags: ['leather', 'techno'],
      currentUserRole: null,
      conversationId: null,
      memberCount: 8,
      joinRequestStatus: 'none',
      requiresJoinApproval,
    });
    requestClubJoin.mockResolvedValue({ joinRequestStatus: 'pending' });

    render(
      <MemoryRouter initialEntries={['/clubs/22222222-2222-4222-8222-222222222222']}>
        <Routes>
          <Route path="/clubs/:clubId" element={<ClubDetail />} />
          <Route path="/chat/:conversationId" element={<div>Coven chat route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('A Club for local dancers.')).toBeInTheDocument();
    expect(screen.getByText('8 members')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share Coven' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Covens' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Request to join' }));
    await waitFor(() => expect(requestClubJoin).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222'));
    expect(screen.getByRole('button', { name: 'Request sent' })).toBeDisabled();
    expect(screen.queryByText('Coven chat route')).not.toBeInTheDocument();
  });

  it.each([true, false])('navigates only after confirmed membership when approval was %s', async (requiresJoinApproval) => {
    getClub.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222', title: 'Open circle', summary: '', tags: ['techno'],
      currentUserRole: null, conversationId: null, memberCount: 8, joinRequestStatus: 'none', requiresJoinApproval,
    });
    let completeJoin!: (result: { joinRequestStatus: 'member'; conversationId: string }) => void;
    requestClubJoin.mockReturnValue(new Promise((resolve) => { completeJoin = resolve; }));
    render(
      <MemoryRouter initialEntries={['/clubs/22222222-2222-4222-8222-222222222222']}>
        <Routes>
          <Route path="/clubs/:clubId" element={<ClubDetail />} />
          <Route path="/chat/44444444-4444-4444-8444-444444444444" element={<div>Coven chat route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const joinButton = await screen.findByRole('button', { name: requiresJoinApproval ? 'Request to join' : 'Join Coven' });
    expect(screen.queryByRole('button', { name: requiresJoinApproval ? 'Join Coven' : 'Request to join' })).not.toBeInTheDocument();
    expect(screen.queryByText('Coven chat route')).not.toBeInTheDocument();
    fireEvent.click(joinButton);
    expect(requestClubJoin).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
    expect(joinButton).toBeDisabled();
    fireEvent.click(joinButton);
    expect(requestClubJoin).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Coven chat route')).not.toBeInTheDocument();
    await act(async () => completeJoin({ joinRequestStatus: 'member', conversationId: '44444444-4444-4444-8444-444444444444' }));
    expect(await screen.findByText('Coven chat route')).toBeInTheDocument();
  });

  it.each([true, false])('keeps a failed join on detail with retry available when approval is %s', async (requiresJoinApproval) => {
    getClub.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222', title: 'Circle', summary: '', tags: ['techno'],
      currentUserRole: null, conversationId: null, memberCount: 8, joinRequestStatus: 'none', requiresJoinApproval,
    });
    requestClubJoin.mockRejectedValue(new Error('This Coven is full.'));
    render(
      <MemoryRouter initialEntries={['/clubs/22222222-2222-4222-8222-222222222222']}>
        <Routes>
          <Route path="/clubs/:clubId" element={<ClubDetail />} />
          <Route path="/chat/:conversationId" element={<div>Coven chat route</div>} />
        </Routes>
      </MemoryRouter>,
    );
    const name = requiresJoinApproval ? 'Request to join' : 'Join Coven';
    fireEvent.click(await screen.findByRole('button', { name }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This Coven is full.');
    expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(screen.queryByText('Coven chat route')).not.toBeInTheDocument();
  });

  it('honors a pending response even when the fetched Coven allowed open joining', async () => {
    getClub.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222', title: 'Circle', summary: '', tags: ['techno'],
      currentUserRole: null, conversationId: null, memberCount: 8, joinRequestStatus: 'none', requiresJoinApproval: false,
    });
    requestClubJoin.mockResolvedValue({ joinRequestStatus: 'pending' });
    render(
      <MemoryRouter initialEntries={['/clubs/22222222-2222-4222-8222-222222222222']}>
        <Routes>
          <Route path="/clubs/:clubId" element={<ClubDetail />} />
          <Route path="/chat/:conversationId" element={<div>Coven chat route</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Join Coven' }));
    expect(await screen.findByRole('button', { name: 'Request sent' })).toBeDisabled();
    expect(screen.queryByText('Coven chat route')).not.toBeInTheDocument();
  });

  it.each(['back', 'unmount', 'other-coven'])('ignores a delayed member response after %s', async (departure) => {
    const firstClubId = '22222222-2222-4222-8222-222222222222';
    const secondClubId = '33333333-3333-4333-8333-333333333333';
    getClub.mockImplementation(async (id: string) => ({
      id, title: id === firstClubId ? 'First circle' : 'Second circle', summary: '', tags: ['techno'],
      currentUserRole: null, conversationId: null, memberCount: 8, joinRequestStatus: 'none', requiresJoinApproval: false,
    }));
    let completeJoin!: (result: { joinRequestStatus: 'member'; conversationId: string }) => void;
    requestClubJoin.mockReturnValue(new Promise((resolve) => { completeJoin = resolve; }));
    const router = createMemoryRouter([
      { path: '/clubs/:clubId', element: <ClubDetail /> },
      { path: '/messages', element: <div>Coven directory route</div> },
      { path: '/chat/:conversationId', element: <div>Old Coven chat route</div> },
    ], { initialEntries: [`/clubs/${firstClubId}`] });
    const view = render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Join Coven' }));

    if (departure === 'back') {
      fireEvent.click(screen.getByRole('button', { name: 'Back to Covens' }));
      expect(await screen.findByText('Coven directory route')).toBeInTheDocument();
    } else if (departure === 'unmount') {
      view.unmount();
    } else {
      await act(async () => { await router.navigate(`/clubs/${secondClubId}`); });
      expect(await screen.findByRole('heading', { name: 'Second circle' })).toBeInTheDocument();
    }
    const destination = router.state.location.pathname;
    await act(async () => completeJoin({ joinRequestStatus: 'member', conversationId: '44444444-4444-4444-8444-444444444444' }));

    expect(router.state.location.pathname).toBe(destination);
    expect(screen.queryByText('Old Coven chat route')).not.toBeInTheDocument();
    if (departure === 'other-coven') {
      expect(screen.getByRole('button', { name: 'Join Coven' })).toBeEnabled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  });

  it.each(['pending', 'error'])('ignores an old %s result without clearing the new Coven join in flight', async (outcome) => {
    const firstClubId = '22222222-2222-4222-8222-222222222222';
    const secondClubId = '33333333-3333-4333-8333-333333333333';
    getClub.mockImplementation(async (id: string) => ({
      id, title: id === firstClubId ? 'First circle' : 'Second circle', summary: '', tags: ['techno'],
      currentUserRole: null, conversationId: null, memberCount: 8, joinRequestStatus: 'none', requiresJoinApproval: false,
    }));
    let completeOldJoin!: (result: { joinRequestStatus: 'pending' }) => void;
    let rejectOldJoin!: (error: Error) => void;
    let completeNewJoin!: (result: { joinRequestStatus: 'pending' }) => void;
    requestClubJoin
      .mockReturnValueOnce(new Promise((resolve, reject) => { completeOldJoin = resolve; rejectOldJoin = reject; }))
      .mockReturnValueOnce(new Promise((resolve) => { completeNewJoin = resolve; }));
    const router = createMemoryRouter([
      { path: '/clubs/:clubId', element: <ClubDetail /> },
    ], { initialEntries: [`/clubs/${firstClubId}`] });
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Join Coven' }));
    await act(async () => { await router.navigate(`/clubs/${secondClubId}`); });
    expect(await screen.findByRole('heading', { name: 'Second circle' })).toBeInTheDocument();
    const newJoinButton = screen.getByRole('button', { name: 'Join Coven' });
    expect(newJoinButton).toBeEnabled();
    fireEvent.click(newJoinButton);
    expect(requestClubJoin).toHaveBeenNthCalledWith(2, secondClubId);

    await act(async () => {
      if (outcome === 'pending') completeOldJoin({ joinRequestStatus: 'pending' });
      else rejectOldJoin(new Error('Old Coven request failed.'));
    });
    expect(screen.getByRole('button', { name: 'Join Coven' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Request sent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/clubs/${secondClubId}`);

    await act(async () => completeNewJoin({ joinRequestStatus: 'pending' }));
    expect(screen.getByRole('button', { name: 'Request sent' })).toBeDisabled();
  });
});
