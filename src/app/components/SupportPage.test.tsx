import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import SupportPage from './SupportPage';

describe('SupportPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: 'support-2',
        status: 'open',
        aiTriageStatus: 'pending',
        createdAt: '2026-07-07T12:00:00.000Z',
      },
    }), { status: 201 })));
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
    vi.unstubAllGlobals();
  });

  it('submits signed-in support requests from the dedicated support page', async () => {
    window.history.pushState({}, '', '/support');

    render(
      <MemoryRouter initialEntries={['/support']}>
        <SupportPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Human trafficking policy' })).toHaveAttribute(
      'href',
      '/human-trafficking-policy',
    );

    fireEvent.change(screen.getByLabelText('Support subject'), {
      target: { value: 'Settings bug' },
    });
    fireEvent.change(screen.getByLabelText('Support message'), {
      target: { value: 'The settings screen got stuck after opening support.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to support' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/support-requests', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        category: 'question',
        subject: 'Settings bug',
        message: 'The settings screen got stuck after opening support.',
        source: 'settings',
        pageUrl: '/support',
      }),
    })));
    expect(await screen.findByText('Support request sent')).toBeInTheDocument();
  });
});
