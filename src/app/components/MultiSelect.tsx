import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { X } from 'lucide-react';

export type MultiSelectOptionGroup = {
  label: string;
  options: string[];
};

interface MultiSelectProps {
  options?: string[];
  optionGroups?: MultiSelectOptionGroup[];
  value?: string[];
  onChange?: (value: string[]) => void;
  selectionMode?: 'multiple' | 'single';
  ariaLabel?: string;
  placeholder?: string;
}

export default function MultiSelect({
  options = [],
  optionGroups,
  value = [],
  onChange,
  selectionMode = 'multiple',
  ariaLabel,
  placeholder = 'Select options...',
}: MultiSelectProps) {
  const [selected, setSelected] = useState<string[]>(value);
  const [isOpen, setIsOpen] = useState(false);
  const groups = optionGroups ?? [{ label: '', options }];

  useEffect(() => {
    setSelected(value);
  }, [value]);

  const toggleOption = (option: string) => {
    const newSelected = selectionMode === 'single'
      ? selected.includes(option) ? [] : [option]
      : selected.includes(option)
        ? selected.filter((s) => s !== option)
        : [...selected, option];
    setSelected(newSelected);
    onChange?.(newSelected);
    if (selectionMode === 'single') {
      setIsOpen(false);
    }
  };

  const removeOption = (option: string) => {
    const newSelected = selected.filter((s) => s !== option);
    setSelected(newSelected);
    onChange?.(newSelected);
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <Badge key={item} variant="secondary" className="gap-1">
              {item}
              <button type="button" onClick={() => removeOption(item)} className="ml-1">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          className="w-full h-10 px-3 text-left rounded-md bg-input-background border border-input hover:border-primary transition-colors"
        >
          {selected.length > 0 ? `${selected.length} selected` : placeholder}
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div
              role="listbox"
              aria-label={ariaLabel}
              className="absolute top-full left-0 right-0 mt-2 max-h-72 overflow-y-auto bg-popover border border-border rounded-md shadow-lg z-20"
            >
              {groups.map((group) => (
                <div key={group.label || 'options'} role={group.label ? 'group' : undefined} aria-label={group.label || undefined}>
                  {group.label ? (
                    <div className="sticky top-0 bg-popover px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {group.label}
                    </div>
                  ) : null}
                  {group.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={selected.includes(option)}
                      onClick={() => toggleOption(option)}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors ${
                        selected.includes(option) ? 'bg-accent text-accent-foreground' : ''
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
