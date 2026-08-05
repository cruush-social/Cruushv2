import { useEffect, useState } from 'react';
import { addDlModeChangedListener, isDlModeEnabled } from './dlMode';

// DL Mode is read by list rows and small presentational components scattered
// across the app, so it is cheaper to subscribe locally than to thread the flag
// down as a prop from every screen.
export function useDlMode() {
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  return dlModeActive;
}
