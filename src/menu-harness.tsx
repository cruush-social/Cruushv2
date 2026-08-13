import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MultiSelect from './app/components/MultiSelect';
import MapFiltersSurface, { DEFAULT_FILTER_STATE, type FilterState } from './app/components/MapFiltersSurface';
import { BODY_TYPES, CROWDS } from './app/lib/profileOptions';
import './styles/index.css';

function InlineCase() {
  const [crowds, setCrowds] = useState<string[]>([]);
  const [bodyTypes, setBodyTypes] = useState<string[]>([]);

  // Mirrors ProfileEdit.tsx:1076-1103 (route /profile/edit, embedded === false,
  // so menuPortal is false).
  return (
    <div className="max-w-2xl mx-auto p-6" id="inline-case">
      <div className="space-y-6">
        <div className="space-y-3 rounded-md border border-border bg-card/40 p-4">
          <div className="flex items-center gap-3">
            <span>I am trans</span>
          </div>
          <div className="space-y-2">
            <span>Crowds</span>
            <MultiSelect ariaLabel="Crowds" maxSelections={3} options={CROWDS} value={crowds} onChange={setCrowds} />
          </div>
        </div>

        <div className="space-y-2">
          <span>Body Type</span>
          <MultiSelect ariaLabel="Body Type" options={BODY_TYPES} value={bodyTypes} onChange={setBodyTypes} />
        </div>
      </div>
    </div>
  );
}

function SheetCase() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<FilterState>(DEFAULT_FILTER_STATE);

  return (
    <div className="p-6">
      <button type="button" id="open-seeking" onClick={() => setOpen(true)} className="rounded border px-3 py-2">
        Open Seeking
      </button>
      <MapFiltersSurface
        open={open}
        onOpenChange={setOpen}
        value={value}
        onChange={setValue}
        onClear={() => setValue(DEFAULT_FILTER_STATE)}
        onApply={() => undefined}
      />
    </div>
  );
}

function Harness() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <InlineCase />
      <SheetCase />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
