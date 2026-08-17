import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Star } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { createSupportRequest } from '../lib/supportApi';

const SURVEY_RECIPIENT = 'reports@cruush.app';

export default function Survey() {
  const navigate = useNavigate();
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [bestPart, setBestPart] = useState('');
  const [improvement, setImprovement] = useState('');
  const [bugs, setBugs] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const body = [
      `Overall experience (1–5): ${ratings.overall || 'Not answered'}`,
      `Ease of use (1–5): ${ratings.ease || 'Not answered'}`,
      `Map experience (1–5): ${ratings.map || 'Not answered'}`,
      `Privacy controls (1–5): ${ratings.privacy || 'Not answered'}`,
      '',
      `What is working best?\n${bestPart || 'Not answered'}`,
      '',
      `What should we improve?\n${improvement || 'Not answered'}`,
      '',
      `Bugs or confusing moments\n${bugs || 'Not answered'}`,
    ].join('\n');
    try {
      await createSupportRequest({ category: 'comment', subject: 'cruush survey response', message: body, source: 'survey', pageUrl: window.location.href });
      setSent(true);
    } catch {
      setError(`We couldn't send your feedback. Please try again or email ${SURVEY_RECIPIENT}.`);
    }
  };

  const StarRating = ({ id, label }: { id: string; label: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} type="button" role="radio" aria-label={`${value} out of 5 stars`} aria-checked={ratings[id] === String(value)} onClick={() => setRatings((current) => ({ ...current, [id]: String(value) }))} className="rounded-md p-1 transition-colors hover:bg-muted">
            <Star className={`h-7 w-7 ${Number(ratings[id]) >= value ? 'fill-current text-primary' : 'text-muted-foreground'}`} />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl">Tell us what you think</h1>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <p className="text-muted-foreground">
          Help us improve cruush. Your feedback is sent directly to {SURVEY_RECIPIENT}.
        </p>
        <form onSubmit={submit} className="space-y-5">
          <StarRating id="overall" label="How is cruush feeling overall?" />
          <StarRating id="ease" label="How easy is cruush to use?" />
          <StarRating id="map" label="How is the map experience?" />
          <StarRating id="privacy" label="How do the privacy controls feel?" />
          <div className="space-y-2"><Label htmlFor="survey-best">What is working best?</Label><Textarea id="survey-best" value={bestPart} onChange={(event) => setBestPart(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="survey-improvement">What should we improve?</Label><Textarea id="survey-improvement" value={improvement} onChange={(event) => setImprovement(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="survey-bugs">Did you hit any bugs or confusing moments?</Label><Textarea id="survey-bugs" value={bugs} onChange={(event) => setBugs(event.target.value)} /></div>
          <Button type="submit">Send feedback</Button>
          {sent ? <p className="text-sm text-muted-foreground">Your feedback was sent to {SURVEY_RECIPIENT}.</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
      </main>
    </div>
  );
}
