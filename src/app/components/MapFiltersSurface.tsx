import { useState } from 'react';
import { Button } from './ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Label } from './ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from './ui/sheet';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import MultiSelect, { type MultiSelectOptionGroup } from './MultiSelect';
import SingleSelect from './SingleSelect';
import CruushPlusGateNotice from './CruushPlusGateNotice';
import { Search } from 'lucide-react';
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
  PREFERRED_SPOTS,
  PRESENTATIONS,
  PROTECTION_BOUNDARIES,
  ROLES,
  SEXUALITY,
  SUBSTANCE_BOUNDARIES,
  VIBE_GROUPS,
  ZODIAC,
} from '../lib/profileOptions';

export interface FilterState {
  searchQuery: string;
  ageRange: [number, number];
  distance: number;
  hasPhoto: boolean;
  mileHighClub: boolean;
  identities: string[];
  presentations: string[];
  lookingFor: string[];
  timing: string[];
  hosting: string[];
  preferredSpots: string[];
  vibes: string[];
  crowds: string[];
  hobbies: string[];
  positions: string[];
  roles: string[];
  kinks: string[];
  bodyTypes: string[];
  sexuality: string[];
  zodiac: string[];
  substanceBoundaries: string[];
  protectionBoundaries: string[];
}

export const DEFAULT_FILTER_STATE: FilterState = {
  searchQuery: '',
  ageRange: [18, 99],
  distance: 100,
  hasPhoto: false,
  mileHighClub: false,
  identities: [],
  presentations: [],
  lookingFor: [],
  timing: [],
  hosting: [],
  preferredSpots: [],
  vibes: [],
  crowds: [],
  hobbies: [],
  positions: [],
  roles: [],
  kinks: [],
  bodyTypes: [],
  sexuality: [],
  zodiac: [],
  substanceBoundaries: [],
  protectionBoundaries: [],
};

interface MapFiltersSurfaceProps {
  mutualCruushesOnly?: boolean;
  mode?: 'sheet';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string | null;
  value: FilterState;
  onChange: (value: FilterState) => void;
  onClear: () => void;
  onApply: () => void;
  onMutualCruushesOnlyChange?: (enabled: boolean) => void;
  hasCruushPlus?: boolean;
  onUpgrade?: () => void;
  searchPlaceholder?: string;
}

type MultiSelectKey = Exclude<keyof FilterState, 'searchQuery' | 'ageRange' | 'distance' | 'hasPhoto' | 'mileHighClub'>;

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
  selectionMode = 'multiple',
  searchable = false,
}: {
  label: string;
  options?: string[];
  optionGroups?: MultiSelectOptionGroup[];
  stateKey: MultiSelectKey;
  value: FilterState;
  onChange: (value: FilterState) => void;
  selectionMode?: 'multiple' | 'single';
  searchable?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {selectionMode === 'single' ? <SingleSelect ariaLabel={label} options={options ?? []} value={value[stateKey][0]} onChange={(item) => onChange(updateList(value, stateKey, item ? [item] : []))} /> : <MultiSelect
        ariaLabel={label}
        menuPortal
        searchable={searchable}
        options={options}
        optionGroups={optionGroups}
        value={value[stateKey]}
        onChange={(items) => onChange(updateList(value, stateKey, items))}
      />}
    </div>
  );
}

export default function MapFiltersSurface({
  mutualCruushesOnly = false,
  open,
  onOpenChange,
  title = 'Seeking Filter',
  description = null,
  value,
  onChange,
  onClear,
  onApply,
  onMutualCruushesOnlyChange,
  hasCruushPlus = false,
  onUpgrade,
  searchPlaceholder = 'Search names, bios, or #tags',
}: MapFiltersSurfaceProps) {
  const [activeTab, setActiveTab] = useState('basics');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeSide="left"
        side="right"
        overlayClassName="z-[1090]"
        className="z-[1100] w-full flex h-full max-h-[100dvh] flex-col gap-0 overflow-hidden border-white/10 bg-background/95 p-0 sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b border-white/10 py-4 pl-14 pr-[4.5rem]">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>

        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-5 py-4 overscroll-contain">
          {!hasCruushPlus && onUpgrade ? (
            <div className="mb-5">
              <CruushPlusGateNotice
                description="Basic includes up to 3 seeking filter categories."
                onUpgrade={onUpgrade}
              />
            </div>
          ) : null}
          <div className="mb-5 space-y-2">
            <Label htmlFor="seeking-profile-search">Search</Label>
            <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.045] px-3">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-white/55" />
              <input
                id="seeking-profile-search"
                type="search"
                value={value.searchQuery}
                onChange={(event) => onChange({ ...value, searchQuery: event.target.value })}
                placeholder={searchPlaceholder}
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/42"
              />
            </div>
          </div>
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
                <span className="block text-sm font-semibold">Mutuals</span>
                <span className="mt-0.5 block text-xs text-white/68">Show mutuals at the top of the map.</span>
              </span>
              <span className="shrink-0 rounded-full bg-black/24 px-3 py-1 text-xs font-semibold">
                {mutualCruushesOnly ? 'On' : 'Off'}
              </span>
            </button>
          ) : null}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="sticky top-0 z-20 grid h-auto w-full grid-cols-3 rounded-full border border-white/10 bg-background/92 p-1 backdrop-blur-md">
              <TabsTrigger value="basics" className="min-h-11" onClick={() => setActiveTab('basics')}>Basics</TabsTrigger>
              <TabsTrigger value="intimacy" className="min-h-11" onClick={() => setActiveTab('intimacy')}>Intimacy</TabsTrigger>
              <TabsTrigger value="health" className="min-h-11" onClick={() => setActiveTab('health')}>Health</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="mt-6 space-y-6">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <Label htmlFor="seeking-has-photo">Has a profile picture</Label>
                <Switch
                  id="seeking-has-photo"
                  checked={value.hasPhoto}
                  onCheckedChange={(hasPhoto) => onChange({ ...value, hasPhoto })}
                />
              </div>

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

              <FieldGroup searchable label="Gender Identity" options={IDENTITIES} stateKey="identities" value={value} onChange={onChange} />
              <FieldGroup label="Presentation" options={PRESENTATIONS} stateKey="presentations" value={value} onChange={onChange} />
              <FieldGroup label="Crowds" options={CROWDS} stateKey="crowds" value={value} onChange={onChange} />
              <FieldGroup label="Body Type" options={BODY_TYPES} stateKey="bodyTypes" value={value} onChange={onChange} />
              <FieldGroup label="Sexuality" options={SEXUALITY} stateKey="sexuality" value={value} onChange={onChange} />
              <FieldGroup label="Zodiac" options={ZODIAC} stateKey="zodiac" selectionMode="single" value={value} onChange={onChange} />
              <FieldGroup searchable label="Vibes" optionGroups={VIBE_GROUPS} stateKey="vibes" value={value} onChange={onChange} />
              <FieldGroup label="Hobbies" options={HOBBIES} stateKey="hobbies" value={value} onChange={onChange} />
            </TabsContent>

            <TabsContent value="intimacy" className="mt-6 space-y-6">
              <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="seeking-mile-high-club">Mile High Club members only</Label>
                </div>
                <Switch
                  id="seeking-mile-high-club"
                  checked={value.mileHighClub}
                  onCheckedChange={(mileHighClub) => onChange({ ...value, mileHighClub })}
                />
              </div>
              <FieldGroup label="Looking For" options={LOOKING_FOR} stateKey="lookingFor" value={value} onChange={onChange} />
              <FieldGroup label="Timing" options={AVAILABILITY} stateKey="timing" value={value} onChange={onChange} />
              <FieldGroup label="Hosting/Travel" options={HOSTING} stateKey="hosting" value={value} onChange={onChange} />
              <FieldGroup label="Preferred spots" options={PREFERRED_SPOTS} stateKey="preferredSpots" value={value} onChange={onChange} />
              <FieldGroup label="Position" options={POSITIONS} stateKey="positions" value={value} onChange={onChange} />
              <FieldGroup label="Role" options={ROLES} stateKey="roles" value={value} onChange={onChange} />
              <FieldGroup searchable label="Kinks & Fetishes" optionGroups={KINK_GROUPS} stateKey="kinks" value={value} onChange={onChange} />
            </TabsContent>

            <TabsContent value="health" className="mt-6 space-y-6">
              <FieldGroup
                label="Substance Boundaries"
                options={SUBSTANCE_BOUNDARIES}
                stateKey="substanceBoundaries"
                value={value}
                onChange={onChange}
              />
              <FieldGroup
                label="Protection boundaries"
                options={PROTECTION_BOUNDARIES}
                stateKey="protectionBoundaries"
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
