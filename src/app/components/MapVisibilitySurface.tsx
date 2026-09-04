import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from './ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Label } from './ui/label';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from './ui/sheet';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import MultiSelect, { type MultiSelectOptionGroup } from './MultiSelect';
import SingleSelect from './SingleSelect';
import {
  AVAILABILITY,
  BODY_TYPES,
  BODY_HAIR,
  PUBIC_HAIR,
  FACIAL_HAIR,
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
  VISIBILITY_VIBE_GROUPS,
  ZODIAC,
} from '../lib/profileOptions';
import { DEFAULT_FILTER_STATE, type FilterState } from './MapFiltersSurface';
import CruushPlusGateNotice from './CruushPlusGateNotice';

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

export const FREE_VISIBILITY_EXCLUSION_LIMIT = 3;
const VISIBILITY_EXCLUSION_LIMIT_MESSAGE = 'You can use up to 3 hidden filters. Remove one before adding another.';

interface MapVisibilitySurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: VisibilityControlState;
  availableCrowdModes?: string[];
  saving?: boolean;
  error?: string | null;
  hasCruushPlus?: boolean;
  onChange: (value: VisibilityControlState) => void;
  onClear: () => void;
  onApply: () => void;
  onUpgrade?: () => void;
}

type VisibilityListKey = Exclude<keyof VisibilityControlState, 'searchQuery' | 'ageRange' | 'distance' | 'mileHighClub' | 'activeCrowdModes' | 'restrictAge' | 'restrictDistance'>;
const VISIBILITY_LIST_KEYS: VisibilityListKey[] = [
  'identities',
  'presentations',
  'lookingFor',
  'timing',
  'hosting',
  'preferredSpots',
  'vibes',
  'crowds',
  'hobbies',
  'positions',
  'roles',
  'kinks',
  'bodyTypes',
  'bodyHair',
  'pubicHair',
  'facialHair',
  'sexuality',
  'zodiac',
  'substanceBoundaries',
  'protectionBoundaries',
];

function updateList(value: VisibilityControlState, key: VisibilityListKey, items: string[]): VisibilityControlState {
  return {
    ...value,
    [key]: items,
  };
}

export function countVisibilityExclusionFilters(value: VisibilityControlState) {
  return [
    value.searchQuery.trim().length > 0,
    value.restrictAge,
    value.restrictDistance,
    value.mileHighClub,
    ...VISIBILITY_LIST_KEYS.map((key) => value[key].length > 0),
  ].filter(Boolean).length;
}

function FieldGroup({
  label,
  options,
  optionGroups,
  stateKey,
  value,
  limitReached,
  onLimitReached,
  onChange,
  selectionMode = 'multiple',
  searchable = false,
}: {
  label: string;
  options?: string[];
  optionGroups?: MultiSelectOptionGroup[];
  stateKey: VisibilityListKey;
  value: VisibilityControlState;
  limitReached: boolean;
  onLimitReached: () => void;
  onChange: (value: VisibilityControlState) => void;
  selectionMode?: 'multiple' | 'single';
  searchable?: boolean;
}) {
  const fieldHasSelections = value[stateKey].length > 0;

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
        disableAddingOptions={limitReached && !fieldHasSelections}
        onAddingDisabled={onLimitReached}
        onChange={(items) => onChange(updateList(value, stateKey, items))}
      />}
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
  error = null,
  hasCruushPlus = false,
  onChange,
  onClear,
  onApply,
  onUpgrade,
}: MapVisibilitySurfaceProps) {
  const visibleCrowdModes = availableCrowdModes.length > 0 ? availableCrowdModes : [];
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('basics');
  const exclusionCount = countVisibilityExclusionFilters(value);
  const freeLimitReached = !hasCruushPlus && exclusionCount >= FREE_VISIBILITY_EXCLUSION_LIMIT;

  const showLimitNotice = () => {
    setLimitNotice(VISIBILITY_EXCLUSION_LIMIT_MESSAGE);
  };

  const handleLimitedChange = (nextValue: VisibilityControlState) => {
    if (!hasCruushPlus && countVisibilityExclusionFilters(nextValue) > FREE_VISIBILITY_EXCLUSION_LIMIT) {
      showLimitNotice();
      return;
    }

    setLimitNotice(null);
    onChange(nextValue);
  };

  const handleClear = () => {
    setLimitNotice(null);
    onClear();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeSide="left"
        side="right"
        overlayClassName="z-[1090]"
        className="z-[1100] w-full flex h-full max-h-[100dvh] flex-col gap-0 overflow-hidden border-white/10 bg-background/95 p-0 sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b border-white/10 py-4 pl-14 pr-[4.5rem]">
          <SheetTitle>Visibility Controls</SheetTitle>
        </SheetHeader>

        <div className="scrollbar-hide min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 overscroll-contain">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Pick who should not see you.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visibility-profile-search">Search</Label>
            <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.045] px-3">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-white/55" />
              <input
                id="visibility-profile-search"
                type="search"
                value={value.searchQuery}
                onChange={(event) => handleLimitedChange({ ...value, searchQuery: event.target.value })}
                placeholder="Hide from matching names, bios, or #tags"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/42"
              />
            </div>
          </div>

          {!hasCruushPlus && onUpgrade ? (
            <CruushPlusGateNotice
              description="Basic includes up to 3 hidden filters."
              onUpgrade={onUpgrade}
            />
          ) : null}

          {limitNotice ? (
            <div className="rounded-md border border-primary/25 bg-primary/10 p-3 text-sm text-primary">
              {limitNotice}
            </div>
          ) : null}

          <div
            className="space-y-2"
            data-testid="crowd-mode-tutorial-target"
            data-tutorial-target="crowds"
          >
            <Label>Crowd Mode</Label>
            {visibleCrowdModes.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {visibleCrowdModes.map((crowdMode) => {
                  const selected = value.activeCrowdModes.includes(crowdMode);

                  return (
                    <button
                      key={crowdMode}
                      type="button"
                      data-tutorial-target="crowds"
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
            ) : (
              <p className="text-sm text-muted-foreground">Crowd Mode is the show-only exception: when selected, only people in those crowds can see you.</p>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-full border border-white/10 bg-background/25 p-1">
              <TabsTrigger value="basics" className="min-h-11" onClick={() => setActiveTab('basics')}>Basics</TabsTrigger>
              <TabsTrigger value="intimacy" className="min-h-11" onClick={() => setActiveTab('intimacy')}>Intimacy</TabsTrigger>
              <TabsTrigger value="health" className="min-h-11" onClick={() => setActiveTab('health')}>Health</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="mt-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="visibility-distance">Distance</Label>
                  <Switch
                    id="visibility-distance"
                    checked={value.restrictDistance}
                    onCheckedChange={(restrictDistance) => handleLimitedChange({ ...value, restrictDistance })}
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
                  {value.restrictDistance ? `Hide me from people farther than ${value.distance} miles` : 'No distance-based hiding'}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="visibility-age">Age Range</Label>
                  <Switch
                    id="visibility-age"
                    checked={value.restrictAge}
                    onCheckedChange={(restrictAge) => handleLimitedChange({ ...value, restrictAge })}
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
                  {value.restrictAge ? `Hide me from people outside ${value.ageRange[0]} - ${value.ageRange[1]}` : 'No age-based hiding'}
                </p>
              </div>

              <FieldGroup label="Gender Identities" options={IDENTITIES} stateKey="identities" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup label="Presentation" options={PRESENTATIONS} stateKey="presentations" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup label="Crowds" options={CROWDS} stateKey="crowds" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <p className="-mt-4 text-sm text-muted-foreground">
                A crowd you select here cannot see you.
              </p>
              <FieldGroup label="Body Type" options={BODY_TYPES} stateKey="bodyTypes" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup label="Sexuality" options={SEXUALITY} stateKey="sexuality" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup label="Zodiac" options={ZODIAC} stateKey="zodiac" selectionMode="single" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup searchable label="Vibes" optionGroups={VISIBILITY_VIBE_GROUPS} stateKey="vibes" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup label="Hobbies" options={HOBBIES} stateKey="hobbies" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
            </TabsContent>

            <TabsContent value="intimacy" className="mt-6 space-y-6">
              <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="visibility-mile-high-club">Hide me from Mile High Club members</Label>
                  <p className="text-xs text-muted-foreground">Hide me from members currently using Mile High Club.</p>
                </div>
                <Switch
                  id="visibility-mile-high-club"
                  checked={value.mileHighClub}
                  onCheckedChange={(mileHighClub) => handleLimitedChange({ ...value, mileHighClub })}
                />
              </div>
              <FieldGroup label="Looking For" options={LOOKING_FOR} stateKey="lookingFor" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup label="Timing" options={AVAILABILITY} stateKey="timing" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup label="Hosting/Travel" options={HOSTING} stateKey="hosting" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup label="Preferred spots" options={PREFERRED_SPOTS} stateKey="preferredSpots" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup label="Position" options={POSITIONS} stateKey="positions" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <FieldGroup label="Role" options={ROLES} stateKey="roles" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
              <Accordion type="single" collapsible className="rounded-2xl border border-white/10 bg-white/[0.035]"><AccordionItem value="hair-now" className="border-0"><AccordionTrigger className="px-4 py-3 hover:no-underline"><span className="text-base">Hair now</span></AccordionTrigger><AccordionContent className="space-y-4 px-4 pb-4 pt-0"><FieldGroup label="Body hair" options={BODY_HAIR} stateKey="bodyHair" selectionMode="single" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} /><FieldGroup label="Pubic hair" options={PUBIC_HAIR} stateKey="pubicHair" selectionMode="single" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} /><FieldGroup label="Facial hair" options={FACIAL_HAIR} stateKey="facialHair" selectionMode="single" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} /></AccordionContent></AccordionItem></Accordion>
              <FieldGroup searchable label="Kinks & Fetishes" optionGroups={KINK_GROUPS} stateKey="kinks" value={value} limitReached={freeLimitReached} onLimitReached={showLimitNotice} onChange={handleLimitedChange} />
            </TabsContent>

            <TabsContent value="health" className="mt-6 space-y-6">
              <FieldGroup
                label="Substance Boundaries"
                options={SUBSTANCE_BOUNDARIES}
                stateKey="substanceBoundaries"
                value={value}
                limitReached={freeLimitReached}
                onLimitReached={showLimitNotice}
                onChange={handleLimitedChange}
              />
              <FieldGroup
                label="Protection boundaries"
                options={PROTECTION_BOUNDARIES}
                stateKey="protectionBoundaries"
                value={value}
                limitReached={freeLimitReached}
                onLimitReached={showLimitNotice}
                onChange={handleLimitedChange}
              />
            </TabsContent>

          </Tabs>
        </div>

        <SheetFooter className="shrink-0 border-t border-white/10 bg-background/95 px-5 py-4 backdrop-blur">
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClear} disabled={saving}>
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
