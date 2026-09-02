import { ArrowLeft, MessageCircle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
import { CruushIcon } from './CruushIconImage';

export default function Tutorial() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-20 text-white">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-white/10 bg-background/88 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back to settings">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl">Tutorial</h2>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <section className="rounded-xl border border-white/10 bg-card/80 p-4">
          <h3 className="text-base">Interactive map tutorial</h3>
          <p className="mt-1 text-sm text-white/58">
            Replay the full tour for cruush+, Mile High Club, Spots and the Pink Book, Seeking, Visibility, Crowd Mode, Ghost Mode, Dark Room, DL Mode, Pulse, Feed, the Cruise Carousel, profile pins, and map controls. Finish the tour to complete its Side Quest.
          </p>
          <Button
            className="mt-4 rounded-full"
            style={{ background: 'var(--cruush-gradient)' }}
            onClick={() => navigate('/map?replayTutorial=1')}
          >
            Replay tutorial
          </Button>
        </section>

        <section className="rounded-xl border border-white/10 bg-card/80 p-4">
          <div className="flex items-start gap-3">
            <MessageCircle className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base">Messages default to Mutuals</h3>
              <p className="mt-1 text-sm text-white/58">
                New accounts default to Mutuals, so only mutuals can start chats unless you change it to Public or Crowd.
              </p>
              <Button className="mt-4 rounded-full" variant="outline" onClick={() => navigate('/cruush/settings')}>
                Open message permissions
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-card/80 p-4">
          <div className="flex items-start gap-3">
            <CruushIcon name="ghost" className="mt-1 h-5 w-5" />
            <div>
              <h3 className="text-base">Location privacy</h3>
              <p className="mt-1 text-sm text-white/58">
                Ghost Mode controls how your map location appears. Privacy Audit shows who can see you and which precise grants can be revoked.
              </p>
              <Button className="mt-4 rounded-full" variant="outline" onClick={() => navigate('/privacy/audit')}>
                Open Privacy Audit
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-card/80 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base">Feed and profile controls</h3>
              <p className="mt-1 text-sm text-white/58">
                Basic members can post text and tags. Feed+ adds up to three photo hearts, specific Crowd audiences, and custom expiration times. Profile tags are searchable in Seeking and Visibility.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="rounded-full" variant="outline" onClick={() => navigate('/feed')}>
                  Open Feed
                </Button>
                <Button className="rounded-full" variant="outline" onClick={() => navigate('/profile/edit')}>
                  Edit profile
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
