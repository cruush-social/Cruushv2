import { registerBugButtonSlot } from '../lib/bugButtonSlot';

/**
 * The place in a screen header where the bug button docks. Every header has
 * one, so the button is always in the header row and never floats over it.
 * It sits at the right end of the row; a Close control, where the row has
 * one, stays last.
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
