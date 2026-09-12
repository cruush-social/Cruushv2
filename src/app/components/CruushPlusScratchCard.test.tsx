import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CruushPlusScratchCard from './CruushPlusScratchCard';

vi.mock('../lib/cruushScratchInteraction', () => ({
  attachCruushScratchInteraction: (root: HTMLElement, reveal: () => void) => {
    const canvas = root.querySelector('.scratch')!;
    const key = (event: Event) => { if ((event as KeyboardEvent).key === 'Enter') reveal(); };
    canvas.addEventListener('keydown', key);
    return () => canvas.removeEventListener('keydown', key);
  },
}));

afterEach(() => vi.unstubAllGlobals());

it('reveals the confirmed duration, flips to shared benefits, and accepts only after reveal', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const close = vi.fn();
  render(<CruushPlusScratchCard card={{ id: 'grant:one', amount: '1', unit: 'day', format: 'default' }} onClose={close} />);
  expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Scratch to reveal your reward' }), { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  expect(screen.getByText('day')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tap to see benefits' }));
  expect(screen.getByText('Mile High Club.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(close).toHaveBeenCalledWith(true);
});

it('reveals and flips a Pulse card to its own benefits without cruush+ benefits', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  render(<CruushPlusScratchCard card={{ id: 'pings:one', amount: '1', unit: 'Pulse', format: 'default', kind: 'ping' }} onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Tap to see benefits' })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Scratch to reveal your reward' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Tap to see benefits' }));
  expect(screen.getByText('Your heart beats for 30 minutes.')).toBeVisible();
  expect(screen.queryByText('Mile High Club.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tap to flip back' })).toBeEnabled();
});
