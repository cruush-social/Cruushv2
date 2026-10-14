/**
 * A signal is one short line. Thirty five characters is what the field holds on
 * a phone without wrapping, and every surface that writes or renders a signal
 * reads this number rather than carrying its own.
 */
export const SIGNAL_MAX_LENGTH = 35;

export function truncateSignal(value: string | null | undefined) {
  return (value ?? '').replace(/[\t\r\n]+/g, ' ').slice(0, SIGNAL_MAX_LENGTH);
}
