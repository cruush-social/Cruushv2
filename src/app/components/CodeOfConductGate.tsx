import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';
import { acceptCodeOfConduct } from '../lib/authApi';
import type { AuthSessionPayload } from '../lib/authApi';
import { CODE_OF_CONDUCT_ITEMS } from '../lib/codeOfConduct';

type CodeOfConductGateProps = {
  version: string;
  onAccepted: (session: AuthSessionPayload) => void;
};

export default function CodeOfConductGate({ version, onAccepted }: CodeOfConductGateProps) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setSaving(true);
    setError(null);

    try {
      onAccepted(await acceptCodeOfConduct(version));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to accept right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <section className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center gap-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">the oath</p>
          <h1 className="text-3xl font-semibold">Before the gates open.</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Every member agrees to the cruush code of conduct. Read it plainly, accept it explicitly, then enter.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-card/70 p-4">
          <ul className="space-y-3 text-sm leading-6 text-white/72">
            {CODE_OF_CONDUCT_ITEMS.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/80">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-white/25 bg-input-background accent-primary"
          />
          <span>I have read and agree to the cruush code of conduct.</span>
        </label>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <Button type="button" size="lg" disabled={!agreed || saving} onClick={handleAccept}>
          {saving ? 'Saving...' : 'I agree and enter'}
        </Button>
      </section>
    </main>
  );
}
