import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  clearMyTravelPin,
  getMyTravelPin,
  saveMyTravelPin,
  type TravelPin,
} from '../lib/privacyApi';
import {
  MAP_SERVICE_CENTER,
  MAP_SERVICE_MAX_BOUNDS,
  MAP_SERVICE_RADIUS_MILES,
} from '../lib/mapServiceArea';
import { MAX_DISCOVERY_ZOOM, MIN_DISCOVERY_ZOOM, getMapStyle } from './MapView';
import { Button } from './ui/button';
import { TravelPinGlyph } from './BadgeGlyphs';
import 'maplibre-gl/dist/maplibre-gl.css';

/** What Travel Mode does and does not allow, stated before it is turned on. */
const TRAVEL_MODE_TERMS = [
  'Your pin sits where you drop it, and the map shows you there instead of your device location.',
  'The pin can be moved once every 3 hours, so it cannot be swept across a city.',
  'You can browse, cruush, and message the same as anywhere else.',
  'Pulse is off while you are travelling. A Pulse calls people to a place you are not standing in.',
  'Kelpie Mode is off while you are travelling. A borrowed location and an unseen viewer is not a pair we allow.',
  'Ghost Mode still works, and it fuzzes the travel pin the same way it fuzzes home.',
];

const EARTH_RADIUS_MILES = 3958.7613;
const PICKER_ZOOM = 10.5;

type PickedPoint = {
  latitude: number;
  longitude: number;
};

function milesFromServiceCenter(point: PickedPoint) {
  const latitudeDelta = (point.latitude - MAP_SERVICE_CENTER.latitude) * Math.PI / 180;
  const longitudeDelta = (point.longitude - MAP_SERVICE_CENTER.longitude) * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(MAP_SERVICE_CENTER.latitude * Math.PI / 180)
    * Math.cos(point.latitude * Math.PI / 180)
    * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function isInsideServiceArea(point: PickedPoint) {
  return milesFromServiceCenter(point) <= MAP_SERVICE_RADIUS_MILES;
}

/**
 * Accepts what a phone or a map actually hands you: "40.733572, -74.002742",
 * the same with a space, or with N/S/E/W suffixes.
 */
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

  if (match[2] && match[2].toLowerCase() === 's') {
    latitude = -Math.abs(latitude);
  }

  if (match[4] && match[4].toLowerCase() === 'w') {
    longitude = -Math.abs(longitude);
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

function formatCountdown(untilMs: number, nowMs: number) {
  const remaining = Math.max(0, untilMs - nowMs);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.ceil((remaining % 3_600_000) / 60_000);

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Tap anywhere inside the service area to place the pin. The map is the whole
 * control: there is no free text box for a place, because a pin is a point and
 * a typed place name is not.
 */
function TravelPinPicker({
  onPick,
  point,
}: {
  onPick: (point: PickedPoint) => void;
  point: PickedPoint | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  const markerRef = useRef<{ setLngLat: (position: [number, number]) => void; remove: () => void } | null>(null);
  const onPickRef = useRef(onPick);
  const [mapError, setMapError] = useState('');
  const [coordinateText, setCoordinateText] = useState('');

  onPickRef.current = onPick;

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;

    if (!container) {
      return;
    }

    import('maplibre-gl')
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: getMapStyle(),
          center: [MAP_SERVICE_CENTER.longitude, MAP_SERVICE_CENTER.latitude],
          zoom: PICKER_ZOOM,
          minZoom: MIN_DISCOVERY_ZOOM,
          maxZoom: MAX_DISCOVERY_ZOOM,
          maxBounds: MAP_SERVICE_MAX_BOUNDS,
          renderWorldCopies: false,
          attributionControl: false,
        });

        mapRef.current = map;

        const element = document.createElement('div');
        element.style.height = '18px';
        element.style.width = '18px';
        element.style.borderRadius = '9999px';
        element.style.backgroundColor = '#ffffff';
        element.style.border = '3.2px solid #004BFF';
        const marker = new maplibregl.Marker({ element });
        markerRef.current = marker;

        map.on('click', (event: { lngLat: { lat: number; lng: number } }) => {
          const picked = {
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          };

          if (!isInsideServiceArea(picked)) {
            setMapError(`That is outside the ${MAP_SERVICE_RADIUS_MILES} mile area cruush covers.`);
            return;
          }

          setMapError('');
          marker.setLngLat([picked.longitude, picked.latitude]).addTo(map);
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
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // A location picked outside the map, by the current-location button, still
  // has to show up on it.
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

  return (
    <div className="space-y-2">
      <div
        aria-label="Pick where your travel pin goes"
        className="h-56 w-full overflow-hidden rounded-lg border border-white/10"
        ref={containerRef}
        role="application"
      />
      <input
        aria-label="Paste GPS coordinates"
        className="w-full rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-white/35"
        inputMode="text"
        onChange={(event) => {
          const next = event.target.value;
          setCoordinateText(next);

          if (!next.trim()) {
            setMapError('');
            return;
          }

          const parsed = parseCoordinates(next);

          if (!parsed) {
            setMapError('That is not a coordinate pair. Try 40.733572, -74.002742');
            return;
          }

          if (!isInsideServiceArea(parsed)) {
            setMapError(`That is outside the ${MAP_SERVICE_RADIUS_MILES} mile area cruush covers.`);
            return;
          }

          setMapError('');
          onPickRef.current(parsed);
        }}
        placeholder="Or paste GPS coordinates"
        value={coordinateText}
      />

      {mapError ? <p className="text-sm text-destructive">{mapError}</p> : null}
    </div>
  );
}

function TravelModeSection() {
  const [pin, setPin] = useState<TravelPin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [point, setPoint] = useState<PickedPoint | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
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

  const useCurrentLocation = useCallback(() => {
    setError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const picked = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        if (!isInsideServiceArea(picked)) {
          setError(`You are outside the ${MAP_SERVICE_RADIUS_MILES} mile area cruush covers. Pick a spot on the map instead.`);
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
        setShowTerms(false);
        setShowPicker(false);
        setPoint(null);
        toast.success('Travel Mode is on.');
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
        setShowPicker(false);
        setPoint(null);
        toast.success('Travel Mode is off.');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not turn off Travel Mode.');
      })
      .finally(() => setSaving(false));
  };

  const canMove = pin ? nowMs >= pin.movableAtMs : true;

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="flex min-w-0 items-center gap-2">
        <TravelPinGlyph className="h-5 w-5 shrink-0 text-white" />
        <h2 className="min-w-0 flex-1 text-base text-white">Travel Mode</h2>
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
        ) : (
          <Button
            className="rounded-full"
            disabled={loading || saving}
            onClick={() => setShowTerms((open) => !open)}
            size="sm"
            type="button"
            variant="outline"
          >
            {showTerms ? 'Close' : 'Turn on'}
          </Button>
        )}
      </div>

      {pin ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="text-white">{pin.label || 'Travelling'}</p>
          <p>
            {canMove
              ? 'Your pin can be moved now.'
              : `Your pin can be moved again in ${formatCountdown(pin.movableAtMs, nowMs)}.`}
          </p>
        </div>
      ) : null}

      {!pin && showTerms ? (
        <div className="space-y-3">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {TRAVEL_MODE_TERMS.map((term) => (
              <li className="flex gap-2" key={term}>
                <span aria-hidden="true" className="text-white/40">-</span>
                <span>{term}</span>
              </li>
            ))}
          </ul>

          <TravelPinPicker onPick={setPoint} point={point} />

          <Button
            className="w-full rounded-full"
            onClick={useCurrentLocation}
            type="button"
            variant="outline"
          >
            Use my current location
          </Button>

          <input
            aria-label="Where you are visiting"
            className="w-full rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-white/35"
            maxLength={60}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Where are you visiting?"
            value={label}
          />
          <Button
            className="w-full rounded-full text-white"
            disabled={saving || !point}
            onClick={savePin}
            style={{ background: 'var(--cruush-gradient)' }}
            type="button"
          >
            {saving ? 'Dropping your pin...' : 'Drop my pin here'}
          </Button>
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
        <div className="space-y-3">
          <TravelPinPicker onPick={setPoint} point={point} />

          <Button
            className="w-full rounded-full"
            onClick={useCurrentLocation}
            type="button"
            variant="outline"
          >
            Use my current location
          </Button>

          <Button
            className="w-full rounded-full text-white"
            disabled={saving || !point}
            onClick={savePin}
            style={{ background: 'var(--cruush-gradient)' }}
            type="button"
          >
            {saving ? 'Moving your pin...' : 'Move my pin here'}
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export default function TravelModeSettings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/88 px-4 py-3 backdrop-blur-md">
        <button
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/55"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg text-white">Travel Mode</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
        <TravelModeSection />
      </main>
    </div>
  );
}
