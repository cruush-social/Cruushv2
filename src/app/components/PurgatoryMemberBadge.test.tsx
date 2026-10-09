import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PurgatoryMemberBadge from './PurgatoryMemberBadge';

describe('PurgatoryMemberBadge', () => {
  function tap(trigger: HTMLElement) {
    for (const type of ['pointerdown', 'pointerup', 'pointerout', 'pointerleave']) {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      fireEvent(trigger, event);
    }
    // Chromium touch focuses after pointerup, before the synthesized click.
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
  }

  it('opens on a tap without activating the surrounding profile and toggles closed', async () => {
    const openProfile = vi.fn();
    render(<div onClick={openProfile}><PurgatoryMemberBadge /></div>);
    const trigger = screen.getByRole('button', { name: 'This is a Purgatory member.' });
    tap(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This is a Purgatory member. They are currently outside cruush’s service area.',
    );
    expect(openProfile).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    tap(trigger);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on keyboard focus and dismisses with Escape', async () => {
    render(<PurgatoryMemberBadge />);
    fireEvent.focus(screen.getByRole('button', { name: 'This is a Purgatory member.' }));
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });
});
