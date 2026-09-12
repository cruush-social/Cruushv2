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
}: {
  borderColor: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      className={`relative overflow-hidden rounded-full border border-[3.2px] bg-[color:var(--cruush-black-glass)] px-3 py-1 text-center text-[0.7rem] font-semibold leading-tight text-white backdrop-blur-[var(--cruush-black-glass-blur)] [overflow-wrap:anywhere] ${className}`}
      data-testid={testId}
      style={{
        backgroundColor: 'var(--cruush-ghost-surface-color, var(--cruush-black-glass))',
        borderColor: `var(--cruush-ghost-flash-border-color, ${borderColor})`,
        borderWidth: '3.2px',
      } as CSSProperties}
    >
      {children}
    </span>
  );
}
