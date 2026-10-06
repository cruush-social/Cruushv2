import { useState } from 'react';
import { Hash, X } from 'lucide-react';

export function normalizeTag(value: string) {
  const normalized = value.normalize('NFKC').trim().replace(/^#+/, '').toLowerCase();
  return /^[a-z0-9_]{1,24}$/.test(normalized) ? normalized : '';
}

type TagInputProps = {
  ariaLabel: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  maxTags: number;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  testId?: string;
  validate?: (tag: string) => string | null;
  onError?: (message: string | null) => void;
};

export default function TagInput({
  ariaLabel,
  tags,
  onChange,
  maxTags,
  disabled = false,
  id,
  placeholder = '#tag',
  testId,
  validate,
  onError,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const normalizedTags = tags.map(normalizeTag).filter(Boolean);
  const atLimit = normalizedTags.length >= maxTags;

  const addTag = () => {
    const tag = normalizeTag(draft);
    if (!tag) {
      onError?.('Use letters, numbers, or underscores after #.');
      return;
    }
    const validationError = validate?.(tag) ?? null;
    if (validationError) {
      onError?.(validationError);
      return;
    }
    if (normalizedTags.includes(tag)) {
      setDraft('');
      onError?.(null);
      return;
    }
    if (atLimit) {
      onError?.(`You can add up to ${maxTags} tags.`);
      return;
    }

    onChange([...normalizedTags, tag]);
    setDraft('');
    onError?.(null);
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex items-center gap-2 rounded-md border border-white/10 bg-input-background px-3">
        <Hash aria-hidden="true" className="h-4 w-4 shrink-0 text-white/55" />
        <input
          aria-label={ariaLabel}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45"
          disabled={disabled || atLimit}
          id={id}
          maxLength={25}
          onChange={(event) => {
            setDraft(event.target.value);
            onError?.(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addTag();
          }}
          placeholder={placeholder}
          value={draft}
        />
        <button
          className="text-sm font-semibold text-white/72 disabled:opacity-35"
          disabled={disabled || atLimit || !normalizeTag(draft)}
          onClick={addTag}
          type="button"
        >
          Add
        </button>
      </div>
      {normalizedTags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {normalizedTags.map((tag) => (
            <button
              aria-label={`Remove #${tag}`}
              className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-black/55 px-2.5 py-1 text-xs text-white/72"
              key={tag}
              onClick={() => onChange(normalizedTags.filter((currentTag) => currentTag !== tag))}
              type="button"
            >
              #{tag}
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
