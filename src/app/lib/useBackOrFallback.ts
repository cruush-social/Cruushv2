import { useCallback, useContext } from 'react';
import { UNSAFE_NavigationContext, useLocation, useNavigate } from 'react-router';

/** Consume history like browser Back. A fresh tab uses a replacement, never a new entry. */
export function useBackOrFallback(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const { navigator } = useContext(UNSAFE_NavigationContext);
  return useCallback(() => {
    const memoryIndex = (navigator as typeof navigator & { index?: number }).index;
    const historyIndex = typeof memoryIndex === 'number' ? memoryIndex : window.history.state?.idx;
    const hasPreviousEntry = typeof historyIndex === 'number'
      ? historyIndex > 0
      : location.key !== 'default';
    if (hasPreviousEntry) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [fallback, location.key, navigate, navigator]);
}
