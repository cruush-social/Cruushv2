import { useNavigate } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import CruushPlusWord from './CruushPlusWord';

export default function CruushPlusSuccess() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <section className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center gap-5">
        <CheckCircle2 className="h-12 w-12 text-primary" />
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold"><CruushPlusWord /> is active.</h1>
          <p className="text-sm text-muted-foreground">
            This open beta checkout did not collect a real payment.
          </p>
        </div>
        <Button type="button" onClick={() => navigate('/map')}>Back to map</Button>
      </section>
    </main>
  );
}
