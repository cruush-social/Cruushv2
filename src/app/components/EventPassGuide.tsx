import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { getEventPassGuide, type EventPassGuide as EventPassGuidePayload } from '../lib/eventsApi';
import { CruushIcon } from './CruushIconImage';
import { Button } from './ui/button';
import LoadingCardSkeletons from './LoadingCardSkeletons';

function formatGuideTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function EventPassGuide() {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const [guide, setGuide] = useState<EventPassGuidePayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eventId) {
      setError('Event not found.');
      return;
    }

    let isMounted = true;

    getEventPassGuide(eventId)
      .then((payload) => {
        if (isMounted) {
          setGuide(payload);
          setError('');
        }
      })
      .catch((guideError) => {
        if (isMounted) {
          setError(guideError instanceof Error ? guideError.message : 'Unable to load the door guide.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [eventId]);

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/92 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl text-white">Door pass guide</h1>
            <p className="text-sm text-white/50">Hourly icon schedule for event staff.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        {error ? (
          <div className="rounded-lg border border-[#d11f3a]/35 bg-[#d11f3a]/10 p-4 text-sm text-[#ff6c9f]">
            {error}
          </div>
        ) : null}

        {!guide && !error ? (
          <LoadingCardSkeletons count={3} label="Loading door guide" />
        ) : null}

        {guide ? (
          <>
            <section className="rounded-lg border border-[#03ecfc]/25 bg-[#03ecfc]/10 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-[#03ecfc]/25 bg-black/30">
                  <CruushIcon name={guide.current.iconName} variant="colored" className="h-11 w-11" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#03ecfc]">Current icon</p>
                  <h2 className="text-2xl text-white">{guide.current.iconName}</h2>
                  <p className="text-sm text-white/60">
                    {formatGuideTime(guide.current.validFrom)} - {formatGuideTime(guide.current.validUntil)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.045]">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <ShieldCheck className="h-4 w-4 text-[#03ecfc]" />
                <h2 className="text-sm uppercase tracking-[0.16em] text-white/70">{guide.venueName}</h2>
              </div>
              <div className="divide-y divide-white/8">
                {guide.guide.map((window) => (
                  <div key={`${window.hourIndex}:${window.validFrom}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/35">
                        <CruushIcon name={window.iconName} variant="colored" className="h-7 w-7" />
                      </span>
                      <div>
                        <p className="text-base text-white">{window.iconName}</p>
                        <p className="text-xs text-white/50">Hour {window.hourIndex + 1}</p>
                      </div>
                    </div>
                    <p className="text-right text-sm text-white/60">
                      {formatGuideTime(window.validFrom)} - {formatGuideTime(window.validUntil)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
