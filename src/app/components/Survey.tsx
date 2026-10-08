import { FormEvent, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import AppPageHeader from './AppPageHeader';
import { createSupportRequest } from '../lib/supportApi';
import { useBackOrFallback } from '../lib/useBackOrFallback';

const SURVEY_RECIPIENT = 'reports@cruush.app';
const SURVEY_GIFT_CODE = 'SURVEYGIFT';

const hesitationReasons = [
  'The price',
  'The payment processor or checkout',
  'I do not see enough value yet',
  'I am not ready to subscribe',
  'I had a technical problem',
  'Something else',
];

const priceOptions = [
  'I would only use a free plan',
  '$1–$4.99 per month',
  '$5–$9.99 per month',
  '$10–$14.99 per month',
  '$15 or more per month',
];

export default function Survey() {
  const goBack = useBackOrFallback('/');
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [bestPart, setBestPart] = useState('');
  const [improvement, setImprovement] = useState('');
  const [bugs, setBugs] = useState('');
  const [hesitation, setHesitation] = useState('');
  const [processor, setProcessor] = useState('');
  const [price, setPrice] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sent || submittingRef.current) return;

    const complete = ['overall', 'ease', 'map', 'privacy'].every((key) => Boolean(ratings[key]))
      && Boolean(hesitation)
      && Boolean(processor)
      && Boolean(price)
      && Boolean(bestPart.trim())
      && Boolean(improvement.trim())
      && Boolean(bugs.trim());
    if (!complete) {
      setError('Complete every question before submitting.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    const body = [
      `Overall experience (1–5): ${ratings.overall || 'Not answered'}`,
      `Ease of use (1–5): ${ratings.ease || 'Not answered'}`,
      `Map experience (1–5): ${ratings.map || 'Not answered'}`,
      `Privacy controls (1–5): ${ratings.privacy || 'Not answered'}`,
      '',
      `What is the biggest reason you have not subscribed?\n${hesitation}`,
      '',
      `How confident would you feel paying through the current checkout/payment processor? (1–5)\n${processor}`,
      '',
      `What monthly price would feel fair for cruush Plus?\n${price}`,
      '',
      `What is working best?\n${bestPart || 'Not answered'}`,
      '',
      `What should we improve?\n${improvement || 'Not answered'}`,
      '',
      `Bugs or confusing moments\n${bugs || 'Not answered'}`,
    ].join('\n');
    try {
      await createSupportRequest({
        category: 'comment',
        subject: 'cruush survey response',
        message: body,
        source: 'survey',
        pageUrl: window.location.href,
      });
      setSent(true);
    } catch {
      submittingRef.current = false;
      setSubmitting(false);
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
      <AppPageHeader
        title="Tell us what you think"
        onBack={goBack}
        bugButtonTestId="survey-bug-button-slot"
      />
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        {sent ? (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
            <p className="select-all rounded-md bg-background px-3 py-2 font-mono text-lg tracking-wider">{SURVEY_GIFT_CODE}</p>
            <p className="mt-2 text-lg text-muted-foreground">Redeem this code in Rewards for one free day of cruush+. It can be used once on your profile.</p>
          </div>
        ) : <form onSubmit={submit} className="space-y-5">
          <StarRating id="overall" label="How is cruush feeling overall?" />
          <StarRating id="ease" label="How easy is cruush to use?" />
          <StarRating id="map" label="How is the map experience?" />
          <StarRating id="privacy" label="How do the privacy controls feel?" />
          <div className="space-y-2"><Label htmlFor="survey-hesitation">What is the biggest reason you have not subscribed?</Label><Select value={hesitation} onValueChange={setHesitation}><SelectTrigger id="survey-hesitation"><SelectValue placeholder="Select one" /></SelectTrigger><SelectContent>{hesitationReasons.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
          <StarRating id="processor" label="How confident would you feel paying through the current checkout/payment processor?" />
          <div className="space-y-2"><Label htmlFor="survey-price">What monthly price would feel fair for cruush Plus?</Label><Select value={price} onValueChange={setPrice}><SelectTrigger id="survey-price"><SelectValue placeholder="Select one" /></SelectTrigger><SelectContent>{priceOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="survey-best">What is working best?</Label><Textarea id="survey-best" value={bestPart} onChange={(event) => setBestPart(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="survey-improvement">What should we improve?</Label><Textarea id="survey-improvement" value={improvement} onChange={(event) => setImprovement(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="survey-bugs">Did you hit any bugs or confusing moments?</Label><Textarea id="survey-bugs" value={bugs} onChange={(event) => setBugs(event.target.value)} /></div>
          <Button disabled={submitting} type="submit">{submitting ? 'Sending...' : 'Send feedback'}</Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>}
      </main>
    </div>
  );
}
