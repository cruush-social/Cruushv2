/**
 * The Pulse mark: a thin ring with an ekg line running through it, both in the
 * ping green. Drawn rather than borrowed so it holds the green at any size on a
 * clear background.
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
      <circle cx="12" cy="12" fill={fill} r="9.6" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.9 12h2.7l1.5-3.3 2.3 6.5 1.7-3.8 1.1 1.9h2.9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}
