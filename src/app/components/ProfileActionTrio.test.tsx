import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProfileActionTrio from './ProfileActionTrio';

const { serviceArea } = vi.hoisted(() => ({ serviceArea: { profilePinsAllowed: false } }));
vi.mock('./MapServiceAreaContext', () => ({ useMapServiceArea: () => serviceArea }));

describe('ProfileActionTrio', () => {
  it('keeps an otherwise permitted pin dark and inert OOS, then restores it in service area', () => {
    const onCenterPin = vi.fn();
    const props = { userName: 'Jordan', cruushState: 'mutual' as const, onCruush: vi.fn(), canCenterPin: true, onCenterPin };
    serviceArea.profilePinsAllowed = false;
    const { rerender } = render(<ProfileActionTrio {...props} />);
    const blocked = screen.getByRole('button', { name: 'Map location unavailable' });
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAttribute('title', 'Map location unavailable');
    expect(blocked).toHaveStyle({ background: 'var(--cruush-gradient-soft-28), #0A0A12' });
    fireEvent.click(blocked);
    expect(onCenterPin).not.toHaveBeenCalled();

    serviceArea.profilePinsAllowed = true;
    rerender(<ProfileActionTrio {...props} />);
    const enabled = screen.getByRole('button', { name: 'Center the map on Jordan' });
    expect(enabled).toBeEnabled();
    fireEvent.click(enabled);
    expect(onCenterPin).toHaveBeenCalledOnce();

    rerender(<ProfileActionTrio {...props} canCenterPin={false} />);
    expect(screen.getByRole('button', { name: 'Jordan does not share their precise location' })).toBeDisabled();
  });
  it('opens a restricted conversation while leaving send permission to the composer', () => {
    const onMessage = vi.fn();

    render(
      <ProfileActionTrio
        userName="Jordan"
        cruushState="available"
        onCruush={vi.fn()}
        canMessage={false}
        onMessage={onMessage}
      />,
    );

    const button = screen.getByRole('button', { name: 'Jordan is not accepting messages from you' });
    expect(button).toBeEnabled();
    expect(button).toHaveStyle({ background: 'var(--cruush-gradient-soft-28), #0A0A12' });
    fireEvent.click(button);
    expect(onMessage).toHaveBeenCalledOnce();
  });
});
