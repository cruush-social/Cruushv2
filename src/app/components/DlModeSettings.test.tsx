import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import DlModeSettings from './DlModeSettings';

describe('DlModeSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists DL Mode from the dedicated settings page', async () => {
    render(
      <MemoryRouter>
        <DlModeSettings />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'DL Mode' })).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Toggle DL Mode' });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem('cruush:dl-mode-enabled')).toBe('false');
  });
});
