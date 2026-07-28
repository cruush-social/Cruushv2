import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FrostedGlassPreview from './FrostedGlassPreview';

describe('FrostedGlassPreview', () => {
  it('renders the frosted map preview by default', () => {
    window.history.replaceState({}, '', '/preview/frosted-glass');

    render(<FrostedGlassPreview />);

    expect(screen.getByTestId('frosted-preview-shell')).toBeInTheDocument();
    expect(screen.getByTestId('frosted-preview-map-screen')).toBeInTheDocument();
    expect(screen.getByTestId('frosted-preview-heart-pin-primary')).toBeInTheDocument();
    expect(screen.getByTestId('frosted-preview-heart-pin-secondary')).toBeInTheDocument();
    expect(screen.getByText('GHOST MODE ACTIVE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feed preview' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches coded preview screens from the dock', () => {
    window.history.replaceState({}, '', '/preview/frosted-glass');

    render(<FrostedGlassPreview />);

    fireEvent.click(screen.getByRole('button', { name: 'Feed preview' }));

    expect(screen.getByTestId('frosted-preview-feed-screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feed preview' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.location.search).toBe('?screen=feed');
  });

  it('can open a specific screen from the query string', () => {
    window.history.replaceState({}, '', '/preview/frosted-glass?screen=messages');

    render(<FrostedGlassPreview />);

    expect(screen.getByTestId('frosted-preview-messages-screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Messages preview' })).toHaveAttribute('aria-pressed', 'true');
  });
});
