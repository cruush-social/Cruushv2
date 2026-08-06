import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MobileInstallPrompt from './MobileInstallPrompt';

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
    vi.unstubAllGlobals();
  });

  it('captures the browser install prompt and runs it from the smart prompt', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);

    render(<MobileInstallPrompt />);
    window.dispatchEvent(installPromptEvent(prompt));

    fireEvent.click(await screen.findByRole('button', { name: 'Install cruush' }));

    await waitFor(() => expect(prompt).toHaveBeenCalled());
  });

  it('shows iOS Home Screen guidance when install is requested without a browser prompt', async () => {
    render(<MobileInstallPrompt />);

    window.dispatchEvent(new Event('cruush:install-requested'));

    expect(await screen.findByText(/Safari share/i)).toBeInTheDocument();
    expect(screen.getByText('Add cruush to Home Screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install cruush' })).not.toBeInTheDocument();
  });
});
