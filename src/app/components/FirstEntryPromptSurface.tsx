import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

type FirstEntryPromptSurfaceProps = {
  description: string;
  icon: ReactNode;
  onDismiss: () => void;
  open: boolean;
  primary: ReactNode;
  secondary: ReactNode;
  testId: string;
  title: string;
};

export default function FirstEntryPromptSurface({
  description,
  icon,
  onDismiss,
  open,
  primary,
  secondary,
  testId,
  title,
}: FirstEntryPromptSurfaceProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onDismiss();
        }
      }}
    >
      <DialogContent
        floating
        showCloseButton={false}
        data-dialog-framing="first-entry"
        data-testid={testId}
        overlayClassName="cruush-first-entry-prompt-overlay"
        className="cruush-first-entry-prompt max-w-[22rem] gap-4 overflow-y-auto rounded-2xl border-white/10 bg-card/95 p-4"
      >
        <DialogHeader bugButton={false} className="gap-2 text-left">
          {icon}
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          {secondary}
          {primary}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
