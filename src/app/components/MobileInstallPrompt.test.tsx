import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MobileInstallPrompt, { installPromptHandledKey } from './MobileInstallPrompt';
import { captureInstallPrompt, clearInstallPrompt } from '../lib/installPrompt';
import { resetExclusivePopupsForTest } from '../lib/popupQueue';

function installPromptEvent(prompt: ReturnType<typeof vi.fn>) {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };

  event.prompt = prompt;
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  event.preventDefault = vi.fn();

  return event;
}

describe('MobileInstallPrompt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetExclusivePopupsForTest();
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1',
      configurable: true,
    });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    clearInstallPrompt();
    resetExclusivePopupsForTest();
    vi.unstubAllGlobals();
  });

  it('captures the browser install prompt and runs it from the smart prompt', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);

    render(<MobileInstallPrompt userId="member-1" />);
    window.dispatchEvent(installPromptEvent(prompt));

    fireEvent.click(await screen.findByRole('button', { name: 'Install cruush' }));

    await waitFor(() => expect(prompt).toHaveBeenCalled());
  });

  it('shows iOS Home Screen guidance when install is requested without a browser prompt', async () => {
    render(<MobileInstallPrompt userId="member-1" />);

    window.dispatchEvent(new Event('cruush:install-requested'));

    expect(await screen.findByText(/Safari share/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Install cruush' })).toHaveClass(
      'cruush-first-entry-prompt',
      'p-4',
    );
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install cruush' })).not.toBeInTheDocument();
  });

  it('keeps a browser prompt captured before the component loads', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    captureInstallPrompt(installPromptEvent(prompt));

    render(<MobileInstallPrompt userId="member-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Install cruush' }));

    await waitFor(() => expect(prompt).toHaveBeenCalled());
  });

  it('stores dismissal for one member without hiding another member prompt', () => {
    const first = render(<MobileInstallPrompt userId="member-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(window.localStorage.getItem(installPromptHandledKey('member-1'))).toBe('true');
    first.unmount();
    resetExclusivePopupsForTest();

    render(<MobileInstallPrompt userId="member-2" />);
    expect(screen.getByRole('dialog', { name: 'Install cruush' })).toBeInTheDocument();
  });

  it('does not prompt when cruush is already running standalone', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(<MobileInstallPrompt userId="member-1" />);

    expect(screen.queryByRole('dialog', { name: 'Install cruush' })).not.toBeInTheDocument();
  });

  it('does not repeat after this member handled it', () => {
    window.localStorage.setItem(installPromptHandledKey('member-1'), 'true');
    render(<MobileInstallPrompt userId="member-1" />);
    expect(screen.queryByRole('dialog', { name: 'Install cruush' })).not.toBeInTheDocument();
  });
});
