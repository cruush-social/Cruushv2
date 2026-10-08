import type { ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import BugButtonSlot from './BugButtonSlot';
import { Button } from './ui/button';

type AppPageHeaderProps = {
  title: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  backTestId?: string;
  onClose?: () => void;
  closeLabel?: string;
  leading?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  bugButtonTestId: string;
  className?: string;
  contentClassName?: string;
  contentTestId?: string;
  rowTestId?: string;
  titleClassName?: string;
  testId?: string;
  children?: ReactNode;
};

export const APP_PAGE_HEADER_BUTTON_CLASS = 'rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10';

export default function AppPageHeader({
  title,
  onBack,
  backLabel = 'Back',
  backTestId,
  onClose,
  closeLabel = 'Close',
  leading,
  subtitle,
  actions,
  bugButtonTestId,
  className = '',
  contentClassName = '',
  contentTestId,
  rowTestId,
  titleClassName = '',
  testId,
  children,
}: AppPageHeaderProps) {
  return (
    <header
      className={`sticky top-0 z-20 shrink-0 border-b border-white/10 bg-black/88 py-4 shadow-[0_20px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl ${className}`}
      data-testid={testId}
    >
      <div className={`mx-auto w-full max-w-2xl px-4 ${children ? 'space-y-4' : ''} ${contentClassName}`} data-testid={contentTestId}>
        <div className="flex min-w-0 items-center gap-2" data-testid={rowTestId}>
          {onBack ? (
            <Button variant="secondary" size="icon" onClick={onBack} aria-label={backLabel} data-testid={backTestId} className={`shrink-0 ${APP_PAGE_HEADER_BUTTON_CLASS}`}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          {leading}
          <div className="min-w-0 flex-1">
            <h1 className={`truncate text-2xl leading-none text-white sm:text-3xl ${titleClassName}`}>{title}</h1>
            {subtitle}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 [&_[data-slot=button]]:!rounded-full">
            {actions}
            <BugButtonSlot className="!ml-0 !h-11 !w-11" testId={bugButtonTestId} />
            {onClose ? (
              <Button variant="secondary" size="icon" onClick={onClose} aria-label={closeLabel} className={APP_PAGE_HEADER_BUTTON_CLASS}>
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
