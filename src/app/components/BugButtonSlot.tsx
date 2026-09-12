import { registerBugButtonSlot } from '../lib/bugButtonSlot';

/**
 * The place in a screen header where the bug button docks. Every header has
 * one, so the button is always in the header row and never floats over it.
 * It stays rightmost in the single header row. Close and other controls sit
 * to its left. Size is shared across every page and viewport.
 */
export default function BugButtonSlot({ className = '', testId }: { className?: string; testId: string }) {
  return (
    <div
      className={`ml-auto h-10 w-10 shrink-0 ${className}`.trim()}
      data-testid={testId}
      ref={registerBugButtonSlot}
    />
  );
}
