import { FormEvent, useMemo, useState } from 'react';
import { Bug, CheckCircle2 } from 'lucide-react';
import { createSupportRequest } from '../lib/supportApi';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

type AlphaBugButtonProps = {
  enabled?: boolean;
};

function getCurrentPageUrl() {
  if (typeof window === 'undefined') {
    return '/';
  }

  return `${window.location.pathname}${window.location.search}` || '/';
}

export default function AlphaBugButton({ enabled = false }: AlphaBugButtonProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState('');
  const pageUrl = useMemo(() => getCurrentPageUrl(), [open]);

  if (!enabled) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (message.trim().length < 10) {
      setError('Add a few more details before sending.');
      return;
    }

    setStatus('submitting');
    setError('');

    try {
      await createSupportRequest({
        category: 'bug',
        subject: `Alpha bug: ${pageUrl}`,
        message: message.trim(),
        source: 'unknown',
        pageUrl,
      });
      setStatus('success');
      setMessage('');
    } catch (bugError) {
      setError(bugError instanceof Error ? bugError.message : 'Unable to send this bug report.');
      setStatus('idle');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setError('');
          setStatus('idle');
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          aria-label="Report alpha bug"
          className="fixed right-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-background/88 text-white shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-md transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary bottom-[calc(6.25rem+env(safe-area-inset-bottom))] md:bottom-5"
          type="button"
        >
          <Bug className="h-5 w-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-lg border-white/10 bg-background">
        <DialogHeader>
          <DialogTitle>Report alpha bug</DialogTitle>
          <DialogDescription>
            Screenshots are allowed for alpha feedback. This report includes the current page.
          </DialogDescription>
        </DialogHeader>

        {status === 'success' ? (
          <div className="rounded-md border border-primary/25 bg-primary/10 p-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>Bug report sent</span>
            </div>
            <Button className="mt-4 w-full" variant="outline" onClick={() => setStatus('idle')}>
              Send another
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="alpha-bug-message">What broke?</Label>
              <Textarea
                className="min-h-[132px] bg-input-background"
                disabled={status === 'submitting'}
                id="alpha-bug-message"
                maxLength={4000}
                minLength={10}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What happened, what you expected, and anything visible in your screenshot."
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
              {status === 'submitting' ? 'Sending...' : 'Send bug report'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
