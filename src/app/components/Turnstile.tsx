import { useEffect, useRef } from 'react';

type TurnstileProps = {
  onTokenChange: (token: string) => void;
  resetKey?: number;
};

export function getTurnstileSiteKey() {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
}

export default function Turnstile({ onTokenChange, resetKey = 0 }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = getTurnstileSiteKey();

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      onTokenChange('');
      return undefined;
    }

    let isMounted = true;

    const renderWidget = () => {
      if (!isMounted || !containerRef.current || widgetIdRef.current || !window.turnstile) {
        return;
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: onTokenChange,
        'expired-callback': () => onTokenChange(''),
        'error-callback': () => onTokenChange(''),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      let script = document.getElementById('cloudflare-turnstile-script') as HTMLScriptElement | null;

      if (!script) {
        script = document.createElement('script');
        script.id = 'cloudflare-turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      script.addEventListener('load', renderWidget);

      return () => {
        isMounted = false;
        script.removeEventListener('load', renderWidget);
      };
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [onTokenChange, siteKey]);

  useEffect(() => {
    if (widgetIdRef.current && window.turnstile?.reset) {
      window.turnstile.reset(widgetIdRef.current);
      onTokenChange('');
    }
  }, [onTokenChange, resetKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="flex justify-center">
      <div ref={containerRef} />
    </div>
  );
}
