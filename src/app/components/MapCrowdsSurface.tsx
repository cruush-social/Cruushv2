import { Button } from './ui/button';
import { Label } from './ui/label';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from './ui/sheet';

interface MapCrowdsSurfaceProps {
  availableCrowds: string[];
  error?: string | null;
  open: boolean;
  saving?: boolean;
  value: string[];
  onApply: () => void;
  onChange: (value: string[]) => void;
  onClear: () => void;
  onEditCrowds: () => void;
  onOpenChange: (open: boolean) => void;
}

export default function MapCrowdsSurface({
  availableCrowds,
  error = null,
  open,
  saving = false,
  value,
  onApply,
  onChange,
  onClear,
  onEditCrowds,
  onOpenChange,
}: MapCrowdsSurfaceProps) {
  const toggleCrowd = (crowd: string) => {
    onChange(value.includes(crowd) ? [] : [crowd]);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeSide="left"
        side="right"
        overlayClassName="z-[1090]"
        className="z-[1100] flex h-full max-h-[100dvh] w-full flex-col gap-0 overflow-hidden border-white/10 bg-background/95 p-0 sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b border-white/10 py-4 pl-14 pr-5">
          <SheetTitle>Crowds</SheetTitle>
        </SheetHeader>

        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-5 py-4 overscroll-contain">
          {error ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-2" data-testid="crowd-mode-tutorial-target" data-tutorial-target="crowds">
            <Label>Crowd Mode</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {availableCrowds.map((crowd) => {
                const selected = value.includes(crowd);
                return (
                  <button
                    key={crowd}
                    type="button"
                    aria-pressed={selected}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${
                      selected ? 'border-white/15 text-white' : 'border-white/10 bg-white/[0.035] text-white/75'
                    }`}
                    onClick={() => toggleCrowd(crowd)}
                    style={selected ? { background: 'var(--cruush-gradient)' } : undefined}
                  >
                    <span>{crowd}</span>
                    <span className="rounded-full bg-black/25 px-2.5 py-1 text-[11px]">{selected ? 'On' : 'Off'}</span>
                  </button>
                );
              })}
            </div>
            {availableCrowds.length === 0 ? (
              <Button type="button" variant="outline" className="mt-2 w-full" onClick={onEditCrowds}>
                Edit Crowds
              </Button>
            ) : null}
          </div>
        </div>

        <SheetFooter className="shrink-0 border-t border-white/10 bg-background/95 px-5 py-4 backdrop-blur">
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" disabled={saving} onClick={onClear}>
              Clear
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={saving}
              onClick={onApply}
              style={{ background: 'var(--cruush-gradient)' }}
            >
              {saving ? 'Saving...' : 'Apply'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
