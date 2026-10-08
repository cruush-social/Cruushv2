import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FirstEntryPromptSurface from './FirstEntryPromptSurface';

describe('FirstEntryPromptSurface', () => {
  it('uses the compact viewport-constrained first-entry frame', () => {
    render(
      <FirstEntryPromptSurface
        open
        icon={<span aria-hidden="true" />}
        title="Install cruush"
        description="Add cruush to your Home Screen."
        primary={<button type="button">Install cruush</button>}
        secondary={<button type="button">Not now</button>}
        onDismiss={vi.fn()}
        testId="first-entry-test"
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Install cruush' });
    expect(dialog).toHaveClass('cruush-first-entry-prompt', 'p-4');
    expect(dialog).toHaveAttribute('data-dialog-framing', 'first-entry');
    expect(dialog).not.toHaveClass('bottom-24', 'right-[4.5rem]');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

});
