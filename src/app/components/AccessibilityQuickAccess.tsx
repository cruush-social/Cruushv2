import { useEffect, useState } from 'react';
import { Accessibility, Contrast, Palette, Type } from 'lucide-react';
import {
  addAccessibilityPreferencesChangedListener,
  getAccessibilityPreferences,
  saveAccessibilityPreferences,
  type AccessibilityPreferences,
} from '../lib/accessibilityPreferences';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

const ACCESSIBILITY_OPTIONS = [
  { icon: Palette, key: 'colorBlindMode', label: 'Color-blind mode' },
  { icon: Accessibility, key: 'reduceMotion', label: 'Reduce motion' },
  { icon: Type, key: 'largerText', label: 'Larger text' },
  { icon: Contrast, key: 'highContrast', label: 'Increase contrast' },
] as const;

type AccessibilityQuickAccessProps = {
  authShellScrolled?: boolean;
};

export default function AccessibilityQuickAccess({
  authShellScrolled = false,
}: AccessibilityQuickAccessProps = {}) {
  const [preferences, setPreferences] = useState(getAccessibilityPreferences);

  useEffect(() => addAccessibilityPreferencesChangedListener(setPreferences), []);

  const updatePreference = (key: keyof AccessibilityPreferences, checked: boolean) => {
    setPreferences((currentPreferences) => {
      const nextPreferences = {
        ...currentPreferences,
        [key]: checked,
      };

      saveAccessibilityPreferences(nextPreferences);
      return nextPreferences;
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          aria-label="Accessibility options"
          aria-hidden={authShellScrolled || undefined}
          className={`fixed right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[70] inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-white/14 bg-background/82 px-3 text-foreground shadow-[0_14px_38px_rgba(0,0,0,0.4)] backdrop-blur-md transition-[background-color,opacity,transform] duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${authShellScrolled ? 'pointer-events-none -translate-y-24 opacity-0' : 'translate-y-0 opacity-100'}`}
          data-testid="accessibility-quick-access"
          tabIndex={authShellScrolled ? -1 : undefined}
          title="Accessibility options"
          type="button"
        >
          <Accessibility aria-hidden="true" className="h-5 w-5" />
          <span className="hidden text-sm sm:inline">Accessibility</span>
        </button>
      </DialogTrigger>

      <DialogContent className="w-[calc(100%-2rem)] max-w-sm border-white/12 bg-background sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Accessibility</DialogTitle>
          <DialogDescription className="sr-only">Accessibility options</DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {ACCESSIBILITY_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            const inputId = `quick-accessibility-${option.key}`;

            return (
              <div
                className={`flex min-h-14 items-center gap-3 p-4 ${index < ACCESSIBILITY_OPTIONS.length - 1 ? 'border-b border-border' : ''}`}
                key={option.key}
              >
                <Icon aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
                <Label className="flex-1" htmlFor={inputId}>{option.label}</Label>
                <Switch
                  checked={preferences[option.key] === true}
                  id={inputId}
                  onCheckedChange={(checked) => updatePreference(option.key, checked)}
                />
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
