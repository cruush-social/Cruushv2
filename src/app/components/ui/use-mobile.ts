import * as React from "react";

// Keep the JS breakpoint aligned with Tailwind's `lg` breakpoint. Between
// 768px and 1023px the shell must use the same mobile layout as its CSS.
export const MOBILE_BREAKPOINT = 1024;

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT, minimumHeight = 0) {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.innerWidth < breakpoint || (minimumHeight > 0 && window.innerHeight < minimumHeight);
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setIsMobile(false);
      return;
    }

    const mql = window.matchMedia(
      minimumHeight > 0
        ? `(max-width: ${breakpoint - 1}px), (max-height: ${minimumHeight - 1}px)`
        : `(max-width: ${breakpoint - 1}px)`,
    );
    const onChange = () => {
      setIsMobile(window.innerWidth < breakpoint || (minimumHeight > 0 && window.innerHeight < minimumHeight));
    };

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener("change", onChange);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(onChange);
    }

    setIsMobile(window.innerWidth < breakpoint || (minimumHeight > 0 && window.innerHeight < minimumHeight));

    return () => {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener("change", onChange);
      } else if (typeof mql.removeListener === 'function') {
        mql.removeListener(onChange);
      }
    };
  }, [breakpoint, minimumHeight]);

  return isMobile;
}
