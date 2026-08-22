/**
 * The Pulse mark: the same ekg line the heart pin draws, in the ping green.
 * Drawn rather than borrowed so it holds the green at any size on a clear
 * background.
 */

/** The heart pin's own trace, so the control and the pin read as one mark. */
const PULSE_EKG_PATH = 'M2 26h6q1.2 -2 2.4 0h1.6l1 2.6 1.4 -17 1.4 20 1 -5.6q2.6 -5 5.2 0h7';

export default function PulseLedIcon({ className = '', fill = 'none', ring = true }: {
  className?: string;
  /** The disc behind the line. Defaults to clear. */
  fill?: string;
  /** Drop the ring where the control already draws a circle of its own. */
  ring?: boolean;
}) {
  if (!ring) {
    // Cropped to the line itself so it fills whatever circle it is placed in.
    return (
      <svg
        aria-hidden="true"
        className={className}
        fill="none"
        viewBox="1.4 9.6 28.2 23"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d={PULSE_EKG_PATH}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 34 34"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="17" cy="17" fill={fill} r="15.4" stroke="currentColor" strokeWidth="1.7" />
      <g transform="translate(1.5 -4.4) scale(0.94)">
        <path
          d={PULSE_EKG_PATH}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </g>
    </svg>
  );
}
