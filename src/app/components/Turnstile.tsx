import { useCallback, useEffect, useRef } from 'react';

type TurnstileProps = {
  onTokenChange: (token: string) => void;
  onError?: (message: string) => void;
  resetKey?: number;
};

const TURNSTILE_CONFIGURATION_ERROR_MESSAGE = 'Security check is unavailable. Contact support.';
const TURNSTILE_CLOCK_ERROR_MESSAGE = 'Security check could not start. Check your device time, then reload.';
const TURNSTILE_UNKNOWN_ERROR_MESSAGE = 'Security check could not start. Reload and try again.';
const TURNSTILE_RETRYABLE_ERROR_CODES = new Set(['110600', '110620', '200500']);
const TURNSTILE_CONFIGURATION_ERROR_CODES = new Set(['110100', '110110', '110200', '400020', '400070']);

function getTurnstileErrorMessage(errorCode?: string) {
  const normalizedErrorCode = errorCode?.trim() ?? '';

  if (
    !normalizedErrorCode ||
    TURNSTILE_RETRYABLE_ERROR_CODES.has(normalizedErrorCode) ||
    normalizedErrorCode.startsWith('300') ||
    normalizedErrorCode.startsWith('600')
  ) {
    return null;
  }

  if (TURNSTILE_CONFIGURATION_ERROR_CODES.has(normalizedErrorCode) || normalizedErrorCode.startsWith('110')) {
    return TURNSTILE_CONFIGURATION_ERROR_MESSAGE;
  }

  if (normalizedErrorCode === '200100') {
    return TURNSTILE_CLOCK_ERROR_MESSAGE;
  }

  return TURNSTILE_UNKNOWN_ERROR_MESSAGE;
}

export function getTurnstileSiteKey() {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
}

export default function Turnstile({ onTokenChange, onError, resetKey = 0 }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = getTurnstileSiteKey();

  const resetWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile?.reset) {
      window.turnstile.reset(widgetIdRef.current);
    }
    onTokenChange('');
  }, [onTokenChange]);

  const handleTurnstileError = useCallback((errorCode?: string) => {
    onTokenChange('');
    const errorMessage = getTurnstileErrorMessage(errorCode);

    if (errorMessage) {
      onError?.(errorMessage);
      return true;
    }

    return false;
  }, [onError, onTokenChange]);

  const handleTurnstileTimeout = useCallback(() => {
    onTokenChange('');
  }, [onTokenChange]);

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
        appearance: 'always',
        retry: 'auto',
        'retry-interval': 8000,
        'refresh-expired': 'auto',
        'refresh-timeout': 'auto',
        callback: onTokenChange,
        'expired-callback': () => onTokenChange(''),
        'timeout-callback': handleTurnstileTimeout,
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
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [handleTurnstileError, handleTurnstileTimeout, onTokenChange, siteKey]);

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
