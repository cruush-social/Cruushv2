import type { CSSProperties, MouseEvent } from 'react';
import { useState } from 'react';
import { Ban } from 'lucide-react';
import { toast } from '../lib/toast';
import { blockUser } from '../lib/blockApi';
import { buttonVariants } from './ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';

type BlockButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type BlockButtonSize = 'default' | 'sm' | 'lg' | 'icon';

type BlockUserActionProps = {
  userId: string;
  displayName: string;
  onBlocked?: (userId: string) => void;
  className?: string;
  dialogClassName?: string;
  dialogStyle?: CSSProperties;
  disabled?: boolean;
  iconOnly?: boolean;
  label?: string;
  size?: BlockButtonSize;
  variant?: BlockButtonVariant;
};

export default function BlockUserAction({
  userId,
  displayName,
  onBlocked,
  className,
  dialogClassName,
  dialogStyle,
  disabled = false,
  iconOnly = true,
  label,
  size = 'icon',
  variant = 'ghost',
}: BlockUserActionProps) {
  const [open, setOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const safeName = displayName.trim() || 'this user';
  const accessibleLabel = label ?? `Block ${safeName}`;

  const handleConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (blocking) {
      return;
    }

    setBlocking(true);
    try {
      const result = await blockUser(userId);
      toast.success(`${safeName} blocked.`);
      setOpen(false);
      onBlocked?.(result.userId);
    } catch (error) {
      console.error('Error blocking user:', error);
      toast.error('Unable to block this user right now.');
    } finally {
      setBlocking(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!blocking) {
          setOpen(nextOpen);
        }
      }}
    >
      <AlertDialogTrigger
        type="button"
        className={buttonVariants({ variant, size, className })}
        disabled={disabled || blocking}
        aria-label={accessibleLabel}
        title={accessibleLabel}
      >
        <Ban className="h-4 w-4" />
        {iconOnly ? null : <span>{blocking ? 'Blocking...' : 'Block'}</span>}
      </AlertDialogTrigger>
      <AlertDialogContent className={dialogClassName} style={dialogStyle}>
        <AlertDialogHeader>
          <AlertDialogTitle>Block {safeName}?</AlertDialogTitle>
          <AlertDialogDescription>
            They will no longer be able to interact with you, and you will stop seeing them in discovery, Confessional, messages, and cruush surfaces.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={blocking}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={blocking}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              void handleConfirm(event);
            }}
          >
            {blocking ? 'Blocking...' : 'Block'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
