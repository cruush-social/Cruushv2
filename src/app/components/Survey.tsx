import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

const SURVEY_RECIPIENT = 'reports@cruush.app';

export default function Survey() {
  const navigate = useNavigate();
  const [rating, setRating] = useState('');
  const [bestPart, setBestPart] = useState('');
  const [improvement, setImprovement] = useState('');
  const [bugs, setBugs] = useState('');
  const [sent, setSent] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = [
      `Overall experience (1–5): ${rating || 'Not answered'}`,
      '',
      `What is working best?\n${bestPart || 'Not answered'}`,
      '',
      `What should we improve?\n${improvement || 'Not answered'}`,
      '',
      `Bugs or confusing moments\n${bugs || 'Not answered'}`,
    ].join('\n');
    window.location.href = `mailto:${SURVEY_RECIPIENT}?subject=${encodeURIComponent('cruush feedback')}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

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
          Help us improve cruush. Your feedback opens an email to {SURVEY_RECIPIENT}.
        </p>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="survey-rating">How is cruush feeling so far?</Label>
            <select id="survey-rating" value={rating} onChange={(event) => setRating(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2">
              <option value="">Choose a rating</option>
              {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="survey-best">What is working best?</Label><Textarea id="survey-best" value={bestPart} onChange={(event) => setBestPart(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="survey-improvement">What should we improve?</Label><Textarea id="survey-improvement" value={improvement} onChange={(event) => setImprovement(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="survey-bugs">Did you hit any bugs or confusing moments?</Label><Textarea id="survey-bugs" value={bugs} onChange={(event) => setBugs(event.target.value)} /></div>
          <Button type="submit">Send feedback</Button>
          {sent ? <p className="text-sm text-muted-foreground">Your email app should be open with your feedback ready to send.</p> : null}
        </form>
      </main>
    </div>
  );
}
