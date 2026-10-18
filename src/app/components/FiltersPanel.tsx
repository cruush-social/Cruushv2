import { useEffect, useRef, useState } from 'react';
import { readAccountPreference, saveAccountPreference, useAccountPreference, usePreferenceDraftOwner } from '../lib/accountPreferences';
import { DEFAULT_FILTER_STATE, type FilterState } from './MapFiltersSurface';
import { formatVibeLabel } from '../lib/vibeLabels';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import MultiSelect from './MultiSelect';
import AppPageHeader from './AppPageHeader';
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
  RELATIONSHIP_STATUS,
  ROLES,
  SUBSTANCE_BOUNDARIES,
  VIBE_GROUPS,
} from '../lib/profileOptions';

const TIMING = AVAILABILITY;

export default function FiltersPanel() {
  const navigate = useNavigate();
  const defaults = { ...DEFAULT_FILTER_STATE, distance: 5 };
  const [savedFilters] = useAccountPreference('map.seeking', defaults);
  const edited = useRef(false);
  const [filters, setFilters] = useState<FilterState>(() => readAccountPreference('map.seeking', defaults));
  useEffect(() => { if (!edited.current) setFilters(savedFilters); }, [savedFilters]);
  usePreferenceDraftOwner(() => { edited.current = false; setFilters(readAccountPreference('map.seeking', defaults)); });
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) => { edited.current = true; setFilters(current => ({ ...current, [key]: value })); };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppPageHeader
        title="Filters"
        onBack={() => navigate(-1)}
        bugButtonTestId="filters-panel-bug-button-slot"
        actions={(
          <Button variant="ghost" size="sm" onClick={() => { edited.current = true; setFilters(defaults); }}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      />

      <div className="max-w-2xl mx-auto p-6">
        <Tabs defaultValue="basics" className="w-full">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="looking">Looking</TabsTrigger>
            <TabsTrigger value="intimacy">Intimacy</TabsTrigger>
            <TabsTrigger value="lifestyle">Lifestyle</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-6 mt-6">
            <div className="space-y-4">
              <Label>Distance (miles)</Label>
              <Slider value={[filters.distance]} onValueChange={value => update('distance', value[0])} min={1} max={100} step={1} />
              <p className="text-sm text-muted-foreground">Up to {filters.distance} miles</p>
            </div>

            <div className="space-y-4">
              <Label>Age Range</Label>
              <Slider value={filters.ageRange} onValueChange={value => update('ageRange', value as [number, number])} max={99} min={18} step={1} />
              <p className="text-sm text-muted-foreground">{filters.ageRange[0]} - {filters.ageRange[1]}</p>
            </div>

            <div className="space-y-2">
              <Label>Gender Identity</Label>
              <MultiSelect menuPortal searchable ariaLabel="Gender Identity" options={IDENTITIES} value={filters.identities} onChange={value => update('identities', value)} />
            </div>

            <div className="space-y-2">
              <Label>Presentation</Label>
              <MultiSelect menuPortal options={PRESENTATIONS} value={filters.presentations} onChange={value => update('presentations', value)} />
            </div>

            <div className="space-y-2">
              <Label>Body Type</Label>
              <MultiSelect menuPortal ariaLabel="Body Type" options={BODY_TYPES} value={filters.bodyTypes} onChange={value => update('bodyTypes', value)} />
            </div>

            <div className="space-y-2">
              <Label>Crowds</Label>
              <MultiSelect menuPortal ariaLabel="Crowds" options={CROWDS} value={filters.crowds} onChange={value => update('crowds', value)} />
            </div>
          </TabsContent>

          <TabsContent value="looking" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Looking For</Label>
              <MultiSelect menuPortal options={LOOKING_FOR} value={filters.lookingFor} onChange={value => update('lookingFor', value)} />
            </div>

            <div className="space-y-2">
              <Label>Timing</Label>
              <div className="flex gap-2">
                {TIMING.map((time) => (
                  <Button key={time} variant="outline" size="sm" className="flex-1" aria-pressed={filters.timing.includes(time)} onClick={() => update('timing', filters.timing.includes(time) ? filters.timing.filter(value => value !== time) : [...filters.timing, time])}>
                    {time}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Hosting/Travel</Label>
              <MultiSelect menuPortal options={HOSTING} value={filters.hosting} onChange={value => update('hosting', value)} />
            </div>

            <div className="space-y-2">
              <Label>Vibes</Label>
              <MultiSelect menuPortal ariaLabel="Vibes" optionGroups={VIBE_GROUPS} value={filters.vibes} onChange={value => update('vibes', value)} formatOptionLabel={formatVibeLabel} />
            </div>

            <div className="space-y-2">
              <Label>Hobbies</Label>
              <MultiSelect menuPortal options={HOBBIES} value={filters.hobbies} onChange={value => update('hobbies', value)} />
            </div>
          </TabsContent>

          <TabsContent value="intimacy" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Position</Label>
              <MultiSelect menuPortal options={POSITIONS} value={filters.positions} onChange={value => update('positions', value)} />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <MultiSelect menuPortal options={ROLES} value={filters.roles} onChange={value => update('roles', value)} />
            </div>

            <div className="space-y-2">
              <Label>Relationship status</Label>
              <MultiSelect menuPortal ariaLabel="Relationship status" options={RELATIONSHIP_STATUS} value={filters.relationshipStatus} onChange={value => update('relationshipStatus', value)} />
            </div>

            <div className="space-y-2">
              <Label>Kinks & Fetishes</Label>
              <MultiSelect menuPortal ariaLabel="Kinks & Fetishes" optionGroups={KINK_GROUPS} value={filters.kinks} onChange={value => update('kinks', value)} />
            </div>

          </TabsContent>

          <TabsContent value="lifestyle" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Substance Boundaries</Label>
              <MultiSelect menuPortal options={SUBSTANCE_BOUNDARIES} value={filters.substanceBoundaries} onChange={value => update('substanceBoundaries', value)} />
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-8 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={() => { void saveAccountPreference('map.seeking', filters).catch(() => undefined); navigate(-1); }}
            style={{
              background: 'var(--cruush-gradient)',
            }}
          >
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
}
