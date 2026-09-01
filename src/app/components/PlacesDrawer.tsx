import { useEffect, useMemo, useState } from 'react';
import { Clock3, MapPin, Plus, Search, Star, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from './ui/sheet';
import {
  PLACE_FACILITY_LABELS,
  PLACE_FACILITY_TYPES,
  getSpotCategoryLabels,
  type PlaceFacilityType,
  type PlaceSort,
  type PlaceTag,
} from '../lib/places';
import { getPlaces, submitPlace, type PlaceRecord } from '../lib/placesApi';

type PlacesDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coordinates: { latitude: number; longitude: number } | null;
  onPlacesChange?: (places: PlaceRecord[]) => void;
  onFiltersActiveChange?: (active: boolean) => void;
  onMapFiltersChange?: (filters: { query: string; facilityTypes: PlaceFacilityType[] }) => void;
  onSelect: (place: PlaceRecord) => void;
};

const SORT_OPTIONS: Array<{ value: PlaceSort; label: string }> = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'active', label: 'Active now' },
  { value: 'recent', label: 'Recent activity' },
  { value: 'top_rated', label: 'Top rated' },
  { value: 'az', label: 'A-Z' },
];

const PLACE_PAGE_SIZE = 50;

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function PlacesDrawer({ open, onOpenChange, coordinates, onFiltersActiveChange, onMapFiltersChange, onPlacesChange, onSelect }: PlacesDrawerProps) {
  const [places, setPlaces] = useState<PlaceRecord[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<PlaceSort>('nearest');
  const [facilityTypes, setFacilityTypes] = useState<PlaceFacilityType[]>([]);
  const [draftFacilityTypes, setDraftFacilityTypes] = useState<PlaceFacilityType[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submission, setSubmission] = useState({
    name: '', description: '', address: '', sourceUrl: '', facilityType: 'other' as PlaceFacilityType,
    tags: [] as PlaceTag[], latitude: coordinates?.latitude ?? null as number | null, longitude: coordinates?.longitude ?? null as number | null,
  });
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!coordinates) return;
    setSubmission((value) => ({ ...value, latitude: coordinates.latitude, longitude: coordinates.longitude }));
  }, [coordinates]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void getPlaces({
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        sort, query, facilityTypes, tags: [], limit: PLACE_PAGE_SIZE, offset: 0,
      }).then((result) => {
        if (cancelled) return;
        setPlaces(result);
        setHasMore(result.length === PLACE_PAGE_SIZE);
        onPlacesChange?.(result);
      }).catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Spots could not load.');
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, query ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [coordinates?.latitude, coordinates?.longitude, facilityTypes, onPlacesChange, open, query, sort]);

  const filterCount = facilityTypes.length + (query.trim() ? 1 : 0);
  useEffect(() => {
    onFiltersActiveChange?.(filterCount > 0);
    onMapFiltersChange?.({ query: query.trim(), facilityTypes });
  }, [facilityTypes, filterCount, onFiltersActiveChange, onMapFiltersChange, query]);
  const resultLabel = useMemo(() => loading ? 'Loading spots...' : `${places.length} ${places.length === 1 ? 'spot' : 'spots'}`, [loading, places.length]);

  const handleSubmit = async () => {
    setSubmissionStatus(null);
    if (submission.latitude == null || submission.longitude == null) {
      setSubmissionStatus('Set your map location before suggesting a spot.');
      return;
    }
    try {
      const result = await submitPlace({
        ...submission,
        latitude: submission.latitude,
        longitude: submission.longitude,
        sourceUrl: submission.sourceUrl || undefined,
        address: submission.address || undefined,
      });
      setSubmissionStatus(result.autoShortlisted
        ? `Supported by ${result.suggestionCount} people and shortlisted for moderator review.`
        : `Suggested for review. ${result.suggestionCount} ${result.suggestionCount === 1 ? 'person supports' : 'people support'} this spot.`);
      setSubmission((value) => ({ ...value, name: '', description: '', address: '', sourceUrl: '', tags: [] }));
    } catch (submitError) {
      setSubmissionStatus(submitError instanceof Error ? submitError.message : 'Spot could not be submitted.');
    }
  };

  const handleLoadMore = async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextPage = await getPlaces({
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        sort,
        query,
        facilityTypes,
        tags: [],
        limit: PLACE_PAGE_SIZE,
        offset: places.length,
      });
      const nextPlaces = [...places];
      const knownIds = new Set(nextPlaces.map((place) => place.id));
      nextPage.forEach((place) => {
        if (!knownIds.has(place.id)) {
          nextPlaces.push(place);
          knownIds.add(place.id);
        }
      });
      setPlaces(nextPlaces);
      setHasMore(nextPage.length === PLACE_PAGE_SIZE);
      onPlacesChange?.(nextPlaces);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'More spots could not load.');
    } finally {
      setLoadingMore(false);
    }
  };

  const pinCurrentLocation = () => {
    setSubmissionStatus(null);
    setShowSubmit(true);
    if (!coordinates) {
      setSubmissionStatus('Set your map location before suggesting a spot.');
      return;
    }
    setSubmission((value) => ({
      ...value,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    }));
    setSubmissionStatus('Map location pinned. Reviewers see the spot details, never who suggested it.');
  };

  const drawerBody = (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 overscroll-contain">
          <div className="flex gap-2 pt-1">
            <Button type="button" className="flex-1" variant={showSubmit ? 'secondary' : 'default'} onClick={() => setShowSubmit(false)}>Discover</Button>
            <Button type="button" className="flex-1" variant={showSubmit ? 'default' : 'secondary'} onClick={() => setShowSubmit(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add spot
            </Button>
          </div>
          {showSubmit ? (
            <div className="space-y-3" data-testid="place-submission-form">
              <Input aria-label="Spot name" placeholder="Spot name" value={submission.name} onChange={(event) => setSubmission((value) => ({ ...value, name: event.target.value }))} />
              <textarea aria-label="Spot description" className="min-h-24 w-full rounded-md border border-white/10 bg-white/[0.05] p-3 text-sm text-white outline-none" placeholder="Short public description" value={submission.description} onChange={(event) => setSubmission((value) => ({ ...value, description: event.target.value }))} />
              <Input aria-label="Public address" placeholder="Public address (optional)" value={submission.address} onChange={(event) => setSubmission((value) => ({ ...value, address: event.target.value }))} />
              <Input aria-label="Source URL" placeholder="Official source URL (optional)" value={submission.sourceUrl} onChange={(event) => setSubmission((value) => ({ ...value, sourceUrl: event.target.value }))} />
              <Button type="button" variant="secondary" className="w-full border border-primary/25" onClick={pinCurrentLocation}>
                <MapPin className="mr-2 h-4 w-4" />Use my current pin for this spot
              </Button>
              <p className="text-xs text-white/55">Your suggestion is private. Reviewers see the spot details, never your identity.</p>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-white">Categories</legend>
                <p className="text-xs text-white/55">Choose one spot type.</p>
                <div className="flex flex-wrap gap-2">
                  {PLACE_FACILITY_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={submission.facilityType === type}
                      className={`rounded-full border px-3 py-1 text-xs ${submission.facilityType === type ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-white/70'}`}
                      onClick={() => setSubmission((value) => ({ ...value, facilityType: type }))}
                    >
                      {PLACE_FACILITY_LABELS[type]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Button type="button" className="w-full" disabled={!submission.name.trim()} onClick={() => void handleSubmit()}>Submit spot for review</Button>
              {submissionStatus ? <p className="text-sm text-white/70">{submissionStatus}</p> : null}
            </div>
          ) : (
            <>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                <Input aria-label="Search spots" className="pl-9" placeholder="Search spots" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <Select value={sort} onValueChange={(value) => setSort(value as PlaceSort)}>
                <SelectTrigger aria-label="Sort spots" className="border-white/10 bg-background text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[1710] border-white/10 bg-background text-white">
                  {SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <details
                open={filtersOpen}
                className="rounded-xl border border-white/10 bg-white/[0.035] p-3"
                onToggle={(event) => {
                  const nextOpen = event.currentTarget.open;
                  setFiltersOpen(nextOpen);
                  if (nextOpen) setDraftFacilityTypes(facilityTypes);
                }}
              >
                <summary className="cursor-pointer text-sm text-white">Spot filters{filterCount ? ` (${filterCount})` : ''}</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {PLACE_FACILITY_TYPES.map((type) => <button key={type} type="button" aria-pressed={draftFacilityTypes.includes(type)} className={`rounded-full border px-3 py-1 text-xs ${draftFacilityTypes.includes(type) ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-white/65'}`} onClick={() => setDraftFacilityTypes(toggleValue(draftFacilityTypes, type))}>{PLACE_FACILITY_LABELS[type]}</button>)}
                </div>
              </details>
              <p className="text-xs text-white/55">{resultLabel}</p>
              {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
              {!loading && !error && places.length === 0 ? <p className="rounded-xl border border-white/10 p-6 text-center text-sm text-white/60">No matching spots yet.</p> : null}
              <div className="space-y-2">
                {places.map((place) => (
                  <button key={place.id} type="button" className="w-full rounded-xl border border-white/10 bg-white/[0.045] p-3 text-left transition hover:border-white/20 hover:bg-white/[0.075]" onClick={() => onSelect(place)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{place.name}</p>
                        <p className="mt-1 text-xs text-white/55">{getSpotCategoryLabels(place.facilityType, place.tags).join(' · ')}</p>
                      </div>
                      {place.distanceMiles != null ? <span className="shrink-0 text-xs text-white/55"><MapPin className="mr-1 inline h-3 w-3" />{place.distanceMiles < 1 ? place.distanceMiles.toFixed(1) : place.distanceMiles.toFixed(0)} mi</span> : null}
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs text-white/65">
                      <span><Users className="mr-1 inline h-3.5 w-3.5" />{place.activeCheckins} here</span>
                      <span><Star className="mr-1 inline h-3.5 w-3.5" />{place.ratingAverage?.toFixed(1) ?? 'New'}{place.ratingCount ? ` (${place.ratingCount})` : ''}</span>
                      {place.recentActivityAt ? <span><Clock3 className="mr-1 inline h-3.5 w-3.5" />Active</span> : null}
                    </div>
                  </button>
                ))}
              </div>
              {hasMore || loadingMore ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loadingMore}
                  onClick={() => void handleLoadMore()}
                >
                  {loadingMore ? 'Loading more spots...' : 'Load more spots'}
                </Button>
              ) : null}
            </>
          )}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeSide="left"
        side="right"
        overlayClassName="z-[1690]"
        className="z-[1700] flex h-full max-h-[100dvh] w-full flex-col gap-0 overflow-hidden border-white/10 bg-background/95 p-0 sm:max-w-xl"
        data-testid="places-drawer"
      >
        <SheetHeader className="shrink-0 border-b border-white/10 py-4 pl-14 pr-5">
          <SheetTitle className="text-xl text-white">Spots</SheetTitle>
          <SheetDescription>Public cruising spaces, healthcare clinics, and community spots.</SheetDescription>
        </SheetHeader>
        {drawerBody}
        {!showSubmit ? (
          <SheetFooter className="shrink-0 border-t border-white/10 bg-background/95 px-5 py-4 backdrop-blur">
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => {
                setQuery('');
                setSort('nearest');
                setDraftFacilityTypes([]);
                setFacilityTypes([]);
              }}>Clear</Button>
              <Button type="button" className="flex-1" style={{ background: 'var(--cruush-gradient)' }} onClick={() => {
                setFacilityTypes(draftFacilityTypes);
                setFiltersOpen(false);
              }}>Apply</Button>
            </div>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
