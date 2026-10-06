import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { CODE_OF_CONDUCT_ITEMS } from '../lib/codeOfConduct';

type CodeOfConductProps = {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  readOnly?: boolean;
  signedAt?: string | null;
};

export default function CodeOfConduct({ checked, onCheckedChange, readOnly = false, signedAt }: CodeOfConductProps) {
  const [checkedItems, setCheckedItems] = useState(() => CODE_OF_CONDUCT_ITEMS.map(() => checked));
  const [agreementChecked, setAgreementChecked] = useState(checked);

  const setItemChecked = (index: number, itemChecked: boolean) => {
    const nextItems = checkedItems.map((value, itemIndex) => itemIndex === index ? itemChecked : value);
    setCheckedItems(nextItems);
    onCheckedChange?.(agreementChecked && nextItems.every(Boolean));
  };

  const setAgreement = (agreement: boolean) => {
    setAgreementChecked(agreement);
    onCheckedChange?.(agreement && checkedItems.every(Boolean));
  };

  return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">
                    <ShieldCheck className="h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">This agreement is required before entering cruush.</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/60 p-4">
                    <ul className="space-y-3 text-sm leading-6 text-white/72">
                      {CODE_OF_CONDUCT_ITEMS.map((item, index) => (
                        <li key={item}>
                          <label className={`flex ${readOnly ? 'cursor-default' : 'cursor-pointer'} items-start gap-3`}>
                            <input
                              type="checkbox"
                              checked={checkedItems[index]}
                              disabled={readOnly}
                              onChange={(event) => setItemChecked(index, event.target.checked)}
                              className="mt-0.5 h-6 w-6 shrink-0 rounded border-white/25 bg-input-background accent-primary"
                            />
                            <span>{item}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-sm font-bold leading-5 text-destructive">
                    By agreeing, you acknowledge that violating any Code of Conduct rule may result in a ban, suspension, or restrictions on app features, without warning or appeal.
                  </p>
                  <label className={`flex ${readOnly ? 'cursor-default' : 'cursor-pointer'} items-start gap-3 rounded-lg border border-white/10 bg-black/55 p-4 text-sm leading-6 text-white/80`}>
                    <input
                      type="checkbox"
                      checked={agreementChecked}
                      disabled={readOnly}
                      onChange={(event) => setAgreement(event.target.checked)}
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
