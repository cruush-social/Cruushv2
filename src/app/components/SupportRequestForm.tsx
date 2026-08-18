import { FormEvent, useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { createSuspensionAppeal, createSupportRequest, type SupportRequestCategory, type SupportRequestSource } from '../lib/supportApi';
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
  appealMode?: boolean;
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
  appealMode = false,
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
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [idPreviewUrl, setIdPreviewUrl] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [idCanvasReady, setIdCanvasReady] = useState(false);
  const [hasRedactions, setHasRedactions] = useState(false);
  const [isRedacting, setIsRedacting] = useState(false);
  const idCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!idPreviewUrl || !appealMode) {
      return undefined;
    }

    const image = new Image();
    image.onload = () => {
      const canvas = idCanvasRef.current;
      if (!canvas) return;
      const scale = Math.min(1, 1800 / image.naturalWidth, 1800 / image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setIdCanvasReady(true);
      setHasRedactions(false);
    };
    image.src = idPreviewUrl;

    return () => {
      image.onload = null;
    };
  }, [appealMode, idPreviewUrl]);

  useEffect(() => {
    return () => {
      if (idPreviewUrl) URL.revokeObjectURL(idPreviewUrl);
    };
  }, [idPreviewUrl]);

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = idCanvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  };

  const startRedaction = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = idCanvasRef.current;
    const point = getCanvasPoint(event);
    if (!canvas || !point) return;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.strokeStyle = '#000';
    context.lineWidth = Math.max(24, canvas.width / 45);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(point.x, point.y);
    setIsRedacting(true);
    setHasRedactions(true);
  };

  const continueRedaction = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isRedacting) return;
    const point = getCanvasPoint(event);
    const context = idCanvasRef.current?.getContext('2d');
    if (!point || !context) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const finishRedaction = (event: PointerEvent<HTMLCanvasElement>) => {
    if (idCanvasRef.current?.hasPointerCapture(event.pointerId)) {
      idCanvasRef.current.releasePointerCapture(event.pointerId);
    }
    setIsRedacting(false);
  };

  const selectIdDocument = (file: File | undefined) => {
    if (!file) return;
    if (idPreviewUrl) URL.revokeObjectURL(idPreviewUrl);
    setIdDocument(file);
    setIdPreviewUrl(URL.createObjectURL(file));
    setIdCanvasReady(false);
    setHasRedactions(false);
  };

  const canvasFile = () => new Promise<File>((resolve, reject) => {
    const canvas = idCanvasRef.current;
    if (!canvas) {
      reject(new Error('Choose an ID photo and mark the private details first.'));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The redacted ID photo could not be prepared.'));
        return;
      }
      resolve(new File([blob], 'id-redacted.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('submitting');
    setError(null);

    try {
      if (appealMode) {
        if (!idDocument || !selfie || !idCanvasReady || !hasRedactions) {
          throw new Error('Choose your ID, mark over every detail except your date of birth and photo, and add a selfie.');
        }
        await createSuspensionAppeal({
          contactEmail: contactEmail.trim(),
          idDocument: await canvasFile(),
          selfie,
        });
      } else {
      const trimmedEmail = contactEmail.trim();
      await createSupportRequest({
        category,
        subject: subject.trim(),
        message: message.trim(),
        ...(trimmedEmail ? { contactEmail: trimmedEmail } : {}),
        source,
        pageUrl: getCurrentPageUrl(),
      });
      }
      setStatus('success');
      setSubject('');
      setMessage('');
      setIdDocument(null);
      setSelfie(null);
      setIdPreviewUrl(null);
      setIdCanvasReady(false);
      setHasRedactions(false);
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
        <h3 className="text-lg">{appealMode ? 'Appeal a suspension' : 'Contact support'}</h3>
        {appealMode ? (
          <p className="mt-2 text-sm text-muted-foreground">
            A human reviews age-related photo suspensions. Take a photo of your ID, then mark over everything except your date of birth and photo. Add a selfie holding a handwritten card with your account email and today’s date. Evidence stays private, expires after 24 hours, and is deleted when the review is closed.
          </p>
        ) : null}
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
        <form aria-label={appealMode ? 'Suspension appeal' : 'Contact support'} className="space-y-4" onSubmit={handleSubmit}>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!appealMode ? <div className="space-y-2">
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
          </div> : null}

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

          {appealMode ? (
            <div className="space-y-4 rounded-md border border-border bg-muted/20 p-3">
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-id-document`}>ID photo</Label>
                <Input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={status === 'submitting'}
                  id={`${idPrefix}-id-document`}
                  onChange={(event) => selectIdDocument(event.target.files?.[0])}
                  required
                  type="file"
                />
                {idPreviewUrl ? (
                  <div className="overflow-hidden rounded-md border border-border bg-black">
                    <canvas
                      ref={idCanvasRef}
                      aria-label="ID photo redaction canvas"
                      className="block h-auto max-h-[28rem] w-full cursor-crosshair object-contain"
                      onPointerDown={startRedaction}
                      onPointerMove={continueRedaction}
                      onPointerUp={finishRedaction}
                      onPointerCancel={finishRedaction}
                      style={{ touchAction: 'none' }}
                    />
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">Draw black marks over your name, address, ID number, and every other detail. Leave only the date of birth and photo visible.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-selfie`}>Selfie with handwritten card</Label>
                <Input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={status === 'submitting'}
                  id={`${idPrefix}-selfie`}
                  onChange={(event) => setSelfie(event.target.files?.[0] ?? null)}
                  required
                  type="file"
                />
                <p className="text-xs text-muted-foreground">Hold a card showing your account email and today’s date.</p>
              </div>
            </div>
          ) : null}

          {!appealMode ? <div className="space-y-2">
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
          </div> : null}

          {!appealMode ? <div className="space-y-2">
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
          </div> : null}

          <Button
            className="w-full"
            disabled={status === 'submitting'}
            style={{ background: 'var(--cruush-gradient)' }}
            type="submit"
          >
            {status === 'submitting' ? 'Sending...' : appealMode ? 'Submit appeal' : 'Send to support'}
          </Button>
        </form>
      )}
    </section>
  );
}
