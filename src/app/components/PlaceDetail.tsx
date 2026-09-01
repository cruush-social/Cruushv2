import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Clock, Copy, ExternalLink, Flag, MapPin, Star, Trash2, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import HeartPhoto from './HeartPhoto';
import CruushBadge from './CruushBadge';
import ReportAction from './ReportAction';
import ReportPage from './ReportPage';
import UserActivityCapsule from './UserActivityCapsule';
import { getStoredUserId } from '../lib/sessionUser';
import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import { PLACE_FACILITY_LABELS, PLACE_TAG_LABELS, getVisibleSpotTags } from '../lib/places';
import {
  checkIntoPlace,
  checkOutOfPlace,
  deletePlaceBoardMessage,
  getPlace,
  getPlaceBoard,
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

function boardExpiryLabel(value: string | null) {
  if (!value) return 'Never';
  const minutes = Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.ceil(hours / 24)}d`;
}

type PlaceDetailProps = {
  embedded?: boolean;
  placeIdOverride?: string;
};

export default function PlaceDetail({ embedded = false, placeIdOverride }: PlaceDetailProps = {}) {
  const { placeId: routePlaceId } = useParams();
  const placeId = placeIdOverride ?? routePlaceId;
  const navigate = useNavigate();
  const [place, setPlace] = useState<PlaceDetailRecord | null>(null);
  const [messages, setMessages] = useState<PlaceBoardMessage[]>([]);
  const [boardHasMore, setBoardHasMore] = useState(false);
  const [loadingMoreBoard, setLoadingMoreBoard] = useState(false);
  const [message, setMessage] = useState('');
  const [checkinDurationHours, setCheckinDurationHours] = useState<1 | 3 | 6 | 12 | 24>(1);
  const [visibleCheckin, setVisibleCheckin] = useState(false);
  const [postingCheckin, setPostingCheckin] = useState(false);
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
      const [placeResult, boardResult] = await Promise.all([
        getPlace(placeId),
        getPlaceBoard(placeId, { limit: BOARD_PAGE_SIZE, offset: 0 }),
      ]);
      if (!isCurrent()) return;
      setPlace(placeResult);
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
    setMessage('');
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

  const popularMaximum = useMemo(() => Math.max(1, ...(place?.popularTimes.map((bucket) => bucket.count) ?? [1])), [place]);
  const combinedRating = useMemo(() => {
    const ratings = place?.ratingBreakdown ?? [];
    const count = ratings.reduce((total, rating) => total + rating.count, 0);
    const weightedStars = ratings.reduce((total, rating) => total + (rating.average ?? 0) * rating.count, 0);
    return { average: count > 0 ? weightedStars / count : null, count };
  }, [place]);

  const handlePostCheckin = () => {
    if (!placeId || place?.id !== placeId || !message.trim() || postingCheckin || mutationRef.current) return;
    const generation = ++checkinGeneration.current;
    const isCurrent = () => generation === checkinGeneration.current && activePlaceId.current === placeId;
    if (!navigator.geolocation) {
      setError('Location is required to post a check-in.');
      return;
    }
    setStatus(null);
    setError(null);
    setPostingCheckin(true);
    navigator.geolocation.getCurrentPosition((position) => {
      if (!isCurrent()) return;
      void checkIntoPlace(placeId, {
        content: message.trim(),
        durationHours: checkinDurationHours,
        visible: visibleCheckin,
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
        setError(postError instanceof Error ? postError.message : 'Check-in could not be posted.');
      }).finally(() => {
        if (isCurrent()) setPostingCheckin(false);
      });
    }, () => {
      if (!isCurrent()) return;
      setPostingCheckin(false);
      setError('Location permission is required to post a check-in.');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
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
      setError(loadError instanceof Error ? loadError.message : 'More board messages could not load.');
    } finally {
      if (isCurrent()) setLoadingMoreBoard(false);
    }
  };

  const mutatePlace = async (
    mutation: (id: string) => Promise<unknown>,
    failureMessage: string,
    successMessage?: string,
  ) => {
    if (!placeId || place?.id !== placeId || mutationRef.current || postingCheckin) return;
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
    return <div className={`flex items-center justify-center bg-background text-white/65 ${embedded ? 'min-h-72' : 'min-h-screen'}`}>Loading spot...</div>;
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
      <div className="space-y-4">{place.ratingBreakdown.map((rating) => (
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
          <Button type="button" variant="ghost" size="icon" autoFocus aria-label="Back to spot board" onClick={() => setRatingOpen(false)}>
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
      {!embedded ? <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">{place.name}</h2>
      </header> : null}

      <div className={`mx-auto space-y-6 p-6 ${embedded ? 'max-w-none' : 'max-w-2xl'}`}>
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.16em] text-primary">{PLACE_FACILITY_LABELS[place.facilityType]}</p>
          <h1 className={`mt-1 text-3xl ${embedded ? 'pr-10' : ''}`}>{place.name}</h1>
          <div className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
            <p className="min-w-0 flex-1"><MapPin className="mr-1 inline h-4 w-4" />{place.address || `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`}</p>
            <button type="button" aria-label="Copy spot address" title="Copy address" className="shrink-0 rounded-md p-1 text-white/55 transition hover:bg-white/10 hover:text-white" onClick={() => void handleCopyAddress()}><Copy className="h-4 w-4" /></button>
          </div>
          {getVisibleSpotTags(place.tags).length ? <div className="mt-3 flex flex-wrap gap-2">{getVisibleSpotTags(place.tags).slice(0, 1).map((tag) => <span key={tag} className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs text-white">{PLACE_TAG_LABELS[tag]}</span>)}</div> : null}
          <button type="button" className="mt-3 inline-flex items-center text-xs text-white/50 hover:text-white" onClick={() => embedded ? setReportTarget({ targetType: 'place', targetId: place.id, targetLabel: place.name }) : navigate('/report', { state: { targetType: 'place', placeId: place.id, targetLabel: place.name } })}><Flag className="mr-1 h-3.5 w-3.5" />Report incorrect or unsafe spot</button>
        </div>

        {place.description ? <p className="text-muted-foreground">{place.description}</p> : null}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-4 text-center">
            <Users className="mx-auto mb-2 h-6 w-6 text-primary" />
            <p className="text-2xl">{place.activeCheckins}</p>
            <p className="text-sm text-muted-foreground">Here now</p>
          </div>
          <button type="button" className="rounded-lg border border-border bg-card p-4 text-center transition hover:border-primary/35 hover:bg-white/[0.055]" aria-label={`Rate this spot. ${place.ratingAverage?.toFixed(1) ?? 'New'} from ${place.ratingCount} ratings`} onClick={() => setRatingOpen(true)}>
            <Star className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl">{place.ratingAverage?.toFixed(1) ?? 'New'}</p>
            <p className="text-sm text-muted-foreground">{place.ratingCount} ratings · Rate this spot</p>
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

        <details className="rounded-xl border border-border bg-card p-4">
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

        {place.sourceUrl ? <a className="inline-flex items-center text-sm text-primary" href={place.sourceUrl} target="_blank" rel="noreferrer">Source{place.sourceAttribution ? `: ${place.sourceAttribution}` : ''}<ExternalLink className="ml-2 h-4 w-4" /></a> : null}

        {status ? <p className="text-sm text-primary">{status}</p> : null}
        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

        <Tabs defaultValue="feed" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="feed">Board</TabsTrigger>
            <TabsTrigger value="here">Who's Here</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="space-y-4 mt-4">
            <div className="rounded-lg border border-border bg-card p-3">
              <textarea aria-label="Leave a spot board message" className="min-h-20 w-full resize-none bg-transparent text-sm text-white outline-none" placeholder="Leave a message for this spot" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-white/60">
                  Duration
                  <select
                    aria-label="Check-in duration"
                    className="rounded-md border border-white/15 bg-black px-2 py-1 text-xs text-white"
                    value={checkinDurationHours}
                    onChange={(event) => setCheckinDurationHours(Number(event.target.value) as 1 | 3 | 6 | 12 | 24)}
                  >
                    {CHECKIN_DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <Checkbox checked={visibleCheckin} onCheckedChange={(checked) => setVisibleCheckin(checked === true)} />
                  Show me in Who's Here
                </label>
                <Button size="sm" disabled={!message.trim() || postingCheckin || mutating} onClick={handlePostCheckin}>{postingCheckin ? 'Posting...' : 'Post check-in'}</Button>
              </div>
              {place.viewerCheckin ? <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3"><p className="text-xs text-white/55">Checked in until {new Date(place.viewerCheckin.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p><button type="button" disabled={mutating || postingCheckin} className="text-xs text-white/65 hover:text-white disabled:opacity-50" onClick={() => void handleCheckout()}>Check out</button></div> : null}
            </div>
            {messages.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No board messages yet.</p> : null}
            {messages.map((post) => (
              <UserActivityCapsule
                key={post.id}
                testId={`spot-board-post-${post.id}`}
                className="bg-black/72 hover:bg-black/86"
                heart={<HeartPhoto className="w-20" label={`${post.user.name} preview`} masked={shouldMaskPhoto(dlModeActive, post.user.photoExplicit)} photo={post.user.photo} theme={currentUserId === post.user.id ? 'current' : post.user.mutual ? 'mutual' : 'nearby'} userId={post.user.id} onClick={() => navigate(`/profile/${post.user.id}`)} />}
                name={post.user.name}
                pronouns={post.user.pronouns || 'Ask me'}
                identityAdornment={<CruushBadge badges={post.user.badges} compact />}
                metadata={<span className="text-xs text-white/62">{relativeTime(post.createdAt)}</span>}
                sideBadges={post.user.sideBadges}
                sideBadgeTone={post.user.travelling ? 'mile-high' : currentUserId === post.user.id ? 'current' : post.user.mutual ? 'mutual' : 'nearby'}
                mutual={post.user.mutual}
                onOpenIdentity={() => navigate(`/profile/${post.user.id}`)}
                content={<p className="text-base">{post.content}</p>}
                cornerAction={(
                  <div className="flex flex-col items-end gap-1">
                    <span className="flex items-center gap-1 text-[11px] text-white/52"><Clock className="h-3 w-3" />{boardExpiryLabel(post.expiresAt)}</span>
                    {post.canDelete ? (
                      <button type="button" aria-label="Delete board post" disabled={mutating || postingCheckin} className="rounded-md p-1.5 text-white/48 hover:text-white disabled:opacity-50" onClick={() => void mutatePlace((id) => deletePlaceBoardMessage(id, post.id), 'Board post could not be deleted.')}><Trash2 className="h-4 w-4" /></button>
                    ) : (
                      <ReportAction targetType="place_message" targetId={post.id} targetLabel={`board post by ${post.user.name}`} className="h-8 w-8 text-muted-foreground hover:text-white" onRequestReport={embedded ? () => setReportTarget({ targetType: 'place_message', targetId: post.id, targetLabel: `board post by ${post.user.name}` }) : undefined} />
                    )}
                  </div>
                )}
              />
            ))}
            {boardHasMore ? <div className="flex justify-center"><Button variant="outline" size="sm" disabled={loadingMoreBoard} onClick={() => void handleLoadMoreBoard()}>{loadingMoreBoard ? 'Loading more messages...' : 'Load more messages'}</Button></div> : null}
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
                      className="w-20"
                      label={`${person.name} profile preview`}
                      masked={shouldMaskPhoto(dlModeActive, person.photoExplicit)}
                      photo={person.photo}
                      theme={currentUserId === person.id ? 'current' : person.mutual ? 'mutual' : 'nearby'}
                      userId={person.id}
                    />
                  )}
                  name={person.name}
                  pronouns={person.pronouns || 'Ask me'}
                  identityAdornment={<CruushBadge badges={person.badges} compact />}
                  sideBadges={person.sideBadges}
                  sideBadgeTone={person.travelling ? 'mile-high' : currentUserId === person.id ? 'current' : person.mutual ? 'mutual' : 'nearby'}
                  mutual={person.mutual}
                  onSelect={() => navigate(`/profile/${person.id}`)}
                  selectLabel={`Open ${person.name} profile`}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
