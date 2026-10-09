import { getNsfwPhotoRestriction } from '../lib/dlMode';
import { useTrustRestrictions } from '../lib/trustRestrictions';
import TrustRestrictionNotice from './TrustRestrictionNotice';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Clock, Copy, ExternalLink, Flag, MapPin, Share2, Star, Trash2, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Slider } from './ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import HeartPhoto from './HeartPhoto';
import CruushBadge from './CruushBadge';
import ReportAction from './ReportAction';
import ReportPage from './ReportPage';
import UserActivityCapsule from './UserActivityCapsule';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import InAppShareDialog from './InAppShareDialog';
import PlaceTransitDetails from './PlaceTransitDetails';
import AppPageHeader from './AppPageHeader';
import { getStoredUserId } from '../lib/sessionUser';
import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import { resolveUserBorderTone } from '../lib/userBorderTone';
import {
  PLACE_AMENITY_LABELS,
  PLACE_AMENITIES,
  PLACE_FACILITY_SINGULAR_LABELS,
  PLACE_VIBES,
  PLACE_VIBE_LABELS,
  type PlaceAmenity,
  type PlaceVibe,
} from '../lib/places';
import {
  checkIntoPlace,
  checkOutOfPlace,
  contributePlaceDetails,
  deletePlaceBoardMessage,
  getPlace,
  getPlaceBoard,
  postPlaceBoardMessage,
  ratePlace,
  removePlaceRating,
  type PlaceBoardMessage,
  type PlaceDetailRecord,
  type PlaceRatingCategory,
} from '../lib/placesApi';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BOARD_PAGE_SIZE = 30;
const CHECKIN_DURATION_OPTIONS = [
  { value: 1, label: '1h' },
  { value: 3, label: '3h' },
  { value: 6, label: '6h' },
  { value: 12, label: '12h' },
  { value: 24, label: '24h' },
];
const RATING_LABELS: Record<PlaceRatingCategory, string> = {
  overall: 'Overall Experience',
  gender_inclusivity: 'Gender Inclusivity',
  lgbtq_friendliness: 'LGBTQ+ Friendliness',
  safety: 'Safety & Comfort',
  accessibility: 'Accessibility',
  cleanliness: 'Cleanliness & Condition',
};

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

type PlaceDetailProps = {
  embedded?: boolean;
  onBack?: () => void;
  onClose?: () => void;
  placeIdOverride?: string;
};

export default function PlaceDetail({ embedded = false, onBack, onClose, placeIdOverride }: PlaceDetailProps = {}) {
  const trust = useTrustRestrictions();
  const { placeId: routePlaceId } = useParams();
  const placeId = placeIdOverride ?? routePlaceId;
  const navigate = useNavigate();
  const [place, setPlace] = useState<PlaceDetailRecord | null>(null);
  const [messages, setMessages] = useState<PlaceBoardMessage[]>([]);
  const [boardHasMore, setBoardHasMore] = useState(false);
  const [loadingMoreBoard, setLoadingMoreBoard] = useState(false);
  const [message, setMessage] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [checkinDurationHours, setCheckinDurationHours] = useState<1 | 3 | 6 | 12 | 24>(1);
  const [checkinVibes, setCheckinVibes] = useState<PlaceVibe[]>([]);
  const [checkinAmenities, setCheckinAmenities] = useState<PlaceAmenity[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailVibes, setDetailVibes] = useState<PlaceVibe[]>([]);
  const [detailAmenities, setDetailAmenities] = useState<PlaceAmenity[]>([]);
  const [detailAccess, setDetailAccess] = useState('');
  const [sendingDetails, setSendingDetails] = useState(false);
  const [checkinVisibility, setCheckinVisibility] = useState<'hidden' | 'public' | 'checked_in'>('hidden');
  const [postingCheckin, setPostingCheckin] = useState(false);
  const [postingBoard, setPostingBoard] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    targetType: 'place' | 'place_message';
    targetId: string;
    targetLabel: string;
  } | null>(null);
  const [mutating, setMutating] = useState(false);
  const mutationRef = useRef<object | null>(null);
  const currentUserId = getStoredUserId();
  const dlModeActive = useDlMode();
  const loadGeneration = useRef(0);
  const checkinGeneration = useRef(0);
  const activePlaceId = useRef(placeId);
  activePlaceId.current = placeId;

  const refresh = async () => {
    if (!placeId || activePlaceId.current !== placeId) return;
    const generation = ++loadGeneration.current;
    const isCurrent = () => generation === loadGeneration.current && activePlaceId.current === placeId;
    setLoading(true);
    setLoadingMoreBoard(false);
    setError(null);
    try {
      const placeResult = await getPlace(placeId);
      if (!isCurrent()) return;
      setPlace(placeResult);
      const boardResult = await getPlaceBoard(placeId, { limit: BOARD_PAGE_SIZE, offset: 0 });
      if (!isCurrent()) return;
      setMessages(boardResult);
      setBoardHasMore(boardResult.length === BOARD_PAGE_SIZE);
    } catch (loadError) {
      if (!isCurrent()) return;
      setError(loadError instanceof Error ? loadError.message : 'Spot could not load.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useEffect(() => {
    checkinGeneration.current += 1;
    mutationRef.current = null;
    setMutating(false);
    setPlace(null);
    setMessages([]);
    setBoardHasMore(false);
    setPostingCheckin(false);
    setPostingBoard(false);
    setMessage('');
    setCheckinVibes([]);
    setCheckinAmenities([]);
    setCheckinVisibility('hidden');
    setDetailsOpen(false);
    setDetailVibes([]);
    setDetailAmenities([]);
    setDetailAccess('');
    setSendingDetails(false);
    setStatus(null);
    setRatingOpen(false);
    setReportTarget(null);
    void refresh();
    return () => {
      loadGeneration.current += 1;
      checkinGeneration.current += 1;
      mutationRef.current = null;
    };
  }, [placeId]);

  useEffect(() => {
    const expiresAt = place?.viewerCheckin?.expiresAt;
    if (!expiresAt) return;
    const remainingMs = Date.parse(expiresAt) - Date.now();
    if (remainingMs <= 0) {
      void refresh();
      return;
    }
    const timer = window.setTimeout(() => void refresh(), remainingMs + 250);
    return () => window.clearTimeout(timer);
  }, [place?.viewerCheckin?.expiresAt]);

  const popularMaximum = useMemo(() => Math.max(1, ...(place?.popularTimes.map((bucket) => bucket.count) ?? [1])), [place]);
  const combinedRating = useMemo(() => {
    const ratings = place?.ratingBreakdown ?? [];
    const count = ratings.reduce((total, rating) => total + rating.count, 0);
    const weightedStars = ratings.reduce((total, rating) => total + (rating.average ?? 0) * rating.count, 0);
    return { average: count > 0 ? weightedStars / count : null, count };
  }, [place]);

  const handlePostCheckin = () => {
    if (!placeId || place?.id !== placeId || checkinVibes.length === 0 || (Boolean(message.trim()) && trust.restricted('pink_book')) || postingCheckin || postingBoard || mutationRef.current) return;
    const generation = ++checkinGeneration.current;
    const isCurrent = () => generation === checkinGeneration.current && activePlaceId.current === placeId;
    if (!navigator.geolocation) {
      setError('Location is required to check in.');
      return;
    }
    setStatus(null);
    setError(null);
    setPostingCheckin(true);
    navigator.geolocation.getCurrentPosition((position) => {
      if (!isCurrent()) return;
      void checkIntoPlace(placeId, {
        ...(message.trim() ? { content: message.trim() } : {}),
        vibes: checkinVibes,
        amenities: checkinAmenities,
        durationHours: checkinDurationHours,
        visible: checkinVisibility !== 'hidden',
        visibility: checkinVisibility,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        observedAt: new Date(position.timestamp).toISOString(),
      }).then(async () => {
        if (!isCurrent()) return;
        setMessage('');
        await refresh();
      }).catch((postError: unknown) => {
        if (!isCurrent()) return;
        setError(postError instanceof Error ? postError.message : 'Check-in could not be completed.');
      }).finally(() => {
        if (isCurrent()) setPostingCheckin(false);
      });
    }, () => {
      if (!isCurrent()) return;
      setPostingCheckin(false);
      setError('Location permission is required to check in.');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  };

  const handlePostBoard = async () => {
    if (!placeId || place?.id !== placeId || !place.viewerCheckin || !message.trim() || trust.restricted('pink_book') || postingBoard || postingCheckin || mutationRef.current) return;
    const generation = loadGeneration.current;
    const isCurrent = () => generation === loadGeneration.current && activePlaceId.current === placeId;
    setPostingBoard(true);
    setError(null);
    try {
      await postPlaceBoardMessage(placeId, { content: message.trim() });
      if (!isCurrent()) return;
      setMessage('');
      await refresh();
    } catch (postError) {
      if (!isCurrent()) return;
      setError(postError instanceof Error ? postError.message : 'Pink Book post could not be posted.');
    } finally {
      if (isCurrent()) setPostingBoard(false);
    }
  };

  const handleLoadMoreBoard = async () => {
    if (!placeId || loadingMoreBoard || !boardHasMore) return;
    const generation = loadGeneration.current;
    const isCurrent = () => generation === loadGeneration.current && activePlaceId.current === placeId;
    setLoadingMoreBoard(true);
    setError(null);
    try {
      const nextPage = await getPlaceBoard(placeId, { limit: BOARD_PAGE_SIZE, offset: messages.length });
      if (!isCurrent()) return;
      setMessages((current) => {
        const known = new Set(current.map((entry) => entry.id));
        return [...current, ...nextPage.filter((entry) => !known.has(entry.id))];
      });
      setBoardHasMore(nextPage.length === BOARD_PAGE_SIZE);
    } catch (loadError) {
      if (!isCurrent()) return;
      setError(loadError instanceof Error ? loadError.message : 'More Pink Book posts could not load.');
    } finally {
      if (isCurrent()) setLoadingMoreBoard(false);
    }
  };

  const mutatePlace = async (
    mutation: (id: string) => Promise<unknown>,
    failureMessage: string,
    successMessage?: string,
  ) => {
    if (!placeId || place?.id !== placeId || mutationRef.current || postingCheckin || postingBoard) return;
    const request = {};
    mutationRef.current = request;
    const isCurrent = () => mutationRef.current === request && activePlaceId.current === placeId;
    setMutating(true);
    setError(null);
    setStatus(null);
    try {
      await mutation(placeId);
      if (!isCurrent()) return;
      if (successMessage) setStatus(successMessage);
      await refresh();
    } catch (mutationError) {
      if (!isCurrent()) return;
      setError(mutationError instanceof Error ? mutationError.message : failureMessage);
    } finally {
      if (isCurrent()) {
        mutationRef.current = null;
        setMutating(false);
      }
    }
  };

  const handleCheckout = () => mutatePlace(checkOutOfPlace, 'Check-out failed.', 'Checked out.');

  const handleContributeDetails = async () => {
    if (!placeId || place?.id !== placeId || sendingDetails || (!detailVibes.length && !detailAmenities.length && !detailAccess.trim())) return;
    const generation = loadGeneration.current;
    const isCurrent = () => generation === loadGeneration.current && activePlaceId.current === placeId;
    setSendingDetails(true);
    setError(null);
    setStatus(null);
    try {
      await contributePlaceDetails(placeId, {
        ...(detailVibes.length ? { vibes: detailVibes } : {}),
        ...(detailAmenities.length ? { amenities: detailAmenities } : {}),
        ...(detailAccess.trim() ? { accessInstructions: detailAccess.trim() } : {}),
      });
      if (!isCurrent()) return;
      setDetailVibes([]);
      setDetailAmenities([]);
      setDetailAccess('');
      setDetailsOpen(false);
      setStatus('Spot details sent.');
      await refresh();
    } catch (detailsError) {
      if (!isCurrent()) return;
      setError(detailsError instanceof Error ? detailsError.message : 'Spot details could not be sent.');
    } finally {
      if (isCurrent()) setSendingDetails(false);
    }
  };

  const handleCopyAddress = async () => {
    const generation = checkinGeneration.current;
    const isCurrent = () => generation === checkinGeneration.current && activePlaceId.current === placeId;
    const address = place?.address || (place ? `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}` : '');
    if (!address || !navigator.clipboard) {
      setError('Address could not be copied.');
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      if (!isCurrent()) return;
      setError(null);
      setStatus('Address copied.');
    } catch {
      if (!isCurrent()) return;
      setError('Address could not be copied.');
    }
  };

  if (place?.id !== placeId && loading) {
    return (
      <div className={`bg-background p-4 ${embedded ? 'min-h-72' : 'min-h-screen'}`}>
        <div className="mx-auto max-w-2xl">
          <LoadingCardSkeletons count={3} label="Loading spot" />
        </div>
      </div>
    );
  }

  if (!place || place.id !== placeId) {
    return <div className={`flex flex-col items-center justify-center gap-4 bg-background p-6 ${embedded ? 'min-h-72' : 'min-h-screen'}`}><p className="text-white">{error ?? 'Spot not found.'}</p>{embedded ? null : <Button onClick={() => navigate('/map')}>Back to map</Button>}</div>;
  }

  if (embedded && reportTarget) {
    return <ReportPage key={`${reportTarget.targetType}:${reportTarget.targetId}`} embedded targetOverride={reportTarget} onBack={() => setReportTarget(null)} />;
  }

  const ratingControls = (
    <>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-center" data-testid="combined-spot-rating">
        <Star className="mx-auto mb-1 h-6 w-6 fill-primary text-primary" />
        <p className="text-2xl text-white">{combinedRating.average?.toFixed(1) ?? 'New'}</p>
        <p className="text-xs text-muted-foreground">All category ratings · {combinedRating.count} total</p>
      </div>
      <div className="grid grid-cols-2 gap-4">{place.ratingBreakdown.map((rating) => (
        <div key={rating.category} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm text-white">{RATING_LABELS[rating.category]}</p><p className="text-xs text-muted-foreground">{rating.average?.toFixed(1) ?? 'New'}{rating.count ? ` from ${rating.count}` : ''}</p></div>
          <div className="flex">{[1, 2, 3, 4, 5].map((stars) => <button key={stars} type="button" aria-label={`Rate ${RATING_LABELS[rating.category]} ${stars} stars`} disabled={mutating || postingCheckin} className="p-1 disabled:opacity-50" onClick={() => void mutatePlace((id) => ratePlace(id, rating.category, stars), 'Rating could not be saved.')}><Star className={`h-5 w-5 ${stars <= (rating.viewerRating ?? 0) ? 'fill-primary text-primary' : 'text-white/35'}`} /></button>)}</div>
        </div>
      ))}</div>
      {place.ratingBreakdown.some((rating) => rating.viewerRating != null) ? <button type="button" disabled={mutating || postingCheckin} className="justify-self-start text-xs text-white/50 hover:text-white disabled:opacity-50" onClick={() => void mutatePlace(removePlaceRating, 'Ratings could not be cleared.')}>Clear my ratings</button> : null}
    </>
  );

  if (embedded && ratingOpen) {
    return (
      <section className="space-y-5 bg-background p-6" data-testid="spot-rating-panel" aria-busy={mutating}>
        <header className="flex items-center gap-3 pr-10">
          <Button type="button" variant="ghost" size="icon" autoFocus aria-label="Back to Spot" onClick={() => setRatingOpen(false)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-xl">Rate this spot</h2>
        </header>
        {ratingControls}
      </section>
    );
  }

  return (
    <div className={embedded ? 'bg-background' : 'min-h-screen bg-background pb-20'} data-testid="spot-detail">
      <AppPageHeader
        title={PLACE_FACILITY_SINGULAR_LABELS[place.facilityType]}
        onBack={onBack ?? (() => navigate(-1))}
        onClose={onClose}
        closeLabel="Close Spot"
        bugButtonTestId="spot-detail-bug-button-slot"
      />

      <div className={`mx-auto flex flex-col gap-4 px-4 py-4 sm:gap-6 sm:p-6 ${embedded ? 'max-w-none' : 'max-w-2xl'}`}>
        <div className={`relative ${embedded ? 'order-1' : 'order-3'}`}>
          <h1 className={`text-3xl ${embedded ? 'pr-10' : ''}`}>{place.name}</h1>
          <PlaceTransitDetails details={place.transitDetails} />
          <div className="mt-2 flex items-start gap-2 text-base text-muted-foreground">
            <p className="min-w-0 flex-1"><MapPin className="mr-1 inline h-4 w-4" />{place.address || `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`}</p>
            <button type="button" aria-label="Send spot in cruush" title="Send in cruush" className="shrink-0 rounded-md p-1 text-white/55 transition hover:bg-white/10 hover:text-white" onClick={() => setShareOpen(true)}><Share2 className="h-4 w-4" /></button>
            <button type="button" aria-label="Copy spot address" title="Copy address" className="shrink-0 rounded-md p-1 text-white/55 transition hover:bg-white/10 hover:text-white" onClick={() => void handleCopyAddress()}><Copy className="h-4 w-4" /></button>
          </div>
          {place.vibes?.length ? <div className="mt-3 flex flex-wrap gap-2">{place.vibes.slice(0, 2).map((vibe) => <span key={vibe} className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-base text-white">{PLACE_VIBE_LABELS[vibe]}</span>)}</div> : null}
          {place.amenities?.length ? <div className="mt-2 flex flex-wrap gap-2">{place.amenities.map((amenity) => <span key={amenity} className="rounded-full border border-white/10 px-3 py-1 text-base text-white/70">{PLACE_AMENITY_LABELS[amenity]}</span>)}</div> : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" className="inline-flex items-center text-base text-white/50 hover:text-white" onClick={() => setDetailsOpen(true)}>Add spot details</button>
            <button type="button" className="inline-flex items-center text-base text-white/50 hover:text-white" onClick={() => embedded ? setReportTarget({ targetType: 'place', targetId: place.id, targetLabel: place.name }) : navigate('/report', { state: { targetType: 'place', placeId: place.id, targetLabel: place.name } })}><Flag className="mr-1 h-3.5 w-3.5" />Report incorrect or unsafe spot</button>
          </div>
        </div>

        {place.description || place.accessInstructions ? <div className="order-4 -mt-1 space-y-3 text-muted-foreground">
          {place.description ? <p>{place.description}</p> : null}
          {place.accessInstructions ? <div><p className="text-base uppercase tracking-[0.14em] text-white/55">Access</p><p className="mt-1">{place.accessInstructions}</p></div> : null}
        </div> : null}

        <div className="order-5 grid grid-cols-2 gap-3 sm:gap-4">
          <div className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-center sm:block sm:p-4">
            <Users className="h-5 w-5 shrink-0 text-primary sm:mx-auto sm:mb-2 sm:h-6 sm:w-6" />
            <p className="text-lg leading-none sm:text-2xl sm:leading-normal">{place.activeCheckins}</p>
            <p className="text-xs leading-none text-muted-foreground sm:text-sm sm:leading-normal">Here now</p>
          </div>
          <button type="button" className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-center transition hover:border-primary/35 hover:bg-white/[0.055] sm:block sm:p-4" aria-label={`Rate this spot. ${place.ratingAverage?.toFixed(1) ?? 'New'} from ${place.ratingCount} ratings`} onClick={() => setRatingOpen(true)}>
            <Star className="h-5 w-5 shrink-0 text-primary sm:mx-auto sm:mb-2 sm:h-6 sm:w-6" />
            <p className="text-lg leading-none sm:text-2xl sm:leading-normal">{place.ratingAverage?.toFixed(1) ?? 'New'}</p>
            <p className="text-xs leading-tight text-muted-foreground sm:text-sm sm:leading-normal">{place.ratingCount === 0 ? 'Rate this spot' : `${place.ratingCount} ratings · Rate this spot`}</p>
          </button>
        </div>

        {!embedded ? <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
          <DialogContent className="scrollbar-hide max-h-[min(85dvh,42rem)] border-white/10 bg-background/98 sm:max-w-lg" data-testid="spot-rating-dialog" aria-busy={mutating}>
            <DialogHeader>
              <DialogTitle>Rate this spot</DialogTitle>
              <DialogDescription className="sr-only">Six star-rating categories.</DialogDescription>
            </DialogHeader>
            {ratingControls}
          </DialogContent>
        </Dialog> : null}

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="scrollbar-hide max-h-[min(85dvh,42rem)] overflow-y-auto border-white/10 bg-background/98 sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add spot details</DialogTitle>
              <DialogDescription className="sr-only">Add vibes, amenities, or access details.</DialogDescription>
            </DialogHeader>
            <fieldset className="space-y-2">
              <legend className="text-xs text-white/60">Vibes</legend>
              <div className="flex flex-wrap gap-2">
                {PLACE_VIBES.map((vibe) => {
                  const selected = detailVibes.includes(vibe);
                  const selectionFull = detailVibes.length >= 3 && !selected;
                  return <button key={vibe} type="button" aria-pressed={selected} disabled={selectionFull || sendingDetails} className={`rounded-full border px-3 py-1 text-xs disabled:opacity-35 ${selected ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-white/65'}`} onClick={() => setDetailVibes((current) => selected ? current.filter((item) => item !== vibe) : [...current, vibe])}>{PLACE_VIBE_LABELS[vibe]}</button>;
                })}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-xs text-white/60">Amenities</legend>
              <div className="flex flex-wrap gap-2">
                {PLACE_AMENITIES.map((amenity) => {
                  const selected = detailAmenities.includes(amenity);
                  return <button key={amenity} type="button" aria-pressed={selected} disabled={sendingDetails} className={`rounded-full border px-3 py-1 text-xs disabled:opacity-35 ${selected ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-white/65'}`} onClick={() => setDetailAmenities((current) => selected ? current.filter((item) => item !== amenity) : [...current, amenity])}>{PLACE_AMENITY_LABELS[amenity]}</button>;
                })}
              </div>
            </fieldset>
            <label className="space-y-2 text-xs text-white/60">
              <span>Access details</span>
              <textarea className="min-h-24 w-full resize-none rounded-lg border border-white/10 bg-black/35 p-3 text-sm text-white outline-none focus:border-primary/45" maxLength={1000} value={detailAccess} onChange={(event) => setDetailAccess(event.target.value)} />
            </label>
            <Button disabled={sendingDetails || (!detailVibes.length && !detailAmenities.length && !detailAccess.trim())} onClick={() => void handleContributeDetails()}>{sendingDetails ? 'Sending...' : 'Send details'}</Button>
          </DialogContent>
        </Dialog>

        <details className="order-6 rounded-xl border border-border bg-card p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium">Popular times<Clock className="h-5 w-5 text-primary" /></summary>
          <div className="mt-4">
            {place.popularTimes.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Not enough activity yet.</p> : (
              <div className="grid grid-cols-[2.5rem_repeat(6,minmax(0,1fr))] gap-1 text-[10px]">
              <span />{[0, 4, 8, 12, 16, 20].map((hour) => <span key={hour} className="text-center text-white/45">{hour}</span>)}
              {WEEKDAYS.flatMap((day, dayIndex) => [
                <span key={`${day}-label`} className="flex items-center text-white/55">{day}</span>,
                ...[0, 4, 8, 12, 16, 20].map((hour) => {
                  const count = place.popularTimes.filter((bucket) => bucket.weekday === dayIndex + 1 && bucket.hour >= hour && bucket.hour < hour + 4).reduce((sum, bucket) => sum + bucket.count, 0);
                  return <span key={`${day}-${hour}`} aria-label={`${day} ${hour}:00, ${count || 'not enough'} check-ins`} className="h-6 rounded" style={{ backgroundColor: count ? `rgba(255, 0, 114, ${0.15 + 0.75 * count / popularMaximum})` : 'rgba(255,255,255,0.035)' }} />;
                }),
              ])}
              </div>
            )}
          </div>
        </details>

        {place.sourceUrl ? <a className="order-8 inline-flex items-center text-lg text-primary" href={place.sourceUrl} target="_blank" rel="noreferrer">Source{place.sourceAttribution ? `: ${place.sourceAttribution}` : ''}<ExternalLink className="ml-2 h-4 w-4" /></a> : null}

        {status ? <p className="order-9 text-sm text-primary">{status}</p> : null}
        {error ? <p className="order-10 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

        <Tabs defaultValue="feed" className="order-7 w-full">
          <TabsList className="grid h-10 w-full grid-cols-2 p-1">
            <TabsTrigger className="h-8 rounded-full py-0" value="feed">Pink Book</TabsTrigger>
            <TabsTrigger className="h-8 rounded-full py-0" value="here">Who's Here</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="space-y-4 mt-4">
            <TrustRestrictionNotice message={trust.message('pink_book', 'Pink Book posting')} />
            <Card className="gap-0">
              <Accordion type="single" collapsible key={place.id}>
                <AccordionItem className="border-0" value="pink-book-composer">
                  <AccordionTrigger className="px-6 py-5 text-base hover:no-underline">
                    {place.viewerCheckin ? 'Post to Pink Book' : 'Check in'}
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-6">
            {place.viewerCheckin ? (
              <div className="p-3">
                <textarea disabled={trust.restricted('pink_book')} aria-label="Write a Pink Book post" className="min-h-20 w-full resize-none bg-transparent text-sm text-white outline-none disabled:opacity-50" placeholder="Write a Pink Book post" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-white/55">Checked in until {new Date(place.viewerCheckin.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                  <div className="flex items-center gap-3">
                    <button type="button" disabled={mutating || postingCheckin || postingBoard} className="text-xs text-white/65 hover:text-white disabled:opacity-50" onClick={() => void handleCheckout()}>Check out</button>
                    <Button size="sm" disabled={trust.restricted('pink_book') || !message.trim() || postingBoard || postingCheckin || mutating} onClick={() => void handlePostBoard()}>{postingBoard ? 'Posting...' : 'Post to Pink Book'}</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3">
                <p className="mb-3 text-base text-white/70">Check in to read other members' Pink Book posts. Your posts stay until you delete them.</p>
                <textarea disabled={trust.restricted('pink_book')} aria-label="Pink Book post for check-in" className="mb-4 min-h-20 w-full resize-none rounded-md border border-white/10 bg-black/30 p-3 text-base text-white outline-none focus:border-primary/45 disabled:opacity-50" placeholder="Write a Pink Book post (optional)" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} />
                <fieldset className="mb-4 space-y-2">
                  <legend className="text-sm text-white/60">Spot vibes</legend>
                  <div className="flex flex-wrap gap-2">
                    {PLACE_VIBES.map((vibe) => {
                      const selected = checkinVibes.includes(vibe);
                      const selectionFull = checkinVibes.length >= 3 && !selected;
                      return (
                        <button
                          key={vibe}
                          type="button"
                          aria-pressed={selected}
                          disabled={selectionFull}
                          className={`rounded-full border px-3 py-1 text-sm disabled:opacity-35 ${selected ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-white/65'}`}
                          onClick={() => setCheckinVibes((current) => selected ? current.filter((item) => item !== vibe) : [...current, vibe])}
                        >
                          {PLACE_VIBE_LABELS[vibe]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset className="mb-4 space-y-2">
                  <legend className="text-sm text-white/60">Amenities (optional)</legend>
                  <div className="flex flex-wrap gap-2">
                    {PLACE_AMENITIES.map((amenity) => {
                      const selected = checkinAmenities.includes(amenity);
                      return (
                        <button
                          key={amenity}
                          type="button"
                          aria-pressed={selected}
                          className={`rounded-full border px-3 py-1 text-sm ${selected ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-white/65'}`}
                          onClick={() => setCheckinAmenities((current) => selected ? current.filter((item) => item !== amenity) : [...current, amenity])}
                        >
                          {PLACE_AMENITY_LABELS[amenity]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                {/* An ordered scale from one hour to a day, so it slides like
                    distance does rather than opening a menu of five items. */}
                <div className="w-full">
                  <div className="flex items-center justify-between text-sm text-white/60">
                    <span>Check-in expires in</span>
                    <span className="font-semibold text-white" data-testid="checkin-duration-value">
                      {CHECKIN_DURATION_OPTIONS.find((option) => option.value === checkinDurationHours)?.label ?? '1h'}
                    </span>
                  </div>
                  <Slider
                    aria-label="Check-in duration"
                    className="mt-2"
                    data-testid="checkin-duration-slider"
                    max={CHECKIN_DURATION_OPTIONS.length - 1}
                    min={0}
                    step={1}
                    value={[Math.max(0, CHECKIN_DURATION_OPTIONS.findIndex((option) => option.value === checkinDurationHours))]}
                    onValueChange={([index]) => {
                      const option = CHECKIN_DURATION_OPTIONS[index] ?? CHECKIN_DURATION_OPTIONS[0];
                      setCheckinDurationHours(option.value as 1 | 3 | 6 | 12 | 24);
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <fieldset>
                    <legend className="mb-2 text-sm text-white/60">Who can see this check-in?</legend>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Check-in visibility">
                      {([
                        ['hidden', 'Hidden'],
                        ['public', 'Public'],
                        ['checked_in', 'Only people checked in'],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={checkinVisibility === value}
                          className={`rounded-full border px-3 py-1.5 text-sm ${checkinVisibility === value ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-white/65'}`}
                          onClick={() => setCheckinVisibility(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <Button size="sm" className="cruush-action-sheen text-base text-white" style={{ background: 'var(--cruush-gradient)' }} disabled={checkinVibes.length === 0 || (Boolean(message.trim()) && trust.restricted('pink_book')) || postingCheckin || postingBoard || mutating} onClick={handlePostCheckin}>{postingCheckin ? 'Checking in...' : 'Check in'}</Button>
                </div>
              </div>
            )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Card>
            {place.viewerCheckin && messages.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No Pink Book posts yet.</p> : null}
            {messages.map((post) => (
              <UserActivityCapsule
                key={post.id}
                testId={`spot-board-post-${post.id}`}
                className="bg-black/72 hover:bg-black/86"
                heart={<HeartPhoto borderTone={resolveUserBorderTone({ current: currentUserId === post.user.id, mileHigh: post.user.travelling, mutual: post.user.mutual })} className="w-20" label={`${post.user.name} preview`} restriction={getNsfwPhotoRestriction(post.user.photoExplicit, { ...post.user.photoRelationship, isMutualCruush: post.user.mutual, sharesCrowd: post.user.sharesCrowd })}
masked={shouldMaskPhoto(dlModeActive, post.user.photoExplicit, { ...post.user.photoRelationship, isMutualCruush: post.user.mutual, sharesCrowd: post.user.sharesCrowd })} photo={post.user.photo} outOfSight={post.user.outOfSight === true} theme={currentUserId === post.user.id ? 'current' : post.user.mutual ? 'mutual' : 'nearby'} userId={post.user.id} onClick={() => navigate(`/profile/${post.user.id}`)} />}
                name={post.user.name}
                pronouns={post.user.pronouns || 'ask me'}
                identityAdornment={<CruushBadge badges={post.user.badges} compact />}
                metadata={<span className="text-xs text-white/62">{relativeTime(post.createdAt)}</span>}
                sideBadges={post.user.sideBadges}
                sideBadgeTone={resolveUserBorderTone({ current: currentUserId === post.user.id, mileHigh: post.user.travelling, mutual: post.user.mutual })}
                mutual={post.user.mutual}
                onOpenIdentity={() => navigate(`/profile/${post.user.id}`)}
                content={<p className="text-base">{post.content}</p>}
                cornerAction={(
                  <>
                    {post.canDelete ? (
                      <button type="button" aria-label="Delete Pink Book post" disabled={mutating || postingCheckin || postingBoard} className="rounded-md p-1.5 text-white/48 hover:text-white disabled:opacity-50" onClick={() => void mutatePlace((id) => deletePlaceBoardMessage(id, post.id), 'Pink Book post could not be deleted.')}><Trash2 className="h-4 w-4" /></button>
                    ) : (
                      <ReportAction targetType="place_message" targetId={post.id} targetLabel={`Pink Book post by ${post.user.name}`} className="h-8 w-8 text-muted-foreground hover:text-white" onRequestReport={embedded ? () => setReportTarget({ targetType: 'place_message', targetId: post.id, targetLabel: `Pink Book post by ${post.user.name}` }) : undefined} />
                    )}
                  </>
                )}
              />
            ))}
            {boardHasMore ? <div className="flex justify-center"><Button variant="outline" size="sm" disabled={loadingMoreBoard} onClick={() => void handleLoadMoreBoard()}>{loadingMoreBoard ? 'Loading more posts...' : 'Load more posts'}</Button></div> : null}
          </TabsContent>

          <TabsContent value="here" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground text-center py-8">
              {place.activeCheckins} {place.activeCheckins === 1 ? 'person is' : 'people are'} checked in. Profiles only appear when they opt in.
            </p>
            <div className="space-y-3">
              {place.visiblePeople.map((person) => (
                <UserActivityCapsule
                  key={person.id}
                  testId={`spot-here-person-${person.id}`}
                  heart={(
                    <HeartPhoto
                      borderTone={resolveUserBorderTone({ current: currentUserId === person.id, mileHigh: person.travelling, mutual: person.mutual })}
                      className="w-20"
                      label={`${person.name} profile preview`}
                      restriction={getNsfwPhotoRestriction(person.photoExplicit, { ...person.photoRelationship, isMutualCruush: person.mutual, sharesCrowd: person.sharesCrowd })}
                      masked={shouldMaskPhoto(dlModeActive, person.photoExplicit, { ...person.photoRelationship, isMutualCruush: person.mutual, sharesCrowd: person.sharesCrowd })}
                      photo={person.photo}
                      outOfSight={person.outOfSight === true}
                      theme={currentUserId === person.id ? 'current' : person.mutual ? 'mutual' : 'nearby'}
                      userId={person.id}
                    />
                  )}
                  name={person.name}
                  pronouns={person.pronouns || 'ask me'}
                  identityAdornment={<CruushBadge badges={person.badges} compact />}
                  sideBadges={person.sideBadges}
                  sideBadgeTone={resolveUserBorderTone({ current: currentUserId === person.id, mileHigh: person.travelling, mutual: person.mutual })}
                  mutual={person.mutual}
                  onSelect={() => navigate(`/profile/${person.id}`)}
                  selectLabel={`Open ${person.name} profile`}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
        <InAppShareDialog open={shareOpen} onOpenChange={setShareOpen} share={{ kind: 'place', id: place.id, label: place.name }} />
      </div>
    </div>
  );
}
