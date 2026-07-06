import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportPage from './ReportPage';

const { createReport } = vi.hoisted(() => ({
  createReport: vi.fn(),
}));

vi.mock('../lib/reportApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/reportApi')>('../lib/reportApi');

  return {
    ...actual,
    createReport,
  };
});

describe('ReportPage', () => {
  beforeEach(() => {
    createReport.mockReset();
    createReport.mockResolvedValue({
      id: 'report-1',
      status: 'open',
      createdAt: '2026-07-06T12:00:00.000Z',
    });
  });

  it('submits a profile report from route state', async () => {
    render(
      <MemoryRouter initialEntries={[{
        pathname: '/report',
        state: {
          targetType: 'profile',
          targetUserId: 'user-2',
          targetLabel: 'Jordan',
        },
      }]}>
        <Routes>
          <Route path="/report" element={<ReportPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Jordan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Minor safety/i }));
    fireEvent.change(screen.getByLabelText('Details'), {
      target: {
        value: 'Profile claims the person is underage.',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(createReport).toHaveBeenCalledWith(expect.objectContaining({
      targetType: 'profile',
      targetUserId: 'user-2',
      reason: 'minor_safety',
      details: 'Profile claims the person is underage.',
    })));
    expect(await screen.findByText('Report submitted')).toBeInTheDocument();
  });

  it('blocks submission when the report target is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/report']}>
        <Routes>
          <Route path="/report" element={<ReportPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('This report link is missing its target.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit report' })).toBeDisabled();
  });
});
