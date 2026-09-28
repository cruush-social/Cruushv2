import type { ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import BugButtonSlot from './BugButtonSlot';
import { Button } from './ui/button';

type AppPageHeaderProps = {
  title: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  onClose?: () => void;
  closeLabel?: string;
  actions?: ReactNode;
  bugButtonTestId: string;
  className?: string;
  titleClassName?: string;
};

export default function AppPageHeader({
  title,
  onBack,
  backLabel = 'Back',
  onClose,
  closeLabel = 'Close',
  actions,
  bugButtonTestId,
  className = '',
  titleClassName = '',
}: AppPageHeaderProps) {
  return (
    <header className={`sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-border bg-background/88 px-4 py-3 backdrop-blur-md ${className}`}>
      {onClose ? (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={closeLabel} className="shrink-0">
          <X className="h-5 w-5" />
        </Button>
      ) : null}
      {onBack ? (
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={backLabel} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      ) : null}
      <h1 className={`min-w-0 flex-1 truncate text-2xl leading-none text-white sm:text-3xl ${titleClassName}`}>{title}</h1>
      {actions}
      <BugButtonSlot testId={bugButtonTestId} />
    </header>
  );
}
