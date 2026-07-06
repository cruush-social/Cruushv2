import { FormEvent, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, CheckCircle2, Flag } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { createReport, type ReportReason, type ReportTargetType } from '../lib/reportApi';

type ReportLocationState = {
  targetType?: ReportTargetType;
  targetUserId?: string;
  conversationId?: string;
  messageId?: string;
  targetLabel?: string;
} | null;

const REPORT_REASONS: Array<{ value: ReportReason; label: string; description: string }> = [
  {
    value: 'non_consensual_imagery',
    label: 'Non-consensual imagery',
    description: 'Someone shared or requested intimate media without consent.',
  },
  {
    value: 'minor_safety',
    label: 'Minor safety',
    description: 'A profile or message may involve someone under 18.',
  },
  {
    value: 'impersonation',
    label: 'Impersonation',
    description: 'Someone is pretending to be another person.',
  },
  {
    value: 'coercion_trafficking',
    label: 'Coercion or trafficking',
    description: 'Pressure, exploitation, trafficking, or unsafe control is involved.',
  },
  {
    value: 'illegal_activity',
    label: 'Illegal activity',
    description: 'The content involves illegal activity or dangerous requests.',
  },
  {
    value: 'spam_scam',
    label: 'Spam or scam',
    description: 'Fake links, solicitation, fraud, or repeated unwanted promotion.',
  },
  {
    value: 'harassment',
    label: 'Harassment',
    description: 'Threatening, repeated, or unwanted contact.',
  },
  {
    value: 'fetishization',
    label: 'Fetishization',
    description: 'Dehumanizing or fetishizing identity, body, race, trans status, or presentation.',
  },
  {
    value: 'hate',
    label: 'Hate or discrimination',
    description: 'Abuse targeting identity, race, gender, sexuality, or protected traits.',
  },
  {
    value: 'violence_threat',
    label: 'Violence or threats',
    description: 'Threats, stalking, intimidation, or physical safety concerns.',
  },
  {
    value: 'privacy_location',
    label: 'Privacy or location',
    description: 'Doxxing, location exposure, screenshots, or private details.',
  },
  {
    value: 'other',
    label: 'Something else',
    description: 'Use details to explain what happened.',
  },
];

function getReportTarget(state: ReportLocationState, searchParams: URLSearchParams) {
  return {
    targetType: state?.targetType ?? (searchParams.get('targetType') as ReportTargetType | null) ?? 'profile',
    targetUserId: state?.targetUserId ?? searchParams.get('targetUserId') ?? undefined,
    conversationId: state?.conversationId ?? searchParams.get('conversationId') ?? undefined,
    messageId: state?.messageId ?? searchParams.get('messageId') ?? undefined,
    targetLabel: state?.targetLabel ?? searchParams.get('targetLabel') ?? undefined,
  };
}

function hasValidTarget(target: ReturnType<typeof getReportTarget>) {
  if (target.targetType === 'profile') {
    return Boolean(target.targetUserId);
  }

  if (target.targetType === 'conversation') {
    return Boolean(target.conversationId);
  }

  if (target.targetType === 'message') {
    return Boolean(target.messageId);
  }

  return false;
}

export default function ReportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const target = useMemo(
    () => getReportTarget(location.state as ReportLocationState, searchParams),
    [location.state, searchParams],
  );
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(hasValidTarget(target) ? null : 'This report link is missing its target.');
  const targetLabel = target.targetLabel?.trim() || (
    target.targetType === 'conversation'
      ? 'this conversation'
      : target.targetType === 'message'
        ? 'this message'
        : 'this profile'
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!hasValidTarget(target)) {
      setError('This report link is missing its target.');
      return;
    }

    setStatus('submitting');
    setError(null);

    try {
      await createReport({
        targetType: target.targetType,
        targetUserId: target.targetUserId,
        conversationId: target.conversationId,
        messageId: target.messageId,
        reason,
        details,
      });
      setStatus('success');
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Failed to submit report.');
      setStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 p-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl">Report</h2>
            <p className="text-xs text-muted-foreground">Send this to automated safety checks</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {status === 'success' ? (
          <div className="rounded-lg border border-primary/25 bg-primary/10 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-2xl">Report submitted</h1>
            <p className="mt-2 text-sm text-muted-foreground">Automated safety checks will use this signal for trust and enforcement decisions.</p>
            <Button className="mt-6" onClick={() => navigate(-1)}>
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
                {REPORT_REASONS.map((option) => (
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
                    <span>
                      <span className="block">{option.label}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
                    </span>
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
              disabled={status === 'submitting' || !hasValidTarget(target)}
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
