import { DROPDOWN_TRIGGER_CLASS } from '../lib/controlStyles';
interface SingleSelectProps {
  options: string[];
  value?: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}

export default function SingleSelect({ options, value = '', onChange, ariaLabel, placeholder = 'Select an option...' }: SingleSelectProps) {
  return <select aria-label={ariaLabel} className={`appearance-none ${DROPDOWN_TRIGGER_CLASS}`} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}
