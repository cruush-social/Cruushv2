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
  });

  it('submits a profile report from route state', async () => {
    createReport.mockResolvedValue({
      id: 'report-1',
      status: 'open',
      createdAt: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter initialEntries={[{
        pathname: '/report',
        state: {
          targetType: 'profile',
          targetUserId: '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97',
          targetLabel: 'River',
        },
      }]}>
        <Routes>
          <Route path="/report" element={<ReportPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('radio', { name: /Spam or scam/i }));
    fireEvent.change(screen.getByLabelText('Details'), {
      target: {
        value: 'Keeps sending off-platform payment links.',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(createReport).toHaveBeenCalledWith({
      targetType: 'profile',
      targetUserId: '53fd68d7-24fc-4cff-8cd7-a97ec0cadf97',
      conversationId: undefined,
      messageId: undefined,
      reason: 'spam_scam',
      details: 'Keeps sending off-platform payment links.',
    }));
    expect(await screen.findByText('Report submitted')).toBeInTheDocument();
  });

  it('blocks submission when the report target is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/report']}>
        <Routes>
          <Route path="/report" element={<ReportPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('This report link is missing its target.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit report' })).toBeDisabled();
    expect(createReport).not.toHaveBeenCalled();
  });
});
