/**
 * The Pulse mark: an ekg line inside a ring, both in the ping green. Drawn
 * rather than borrowed so it holds the green at any size on a clear background.
 */
export default function PulseLedIcon({ className = '', fill = 'none' }: {
  className?: string;
  /** The disc behind the line. Defaults to clear. */
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
      <circle cx="12" cy="12" fill={fill} r="9.4" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M4.8 12h2.9l1.5-3.4 2.3 6.6 1.7-3.9 1.1 1.9h2.9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}
