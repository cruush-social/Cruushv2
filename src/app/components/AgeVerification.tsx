import { useState, type FormEvent } from 'react';
import { verifyAge, type AuthSessionPayload } from '../lib/authApi';
import { Button } from './ui/button';

interface AgeVerificationProps {
  onVerified: (session: AuthSessionPayload) => void;
}

export default function AgeVerification({ onVerified }: AgeVerificationProps) {
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      onVerified(await verifyAge({ dateOfBirth }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to verify your date of birth.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground">
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-sm flex-col gap-5 rounded-xl border border-white/10 bg-black/80 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Confirm your age</h1>
          <p className="mt-2 text-sm text-white/65">Enter your date of birth to continue.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="age-verification-date">Date of birth</label>
          <input
            id="age-verification-date"
            type="date"
            autoComplete="bday"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            required
            disabled={saving}
            className="h-11 w-full rounded-md border border-input bg-input-background px-3 text-foreground"
          />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={saving}>{saving ? 'Checking…' : 'Continue'}</Button>
      </form>
    </main>
  );
}
