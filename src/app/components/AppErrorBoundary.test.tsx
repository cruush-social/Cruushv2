import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AppErrorBoundary from './AppErrorBoundary';

function BrokenShell() {
  throw new Error('Map shell failed.');
}

describe('AppErrorBoundary', () => {
  it('shows a stable error code when the app shell crashes', () => {
    render(
      <AppErrorBoundary>
        <BrokenShell />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Error code: APP_SHELL_RENDER_ERROR')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Feed' })).toHaveAttribute('href', '/feed');
  });
});
