import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CruushPlusCardDialog from './CruushPlusCardDialog';

describe('CruushPlusCardDialog', () => {
  it('shows the moire card and opens cruush+ without claiming a trial', () => {
    const onOpenChange = vi.fn();
    const onUpgrade = vi.fn();

    render(
      <CruushPlusCardDialog
        open
        onOpenChange={onOpenChange}
        onUpgrade={onUpgrade}
        title="Feed+"
        description="Post to a specific Crowd and choose when your post expires."
      />,
    );

    expect(screen.getByTestId('cruush-plus-card')).toBeInTheDocument();
    expect(screen.getByText('Feed+')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /See cruush\+/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});
