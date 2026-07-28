import { useCallback, useEffect, useRef } from 'react';

type TurnstileProps = {
  onTokenChange: (token: string) => void;
  onError?: (message: string) => void;
  resetKey?: number;
};

const TURNSTILE_RETRY_DELAY_MS = 750;
const TURNSTILE_ERROR_MESSAGE = 'Security check restarted. Complete the captcha again.';

export function getTurnstileSiteKey() {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
}

export default function Turnstile({ onTokenChange, onError, resetKey = 0 }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const siteKey = getTurnstileSiteKey();

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const resetWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile?.reset) {
      window.turnstile.reset(widgetIdRef.current);
    }
    onTokenChange('');
  }, [onTokenChange]);

  const handleTurnstileError = useCallback(() => {
    onTokenChange('');
    onError?.(TURNSTILE_ERROR_MESSAGE);
    clearRetryTimeout();
    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null;
      resetWidget();
    }, TURNSTILE_RETRY_DELAY_MS);
    return true;
  }, [clearRetryTimeout, onError, onTokenChange, resetWidget]);

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      onTokenChange('');
      return undefined;
    }

    let isMounted = true;
    let script: HTMLScriptElement | null = null;

    const renderWidget = () => {
      if (!isMounted || !containerRef.current || widgetIdRef.current || !window.turnstile) {
        return;
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        size: 'flexible',
        callback: onTokenChange,
        'expired-callback': () => onTokenChange(''),
        'timeout-callback': handleTurnstileError,
        'error-callback': handleTurnstileError,
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      script = document.getElementById('cloudflare-turnstile-script') as HTMLScriptElement | null;

      if (!script) {
        script = document.createElement('script');
        script.id = 'cloudflare-turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      script.addEventListener('load', renderWidget);
    }

    return () => {
      isMounted = false;
      script?.removeEventListener('load', renderWidget);
      clearRetryTimeout();
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [clearRetryTimeout, handleTurnstileError, onTokenChange, siteKey]);

  useEffect(() => {
    resetWidget();
  }, [resetKey, resetWidget]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="flex justify-center">
      <div ref={containerRef} />
    </div>
  );
}
