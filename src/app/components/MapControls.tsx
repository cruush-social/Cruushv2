import type { Dispatch, SetStateAction } from 'react';
import { ChevronDown, MapPin, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';
import CruushIconImage from './CruushIconImage';
import PulseLedIcon from './PulseLedIcon';
import type { CruushMapInstance } from '../lib/mapMarkers';
import crowdIconColored from '../assets/ui-icons/crowds-colored.svg';
import seekingIcon from '../assets/ui-icons/seeking-magnifying-glass-8149381.svg';
import visibilityIcon from '../assets/ui-icons/visibility-hidden-234738.svg';
import placesGhostSource from '../assets/ui-icons/places-ghost-source.png';

type MapControlsProps = {
  isMobile: boolean;
  sidePanelView: unknown;
  selectedPlace: unknown;
  selectedUser: unknown;
  setMapControlsHovered: (hovered: boolean) => void;
  activeCrowdNotice: string | null;
  setVisibilityError: (error: string | null) => void;
  setIsVisibilityOpen: (open: boolean) => void;
  mapControlsOpen: boolean;
  setMapControlsOpen: Dispatch<SetStateAction<boolean>>;
  hasActiveFilters: boolean;
  setIsFiltersOpen: (open: boolean) => void;
  hasActiveVisibility: boolean;
  spotFiltersActive: boolean;
  setPlacesOpen: (open: boolean) => void;
  setMapPingSheetOpen: (open: boolean) => void;
  mapPingStatus: { activePing?: unknown } | null;
  handleCenterMyLocation: () => void;
  locationStatus: string;
  mapInstance: CruushMapInstance | null;
};

export default function MapControls({ isMobile, sidePanelView, selectedPlace, selectedUser, setMapControlsHovered, activeCrowdNotice, setVisibilityError, setIsVisibilityOpen, mapControlsOpen, setMapControlsOpen, hasActiveFilters, setIsFiltersOpen, hasActiveVisibility, spotFiltersActive, setPlacesOpen, setMapPingSheetOpen, mapPingStatus, handleCenterMyLocation, locationStatus, mapInstance }: MapControlsProps) {
  return (
        <div
          className={`pointer-events-none [&_button]:pointer-events-auto absolute right-3 top-[4.625rem] z-[900] flex flex-col items-end gap-2 sm:right-4 sm:top-[5.375rem] lg:right-3 lg:top-16 ${isMobile && (sidePanelView || selectedPlace || selectedUser) ? 'hidden' : ''}`}
          data-map-control-hit-layer="true"
          data-testid="map-right-actions"
          onPointerEnter={() => setMapControlsHovered(true)}
          onPointerLeave={() => setMapControlsHovered(false)}
        >
          {activeCrowdNotice ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-2 rounded-full border border-white/15 px-3 text-[11px] uppercase tracking-[0.16em] text-white shadow-[0_12px_35px_rgba(0,0,0,0.25)] backdrop-blur-md transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65"
              style={{ background: 'var(--cruush-gradient)' }}
              onClick={() => {
                setVisibilityError(null);
                setIsVisibilityOpen(true);
              }}
            >
              <CruushIconImage src={crowdIconColored} className="h-4 w-4" />
              {activeCrowdNotice}
            </button>
          ) : null}

          <Button
            type="button"
            aria-controls="map-controls-menu"
            aria-expanded={mapControlsOpen}
            data-testid="map-controls-trigger"
            data-tutorial-target="map-controls"
            className="h-9 rounded-full border border-white/10 bg-background/68 px-4 text-[11px] uppercase tracking-[0.18em] text-white shadow-[0_12px_35px_rgba(0,0,0,0.25)] backdrop-blur-md hover:bg-background"
            onClick={() => setMapControlsOpen((open) => !open)}
          >
            Map Controls <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${mapControlsOpen ? 'rotate-180' : ''}`} />
          </Button>

          {mapControlsOpen ? (
            <div
              id="map-controls-menu"
              className="flex max-h-[calc(100dvh-9rem)] flex-col items-end gap-2 overflow-y-auto px-2 pb-2"
              data-testid="map-controls-menu"
            >
              <Button
                className={`h-8 rounded-full border px-4 text-[11px] uppercase tracking-[0.18em] transition-[filter,border-color,background-color] hover:border-white/30 hover:brightness-125 ${hasActiveFilters ? 'border-white/15 text-white' : 'border-white/10 bg-background/68 text-white hover:bg-white/10'}`}
                style={hasActiveFilters ? { background: 'var(--cruush-gradient)' } : undefined}
                data-testid="map-seeking-button"
                data-tutorial-target="seeking"
                onClick={() => setIsFiltersOpen(true)}
              >
                <CruushIconImage src={seekingIcon} className="mr-2 h-4 w-4 brightness-0 invert" />
                SEEKING
              </Button>
              <Button
                type="button"
                data-testid="map-visibility-button"
                data-tutorial-target="visibility"
                onClick={() => {
                  setVisibilityError(null);
                  setIsVisibilityOpen(true);
                }}
                className={`h-8 rounded-full border px-4 text-[11px] uppercase tracking-[0.18em] text-white transition-[filter,border-color,background-color] hover:border-white/30 hover:brightness-125 has-[>img]:px-3 ${hasActiveVisibility ? 'border-white/15' : 'border-white/10 bg-background/68 hover:bg-white/10'}`}
                style={hasActiveVisibility ? { background: 'var(--cruush-gradient)' } : undefined}
              >
                <CruushIconImage src={visibilityIcon} className="mr-2 h-4 w-4 brightness-0 invert" />
                VISIBILITY
              </Button>
              <Button
                type="button"
                data-testid="map-places-button"
                data-tutorial-target="places"
                aria-pressed={spotFiltersActive}
                onClick={() => {
                  setPlacesOpen(true);
                }}
                className={`h-8 rounded-full border px-4 text-[11px] uppercase tracking-[0.18em] text-white transition-[filter,border-color,background-color] hover:border-white/30 hover:brightness-125 has-[>img]:px-3 ${spotFiltersActive ? 'border-white/15' : 'border-white/10 bg-background/68 hover:bg-white/10'}`}
                style={spotFiltersActive ? { background: 'var(--cruush-gradient)' } : undefined}
              >
                <CruushIconImage src={placesGhostSource} className="mr-2 h-4 w-4 brightness-0 invert" />
                SPOTS
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMapPingSheetOpen(true)}
                data-testid="map-ping-button"
                data-tutorial-target="ping"
                aria-label="Send a Pulse"
                title="Send a Pulse"
                className={`size-11 shrink-0 rounded-full border border-white/10 bg-background text-[#c8ff31] hover:brightness-125 sm:size-12 lg:size-[3.25rem] [&_svg]:!h-full [&_svg]:!w-full ${mapPingStatus?.activePing ? 'shadow-[0_0_0_2px_rgba(200,255,49,0.16)]' : ''}`}
              >
                <PulseLedIcon />
              </Button>
              <div className="flex flex-col gap-2" data-testid="map-zoom-controls">
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={handleCenterMyLocation}
                  disabled={locationStatus === 'locating' || !mapInstance}
                  aria-label={locationStatus === 'locating' ? 'Finding your location' : 'Center your location'}
                  title={locationStatus === 'locating' ? 'Finding your location' : 'Center your location'}
                  className="rounded-full border border-white/10 bg-background/78 text-white backdrop-blur-md hover:bg-white/10"
                >
                  <MapPin className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => mapInstance?.zoomIn()}
                  disabled={!mapInstance}
                  data-tutorial-target="zoom"
                  aria-label="Zoom in on map"
                  title="Zoom in on map"
                  className="rounded-full border border-white/10 bg-background/78 text-white backdrop-blur-md hover:bg-white/10"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => mapInstance?.zoomOut()}
                  disabled={!mapInstance}
                  data-tutorial-target="zoom"
                  aria-label="Zoom out on map"
                  title="Zoom out on map"
                  className="rounded-full border border-white/10 bg-background/78 text-white backdrop-blur-md hover:bg-white/10"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
  );
}
