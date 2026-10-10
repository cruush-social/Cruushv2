import type { ReactNode, RefObject } from 'react';
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
  initialFocusRef?: RefObject<HTMLButtonElement | null>;
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
  initialFocusRef,
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
        onOpenAutoFocus={initialFocusRef ? (event) => {
          event.preventDefault();
          initialFocusRef.current?.focus();
        } : undefined}
        showCloseButton={false}
        data-dialog-framing="first-entry"
        data-testid={testId}
        overlayClassName="cruush-first-entry-prompt-overlay"
        className="cruush-first-entry-prompt max-w-[22rem] gap-4 overflow-y-auto rounded-2xl border border-white/25 bg-black/48 p-4 backdrop-blur-xl backdrop-saturate-150"
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
