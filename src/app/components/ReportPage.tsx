import { FormEvent, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, CheckCircle2, Flag } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import BugButtonSlot from './BugButtonSlot';
import {
  createReport,
  REPORT_REASON_OPTIONS,
  type ReportReason,
  type ReportTargetType,
} from '../lib/reportApi';

type ReportLocationState = {
  targetType?: ReportTargetType;
  targetUserId?: string;
  conversationId?: string;
  messageId?: string;
  postId?: string;
  placeId?: string;
  placeMessageId?: string;
  profilePhotoUrl?: string;
  targetId?: string;
  targetLabel?: string;
} | null;

function getReportTarget(state: ReportLocationState, searchParams: URLSearchParams) {
  return {
    targetType: state?.targetType ?? (searchParams.get('targetType') as ReportTargetType | null) ?? 'profile',
    targetUserId: state?.targetUserId ?? searchParams.get('targetUserId') ?? undefined,
    conversationId: state?.conversationId ?? searchParams.get('conversationId') ?? undefined,
    messageId: state?.messageId ?? searchParams.get('messageId') ?? undefined,
    postId: state?.postId ?? searchParams.get('postId') ?? undefined,
    placeId: state?.placeId ?? searchParams.get('placeId') ?? undefined,
    placeMessageId: state?.placeMessageId ?? searchParams.get('placeMessageId') ?? undefined,
    profilePhotoUrl: state?.profilePhotoUrl ?? searchParams.get('profilePhotoUrl') ?? undefined,
    targetId: state?.targetId ?? searchParams.get('targetId') ?? undefined,
    targetLabel: state?.targetLabel ?? searchParams.get('targetLabel') ?? undefined,
  };
}

function getTargetId(target: ReturnType<typeof getReportTarget>) {
  if (target.targetId) {
    return target.targetId;
  }

  if (target.targetType === 'user' || target.targetType === 'profile') {
    return target.targetUserId;
  }

  if (target.targetType === 'conversation') {
    return target.conversationId;
  }

  if (target.targetType === 'message') {
    return target.messageId;
  }

  if (target.targetType === 'profile_photo') {
    return target.profilePhotoUrl ?? target.targetId;
  }

  if (target.targetType === 'place') return target.placeId;
  if (target.targetType === 'place_message') return target.placeMessageId;

  return target.postId;
}

type ReportPageProps = {
  embedded?: boolean;
  targetOverride?: NonNullable<ReportLocationState>;
  onBack?: () => void;
};

export default function ReportPage({ embedded = false, targetOverride, onBack }: ReportPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const target = useMemo(
    () => getReportTarget(targetOverride ?? (location.state as ReportLocationState), targetOverride ? new URLSearchParams() : searchParams),
    [location.state, searchParams, targetOverride],
  );
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const targetId = getTargetId(target);
  const [error, setError] = useState<string | null>(targetId ? null : 'This report link is missing its target.');
  const targetLabel = target.targetLabel?.trim() || (
    target.targetType === 'conversation'
      ? 'this conversation'
      : target.targetType === 'message'
        ? 'this message'
        : target.targetType === 'post'
          ? 'this post'
          : target.targetType === 'profile_photo'
            ? 'this profile photo'
          : target.targetType === 'place'
            ? 'this spot'
          : target.targetType === 'place_message'
            ? 'this board post'
          : 'this profile'
  );
  const goBack = onBack ?? (() => navigate(-1));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === 'submitting') return;

    if (!targetId) {
      setError('This report link is missing its target.');
      return;
    }

    if (!reason) {
      setError('Choose a reason before submitting.');
      return;
    }

    setStatus('submitting');
    setError(null);

    try {
      await createReport({
        targetType: target.targetType,
        targetId,
        targetUserId: target.targetUserId,
        reason,
        details: details.trim() || undefined,
      });
      setStatus('success');
    } catch {
      setError('Unable to submit this report right now.');
      setStatus('idle');
    }
  };

  return (
    <div className={embedded ? 'bg-background' : 'min-h-screen bg-background pb-20'}>
      <header className="sticky top-0 z-10 border-b border-border bg-[color:var(--cruush-black-glass)] p-4 backdrop-blur-[var(--cruush-black-glass-blur)]">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl">Report</h2>
            <p className="text-xs text-muted-foreground">Send this to automated safety checks</p>
          </div>
          <BugButtonSlot testId="report-page-bug-button-slot" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {status === 'success' ? (
          <div className="rounded-lg border border-primary/25 bg-primary/10 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-2xl">Report submitted</h1>
            <p className="mt-2 text-sm text-muted-foreground">Automated safety checks will use this signal for trust and enforcement decisions.</p>
            <Button className="mt-6" onClick={goBack}>
              Done
            </Button>
          </div>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <section className="rounded-lg border border-border bg-card/70 p-4">
              <div className="flex items-start gap-3">
                <Flag className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm uppercase text-muted-foreground">Reporting</p>
                  <h1 className="mt-1 text-2xl">{targetLabel}</h1>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <Label>Reason</Label>
              <div className="grid gap-2">
                {REPORT_REASON_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${
                      reason === option.value
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border bg-card/70 hover:bg-accent/50'
                    }`}
                  >
                    <input
                      checked={reason === option.value}
                      className="mt-1"
                      name="reason"
                      onChange={() => setReason(option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <span className="block">{option.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label htmlFor="report-details">Details</Label>
              <Textarea
                id="report-details"
                maxLength={2000}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Add context, timestamps, or anything automated safety checks should use."
                value={details}
                className="min-h-[140px] bg-input-background"
              />
              <p className="text-right text-xs text-muted-foreground">{details.length}/2000</p>
            </section>

            <Button
              className="w-full"
              disabled={status === 'submitting' || !targetId}
              style={{ background: 'var(--cruush-gradient)' }}
              type="submit"
            >
              {status === 'submitting' ? 'Submitting...' : 'Submit report'}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
