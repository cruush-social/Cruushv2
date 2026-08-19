import { Button } from './ui/button';
import { Label } from './ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from './ui/sheet';
import { Slider } from './ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import MultiSelect, { type MultiSelectOptionGroup } from './MultiSelect';
import CruushPlusGateNotice from './CruushPlusGateNotice';
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

export interface FilterState {
  ageRange: [number, number];
  distance: number;
  identities: string[];
  presentations: string[];
  lookingFor: string[];
  timing: string[];
  hosting: string[];
  vibes: string[];
  crowds: string[];
  hobbies: string[];
  positions: string[];
  roles: string[];
  kinks: string[];
  bodyTypes: string[];
  sexuality: string[];
  substanceBoundaries: string[];
}

export const DEFAULT_FILTER_STATE: FilterState = {
  ageRange: [18, 99],
  distance: 100,
  identities: [],
  presentations: [],
  lookingFor: [],
  timing: [],
  hosting: [],
  vibes: [],
  crowds: [],
  hobbies: [],
  positions: [],
  roles: [],
  kinks: [],
  bodyTypes: [],
  sexuality: [],
  substanceBoundaries: [],
};

interface MapFiltersSurfaceProps {
  mutualCruushesOnly?: boolean;
  mode?: 'sheet';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  value: FilterState;
  onChange: (value: FilterState) => void;
  onClear: () => void;
  onApply: () => void;
  onMutualCruushesOnlyChange?: (enabled: boolean) => void;
  hasCruushPlus?: boolean;
  onUpgrade?: () => void;
}

type MultiSelectKey = Exclude<keyof FilterState, 'ageRange' | 'distance'>;

function updateList(value: FilterState, key: MultiSelectKey, items: string[]): FilterState {
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
  stateKey: MultiSelectKey;
  value: FilterState;
  onChange: (value: FilterState) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <MultiSelect
        ariaLabel={label}
        menuPortal
        options={options}
        optionGroups={optionGroups}
        value={value[stateKey]}
        onChange={(items) => onChange(updateList(value, stateKey, items))}
      />
    </div>
  );
}

export default function MapFiltersSurface({
  mutualCruushesOnly = false,
  open,
  onOpenChange,
  title = 'Seeking',
  description = 'Refine nearby people by distance, profile details, and vibe.',
  value,
  onChange,
  onClear,
  onApply,
  onMutualCruushesOnlyChange,
  hasCruushPlus = false,
  onUpgrade,
}: MapFiltersSurfaceProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-full max-h-[100dvh] flex-col gap-0 overflow-hidden border-white/10 bg-background/95 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b border-white/10 px-5 py-4">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 overscroll-contain">
          {!hasCruushPlus && onUpgrade ? (
            <div className="mb-5">
              <CruushPlusGateNotice
                description="Basic includes up to 3 seeking filter categories."
                onUpgrade={onUpgrade}
              />
            </div>
          ) : null}
          {onMutualCruushesOnlyChange ? (
            <button
              type="button"
              aria-pressed={mutualCruushesOnly}
              className={[
                'mb-5 flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left shadow-[0_16px_38px_rgba(0,0,0,0.28)] transition-colors',
                mutualCruushesOnly
                  ? 'border-white/15 text-white'
                  : 'border-white/10 bg-white/[0.035] text-white/76 hover:bg-white/[0.065]',
              ].join(' ')}
              onClick={() => onMutualCruushesOnlyChange(!mutualCruushesOnly)}
              style={mutualCruushesOnly ? { background: 'var(--cruush-gradient)' } : undefined}
            >
              <span>
                <span className="block text-sm font-semibold">Mutual cruushes</span>
                <span className="mt-0.5 block text-xs text-white/68">Show mutual cruushes at the top of the map.</span>
              </span>
              <span className="shrink-0 rounded-full bg-black/24 px-3 py-1 text-xs font-semibold">
                {mutualCruushesOnly ? 'On' : 'Off'}
              </span>
            </button>
          ) : null}

          <Tabs defaultValue="basics" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-4">
              <TabsTrigger value="basics">Basics</TabsTrigger>
              <TabsTrigger value="looking">Looking</TabsTrigger>
              <TabsTrigger value="intimacy">Intimacy</TabsTrigger>
              <TabsTrigger value="lifestyle">Lifestyle</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="mt-6 space-y-6">
              <div className="space-y-4">
                <Label>Distance</Label>
                <Slider
                  value={[value.distance]}
                  min={1}
                  max={100}
                  step={1}
                  onValueChange={([distance]) => onChange({ ...value, distance })}
                />
                <p className="text-sm text-muted-foreground">Up to {value.distance} miles</p>
              </div>

              <div className="space-y-4">
                <Label>Age Range</Label>
                <Slider
                  value={value.ageRange}
                  min={18}
                  max={99}
                  step={1}
                  onValueChange={([minAge, maxAge]) => {
                    onChange({ ...value, ageRange: [minAge, maxAge] });
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  {value.ageRange[0]} - {value.ageRange[1]}
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

        <SheetFooter className="shrink-0 border-t border-white/10 bg-background/95 px-5 py-4 backdrop-blur">
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClear}>
              Clear
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={onApply}
              style={{ background: 'var(--cruush-gradient)' }}
            >
              Apply
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
