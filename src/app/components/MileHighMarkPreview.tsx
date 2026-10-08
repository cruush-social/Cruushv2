import { useNavigate } from 'react-router';
import AppPageHeader from './AppPageHeader';

/**
 * Marks for the Mile High Club, side by side. The feature moves your pin
 * somewhere you are not standing, so the aim is a mark that says "somewhere
 * else" rather than one that says "aeroplane": there is already a plane on the
 * heart. Every mark is flat white and holds as one shape down to chip size.
 */

type MarkProps = { className?: string };

/** Hollow pin where you are, solid pin where you dropped it, dashed run between. */
export function MileHighTwoPins({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      {/* The dashed run borrows the map's own language: it already draws a
          dashed line between two pins. */}
      <path
        d="M5.6 19.2C8.6 15.4 12.4 13.4 17 13"
        fill="none"
        stroke="currentColor"
        strokeDasharray="2.1 2.1"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      {/* Where you actually are: hollow, because you are not there any more. */}
      <path
        clipRule="evenodd"
        d="M5.6 12.4a3 3 0 0 0-3 3c0 2.2 3 5.6 3 5.6s3-3.4 3-5.6a3 3 0 0 0-3-3Zm0 1.8a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z"
        fillRule="evenodd"
      />
      {/* Where you dropped it: solid, because that is where the map shows you. */}
      <path d="M17.4 2.2a4 4 0 0 0-4 4c0 2.9 4 7.4 4 7.4s4-4.5 4-7.4a4 4 0 0 0-4-4Z" />
    </svg>
  );
}

/** The heart, with the trail it left getting there. No aircraft. */
export function MileHighContrail({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      {/* Three trails, tapering, so the heart reads as the thing that moved. */}
      <path d="M1.1 8.2 7.4 7.4v1.7L1.1 9.9a.85.85 0 0 1 0-1.7Z" />
      <path d="M2.6 12.6 8.6 11.9v1.7l-6 .7a.85.85 0 0 1 0-1.7Z" />
      <path d="M5 16.9l4.9-.6v1.7l-4.9.6a.85.85 0 0 1 0-1.7Z" />
      <path d="M16.2 3.6c-1.4 0-2.4.7-3.1 1.6-.7-.9-1.7-1.6-3.1-1.6-2.4 0-4 2.4-2.9 4.8 1.4 3.2 6 6.5 6 6.5s4.6-3.3 6-6.5c1.1-2.4-.5-4.8-2.9-4.8Z" />
    </svg>
  );
}

/** The window, not the plane. A heart seen through it. */
export function MileHighWindow({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      {/* The frame is one of the few aviation shapes that is not an aircraft. */}
      <path
        clipRule="evenodd"
        d="M12 1.6c-3.9 0-7 3.2-7 7v6.8c0 3.9 3.1 7 7 7s7-3.1 7-7V8.6c0-3.8-3.1-7-7-7Zm0 2.5c2.5 0 4.5 2 4.5 4.5v6.8c0 2.5-2 4.5-4.5 4.5s-4.5-2-4.5-4.5V8.6c0-2.5 2-4.5 4.5-4.5Z"
        fillRule="evenodd"
      />
      <path d="M14 7.6c-.9 0-1.5.5-2 1.1-.5-.6-1.1-1.1-2-1.1-1.5 0-2.5 1.5-1.8 3 .9 2 3.8 4.1 3.8 4.1s2.9-2.1 3.8-4.1c.7-1.5-.3-3-1.8-3Z" />
    </svg>
  );
}

/** A pin standing above the cloud line. */
export function MileHighAboveClouds({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path
        clipRule="evenodd"
        d="M12 1.4a5.7 5.7 0 0 0-5.7 5.7c0 4.2 5.7 10.3 5.7 10.3s5.7-6.1 5.7-10.3A5.7 5.7 0 0 0 12 1.4Zm0 3.3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"
        fillRule="evenodd"
      />
      {/* The cloud band crosses in front, so the pin is above it, not on it. */}
      <path d="M2.6 21.4c0-1.3 1-2.3 2.3-2.3.3 0 .6 0 .8.1a3.2 3.2 0 0 1 5.8-.7 2.5 2.5 0 0 1 3.8 1.3c.3-.2.7-.3 1.1-.3 1.3 0 2.4 1 2.4 2.3 0 .4-.1.7-.2 1H2.8a2.4 2.4 0 0 1-.2-1.4Z" />
    </svg>
  );
}

const MARKS = [
  {
    id: 'two-pins',
    title: 'Two pins, one run',
    note: 'Hollow pin where you are, solid pin where you dropped it. Describes what the feature does rather than gesturing at aviation, and the map already draws that dashed line.',
    Mark: MileHighTwoPins,
  },
  {
    id: 'contrail',
    title: 'Contrail',
    note: 'The heart is the subject and the trail is what it left. Keeps the heart the way the rest of the set does, no aircraft anywhere in it.',
    Mark: MileHighContrail,
  },
  {
    id: 'window',
    title: 'Window seat',
    note: 'The window frame, with a heart through it. One bold silhouette, which is what survives at chip size.',
    Mark: MileHighWindow,
  },
  {
    id: 'above-clouds',
    title: 'Above the clouds',
    note: 'A pin standing above the cloud line. Clouds already appear inside the heart photo masks.',
    Mark: MileHighAboveClouds,
  },
] as const;

export default function MileHighMarkPreview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24 text-white">
      <AppPageHeader
        title="Mile High Club marks"
        onBack={() => navigate(-1)}
        bugButtonTestId="mile-high-mark-preview-bug-button-slot"
      />

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
        <p className="text-sm text-white/62">
          Each one large, at control size, on the gradient, small, and last in a real badge chip at
          25px with the 3.2px border the map draws. Flat white throughout.
        </p>

        {MARKS.map(({ id, title, note, Mark }) => (
          <section className="space-y-3 rounded-2xl border border-white/10 bg-black/45 p-4" key={id}>
            <div>
              <h2 className="text-base">{title}</h2>
              <p className="text-xs text-white/55">{note}</p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Mark className="h-14 w-14 text-white" />
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-black/55">
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

              {/* The real chip: the size and border the map draws beside a heart. */}
              <span
                className="flex h-[1.5625rem] w-[1.5625rem] items-center justify-center rounded-full bg-black"
                style={{ border: '3.2px solid #004BFF' }}
              >
                <Mark className="h-3 w-3 text-white" />
              </span>
              <span
                className="flex h-[1.5625rem] w-[1.5625rem] items-center justify-center rounded-full"
                style={{ border: '3.2px solid #6f00ff', background: 'var(--cruush-gradient)' }}
              >
                <Mark className="h-3 w-3 text-white" />
              </span>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
