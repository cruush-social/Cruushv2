import { useState } from 'react';
import { ArrowLeft, Flag, Ban } from 'lucide-react';
import { useNavigate } from 'react-router';
import HeartPhoto from './HeartPhoto';
import { CruushIcon } from './CruushIconImage';

/**
 * A side-by-side of the ways feed photos could read, built out of the same
 * card, heart, and tag pieces the live feed already uses so the comparison is
 * honest. Nothing here posts or fetches; it is a place to choose a direction.
 */

const CARD_CLASS_NAME = 'rounded-2xl border border-white/10 bg-black/72 p-4';
const VIBE_BASE = 'min-w-0 max-w-full rounded-full border px-2 py-0.5 text-[11px] uppercase leading-tight tracking-[0.06em]';
const VIBE_NEARBY = `${VIBE_BASE} border-[#FF0072]/55 bg-[#FF0072]/16 text-[#FFB3D2]`;
const VIBE_MUTUAL = `${VIBE_BASE} border-[#6F00FF]/55 bg-[#6F00FF]/12 text-[#DCC7FF]`;

const SAMPLE = {
  author: 'Nora',
  pronouns: 'she/her',
  distance: '0.8 mi',
  age: '9h ago',
  expiry: 'Never',
  content: 'Coffee then the late show at Nitehawk if anyone is around Williamsburg tonight.',
  vibes: ['GOTH', 'LEATHER', 'CAM'],
};

function PostChrome({ children, heartSize, vibesUnderHeart }: {
  children: React.ReactNode;
  heartSize: string;
  vibesUnderHeart: boolean;
}) {
  const vibes = (
    <div className="flex flex-wrap items-center gap-1">
      {SAMPLE.vibes.map((vibe) => (
        <span className={VIBE_NEARBY} key={vibe}>{vibe}</span>
      ))}
    </div>
  );

  return (
    <div className={CARD_CLASS_NAME}>
      <div className="flex items-start gap-3">
        <div className={`-mt-2 flex flex-shrink-0 flex-col items-center gap-1.5 ${heartSize}`}>
          <HeartPhoto
            className="w-full"
            label={`${SAMPLE.author} preview`}
            masked={false}
            photo={null}
            theme="nearby"
            userId="preview-nora"
            fallback={<CruushIcon name="cruush" className="h-5 w-5 opacity-20" />}
          />
          {vibesUnderHeart ? vibes : null}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-white">{SAMPLE.author}</span>
            <div className="flex shrink-0 flex-wrap items-center gap-x-2 text-xs text-white/52">
              <span>{SAMPLE.distance}</span>
              <span>{SAMPLE.age}</span>
              <span>{SAMPLE.expiry}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-white/45">
              <Flag className="h-4 w-4" />
              <Ban className="h-4 w-4" />
            </div>
          </div>

          <p className="text-sm text-white/90">{SAMPLE.content}</p>
          {children}
          {vibesUnderHeart ? null : vibes}
        </div>
      </div>
    </div>
  );
}

function HeartAttachments({ count, onExpand }: { count: number; onExpand: (index: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: count }, (_, index) => (
        <button
          className="w-16 border-0 bg-transparent p-0"
          key={index}
          onClick={() => onExpand(index)}
          type="button"
        >
          <HeartPhoto
            className="w-full"
            label={`Attachment ${index + 1}`}
            masked={false}
            photo={null}
            theme={index === 0 ? 'nearby' : 'mutual'}
            userId={`preview-attachment-${index}`}
            fallback={<CruushIcon name="camera" className="h-4 w-4 opacity-30" />}
          />
        </button>
      ))}
    </div>
  );
}

function FrameAttachments({ count, onExpand }: { count: number; onExpand: (index: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: count }, (_, index) => (
        <button
          className="w-[4.5rem] overflow-hidden rounded-xl border border-white/12 bg-black/60 p-0"
          key={index}
          onClick={() => onExpand(index)}
          style={{ aspectRatio: '4 / 5' }}
          type="button"
        >
          <span
            className="flex h-full w-full items-center justify-center"
            style={{ background: 'var(--cruush-gradient-soft-28), #0A0A12' }}
          >
            <CruushIcon name="camera" className="h-4 w-4 opacity-40" />
          </span>
        </button>
      ))}
    </div>
  );
}

const OPTIONS = [
  {
    id: 'hearts-under-text',
    title: 'Hearts under the text',
    note: 'Attachments read as small hearts on the same line, so a post with photos still fits one card height. Tapping one opens it full screen.',
  },
  {
    id: 'hearts-bigger-author',
    title: 'Bigger author heart, vibes under it',
    note: 'The author heart grows from w-14 to w-20 and the vibe tags move under it, which is the placement asked for on the profile as well.',
  },
  {
    id: 'frames',
    title: 'Four by five frames',
    note: 'The same 4:5 frame the cruise carousel uses. More of the photo reads, at the cost of card height.',
  },
] as const;

export default function FeedPhotoPreview() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background pb-24 text-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-background/95 px-4 py-3 backdrop-blur-md">
        <button
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-background/55"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg">Feed photos</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-8 px-4 py-6">
        <p className="text-sm text-white/60">
          Three ways a feed post with photos could read, built from the pieces the feed already
          uses. Tap an attachment to see how it opens.
        </p>

        <section className="space-y-3">
          <div>
            <h2 className="text-base">Today</h2>
            <p className="text-xs text-white/52">What the feed renders now, with no attachment.</p>
          </div>
          <PostChrome heartSize="w-14" vibesUnderHeart={false}>{null}</PostChrome>
        </section>

        {OPTIONS.map((option) => (
          <section className="space-y-3" key={option.id}>
            <div>
              <h2 className="text-base">{option.title}</h2>
              <p className="text-xs text-white/52">{option.note}</p>
            </div>
            <PostChrome
              heartSize={option.id === 'hearts-bigger-author' ? 'w-20' : 'w-14'}
              vibesUnderHeart={option.id === 'hearts-bigger-author'}
            >
              {option.id === 'frames' ? (
                <FrameAttachments count={3} onExpand={() => setExpanded(option.id)} />
              ) : (
                <HeartAttachments count={option.id === 'hearts-under-text' ? 1 : 3} onExpand={() => setExpanded(option.id)} />
              )}
            </PostChrome>
          </section>
        ))}
      </main>

      {expanded ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black"
          onClick={() => setExpanded(null)}
          role="dialog"
        >
          <div
            className="flex h-[70vh] w-[min(90vw,26rem)] items-center justify-center rounded-3xl border border-white/10"
            style={{ background: 'var(--cruush-gradient-soft-28), #0A0A12' }}
          >
            <CruushIcon name="camera" className="h-10 w-10 opacity-40" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
