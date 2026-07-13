import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportAction from './ReportAction';

const { createReport, toastSuccess, toastError } = vi.hoisted(() => ({
  createReport: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../lib/reportApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/reportApi')>('../lib/reportApi');
  return { ...actual, createReport };
});

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

describe('ReportAction', () => {
  beforeEach(() => {
    createReport.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    createReport.mockResolvedValue({
      id: 'report-1',
      status: 'open',
      createdAt: '2026-07-11T12:00:00.000Z',
    });
  });

  it('requires a reason before submitting', async () => {
    render(<ReportAction targetType="profile" targetId="user-2" targetLabel="River" />);

    fireEvent.click(screen.getByRole('button', { name: 'Report River' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    expect(await screen.findByText('Choose a reason before submitting.')).toBeInTheDocument();
    expect(createReport).not.toHaveBeenCalled();
  });

  it('submits once with the reason and optional details', async () => {
    let resolveReport: (value: unknown) => void = () => {};
    createReport.mockReturnValue(new Promise((resolve) => {
      resolveReport = resolve;
    }));

    render(<ReportAction targetType="post" targetId="post-1" targetLabel="post by River" />);

    fireEvent.click(screen.getByRole('button', { name: 'Report post by River' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'spam_scam' } });
    fireEvent.change(screen.getByLabelText('Additional details (optional)'), {
      target: { value: 'Repeated link spam.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submitting...' }));

    expect(createReport).toHaveBeenCalledTimes(1);
    expect(createReport).toHaveBeenCalledWith({
      targetType: 'post',
      targetId: 'post-1',
      reason: 'spam_scam',
      details: 'Repeated link spam.',
    });

    resolveReport({ id: 'report-1', status: 'open', createdAt: '2026-07-11T12:00:00.000Z' });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Report submitted.'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a safe error and keeps the dialog open when submission fails', async () => {
    createReport.mockRejectedValue(new Error('private backend detail'));
    render(<ReportAction targetType="conversation" targetId="conversation-1" targetLabel="conversation with River" />);

    fireEvent.click(screen.getByRole('button', { name: 'Report conversation with River' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'harassment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Unable to submit this report right now.'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('private backend detail')).not.toBeInTheDocument();
  });
});
