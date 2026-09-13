import { ShieldCheck } from 'lucide-react';
import { CODE_OF_CONDUCT_ITEMS } from '../lib/codeOfConduct';

type CodeOfConductProps = {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  readOnly?: boolean;
  signedAt?: string | null;
};

export default function CodeOfConduct({ checked, onCheckedChange, readOnly = false, signedAt }: CodeOfConductProps) {
  return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">
                    <ShieldCheck className="h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">This agreement is required before entering cruush.</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/60 p-4">
                    <ul className="space-y-3 text-sm leading-6 text-white/72">
                      {CODE_OF_CONDUCT_ITEMS.map((item) => (
                        <li key={item} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xl font-bold leading-6 text-destructive">
                    By agreeing, you acknowledge that violating any Code of Conduct rule may result in a ban, suspension, or restrictions on app features, without warning or appeal.
                  </p>
                  <label className={`flex ${readOnly ? 'cursor-default' : 'cursor-pointer'} items-start gap-3 rounded-lg border border-white/10 bg-black/55 p-4 text-sm leading-6 text-white/80`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readOnly}
                      onChange={(event) => onCheckedChange?.(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-white/25 bg-input-background accent-primary"
                    />
                    <span>I have read and agree to the cruush code of conduct.</span>
                  </label>
                  {readOnly && signedAt ? (
                    <p className="text-sm leading-6 text-white/72">
                      Signed <time dateTime={signedAt}>{new Date(signedAt).toLocaleString()}</time>
                    </p>
                  ) : null}
                </div>
  );
}
