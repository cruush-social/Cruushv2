/**
 * A signal is one short line. Thirty five characters is what the field holds on
 * a phone without wrapping, and every surface that writes or renders a signal
 * reads this number rather than carrying its own.
 */
export const SIGNAL_MAX_LENGTH = 35;
