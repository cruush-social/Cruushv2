import { Button } from './ui/button';
import { Label } from './ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from './ui/sheet';
import { Slider } from './ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import MultiSelect from './MultiSelect';
import {
  AVAILABILITY,
  BODY_TYPES,
  CONDOMS,
  HOBBIES,
  HOSTING,
  IDENTITIES,
  KINKS,
  LOOKING_FOR,
  POSITIONS,
  PRESENTATIONS,
  SEXUALITY,
  SUBSTANCE_BOUNDARIES,
  VIBES,
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
  hobbies: string[];
  positions: string[];
  kinks: string[];
  bodyTypes: string[];
  sexuality: string[];
  condoms: string[];
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
  hobbies: [],
  positions: [],
  kinks: [],
  bodyTypes: [],
  sexuality: [],
  condoms: [],
  substanceBoundaries: [],
};

interface MapFiltersSurfaceProps {
  mode?: 'sheet';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FilterState;
  onChange: (value: FilterState) => void;
  onClear: () => void;
  onApply: () => void;
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
  stateKey,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  stateKey: MultiSelectKey;
  value: FilterState;
  onChange: (value: FilterState) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <MultiSelect
        options={options}
        value={value[stateKey]}
        onChange={(items) => onChange(updateList(value, stateKey, items))}
      />
    </div>
  );
}

export default function MapFiltersSurface({
  open,
  onOpenChange,
  value,
  onChange,
  onClear,
  onApply,
}: MapFiltersSurfaceProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-background/95 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-white/10 px-5 py-4">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Refine nearby people by distance, profile details, and vibe.</SheetDescription>
        </SheetHeader>

        <div className="px-5 py-4">
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
              <FieldGroup label="Body Type" options={BODY_TYPES} stateKey="bodyTypes" value={value} onChange={onChange} />
              <FieldGroup label="Sexuality" options={SEXUALITY} stateKey="sexuality" value={value} onChange={onChange} />
            </TabsContent>

            <TabsContent value="looking" className="mt-6 space-y-6">
              <FieldGroup label="Looking For" options={LOOKING_FOR} stateKey="lookingFor" value={value} onChange={onChange} />
              <FieldGroup label="Timing" options={AVAILABILITY} stateKey="timing" value={value} onChange={onChange} />
              <FieldGroup label="Hosting/Travel" options={HOSTING} stateKey="hosting" value={value} onChange={onChange} />
              <FieldGroup label="Vibes" options={VIBES} stateKey="vibes" value={value} onChange={onChange} />
              <FieldGroup label="Hobbies" options={HOBBIES} stateKey="hobbies" value={value} onChange={onChange} />
            </TabsContent>

            <TabsContent value="intimacy" className="mt-6 space-y-6">
              <FieldGroup label="Position" options={POSITIONS} stateKey="positions" value={value} onChange={onChange} />
              <FieldGroup label="Kinks" options={KINKS} stateKey="kinks" value={value} onChange={onChange} />
              <FieldGroup label="Protection" options={CONDOMS} stateKey="condoms" value={value} onChange={onChange} />
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
