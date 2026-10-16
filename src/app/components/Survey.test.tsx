import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Survey from './Survey';
import { ApiClientError } from '../lib/apiClient';

const { createSupportRequest } = vi.hoisted(() => ({
  createSupportRequest: vi.fn(),
}));

vi.mock('../lib/supportApi', () => ({
  createSupportRequest,
}));

describe('Survey', () => {
  const completeSurvey = (includeWrittenAnswers = true) => {
    for (const label of [
      'How is cruush feeling overall?',
      'How easy is cruush to use?',
      'How is the map experience?',
      'How do the privacy controls feel?',
      'How confident would you feel paying through the current checkout/payment processor?',
    ]) {
      fireEvent.click(within(screen.getByRole('radiogroup', { name: label })).getByRole('radio', { name: '5 out of 5 stars' }));
    }
    fireEvent.click(screen.getByRole('combobox', { name: 'What is the biggest reason you have not subscribed?' }));
    fireEvent.click(screen.getByRole('option', { name: 'The price' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'What monthly price would feel fair for cruush Plus?' }));
    fireEvent.click(screen.getByRole('option', { name: '$5–$9.99 per month' }));
    if (includeWrittenAnswers) {
      fireEvent.change(screen.getByLabelText('What is working best?'), { target: { value: 'The map.' } });
      fireEvent.change(screen.getByLabelText('What should we improve?'), { target: { value: 'Nothing.' } });
      fireEvent.change(screen.getByLabelText('Did you hit any bugs or confusing moments?'), { target: { value: 'No.' } });
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(screen.getByRole('combobox', { name: 'What is the biggest reason you have not subscribed?' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'How confident would you feel paying through the current checkout/payment processor?' })).toBeInTheDocument();
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

    completeSurvey();
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith(expect.objectContaining({
      category: 'comment',
      source: 'survey',
      subject: 'cruush subscription survey response',
    })));
    expect(createSupportRequest.mock.calls[0]?.[0]).not.toHaveProperty('contactEmail');
    expect(await screen.findByText('SURVEYGIFT')).toBeInTheDocument();
    expect(screen.getByText(/one free day of cruush\+/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send feedback' })).not.toBeInTheDocument();
  });

  it('allows only one in-flight submission', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    createSupportRequest.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    render(
      <MemoryRouter>
        <Survey />
      </MemoryRouter>,
    );

    completeSurvey();
    const form = screen.getByRole('button', { name: 'Send feedback' }).closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(createSupportRequest).toHaveBeenCalledTimes(1);
    resolveRequest?.({
      id: 'survey-response-1',
      status: 'open',
      aiTriageStatus: 'pending',
      createdAt: '2026-08-18T12:00:00.000Z',
    });
    expect(await screen.findByText('SURVEYGIFT')).toBeInTheDocument();
  });

  it.each(['', '   '])('accepts omitted written answers (%j)', async (answer) => {
    createSupportRequest.mockResolvedValue({ id: 'survey-response-1' });
    render(<MemoryRouter><Survey /></MemoryRouter>);
    completeSurvey(false);
    for (const textbox of screen.getAllByRole('textbox')) {
      fireEvent.change(textbox, { target: { value: answer } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(await screen.findByText('SURVEYGIFT')).toBeInTheDocument();
    expect(createSupportRequest).toHaveBeenCalledTimes(1);
    const payload = createSupportRequest.mock.calls[0][0];
    expect(payload.source).toBe('survey');
    expect(payload.message).toContain('What is working best?\nNot answered');
    expect(payload.message).toContain('What should we improve?\nNot answered');
    expect(payload.message).toContain('Bugs or confusing moments\nNot answered');
  });

  it('still requires the ratings and dropdown answers', () => {
    render(<MemoryRouter><Survey /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(createSupportRequest).not.toHaveBeenCalled();
    expect(screen.getByText('Complete the ratings and dropdown questions before submitting.')).toBeInTheDocument();
  });
  it('submits a long written answer intact', async () => {
    createSupportRequest.mockResolvedValue({ id: 'long-survey' });
    render(<MemoryRouter><Survey /></MemoryRouter>);
    completeSurvey();
    const answer = 'Detailed feedback. '.repeat(300);
    fireEvent.change(screen.getByLabelText('What should we improve?'), { target: { value: answer } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByText('SURVEYGIFT')).toBeInTheDocument();
    expect(createSupportRequest.mock.calls[0][0].message).toContain(answer);
  });

  it('preserves oversized answers and lets the member shorten and resubmit', async () => {
    createSupportRequest.mockResolvedValue({ id: 'shortened-survey' });
    render(<MemoryRouter><Survey /></MemoryRouter>);
    completeSurvey();
    const field = screen.getByLabelText('What should we improve?');
    const answer = 'x'.repeat(12000);
    fireEvent.change(field, { target: { value: answer } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(createSupportRequest).not.toHaveBeenCalled();
    expect(field).toHaveValue(answer);
    expect(screen.getByText('Your survey is too long. Please shorten your written answers and try again.')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'Shortened feedback' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByText('SURVEYGIFT')).toBeInTheDocument();
  });

  it('shows the API retry guidance and retains answers after rate limiting', async () => {
    createSupportRequest.mockRejectedValueOnce(new ApiClientError(429, 'RATE_LIMITED', 'Too many support requests. Try again later.'));
    render(<MemoryRouter><Survey /></MemoryRouter>);
    completeSurvey();
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByText('Too many support requests. Try again later.')).toBeInTheDocument();
    expect(screen.getByLabelText('What is working best?')).toHaveValue('The map.');
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeEnabled();
  });

});
