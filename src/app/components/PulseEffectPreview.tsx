import { useNavigate } from 'react-router';
import HeartPhoto from './HeartPhoto';
import AppPageHeader from './AppPageHeader';
import { HEART_PIN_PATH } from '../lib/heartPin';

/**
 * Four ways an ekg could ride a pulsing pin, side by side. Nothing here changes
 * a shape or a size: every heart is the map's heart at the map's size, and only
 * the added effect differs.
 */

const SIGNAL = 'Gallery hop, then dancing';

function Unit({ children, traceSignal = false, beating = false, signalTrace = false, signalTopTrace = false }: {
  children?: React.ReactNode;
  traceSignal?: boolean;
  /** Runs the map's own heartbeat on the whole unit, caption included. */
  beating?: boolean;
  /** Runs the trace behind the caption text instead of over the photo. */
  signalTrace?: boolean;
  /** Runs the trace along the caption's top edge, so the border is the line. */
  signalTopTrace?: boolean;
}) {
  return (
    <span
      className="relative flex h-20 w-[103px] origin-bottom items-end justify-center"
      style={beating ? { animation: 'cruush-map-ping-heart-pulse 1.35s ease-in-out infinite' } : undefined}
    >
      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full">
        {signalTopTrace ? (
          /* The caption's top edge is the trace: the flat baseline sits on the
             border and only the spike breaks above it. */
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute -top-5 left-0 z-10 h-6 w-full overflow-visible"
            fill="none"
            preserveAspectRatio="none"
            viewBox="0 0 42 12"
          >
            <path
              className="cruush-pulse-ekg-draw"
              d="M0 10h13.6q1 -1.4 2 0h1.4l0.8 1.5 1.2 -8 1.2 9 0.8 -2.5q2 -1.6 4 0h16"
              stroke="#C8FF31"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.1"
            />
          </svg>
        ) : null}
        <span
          className={`relative block w-max max-w-[16rem] overflow-hidden rounded-full border border-[3.2px] bg-black/86 px-3 py-1 text-center text-[0.7rem] font-semibold leading-tight text-white backdrop-blur-md ${
            traceSignal ? 'cruush-ping-signal-trace' : ''
          }`}
          style={{ borderColor: '#C8FF31' }}
        >
        {signalTrace ? (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
            fill="none"
            preserveAspectRatio="none"
            viewBox="0 0 42 12"
          >
            <path
              className="cruush-pulse-ekg-draw"
              d="M0 6h7q1 -1.6 2 0h1.4l0.8 2 1.2 -5.4 1.2 6.6 0.8 -2q2 -1.8 4 0h23.6"
              stroke="#C8FF31"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity="0.5"
              strokeWidth="0.9"
            />
          </svg>
        ) : null}
        <span className="relative">{SIGNAL}</span>
        </span>
      </span>
      <span className="relative block w-20">
        {children}
        <HeartPhoto
          borderColor="#C8FF31"
          className="w-20"
          label="Pulse example"
          masked={false}
          photo={null}
          theme="current"
          userId="pulse-effect"
        />
      </span>
    </span>
  );
}

function BorderCharge() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      fill="none"
      viewBox="0 0 64 64"
    >
      <path
        className="cruush-pulse-border-charge"
        d={HEART_PIN_PATH}
        stroke="#C8FF31"
        strokeLinecap="round"
        strokeWidth="3.4"
      />
    </svg>
  );
}

// A real PQRST complex rather than a zigzag: flat baseline, the small rounded P
// bump, a short Q dip, the tall narrow R spike, the S undershoot below the
// baseline, then the broad T wave and back to flat. Drawn inside the heart so
// the trace starts and ends within the border.
const EKG_PATH = 'M2 26h6q1.2 -2 2.4 0h1.6l1 2.6 1.4 -17 1.4 20 1 -5.6q2.6 -5 5.2 0h7';

function EkgTrace({ behind }: { behind?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 top-[52%] h-12 w-[6.1rem] -translate-x-1/2 -translate-y-1/2 ${
        behind ? 'z-0' : 'z-20'
      }`}
      fill="none"
      viewBox="0 0 42 42"
    >
      {/* A thin bright line with its own glow, the way a monitor trace reads.
          The glow is a blurred copy of the same path, not a box shadow. */}
      <g style={{ filter: 'blur(1.6px)' }}>
        <path
          className="cruush-pulse-ekg-draw"
          d={EKG_PATH}
          stroke="#C8FF31"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.55"
          strokeWidth="2.6"
        />
      </g>
      <path
        className="cruush-pulse-ekg-draw"
        d={EKG_PATH}
        stroke="#EDFFB4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.92"
        strokeWidth="1"
      />
    </svg>
  );
}

function EkgHead() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-[46%] z-20 h-12 w-[4.6rem] -translate-x-1/2 -translate-y-1/2"
      fill="none"
      viewBox="0 0 42 42"
    >
      <path
        className="cruush-pulse-ekg-draw"
        d={EKG_PATH}
        stroke="#C8FF31"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.62" strokeWidth="1.9"
      />
      <circle
        className="cruush-pulse-ekg-head"
        fill="#EDFFB4"
        r="1.9"
        style={{ offsetPath: `path('${EKG_PATH}')` }}
      />
    </svg>
  );
}

function EkgCircuit() {
  return (
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[46%] z-20 h-12 w-[4.6rem] -translate-x-1/2 -translate-y-1/2"
        fill="none"
        viewBox="0 0 42 42"
      >
        <path
          className="cruush-pulse-circuit-line"
          d={EKG_PATH}
          stroke="#C8FF31"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.62" strokeWidth="1.9"
        />
      </svg>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 h-full w-full"
        fill="none"
        viewBox="0 0 64 64"
      >
        <path
          className="cruush-pulse-circuit-border"
          d={HEART_PIN_PATH}
          stroke="#C8FF31"
          strokeLinecap="round"
          strokeWidth="3.4"
        />
      </svg>
    </>
  );
}

const EXAMPLES = [
  {
    id: 'trace',
    title: 'Trace on the signal border',
    note: 'A green highlight runs the caption border once per beat. Nothing sits over the photo.',
    render: () => <Unit traceSignal />,
  },
  {
    id: 'over',
    title: 'Ekg over the heart',
    note: 'The line draws across the front of the pin on each beat, then clears.',
    render: () => <Unit><EkgTrace /></Unit>,
  },
  {
    id: 'behind',
    title: 'Ekg behind the heart',
    note: 'The same line, drawn behind the pin so only its ends read on either side.',
    render: () => <Unit><EkgTrace behind /></Unit>,
  },
  {
    id: 'charge',
    title: 'Ekg across, charge running the border',
    note: 'The line draws across the pin and a lit segment chases the heart outline on the same beat.',
    render: () => <Unit><EkgTrace /><BorderCharge /></Unit>,
  },
  {
    id: 'charge-only',
    title: 'Charge running the border alone',
    note: 'Just the segment chasing the outline. Nothing crosses the photo.',
    render: () => <Unit><BorderCharge /></Unit>,
  },
  {
    id: 'head',
    title: 'Ekg with a lit head',
    note: 'The line stays faint and a bright point runs along it, the way a monitor cursor moves.',
    render: () => <Unit><EkgHead /></Unit>,
  },
  {
    id: 'circuit',
    title: 'One circuit',
    note: 'The line crosses the pin, then the same current carries on around the heart outline.',
    render: () => <Unit><EkgCircuit /></Unit>,
  },
  {
    id: 'beat-ekg',
    title: 'Ekg beating with the pin',
    note: 'The whole unit runs the map heartbeat and the line draws across it on the same beat.',
    render: () => <Unit beating><EkgTrace /></Unit>,
  },
  {
    id: 'beat-circuit',
    title: 'Circuit beating with the pin',
    note: 'The heartbeat plus the current crossing the pin and carrying on around the outline.',
    render: () => <Unit beating><EkgCircuit /></Unit>,
  },
  {
    id: 'signal-behind',
    title: 'Ekg behind the signal',
    note: 'The trace runs inside the caption, behind the words. Nothing touches the photo.',
    render: () => <Unit signalTrace />,
  },
  {
    id: 'signal-behind-beat',
    title: 'Ekg behind the signal, beating',
    note: 'The same trace inside the caption while the whole unit runs the heartbeat.',
    render: () => <Unit beating signalTrace />,
  },
  {
    id: 'signal-and-pin',
    title: 'Ekg in both, beating',
    note: 'Trace inside the caption and across the pin, on the same beat.',
    render: () => <Unit beating signalTrace><EkgTrace /></Unit>,
  },
  {
    id: 'signal-top',
    title: 'Ekg across the top of the signal',
    note: 'The caption\u2019s top edge becomes the trace. The spike breaks above the border and nothing touches the photo.',
    render: () => <Unit signalTopTrace />,
  },
  {
    id: 'signal-top-beat',
    title: 'Ekg across the top, beating',
    note: 'The same top edge trace while the whole unit runs the heartbeat.',
    render: () => <Unit beating signalTopTrace />,
  },
] as const;

export default function PulseEffectPreview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24 text-white">
      <AppPageHeader
        title="Pulse effects"
        onBack={() => navigate(-1)}
        bugButtonTestId="pulse-effect-preview-bug-button-slot"
      />

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
        <p className="text-sm text-white/62">
          Same heart, same size, same signal capsule. Only the effect differs.
        </p>

        {EXAMPLES.map((example) => (
          <section
            className="space-y-2 rounded-2xl border border-white/10 bg-black/45 p-4"
            key={example.id}
          >
            <div>
              <h2 className="text-base">{example.title}</h2>
              <p className="text-xs text-white/55">{example.note}</p>
            </div>
            <div className="flex items-end justify-center pb-2 pt-10">
              {example.render()}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
