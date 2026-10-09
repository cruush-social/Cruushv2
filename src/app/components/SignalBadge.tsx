import type { CSSProperties, ReactNode } from 'react';

/**
 * The pill a signal is read in. It lives on the map above someone's heart, and
 * onboarding shows the same component so the example a member is shown while
 * writing their signal is the thing itself rather than a drawing of it.
 */
export default function SignalBadge({
  borderColor,
  children,
  className = '',
  testId,
  compact = false,
  compactHorizontalPadding = false,
}: {
  borderColor: string;
  children: ReactNode;
  className?: string;
  testId?: string;
  compact?: boolean;
  compactHorizontalPadding?: boolean;
}) {
  return (
    <span
      className={`relative overflow-hidden rounded-full border border-[3.2px] bg-black/86 ${compact || compactHorizontalPadding ? 'px-2' : 'px-3'} ${compact ? 'py-0.5' : 'py-1'} text-center text-[0.7rem] font-semibold leading-tight text-white backdrop-blur-md [overflow-wrap:anywhere] ${className}`}
      data-testid={testId}
      style={{
        backgroundColor: 'rgba(0, 0, 0, var(--cruush-ghost-surface-alpha, 0.86))',
        borderColor: `var(--cruush-ghost-flash-border-color, ${borderColor})`,
        borderWidth: '3.2px',
      } as CSSProperties}
    >
      {children}
    </span>
  );
}
