import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import BugButtonSlot from './BugButtonSlot';

/**
 * Marks for Kelpie Mode, side by side. A kelpie is a water horse: it waits
 * under the surface, watches the bank, and is gone before you are sure it was
 * there. Every mark here is one filled shape so it holds in white at the size
 * a mode control renders, and none of them carry colour of their own.
 */

type MarkProps = { className?: string };

/** Head and mane above the waterline, the rest of it under. */
export function KelpieWaterHorse({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      {/* A horse head in profile, facing the bank: ears, a long face down to the
          muzzle, jaw, and the arched crest of the neck going into the water. */}
      <path
        clipRule="evenodd"
        d="M9.5 1.9 8.9 5.1C8.5 5.6 8.2 6 7.8 6.5 7 7.8 6.1 9 5.4 11.4c-.4.6-.8 1.1-.8 1.7 0 .8.4 1.3 1.1 1.3l2.3-.2c.8.4 1.4.8 2 1.2.7.5 1.3.9 1.8 1.4h6.4c.2-3.7-.2-6.6-1.2-8.9-.8-1.7-2-2.9-3.4-3.8l-.8-2.4-1.1 3-1.2-.3Zm-.2 5.7a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Z"
        fillRule="evenodd"
      />
      {/* Mane, growing off the crest rather than floating beside it. */}
      <path d="M13.4 3.6c2.5 1.4 4.2 3.4 5.1 6.1.4 1.3.6 2.7.7 4.2l-2-.6c-.1-1.4-.3-2.6-.7-3.7-.7-2.2-1.8-3.9-3.5-5.1z" />
      <path d="M15.4 5.6c2.4 1.9 3.9 4.3 4.4 7.2.2 1 .3 2 .3 3l-1.9-.7c0-.9-.1-1.7-.3-2.5-.4-2.4-1.5-4.4-3.3-6z" />
      <path d="M2.4 17.6h19.2v1.5H2.4z" />
      <path d="M2.4 20.6c1.6 0 1.6 1.4 3.2 1.4s1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4v1.5c-1.6 0-1.6 1.4-3.2 1.4s-1.6-1.4-3.2-1.4-1.6 1.4-3.2 1.4-1.6-1.4-3.2-1.4-1.6 1.4-3.2 1.4-1.6-1.4-3.2-1.4z" />
    </svg>
  );
}

/** Only the head breaks the surface, mane streaming back on the current. */
export function KelpieSurfacing({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path
        clipRule="evenodd"
        d="M20.6 3.4a5.6 5.6 0 0 0-3 1.5 5.4 5.4 0 0 0-1.9-.4c-3 0-5.4 2.3-5.4 5.2 0 1.3.5 2.5 1.3 3.4l-1 2.4h9.1l-.9-2.5c.8-.9 1.2-2 1.2-3.3 0-.6-.1-1.3-.3-1.8 1-1.2 1.4-2.7 1-4.4Zm-6.4 5.1a1 1 0 1 0 0 2.1 1 1 0 0 0 0-2.1Z"
        fillRule="evenodd"
      />
      <path d="M9.2 4.6c.8 1.4 1 3 .7 4.6-1-.9-1.5-2.1-1.6-3.5.2-.4.5-.8.9-1.1Z" />
      <path d="M5.5 6.4c1.3 1.4 1.9 3 1.9 4.9-1.3-.9-2-2.2-2.3-3.8 0-.4.1-.8.4-1.1Z" />
      <path d="M1.8 17.4h20.4v1.5H1.8z" />
      <path d="M1.8 20.4c1.6 0 1.6 1.4 3.2 1.4s1.6-1.4 3.2-1.4 1.7 1.4 3.3 1.4 1.7-1.4 3.3-1.4 1.7 1.4 3.3 1.4 1.7-1.4 3.3-1.4v1.5c-1.6 0-1.6 1.4-3.3 1.4s-1.6-1.4-3.3-1.4-1.6 1.4-3.3 1.4-1.6-1.4-3.3-1.4-1.6 1.4-3.2 1.4-1.6-1.4-3.2-1.4z" />
    </svg>
  );
}

/** The other shape it wears: long hair, pointed ears, waterweed in the hair. */
export function KelpieRider({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path
        clipRule="evenodd"
        d="M12 2.2c-3 0-5.2 2.2-5.2 5.1 0 .6.1 1.2.3 1.8L4.4 7.4l1.5 3.4-1.7.4 2.4 1.9c.4.7.9 1.3 1.5 1.8l-1 3.4h9.8l-1-3.4c.6-.5 1.1-1.1 1.5-1.8l2.4-1.9-1.7-.4L19.6 7l-2.7 2.1c.2-.6.3-1.2.3-1.8 0-2.9-2.2-5.1-5.2-5.1Zm-2.1 5.2a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Zm4.2 0a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Z"
        fillRule="evenodd"
      />
      <path d="M2.2 19.5h19.6v1.5H2.2z" />
      <path d="M2.2 22.4c1.6 0 1.6-1.3 3.2-1.3s1.6 1.3 3.3 1.3 1.6-1.3 3.3-1.3 1.6 1.3 3.3 1.3 1.6-1.3 3.2-1.3 1.6 1.3 3.3 1.3V24H2.2z" />
    </svg>
  );
}

/** A hoofprint filling with water: it was here, it is not here now. */
export function KelpieTrace({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path
        clipRule="evenodd"
        d="M12 2.6c-4 0-7.2 3-7.2 6.9 0 3.4 2.3 6.2 5.4 6.8v2.1h3.6v-2.1c3.1-.6 5.4-3.4 5.4-6.8 0-3.8-3.2-6.9-7.2-6.9Zm0 3.1c2.2 0 4 1.7 4 3.8s-1.8 3.8-4 3.8-4-1.7-4-3.8 1.8-3.8 4-3.8Z"
        fillRule="evenodd"
      />
      <path d="M2.2 20c1.6 0 1.6 1.4 3.2 1.4S7 20 8.7 20s1.6 1.4 3.3 1.4S13.6 20 15.3 20s1.6 1.4 3.2 1.4S20.1 20 21.8 20v1.5c-1.7 0-1.7 1.4-3.3 1.4s-1.6-1.4-3.2-1.4-1.7 1.4-3.3 1.4-1.7-1.4-3.3-1.4-1.6 1.4-3.2 1.4-1.6-1.4-3.3-1.4z" />
    </svg>
  );
}

/** Eyes over the waterline and nothing else. */
export function KelpieWatching({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path
        clipRule="evenodd"
        d="M12 3.4c-3.3 0-6 2.6-6 5.8 0 2 1 3.7 2.6 4.8l-.6 1.9h8l-.6-1.9c1.6-1.1 2.6-2.8 2.6-4.8 0-3.2-2.7-5.8-6-5.8Zm-2.4 4.9a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Zm4.8 0a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z"
        fillRule="evenodd"
      />
      <path d="M6.7 3.1c1 1 1.4 2.3 1.3 3.7C7 6.1 6.4 5 6.3 3.7c.1-.2.2-.4.4-.6Z" />
      <path d="M17.3 3.1c.2.2.3.4.4.6-.1 1.3-.7 2.4-1.7 3.1-.1-1.4.3-2.7 1.3-3.7Z" />
      <path d="M1.9 17.2h20.2v1.6H1.9z" />
      <path d="M1.9 20.2c1.7 0 1.7 1.4 3.4 1.4s1.7-1.4 3.4-1.4 1.7 1.4 3.3 1.4 1.7-1.4 3.4-1.4 1.7 1.4 3.4 1.4 1.6-1.4 3.3-1.4v1.6c-1.7 0-1.7 1.4-3.3 1.4s-1.7-1.4-3.4-1.4-1.7 1.4-3.4 1.4-1.6-1.4-3.3-1.4-1.7 1.4-3.4 1.4-1.7-1.4-3.4-1.4z" />
    </svg>
  );
}

const MARKS = [
  {
    id: 'water-horse',
    title: 'Water horse',
    note: 'Head and mane above the line, the body under it. The full creature, read at a glance.',
    Mark: KelpieWaterHorse,
  },
  {
    id: 'surfacing',
    title: 'Surfacing',
    note: 'Only the head breaks the surface, mane streaming back. More lurk, less horse.',
    Mark: KelpieSurfacing,
  },
  {
    id: 'rider',
    title: 'The other shape',
    note: 'Long hair, pointed ears, waterweed in it. The shape a kelpie wears on land.',
    Mark: KelpieRider,
  },
  {
    id: 'watching',
    title: 'Watching',
    note: 'Eyes over the waterline and nothing else. Sees without being seen, which is the mode.',
    Mark: KelpieWatching,
  },
  {
    id: 'trace',
    title: 'Trace',
    note: 'A hoofprint filling with water. It was here, and it is not here now.',
    Mark: KelpieTrace,
  },
] as const;

export default function KelpieMarkPreview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24 text-white">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-[color:var(--cruush-black-glass)] px-4 py-3 backdrop-blur-[var(--cruush-black-glass-blur)]">
        <button
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/55"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg">Kelpie marks</h1>
      
        <BugButtonSlot testId="kelpie-mark-preview-bug-button-slot" />
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
        <p className="text-sm text-white/62">
          Each one at the size it renders in the mode row, at control size, and small. Flat white
          throughout, and again on the gradient the way the mode controls carry it.
        </p>

        {MARKS.map(({ id, title, note, Mark }) => (
          <section className="space-y-3 rounded-2xl border border-white/10 bg-black/45 p-4" key={id}>
            <div>
              <h2 className="text-base">{title}</h2>
              <p className="text-xs text-white/55">{note}</p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Mark className="h-14 w-14 text-white" />
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-black/55"
              >
                <Mark className="h-7 w-7 text-white" />
              </span>
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full border-0"
                style={{ background: 'var(--cruush-gradient)' }}
              >
                <Mark className="h-7 w-7 text-white" />
              </span>
              <Mark className="h-5 w-5 text-white" />
              <Mark className="h-4 w-4 text-white" />
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
