/**
 * The Pulse mark: a lit core with two rings coming off it. Drawn rather than
 * borrowed so it reads as the ping green at any size, on a clear background.
 */
export default function PulseLedIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" fill="currentColor" r="3.1" />
      <path
        d="M6.9 6.9a7.2 7.2 0 0 0 0 10.2M17.1 6.9a7.2 7.2 0 0 1 0 10.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity="0.85"
        strokeWidth="1.9"
      />
      <path
        d="M3.6 3.6a11.9 11.9 0 0 0 0 16.8M20.4 3.6a11.9 11.9 0 0 1 0 16.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity="0.45"
        strokeWidth="1.6"
      />
    </svg>
  );
}
