interface SingleSelectProps {
  options: string[];
  value?: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}

export default function SingleSelect({ options, value = '', onChange, ariaLabel, placeholder = 'Select an option...' }: SingleSelectProps) {
  return <select aria-label={ariaLabel} className="h-10 w-full appearance-none rounded-md border border-input bg-input-background px-3 text-left text-sm text-foreground transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}
