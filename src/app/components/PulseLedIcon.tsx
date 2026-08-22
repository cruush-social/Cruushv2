/**
 * The Pulse mark: a heart drawn in the ping green with a black centre and an
 * ekg line running through it. Drawn rather than borrowed so it holds the green
 * at any size against a clear background.
 */
const HEART_PATH = 'M12 20.6C6.6 16.8 3.4 13.6 3.4 10.1a4.7 4.7 0 0 1 8.6-2.7 4.7 4.7 0 0 1 8.6 2.7c0 3.5-3.2 6.7-8.6 10.5Z';

export default function PulseLedIcon({ className = '', fill = '#050506' }: {
  className?: string;
  /** Pass "none" to let the surface behind the mark show through. */
  fill?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={HEART_PATH} fill={fill} stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M5.6 12.1h2.6l1.4-2.8 2 5.4 1.5-3.2 1 1.5h2.9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
