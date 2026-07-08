import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from './ui/sheet';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import MultiSelect, { type MultiSelectOptionGroup } from './MultiSelect';
import {
  AVAILABILITY,
  BODY_TYPES,
  CROWDS,
  HOBBIES,
  HOSTING,
  IDENTITIES,
  KINK_GROUPS,
  LOOKING_FOR,
  POSITIONS,
  PRESENTATIONS,
  ROLES,
  SEXUALITY,
  SUBSTANCE_BOUNDARIES,
  VIBE_GROUPS,
} from '../lib/profileOptions';
import { DEFAULT_FILTER_STATE, type FilterState } from './MapFiltersSurface';
import type { ProfileVisibilitySet } from '../lib/profileApi';

export interface VisibilityControlState extends FilterState {
  activeCrowdModes: string[];
  restrictAge: boolean;
  restrictDistance: boolean;
}

export const DEFAULT_VISIBILITY_STATE: VisibilityControlState = {
  ...DEFAULT_FILTER_STATE,
  activeCrowdModes: [],
  restrictAge: false,
  restrictDistance: false,
};

interface MapVisibilitySurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: VisibilityControlState;
  availableCrowdModes?: string[];
  saving?: boolean;
  savingSet?: boolean;
  error?: string | null;
  hasCruushPlus?: boolean;
  savedSetName?: string;
  savedSets?: ProfileVisibilitySet[];
  onChange: (value: VisibilityControlState) => void;
  onClear: () => void;
  onApply: () => void;
  onApplySet?: (setId: string) => void;
  onDeleteSet?: (setId: string) => void;
  onRenameSet?: (setId: string, name: string) => void;
  onSaveSet?: () => void;
  onSavedSetNameChange?: (name: string) => void;
  onUpgradeSavedSets?: () => void;
}

type VisibilityListKey = Exclude<keyof VisibilityControlState, 'ageRange' | 'distance' | 'activeCrowdModes' | 'restrictAge' | 'restrictDistance'>;

function updateList(value: VisibilityControlState, key: VisibilityListKey, items: string[]): VisibilityControlState {
  return {
    ...value,
    [key]: items,
  };
}

function FieldGroup({
  label,
  options,
  optionGroups,
  stateKey,
  value,
  onChange,
}: {
  label: string;
  options?: string[];
  optionGroups?: MultiSelectOptionGroup[];
  stateKey: VisibilityListKey;
  value: VisibilityControlState;
  onChange: (value: VisibilityControlState) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <MultiSelect
        ariaLabel={label}
        options={options}
        optionGroups={optionGroups}
        value={value[stateKey]}
        onChange={(items) => onChange(updateList(value, stateKey, items))}
      />
    </div>
  );
}

function toggleCrowdMode(value: VisibilityControlState, crowdMode: string): VisibilityControlState {
  const isActive = value.activeCrowdModes.includes(crowdMode);

  return {
    ...value,
    activeCrowdModes: isActive
      ? value.activeCrowdModes.filter((item) => item !== crowdMode)
      : [...value.activeCrowdModes, crowdMode],
  };
}

export default function MapVisibilitySurface({
  open,
  onOpenChange,
  value,
  availableCrowdModes = CROWDS,
  saving = false,
  savingSet = false,
  error = null,
  hasCruushPlus = false,
  savedSetName = '',
  savedSets = [],
  onChange,
  onClear,
  onApply,
  onApplySet,
  onDeleteSet,
  onRenameSet,
  onSaveSet,
  onSavedSetNameChange,
  onUpgradeSavedSets,
}: MapVisibilitySurfaceProps) {
  const visibleCrowdModes = availableCrowdModes.length > 0 ? availableCrowdModes : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-background/95 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-white/10 px-5 py-4">
          <SheetTitle>Visibility</SheetTitle>
          <SheetDescription>Control who can see you across the app.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-5 py-4">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Saved sets</Label>
              {!hasCruushPlus ? (
                <Button type="button" size="sm" onClick={onUpgradeSavedSets}>
                  Upgrade for saved sets
                </Button>
              ) : null}
            </div>

            {!hasCruushPlus ? (
              <p className="text-sm text-muted-foreground">cruush+ saves named visibility sets.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    aria-label="Saved set name"
                    value={savedSetName}
                    onChange={(event) => onSavedSetNameChange?.(event.target.value)}
                    placeholder="Night out"
                    className="bg-input-background"
                  />
                  <Button type="button" onClick={onSaveSet} disabled={savingSet || !savedSetName.trim()}>
                    Save set
                  </Button>
                </div>

                {savedSets.length > 0 ? (
                  <div className="space-y-2">
                    {savedSets.map((set) => (
                      <div key={set.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-w-0 flex-1 justify-start truncate"
                          onClick={() => onApplySet?.(set.id)}
                          disabled={saving || savingSet}
                          aria-label={`Apply ${set.name}`}
                        >
                          {set.name}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onRenameSet?.(set.id, set.name)}
                          disabled={savingSet}
                          aria-label={`Rename ${set.name}`}
                        >
                          Rename
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onDeleteSet?.(set.id)}
                          disabled={savingSet}
                          aria-label={`Delete ${set.name}`}
                        >
                          Delete
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No saved sets yet.</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Crowd Mode</Label>
            {visibleCrowdModes.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {visibleCrowdModes.map((crowdMode) => {
                  const selected = value.activeCrowdModes.includes(crowdMode);

                  return (
                    <button
                      key={crowdMode}
                      type="button"
                      aria-pressed={selected}
                      className={[
                        'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold shadow-[0_16px_38px_rgba(0,0,0,0.22)] transition-colors',
                        selected
                          ? 'border-white/15 text-white'
                          : 'border-white/10 bg-white/[0.035] text-white/76 hover:bg-white/[0.065]',
                      ].join(' ')}
                      onClick={() => onChange(toggleCrowdMode(value, crowdMode))}
                      style={selected ? { background: 'var(--cruush-gradient)' } : undefined}
                    >
                      <span>{crowdMode}</span>
                      <span className="rounded-full bg-black/24 px-2.5 py-1 text-[11px]">
                        {selected ? 'On' : 'Off'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {visibleCrowdModes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Crowd modes unlock after your profile has crowd membership.</p>
            ) : null}
          </div>

          <Tabs defaultValue="basics" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-4">
              <TabsTrigger value="basics">Basics</TabsTrigger>
              <TabsTrigger value="looking">Looking</TabsTrigger>
              <TabsTrigger value="intimacy">Intimacy</TabsTrigger>
              <TabsTrigger value="lifestyle">Lifestyle</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="mt-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="visibility-distance">Distance</Label>
                  <Switch
                    id="visibility-distance"
                    checked={value.restrictDistance}
                    onCheckedChange={(restrictDistance) => onChange({ ...value, restrictDistance })}
                  />
                </div>
                <Slider
                  value={[value.distance]}
                  min={1}
                  max={100}
                  step={1}
                  disabled={!value.restrictDistance}
                  onValueChange={([distance]) => onChange({ ...value, distance })}
                />
                <p className="text-sm text-muted-foreground">
                  {value.restrictDistance ? `Up to ${value.distance} miles` : 'Any distance'}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="visibility-age">Age Range</Label>
                  <Switch
                    id="visibility-age"
                    checked={value.restrictAge}
                    onCheckedChange={(restrictAge) => onChange({ ...value, restrictAge })}
                  />
                </div>
                <Slider
                  value={value.ageRange}
                  min={18}
                  max={99}
                  step={1}
                  disabled={!value.restrictAge}
                  onValueChange={([minAge, maxAge]) => {
                    onChange({ ...value, ageRange: [minAge, maxAge] });
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  {value.restrictAge ? `${value.ageRange[0]} - ${value.ageRange[1]}` : 'Any age'}
                </p>
              </div>

              <FieldGroup label="Gender Identities" options={IDENTITIES} stateKey="identities" value={value} onChange={onChange} />
              <FieldGroup label="Presentation" options={PRESENTATIONS} stateKey="presentations" value={value} onChange={onChange} />
              <FieldGroup label="Crowds" options={CROWDS} stateKey="crowds" value={value} onChange={onChange} />
              <FieldGroup label="Body Type" options={BODY_TYPES} stateKey="bodyTypes" value={value} onChange={onChange} />
              <FieldGroup label="Sexuality" options={SEXUALITY} stateKey="sexuality" value={value} onChange={onChange} />
            </TabsContent>

            <TabsContent value="looking" className="mt-6 space-y-6">
              <FieldGroup label="Looking For" options={LOOKING_FOR} stateKey="lookingFor" value={value} onChange={onChange} />
              <FieldGroup label="Timing" options={AVAILABILITY} stateKey="timing" value={value} onChange={onChange} />
              <FieldGroup label="Hosting/Travel" options={HOSTING} stateKey="hosting" value={value} onChange={onChange} />
              <FieldGroup label="Vibes" optionGroups={VIBE_GROUPS} stateKey="vibes" value={value} onChange={onChange} />
              <FieldGroup label="Hobbies" options={HOBBIES} stateKey="hobbies" value={value} onChange={onChange} />
            </TabsContent>

            <TabsContent value="intimacy" className="mt-6 space-y-6">
              <FieldGroup label="Position" options={POSITIONS} stateKey="positions" value={value} onChange={onChange} />
              <FieldGroup label="Role" options={ROLES} stateKey="roles" value={value} onChange={onChange} />
              <FieldGroup label="Kinks & Fetishes" optionGroups={KINK_GROUPS} stateKey="kinks" value={value} onChange={onChange} />
            </TabsContent>

            <TabsContent value="lifestyle" className="mt-6 space-y-6">
              <FieldGroup
                label="Substance Boundaries"
                options={SUBSTANCE_BOUNDARIES}
                stateKey="substanceBoundaries"
                value={value}
                onChange={onChange}
              />
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter className="sticky bottom-0 border-t border-white/10 bg-background/95 px-5 py-4 backdrop-blur">
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClear} disabled={saving}>
              Clear
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={onApply}
              disabled={saving}
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
