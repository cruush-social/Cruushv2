import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Turnstile from './Turnstile';

type TurnstileOptions = Parameters<NonNullable<Window['turnstile']>['render']>[1];

describe('Turnstile', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete window.turnstile;
    document.getElementById('cloudflare-turnstile-script')?.remove();
  });

  it('lets Turnstile silently recover from retriable challenge errors', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    let options: TurnstileOptions | undefined;
    const renderWidget = vi.fn((_container: HTMLElement, renderOptions: TurnstileOptions) => {
      options = renderOptions;
      return 'widget-1';
    });
    const resetWidget = vi.fn();
    const onTokenChange = vi.fn();
    const onError = vi.fn();

    window.turnstile = {
      render: renderWidget,
      remove: vi.fn(),
      reset: resetWidget,
    };

    render(<Turnstile onTokenChange={onTokenChange} onError={onError} />);

    expect(renderWidget).toHaveBeenCalledTimes(1);
    expect(options).toMatchObject({
      appearance: 'always',
      retry: 'auto',
      'retry-interval': 8000,
      'refresh-expired': 'auto',
      'refresh-timeout': 'auto',
      size: 'flexible',
      theme: 'dark',
    });
    resetWidget.mockClear();
    onTokenChange.mockClear();

    const handled = options?.['error-callback']('300030');

    expect(handled).toBe(false);
    expect(onTokenChange).toHaveBeenCalledWith('');
    expect(resetWidget).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces non-retryable Turnstile configuration errors', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    let options: TurnstileOptions | undefined;
    const renderWidget = vi.fn((_container: HTMLElement, renderOptions: TurnstileOptions) => {
      options = renderOptions;
      return 'widget-1';
    });
    const onTokenChange = vi.fn();
    const onError = vi.fn();

    window.turnstile = {
      render: renderWidget,
      remove: vi.fn(),
      reset: vi.fn(),
    };

    render(<Turnstile onTokenChange={onTokenChange} onError={onError} />);

    onTokenChange.mockClear();

    const handled = options?.['error-callback']('110200');

    expect(handled).toBe(true);
    expect(onTokenChange).toHaveBeenCalledWith('');
    expect(onError).toHaveBeenCalledWith('Security check is unavailable. Contact support.');
  });

  it('clears stale tokens on challenge timeout without showing a form error', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    let options: TurnstileOptions | undefined;
    const renderWidget = vi.fn((_container: HTMLElement, renderOptions: TurnstileOptions) => {
      options = renderOptions;
      return 'widget-1';
    });
    const onTokenChange = vi.fn();
    const onError = vi.fn();

    window.turnstile = {
      render: renderWidget,
      remove: vi.fn(),
      reset: vi.fn(),
    };

    render(<Turnstile onTokenChange={onTokenChange} onError={onError} />);

    onTokenChange.mockClear();

    options?.['timeout-callback']?.();

    expect(onTokenChange).toHaveBeenCalledWith('');
    expect(onError).not.toHaveBeenCalled();
  });

  it('removes a widget that renders after the Turnstile script finishes loading', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    const removeWidget = vi.fn();
    const renderWidget = vi.fn(() => 'widget-1');
    const { unmount } = render(<Turnstile onTokenChange={vi.fn()} />);
    const script = document.getElementById('cloudflare-turnstile-script');

    expect(script).toBeInstanceOf(HTMLScriptElement);

    window.turnstile = {
      render: renderWidget,
      remove: removeWidget,
      reset: vi.fn(),
    };

    act(() => {
      script?.dispatchEvent(new Event('load'));
    });
    expect(renderWidget).toHaveBeenCalledTimes(1);

    unmount();

    expect(removeWidget).toHaveBeenCalledWith('widget-1');
  });
});
