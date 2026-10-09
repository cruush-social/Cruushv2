import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import { Flag } from 'lucide-react';
import { toast } from '../lib/toast';
import {
  createReport,
  type ReportReason,
  type ReportTargetType,
} from '../lib/reportApi';
import { buttonVariants } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import ReportReasonPicker from './ReportReasonPicker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';

type ReportButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ReportButtonSize = 'default' | 'sm' | 'lg' | 'icon';

type ReportActionProps = {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  targetUserId?: string;
  onReported?: (targetId: string) => void;
  onRequestReport?: () => void;
  className?: string;
  dialogClassName?: string;
  dialogStyle?: CSSProperties;
  disabled?: boolean;
  iconOnly?: boolean;
  label?: string;
  size?: ReportButtonSize;
  variant?: ReportButtonVariant;
};

export default function ReportAction({
  targetType,
  targetId,
  targetLabel,
  targetUserId,
  onReported,
  onRequestReport,
  className,
  dialogClassName,
  dialogStyle,
  disabled = false,
  iconOnly = true,
  label,
  size = 'icon',
  variant = 'ghost',
}: ReportActionProps) {
  const reasonId = useId();
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const safeLabel = targetLabel.trim() || 'this content';
  const accessibleLabel = label ?? `Report ${safeLabel}`;

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting) {
      return;
    }

    if (nextOpen && onRequestReport) {
      onRequestReport();
      return;
    }

    setOpen(nextOpen);
    if (!nextOpen) {
      setReason('');
      setDetails('');
      setValidationError(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!reason) {
      setValidationError('Choose a reason before submitting.');
      return;
    }

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setValidationError(null);

    try {
      await createReport({
        targetType,
        targetId,
        targetUserId,
        reason,
        details: details.trim() || undefined,
      });
      toast.success('Report submitted.');
      setOpen(false);
      setReason('');
      setDetails('');
      onReported?.(targetId);
    } catch {
      toast.error('Unable to submit this report right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        type="button"
        className={buttonVariants({ variant, size, className })}
        disabled={disabled || submitting}
        aria-label={accessibleLabel}
        title={accessibleLabel}
      >
        <Flag className="h-4 w-4" />
        {iconOnly ? null : <span>Report</span>}
      </DialogTrigger>
      <DialogContent className={dialogClassName} style={dialogStyle}>
        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>Report {safeLabel}?</DialogTitle>
            <DialogDescription>
              Submitting sends this report to cruush moderation. Reporting does not automatically block or hide anyone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={reasonId}>Reason</Label>
            <ReportReasonPicker
              id={reasonId}
              value={reason}
              onChange={(nextReason) => {
                setReason(nextReason);
                setValidationError(null);
              }}
              disabled={submitting}
            />
            {validationError ? <p className="text-sm text-destructive">{validationError}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={detailsId}>Additional details (optional)</Label>
            <Textarea
              id={detailsId}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={2000}
              disabled={submitting}
              placeholder="Add context that may help the moderation team review this report."
              className="min-h-28 bg-input-background"
            />
            <p className="text-right text-xs text-muted-foreground">{details.length}/2000</p>
          </div>

          <DialogFooter>
            <button
              type="button"
              className={buttonVariants({ variant: 'outline' })}
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={buttonVariants({ variant: 'destructive' })}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit report'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
