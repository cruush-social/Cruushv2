import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
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
    expect(screen.queryByRole('button', { name: 'Edit Club' })).not.toBeInTheDocument();
  });

  it('keeps public detail, sharing, and join requests for nonmembers', async () => {
    getClub.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Brooklyn techno',
      summary: 'A Club for local dancers.',
      tags: ['leather', 'techno'],
      currentUserRole: null,
      conversationId: null,
      memberCount: 8,
      joinRequestStatus: 'none',
    });
    requestClubJoin.mockResolvedValue({ joinRequestStatus: 'pending' });

    render(
      <MemoryRouter initialEntries={['/clubs/22222222-2222-4222-8222-222222222222']}>
        <Routes><Route path="/clubs/:clubId" element={<ClubDetail />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('A Club for local dancers.')).toBeInTheDocument();
    expect(screen.getByText('8 members')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share Club' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Request to join' }));
    await waitFor(() => expect(requestClubJoin).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222'));
    expect(screen.getByRole('button', { name: 'Request sent' })).toBeDisabled();
  });
});
