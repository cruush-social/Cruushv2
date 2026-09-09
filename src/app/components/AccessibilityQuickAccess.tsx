import { useEffect, useState } from 'react';
import { Accessibility, Contrast, Palette, Type } from 'lucide-react';
import {
  addAccessibilityPreferencesChangedListener,
  COLOR_VISION_MODES,
  getAccessibilityPreferences,
  saveAccessibilityPreferences,
  type AccessibilityPreferences,
  type ColorVisionMode,
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

const ACCESSIBILITY_OPTIONS = [
  { icon: Accessibility, key: 'reduceMotion', label: 'Reduce motion' },
  { icon: Type, key: 'largerText', label: 'Larger text' },
  { icon: Contrast, key: 'highContrast', label: 'Increase contrast' },
] as const;

const COLOR_VISION_LABELS: Record<ColorVisionMode, string> = {
  off: 'Off',
  deuteranomaly: 'Deuteranomaly',
  deuteranopia: 'Deuteranopia',
  protanomaly: 'Protanomaly',
  protanopia: 'Protanopia',
  tritanomaly: 'Tritanomaly',
  tritanopia: 'Tritanopia',
  monochromacy: 'Monochromacy',
};

type AccessibilityQuickAccessProps = {
  authShellScrolled?: boolean;
};

export default function AccessibilityQuickAccess({
  authShellScrolled = false,
}: AccessibilityQuickAccessProps = {}) {
  const [preferences, setPreferences] = useState(getAccessibilityPreferences);

  useEffect(() => addAccessibilityPreferencesChangedListener(setPreferences), []);

  const updatePreference = (
    key: Exclude<keyof AccessibilityPreferences, 'colorVisionMode'>,
    checked: boolean,
  ) => {
    setPreferences((currentPreferences) => {
      const nextPreferences = {
        ...currentPreferences,
        [key]: checked,
      };

      saveAccessibilityPreferences(nextPreferences);
      return nextPreferences;
    });
  };

  const updateColorVisionMode = (colorVisionMode: ColorVisionMode) => {
    setPreferences((currentPreferences) => {
      const nextPreferences = {
        ...currentPreferences,
        colorBlindMode: colorVisionMode !== 'off',
        colorVisionMode,
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

      <DialogContent className="content-start w-[calc(100%-2rem)] max-w-sm border-white/12 bg-background sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Accessibility</DialogTitle>
          <DialogDescription className="sr-only">Accessibility options</DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Accordion type="single" collapsible className="border-b border-border">
            <AccordionItem value="color-vision" className="border-0">
              <AccordionTrigger className="min-h-14 px-4 py-3 hover:no-underline">
                <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Palette aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">Color vision</span>
                  <span className="truncate text-sm text-muted-foreground">{COLOR_VISION_LABELS[preferences.colorVisionMode]}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-0">
                <div aria-label="Color vision" className="grid grid-cols-2 gap-2" role="radiogroup">
                  {COLOR_VISION_MODES.map((value) => (
                    <button
                      aria-checked={preferences.colorVisionMode === value}
                      className={`min-h-10 rounded-full border px-3 py-2 text-sm ${preferences.colorVisionMode === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground'}`}
                      key={value}
                      onClick={() => updateColorVisionMode(value)}
                      role="radio"
                      type="button"
                    >
                      {COLOR_VISION_LABELS[value]}
                    </button>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
