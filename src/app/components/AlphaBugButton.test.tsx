import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlphaBugButton from './AlphaBugButton';

const { createSupportRequest } = vi.hoisted(() => ({
  createSupportRequest: vi.fn(),
}));

vi.mock('../lib/supportApi', () => ({
  createSupportRequest,
}));

describe('AlphaBugButton', () => {
  beforeEach(() => {
    createSupportRequest.mockReset();
    createSupportRequest.mockResolvedValue({
      id: 'support-1',
      status: 'open',
      aiTriageStatus: 'pending',
      createdAt: '2026-07-28T12:00:00.000Z',
    });
    window.history.replaceState({}, '', '/map?layer=nearby');
  });

  it('stays hidden when alpha reporting is not enabled', () => {
    render(<AlphaBugButton enabled={false} />);

    expect(screen.queryByRole('button', { name: 'Report alpha bug' })).not.toBeInTheDocument();
  });

  it('submits a fast bug report with page context', async () => {
    render(<AlphaBugButton enabled />);

    fireEvent.click(screen.getByRole('button', { name: 'Report alpha bug' }));
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'Map pins disappeared after I changed filters.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith({
      category: 'bug',
      subject: 'Alpha bug: /map?layer=nearby',
      message: 'Map pins disappeared after I changed filters.',
      source: 'unknown',
      pageUrl: '/map?layer=nearby',
    }));
    expect(await screen.findByText('Bug report sent')).toBeInTheDocument();
    expect(screen.getByText('Screenshots are allowed for alpha feedback. This report includes the current page.')).toBeInTheDocument();
  });
});
