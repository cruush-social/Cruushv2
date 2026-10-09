import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from '../lib/toast';
import {
  clearMyTravelPin,
  geocodeTravelAddress,
  getMyTravelPin,
  saveMyTravelPin,
  type TravelPin,
} from '../lib/privacyApi';
import {
  MAP_SERVICE_CENTER,
  MAP_SERVICE_MAX_BOUNDS,
  isWithinMapServiceArea,
  mapServiceMinZoomForViewport,
} from '../lib/mapServiceArea';
import { MAX_DISCOVERY_ZOOM, MIN_DISCOVERY_ZOOM, getMapStyle } from './MapView';
import { Button } from './ui/button';
import CruushPlusCardDialog from './CruushPlusCardDialog';
import AppPageHeader from './AppPageHeader';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { CRUUSH_PLUS_CHANGED_EVENT, getMyBillingStatus } from '../lib/billingApi';
import 'maplibre-gl/dist/maplibre-gl.css';
import mileHighClubWhite from '../assets/ui-icons/mile-high-club-white.svg';
import { HEART_PIN_PATH, HEART_PIN_THEMES } from '../lib/heartPin';
import { buildCruushPlusStorePath } from '../lib/cruushPlusConversion';

/** What Mile High Club does and does not allow, stated before it is turned on. */
const TRAVEL_MODE_TERMS = [
  'Your pin shows where you drop it instead of your device location, and it can move once every 3 hours.',
  'Browse, cruush, message, and Pulse from your travel pin. Ghost Mode still fuzzes it.',
  'Dark Room is off while you are travelling. A borrowed location and an unseen viewer is the one pair we do not allow.',
];

const PICKER_ZOOM_OFFSET = 0.75;

type PickedPoint = {
  latitude: number;
  longitude: number;
};

function isInsideServiceArea(point: PickedPoint) {
  return isWithinMapServiceArea(point);
}

function parseCoordinates(raw: string): PickedPoint | null {
  const cleaned = raw.trim().replace(/[()]/g, '');
  const match = cleaned.match(
    /^(-?\d+(?:\.\d+)?)\s*([NnSs])?\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*([EeWw])?$/,
  );

  if (!match) {
    return null;
  }

  let latitude = Number(match[1]);
  let longitude = Number(match[3]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (match[2]?.toLowerCase() === 's') {
    latitude = -Math.abs(latitude);
  }

  if (match[4]?.toLowerCase() === 'w') {
    longitude = -Math.abs(longitude);
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

export function formatTravelPinCountdown(untilMs: number, nowMs: number) {
  const totalMinutes = Math.ceil(Math.max(0, untilMs - nowMs) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function TravelPinPicker({
  actions,
  onLabelChange,
  onPick,
  point,
}: {
  actions: ReactNode;
  onLabelChange: (label: string) => void;
  onPick: (point: PickedPoint) => void;
  point: PickedPoint | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ remove: () => void; resize: () => void } | null>(null);
  const markerRef = useRef<{ setLngLat: (position: [number, number]) => void; remove: () => void } | null>(null);
  const onPickRef = useRef(onPick);
  const onLabelChangeRef = useRef(onLabelChange);
  const [mapError, setMapError] = useState('');
  const [locationText, setLocationText] = useState('');
  const [searching, setSearching] = useState(false);

  onPickRef.current = onPick;
  onLabelChangeRef.current = onLabelChange;

  useEffect(() => {
    let cancelled = false;
    let resizeFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    const container = containerRef.current;

    if (!container) {
      return;
    }

    import('maplibre-gl')
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        const minimumZoom = mapServiceMinZoomForViewport(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight,
          MIN_DISCOVERY_ZOOM,
        );
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: getMapStyle(),
          center: [MAP_SERVICE_CENTER.longitude, MAP_SERVICE_CENTER.latitude],
          zoom: minimumZoom + PICKER_ZOOM_OFFSET,
          minZoom: minimumZoom,
          maxZoom: MAX_DISCOVERY_ZOOM,
          maxBounds: MAP_SERVICE_MAX_BOUNDS,
          renderWorldCopies: false,
          attributionControl: false,
        });

        mapRef.current = map;
        const resizeMap = () => {
          window.cancelAnimationFrame(resizeFrame);
          resizeFrame = window.requestAnimationFrame(() => map.resize());
        };
        resizeMap();
        map.once('load', resizeMap);
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(resizeMap);
          resizeObserver.observe(containerRef.current);
        }

        const element = document.createElement('div');
        element.style.height = '38px';
        element.style.width = '38px';
        const heart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        heart.setAttribute('aria-hidden', 'true');
        heart.setAttribute('height', '38');
        heart.setAttribute('viewBox', '0 0 64 64');
        heart.setAttribute('width', '38');
        const heartPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        heartPath.setAttribute('d', HEART_PIN_PATH);
        heartPath.setAttribute('fill', '#05050A');
        heartPath.setAttribute('stroke', HEART_PIN_THEMES.current.border);
        heartPath.setAttribute('stroke-linejoin', 'round');
        heartPath.setAttribute('stroke-width', '5');
        heart.appendChild(heartPath);
        element.appendChild(heart);
        const marker = new maplibregl.Marker({ element, anchor: 'bottom' });
        markerRef.current = marker;

        map.on('click', (event: { lngLat: { lat: number; lng: number } }) => {
          const picked = {
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          };

          if (!isInsideServiceArea(picked)) {
            setMapError('That is outside the cruush service area.');
            return;
          }

          setMapError('');
          marker.setLngLat([picked.longitude, picked.latitude]).addTo(map);
          onLabelChangeRef.current('');
          onPickRef.current(picked);
        });

        map.on('error', () => {
          setMapError('The map could not load. Use your current location instead.');
        });
      })
      .catch(() => {
        if (!cancelled) {
          setMapError('The map could not load. Use your current location instead.');
        }
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!point || !markerRef.current || !mapRef.current) {
      return;
    }

    markerRef.current.setLngLat([point.longitude, point.latitude]);
    (markerRef.current as unknown as { addTo: (map: unknown) => void }).addTo(mapRef.current);
    (mapRef.current as unknown as { easeTo: (options: unknown) => void }).easeTo({
      center: [point.longitude, point.latitude],
    });
  }, [point]);

  const findLocation = async () => {
    const query = locationText.trim();
    if (!query) return;

    const parsed = parseCoordinates(query);
    if (parsed) {
      if (!isInsideServiceArea(parsed)) {
        setMapError('That is outside the cruush service area.');
        return;
      }
      setMapError('');
      onLabelChange(query);
      onPick(parsed);
      return;
    }

    setSearching(true);
    setMapError('');
    try {
      const { result } = await geocodeTravelAddress(query);
      if (!result) {
        setMapError('No address found inside the cruush service area.');
        return;
      }
      setLocationText(result.label);
      onLabelChange(result.label);
      onPick({ latitude: result.latitude, longitude: result.longitude });
    } catch (cause) {
      setMapError(cause instanceof Error ? cause.message : 'Address search is temporarily unavailable.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="cruush-travel-mode-picker flex min-h-0 flex-1 flex-col gap-2">
      <form className="cruush-travel-mode-search flex gap-2" onSubmit={(event) => { event.preventDefault(); void findLocation(); }}>
        <input
          aria-label="Start entering an address or GPS coordinates"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-white/35"
          inputMode="text"
          onChange={(event) => {
            setLocationText(event.target.value);
            setMapError('');
          }}
          placeholder="Address or GPS coordinates"
          value={locationText}
        />
        <Button aria-label="Find address" className="size-10 shrink-0 rounded-full" disabled={searching || !locationText.trim()} size="icon" type="submit" variant="outline">
          <Search className="h-4 w-4" />
        </Button>
      </form>
      {actions}
      {mapError ? <p className="text-sm text-destructive">{mapError}</p> : null}
      <div className="cruush-travel-mode-picker-map relative min-h-0 lg:min-h-64 flex-1 overflow-hidden rounded-lg border border-white/10">
        <div
          aria-label="Pick where your travel pin goes"
          className="h-full min-h-0 w-full lg:min-h-64"
          ref={containerRef}
          role="application"
          style={{ inset: 0, position: 'absolute' }}
        />
        <a className="absolute bottom-1 right-1 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white/70" href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">© OpenStreetMap contributors</a>
      </div>
    </div>
  );
}

function TravelModeSection({ onTravelPinChange }: { onTravelPinChange?: (pin: TravelPin | null) => void }) {
  const navigate = useNavigate();
  const [pin, setPin] = useState<TravelPin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [point, setPoint] = useState<PickedPoint | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [hasCruushPlus, setHasCruushPlus] = useState<boolean | null>(null);
  const [plusCardOpen, setPlusCardOpen] = useState(false);
  const nowMs = Date.now();

  useEffect(() => {
    let active = true;

    getMyTravelPin()
      .then((result) => {
        if (active) {
          setPin(result.pin);
          setLabel(result.pin?.label ?? '');
        }
      })
      .catch(() => {
        if (active) {
          setPin(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadBilling = () => {
      void getMyBillingStatus()
        .then((status) => {
          if (active) setHasCruushPlus(status.cruushPlus === true);
        })
        .catch(() => {
          if (active) setHasCruushPlus(false);
        });
    };

    loadBilling();
    window.addEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadBilling);
    return () => {
      active = false;
      window.removeEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadBilling);
    };
  }, []);

  const useCurrentLocation = useCallback(() => {
    setError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const picked = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        if (!isInsideServiceArea(picked)) {
        setError('You are outside the cruush service area. Pick a spot on the map instead.');
          return;
        }

        setPoint(picked);
      },
      () => {
        setError('cruush could not read your location. Pick a spot on the map instead.');
      },
    );
  }, []);

  const savePin = () => {
    if (!point) {
      setError('Pick where your pin goes first.');
      return;
    }

    setSaving(true);
    setError('');

    saveMyTravelPin({
      latitude: point.latitude,
      longitude: point.longitude,
      label: label.trim(),
    })
      .then((result) => {
        setPin(result.pin);
        onTravelPinChange?.(result.pin);
        setShowTerms(false);
        setShowPicker(false);
        setPoint(null);
        toast.success('Mile High Club is on.');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not drop your travel pin.');
      })
      .finally(() => setSaving(false));
  };

  const turnOff = () => {
    setSaving(true);
    setError('');
    clearMyTravelPin()
      .then(() => {
        setPin(null);
        onTravelPinChange?.(null);
        setShowPicker(false);
        setPoint(null);
        toast.success('Mile High Club is off.');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not turn off Mile High Club.');
      })
      .finally(() => setSaving(false));
  };

  const canMove = pin ? nowMs >= pin.movableAtMs : true;
  const pickerOpen = !pin || Boolean(pin && canMove && showPicker);

  return (
    <>
    <div className={`cruush-travel-mode-section ${pickerOpen ? 'flex min-h-0 flex-1 flex-col' : ''} space-y-3 rounded-lg border border-white/10 bg-white/[0.035] p-3`}>
      <div className="flex min-w-0 items-center gap-2">
        <img
          alt=""
          aria-hidden="true"
          className="h-5 w-5 shrink-0"
          src={mileHighClubWhite}
        />
        <h2 className="min-w-0 flex-1 text-base text-white">Mile High Club</h2>
        {pin ? (
          <Button
            className="rounded-full"
            disabled={saving}
            onClick={turnOff}
            size="sm"
            type="button"
            variant="outline"
          >
            Turn off
          </Button>
        ) : hasCruushPlus === true ? (
          <Button
            className="rounded-full"
            disabled={loading || saving}
            onClick={() => {
              setShowTerms((open) => !open);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {showTerms ? 'Close' : 'Turn on'}
          </Button>
        ) : null}
      </div>

      {pin ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="text-white">{pin.label || 'Mile High Club'}</p>
          <p>
            {canMove
              ? 'Your pin can be moved now.'
              : `Your pin can be moved again in ${formatTravelPinCountdown(pin.movableAtMs, nowMs)}.`}
          </p>
        </div>
      ) : null}

      {!pin ? (
        <div className="cruush-travel-mode-open-panel flex min-h-0 flex-1 flex-col gap-3">
          <Accordion
            collapsible
            type="single"
            value={showTerms ? 'details' : ''}
            onValueChange={(value) => setShowTerms(value === 'details')}
          >
            <AccordionItem value="details">
              <AccordionTrigger className="px-4 py-2 text-sm">How Mile High Club works</AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <ul className="cruush-travel-mode-terms space-y-2 pr-1 text-sm text-muted-foreground">
                  {TRAVEL_MODE_TERMS.map((term) => (
                    <li className="flex gap-2" key={term}>
                      <span aria-hidden="true" className="text-white/40">-</span>
                      <span>{term}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <TravelPinPicker
            actions={(
              <div className="cruush-travel-mode-actions grid grid-cols-2 gap-2">
                <Button className="rounded-full text-[0.7rem] leading-tight sm:text-sm" onClick={useCurrentLocation} type="button" variant="outline">Use my current location</Button>
                {hasCruushPlus !== true ? (
                  <Button className="rounded-full text-[0.7rem] leading-tight text-white sm:text-sm" disabled={loading} onClick={() => setPlusCardOpen(true)} style={{ background: 'var(--cruush-gradient)' }} type="button">Get cruush+</Button>
                ) : (
                  <Button className="rounded-full text-[0.7rem] leading-tight text-white sm:text-sm" disabled={saving || !point} onClick={savePin} style={{ background: 'var(--cruush-gradient)' }} type="button">{saving ? 'Dropping your pin...' : 'Drop my pin here'}</Button>
                )}
              </div>
            )}
            onLabelChange={setLabel}
            onPick={setPoint}
            point={point}
          />
        </div>
      ) : null}

      {pin && canMove && !showPicker ? (
        <Button
          className="w-full rounded-full"
          disabled={saving}
          onClick={() => setShowPicker(true)}
          type="button"
          variant="outline"
        >
          Move my pin
        </Button>
      ) : null}

      {pin && canMove && showPicker ? (
        <div className="cruush-travel-mode-open-panel flex min-h-0 flex-1 flex-col gap-3">
          <TravelPinPicker
            actions={(
              <div className="cruush-travel-mode-actions grid grid-cols-2 gap-2">
                <Button className="rounded-full text-[0.7rem] leading-tight sm:text-sm" onClick={useCurrentLocation} type="button" variant="outline">Use my current location</Button>
                <Button className="rounded-full text-[0.7rem] leading-tight text-white sm:text-sm" disabled={saving || !point} onClick={savePin} style={{ background: 'var(--cruush-gradient)' }} type="button">{saving ? 'Moving your pin...' : 'Move my pin here'}</Button>
              </div>
            )}
            onLabelChange={setLabel}
            onPick={setPoint}
            point={point}
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
    <CruushPlusCardDialog
      open={plusCardOpen}
      onOpenChange={setPlusCardOpen}
      onUpgrade={() => navigate(buildCruushPlusStorePath('mile_high_club', 'mile_high_club'))}
      surface="mile_high_club"
      benefit="mile_high_club"
      title="Mile High Club"
      description="Drop a pin where you are visiting and cruise from there with cruush+."
    />
    </>
  );
}

type TravelModeSettingsProps = {
  embedded?: boolean;
  onBack?: () => void;
  onClose?: () => void;
  onTravelPinChange?: (pin: TravelPin | null) => void;
};

export default function TravelModeSettings({ embedded = false, onBack, onClose, onTravelPinChange }: TravelModeSettingsProps = {}) {
  const navigate = useNavigate();

  return (
    <div className={`cruush-travel-mode-page flex min-h-0 flex-col overflow-hidden bg-background text-foreground ${embedded ? 'h-full' : 'h-[100dvh] pb-[calc(6rem+env(safe-area-inset-bottom))]'}`}>
      <AppPageHeader
        title="Mile High Club"
        onClose={embedded ? onClose : undefined}
        closeLabel="Close Mile High Club"
        onBack={embedded ? onBack : () => navigate(-1)}
        bugButtonTestId="travel-mode-settings-bug-button-slot"
      />

      <main className="cruush-travel-mode-main mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 py-4 lg:overflow-y-auto">
        <TravelModeSection onTravelPinChange={onTravelPinChange} />
      </main>
    </div>
  );
}
