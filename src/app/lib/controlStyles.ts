/**
 * One appearance for every dropdown a member can open.
 *
 * Gender Identity and Body Type are the reference: they are MultiSelect, whose
 * trigger is a 10-height rounded input surface with the input border and a
 * primary border on hover. Everything else had drifted into its own treatment,
 * five of them across the member surfaces, from a full-round pill on a plain
 * background in notification quiet hours to a black box with a white border in
 * the Spots drawer.
 */
export const DROPDOWN_TRIGGER_CLASS = [
  'h-10 w-full rounded-md border border-input bg-input-background px-3',
  'text-left text-sm text-foreground transition-colors',
  'hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');
