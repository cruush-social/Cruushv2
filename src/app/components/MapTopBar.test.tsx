import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MapTopBar from './MapTopBar';
import { DEFAULT_PRIVACY_SETTINGS } from '../lib/privacyApi';

vi.mock('./CruushIconImage', () => ({
  default: () => <span />,
  CruushIcon: ({ name, variant }: { name: string; variant: string }) => <span data-testid={name} data-variant={variant} />,
}));

describe('MapTopBar outside-area Ghost entry', () => {
  it('opens Ghost settings with a white undimmed glyph instead of redirecting to MHC', () => {
    const navigate = vi.fn();
    render(<MapTopBar setMapControlsHovered={vi.fn()} handleFeelingLucky={vi.fn()} navigate={navigate}
      privacySettings={{ ...DEFAULT_PRIVACY_SETTINGS, ghostModeEnabled: true }} dlModeActive={false}
      usesFullPageProfile sidePanelView={null} setSidePanelReturnView={vi.fn()} setSidePanelView={vi.fn()}
      notificationUnreadCount={0} outsideServiceArea />);
    const button = screen.getByRole('button', { name: 'Ghost Mode Settings' });
    expect(screen.getByTestId('ghost')).toHaveAttribute('data-variant', 'white');
    expect(button).not.toHaveClass('opacity-45');
    fireEvent.click(button);
    expect(navigate).toHaveBeenCalledWith('/privacy/ghost-mode');
  });
});
