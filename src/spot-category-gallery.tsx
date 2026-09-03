/**
 * Development-only sheet of every Spot category with the pin the map draws for
 * it. Rendered from the real MapMarkerPin, so what shows here is what ships;
 * a mocked-up swatch would only prove the mock.
 */

import { createRoot } from 'react-dom/client';
import { MapMarkerPin } from './app/components/MapView';
import { PLACE_FACILITY_SINGULAR_LABELS, PLACE_FACILITY_TYPES } from './app/lib/places';
import type { MapMarker } from './app/lib/mapMarkers';
import './styles/index.css';

function categoryMarker(facilityType: string): MapMarker {
  return {
    id: `category-${facilityType}`,
    displayName: PLACE_FACILITY_SINGULAR_LABELS[facilityType as keyof typeof PLACE_FACILITY_SINGULAR_LABELS] ?? facilityType,
    approximateLatitude: 40.73,
    approximateLongitude: -73.99,
    kind: 'place',
    place: {
      id: `category-${facilityType}`,
      slug: facilityType,
      facilityType,
      activeCheckins: 0,
    },
  } as unknown as MapMarker;
}

function SpotCategoryGallery() {
  return (
    <main className="min-h-screen bg-[#050505] px-5 py-8 text-white">
      <h1 className="text-2xl">Spot categories</h1>
      <p className="mt-1 text-sm text-white/60">{PLACE_FACILITY_TYPES.length} categories, each with the marker the map draws.</p>
      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {PLACE_FACILITY_TYPES.map((facilityType) => (
          <li className="flex flex-col items-center gap-3" key={facilityType}>
            <div className="flex h-16 w-16 items-center justify-center">
              <MapMarkerPin marker={categoryMarker(facilityType)} />
            </div>
            <div className="text-center">
              <p className="text-sm">{PLACE_FACILITY_SINGULAR_LABELS[facilityType]}</p>
              <p className="text-[11px] text-white/40">{facilityType}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<SpotCategoryGallery />);
