import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import Survey from './Survey';

const { createSupportRequest } = vi.hoisted(() => ({
  createSupportRequest: vi.fn(),
}));

vi.mock('../lib/supportApi', () => ({
  createSupportRequest,
}));

describe('Survey', () => {
  it('renders the star ratings and written feedback questions', () => {
    render(
      <MemoryRouter>
        <Survey />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Tell us what you think' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'How is cruush feeling overall?' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'How easy is cruush to use?' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'How is the map experience?' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'How do the privacy controls feel?' })).toBeInTheDocument();
    expect(screen.getByLabelText('What is working best?')).toBeInTheDocument();
    expect(screen.getByText(/reports@cruush\.app/)).toBeInTheDocument();
  });

  it('submits through the anonymous survey source without requiring an email', async () => {
    createSupportRequest.mockResolvedValue({
      id: 'survey-response-1',
      status: 'open',
      aiTriageStatus: 'pending',
      createdAt: '2026-08-18T12:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <Survey />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('What is working best?'), {
      target: { value: 'The map.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith(expect.objectContaining({
      category: 'comment',
      source: 'survey',
      subject: 'cruush survey response',
    })));
    expect(createSupportRequest.mock.calls[0]?.[0]).not.toHaveProperty('contactEmail');
    expect(await screen.findByText(/Your feedback was sent/)).toBeInTheDocument();
  });
});
