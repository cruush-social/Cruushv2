import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Heart, MapPin, MessageCircle, Sparkles, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { sendCruush } from '../lib/cruushApi';
import { openConversationOrInbox } from '../lib/openConversation';
import { PROFILE_HERO_ASPECT_STYLE } from '../lib/photoLayout';

interface MapProfilePopupProps {
  user: any;
  onClose: () => void;
}

export default function MapProfilePopup({ user, onClose }: MapProfilePopupProps) {
  const navigate = useNavigate();
  const [cruushed, setCruushed] = useState(false);

  const handleCruush = async () => {
    try {
      const data = await sendCruush(user.id, {
        name: user.name,
        pronouns: user.pronouns,
        photo: user.photo ?? null,
      });
      setCruushed(true);

      if (data.mutual) {
        alert(`It's mutual. You and ${user.name} have a cruush on each other.`);
      }
    } catch (error) {
      console.error('Error sending cruush:', error);
    }
  };

  return (
    <aside
      className="absolute bottom-28 left-6 z-30 hidden w-[23rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-[28px] border border-white/10 bg-black/80 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl lg:block"
      style={{ maxHeight: 'calc(100vh - 8rem)' }}
    >
      <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">
        <div
          className="relative overflow-hidden bg-gradient-to-br from-crimson-dark via-crimson-dark to-crimson-bright"
          style={PROFILE_HERO_ASPECT_STYLE}
        >
          {user.photo ? (
            <img
              src={user.photo}
              alt={user.name}
              className="h-full w-full object-cover"
              style={PROFILE_HERO_ASPECT_STYLE}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Heart className="h-24 w-24 text-white/15" />
            </div>
          )}

          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm">
              Nearby now
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/80 backdrop-blur-sm transition hover:text-white"
              aria-label="Close profile preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-5 pb-5 pt-10">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-3xl text-white">
                  {user.name}
                  {user.age ? <span className="text-white/80">, {user.age}</span> : null}
                </h3>
                <p className="mt-1 text-sm text-white/80">{user.pronouns}</p>
              </div>
              {user.lastActive ? (
                <div className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80 backdrop-blur-sm">
                  {user.lastActive}
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex items-center gap-2 text-sm text-white/80">
              <MapPin className="h-4 w-4" />
              <span>{user.distance || 'Nearby'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 text-white">
          <section className="grid grid-cols-2 gap-3 text-sm">
            <MiniStat label="Pronouns" value={user.pronouns || 'Ask me'} />
            <MiniStat label="Distance" value={user.distance || 'Nearby'} />
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
              <Sparkles className="h-3.5 w-3.5" />
              Looking for
            </div>
            <div className="flex flex-wrap gap-2">
              {user.lookingFor?.length ? (
                user.lookingFor.map((item: string) => (
                  <Badge key={item} className="border-0 bg-white/10 text-white hover:bg-white/10">
                    {item}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-white/55">Open to seeing where the vibe goes.</span>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-xs uppercase tracking-[0.18em] text-white/55">Vibes</div>
            <div className="flex flex-wrap gap-2">
              {user.vibes?.length ? (
                user.vibes.map((item: string) => (
                  <Badge
                    key={item}
                    className="border-0 text-white"
                    style={{ background: 'linear-gradient(135deg, rgba(255,47,114,0.28) 0%, rgba(122,43,255,0.28) 42%, rgba(34,184,255,0.28) 100%)' }}
                  >
                    {item}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-white/55">No vibe tags yet.</span>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-xs uppercase tracking-[0.18em] text-white/55">Map status</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MiniStat label="Last Active" value={user.lastActive || 'Just now'} />
              <MiniStat label="Cruush" value={cruushed ? 'Sent' : 'Ready'} />
            </div>
          </section>

          <section className="space-y-2 pb-20">
            <div className="text-xs uppercase tracking-[0.18em] text-white/55">At a glance</div>
            <p className="text-sm leading-6 text-white/72">
              {user.name} is nearby right now. Open the chat fast if the vibe is there, or drop a cruush and keep cruising.
            </p>
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-white/10 bg-black/85 px-5 py-4 backdrop-blur-xl">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <Button
              onClick={handleCruush}
              disabled={cruushed}
              className="h-12 w-12 rounded-2xl border-0 px-0 text-white"
              style={{
                background: cruushed
                  ? 'rgba(255,255,255,0.16)'
                  : 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
              }}
              aria-label={cruushed ? 'Cruush sent' : 'Send cruush'}
            >
              <Heart className={`h-5 w-5 ${cruushed ? 'fill-current' : ''}`} />
            </Button>

            <Button
              className="h-12 justify-center rounded-2xl border-0 text-base text-white"
              style={{
                background: 'linear-gradient(135deg, rgba(255,47,114,0.96) 0%, rgba(122,43,255,0.96) 42%, rgba(34,184,255,0.96) 100%)',
              }}
              onClick={() => {
                void openConversationOrInbox(navigate, user.id);
              }}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Message now
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className="mt-1 text-sm text-white/85">{value}</div>
    </div>
  );
}
