import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { X } from 'lucide-react';

interface MultiSelectProps {
  options: string[];
  value?: string[];
  onChange?: (value: string[]) => void;
}

export default function MultiSelect({ options, value = [], onChange }: MultiSelectProps) {
  const [selected, setSelected] = useState<string[]>(value);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setSelected(value);
  }, [value]);

  const toggleOption = (option: string) => {
    const newSelected = selected.includes(option)
      ? selected.filter((s) => s !== option)
      : [...selected, option];
    setSelected(newSelected);
    onChange?.(newSelected);
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
              <button onClick={() => removeOption(item)} className="ml-1">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full h-10 px-3 text-left rounded-md bg-input-background border border-input hover:border-primary transition-colors"
        >
          {selected.length > 0 ? `${selected.length} selected` : 'Select options...'}
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto bg-popover border border-border rounded-md shadow-lg z-20">
              {options.map((option) => (
                <button
                  key={option}
                  onClick={() => toggleOption(option)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors ${
                    selected.includes(option) ? 'bg-accent text-accent-foreground' : ''
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
