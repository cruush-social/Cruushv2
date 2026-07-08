import { FormEvent, useId, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { createSupportRequest, type SupportRequestCategory, type SupportRequestSource } from '../lib/supportApi';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { cn } from './ui/utils';

const SUPPORT_CATEGORIES: Array<{ value: SupportRequestCategory; label: string }> = [
  { value: 'question', label: 'Question' },
  { value: 'bug', label: 'Bug report' },
  { value: 'comment', label: 'Comment' },
  { value: 'policy', label: 'Policy or reviewer question' },
];

type SupportRequestFormProps = {
  className?: string;
  requireContactEmail?: boolean;
  source: SupportRequestSource;
};

function getCurrentPageUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  return `${window.location.pathname}${window.location.search}` || '/';
}

export default function SupportRequestForm({
  className,
  requireContactEmail = false,
  source,
}: SupportRequestFormProps) {
  const idPrefix = useId();
  const [category, setCategory] = useState<SupportRequestCategory>('question');
  const [contactEmail, setContactEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('submitting');
    setError(null);

    try {
      const trimmedEmail = contactEmail.trim();
      await createSupportRequest({
        category,
        subject: subject.trim(),
        message: message.trim(),
        ...(trimmedEmail ? { contactEmail: trimmedEmail } : {}),
        source,
        pageUrl: getCurrentPageUrl(),
      });
      setStatus('success');
      setSubject('');
      setMessage('');
      if (!requireContactEmail) {
        setContactEmail('');
      }
    } catch (supportError) {
      setError(supportError instanceof Error ? supportError.message : 'Failed to send support request.');
      setStatus('idle');
    }
  };

  return (
    <section className={cn('rounded-lg border border-border bg-card/70 p-4', className)}>
      <div className="mb-4">
        <h3 className="text-lg">Contact support</h3>
      </div>

      {status === 'success' ? (
        <div className="rounded-md border border-primary/25 bg-primary/10 p-4 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <span>Support request sent</span>
          </div>
          <Button className="mt-4" variant="outline" onClick={() => setStatus('idle')}>
            Send another
          </Button>
        </div>
      ) : (
        <form aria-label="Contact support" className="space-y-4" onSubmit={handleSubmit}>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-category`}>Support type</Label>
            <select
              className="h-11 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              disabled={status === 'submitting'}
              id={`${idPrefix}-category`}
              onChange={(event) => setCategory(event.target.value as SupportRequestCategory)}
              value={category}
            >
              {SUPPORT_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-contact-email`}>Reply email</Label>
            <Input
              autoComplete="email"
              disabled={status === 'submitting'}
              id={`${idPrefix}-contact-email`}
              maxLength={320}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="you@example.com"
              required={requireContactEmail}
              type="email"
              value={contactEmail}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-subject`}>Support subject</Label>
            <Input
              disabled={status === 'submitting'}
              id={`${idPrefix}-subject`}
              maxLength={140}
              minLength={3}
              onChange={(event) => setSubject(event.target.value)}
              required
              value={subject}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-message`}>Support message</Label>
            <Textarea
              className="min-h-[120px] bg-input-background"
              disabled={status === 'submitting'}
              id={`${idPrefix}-message`}
              maxLength={4000}
              minLength={10}
              onChange={(event) => setMessage(event.target.value)}
              required
              value={message}
            />
            <p className="text-right text-xs text-muted-foreground">{message.length}/4000</p>
          </div>

          <Button
            className="w-full"
            disabled={status === 'submitting'}
            style={{ background: 'var(--cruush-gradient)' }}
            type="submit"
          >
            {status === 'submitting' ? 'Sending...' : 'Send to support'}
          </Button>
        </form>
      )}
    </section>
  );
}
