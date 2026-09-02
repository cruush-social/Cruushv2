import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import MapSidePanel from './MapSidePanel';

vi.mock('./DesktopDockPanel', () => ({
  default: ({ children }: { children: ReactNode }) => <aside data-testid="dock-panel">{children}</aside>,
}));

vi.mock('./LocalFeed', () => ({ default: () => <div>Feed surface</div> }));
vi.mock('./CruushActivity', () => ({ default: () => <div>Cruushes surface</div> }));
vi.mock('./DirectMessages', () => ({
  default: ({ onOpenConversation }: { onOpenConversation: (id: string) => void }) => (
    <button type="button" onClick={() => onOpenConversation('conversation-1')}>Open River thread</button>
  ),
}));
vi.mock('./PrivateGroupChat', () => ({
  default: ({ onBack, onClose }: { onBack: () => void; onClose: () => void }) => (
    <div>
      <p>River thread</p>
      <button type="button" onClick={onBack}>Back to Messages</button>
      <button type="button" onClick={onClose}>Close thread</button>
    </div>
  ),
}));
vi.mock('./Settings', () => ({
  default: ({ embedded, onBack, onClose }: { embedded: boolean; onBack?: () => void; onClose: () => void }) => (
    <div data-embedded={embedded ? 'true' : 'false'}>
      <p>Settings surface</p>
      {onBack ? <button type="button" onClick={onBack}>Back to prior popup</button> : null}
      <button type="button" onClick={onClose}>Close settings</button>
    </div>
  ),
}));
vi.mock('./TravelModeSettings', () => ({
  default: ({ onTravelPinChange }: { onTravelPinChange?: (pin: { userId: string } | null) => void }) => (
    <div>
      <p>Mile High Club surface</p>
      <button type="button" onClick={() => onTravelPinChange?.({ userId: 'viewer' })}>Drop travel pin</button>
    </div>
  ),
}));

describe('MapSidePanel', () => {
  it('opens a message thread inside the existing popup and Back returns to the list', async () => {
    const onClose = vi.fn();
    render(<MapSidePanel view="messages" onClose={onClose} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open River thread' }));
    expect(await screen.findByText('River thread')).toBeInTheDocument();
    expect(screen.getByTestId('dock-panel')).toContainElement(screen.getByText('River thread'));

    fireEvent.click(screen.getByRole('button', { name: 'Back to Messages' }));
    expect(await screen.findByRole('button', { name: 'Open River thread' })).toBeInTheDocument();
    expect(screen.queryByText('River thread')).not.toBeInTheDocument();
  });

  it('keeps embedded Settings in the same popup and exposes Back and Close', async () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(<MapSidePanel view="settings" onBackFromSettings={onBack} onClose={onClose} />);

    const settings = await screen.findByText('Settings surface');
    expect(screen.getByTestId('dock-panel')).toContainElement(settings);
    expect(settings.parentElement).toHaveAttribute('data-embedded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Back to prior popup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens Mile High Club directly in the map popup and reports the new pin', async () => {
    const onTravelPinChange = vi.fn();
    render(
      <MapSidePanel
        view="settings"
        openMileHighClub
        onClose={vi.fn()}
        onTravelPinChange={onTravelPinChange}
      />,
    );

    expect(await screen.findByText('Mile High Club surface')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Drop travel pin' }));
    expect(onTravelPinChange).toHaveBeenCalledWith({ userId: 'viewer' });
  });
});
