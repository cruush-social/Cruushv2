import { Suspense, lazy } from 'react';
import { X } from 'lucide-react';
import DesktopDockPanel from './DesktopDockPanel';

const LocalFeed = lazy(() => import('./LocalFeed'));
const CruushActivity = lazy(() => import('./CruushActivity'));
const DirectMessages = lazy(() => import('./DirectMessages'));

export type MapSidePanelView = 'feed' | 'activity' | 'messages';

export const MAP_SIDE_PANEL_VIEWS: { id: MapSidePanelView; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'activity', label: 'Activity' },
  { id: 'messages', label: 'Messages' },
];

type MapSidePanelProps = {
  view: MapSidePanelView;
  onViewChange: (view: MapSidePanelView) => void;
  onClose: () => void;
};

export default function MapSidePanel({ view, onViewChange, onClose }: MapSidePanelProps) {
  return (
    <DesktopDockPanel slot="right" ariaLabel="Side panel">
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-9">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-white/10 bg-background/40 p-1">
            {MAP_SIDE_PANEL_VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                data-testid={`map-side-panel-tab-${option.id}`}
                onClick={() => onViewChange(option.id)}
                className={`min-h-9 flex-1 rounded-full px-3 text-xs uppercase tracking-[0.14em] transition ${
                  view === option.id ? 'text-white' : 'text-white/58 hover:text-white/80'
                }`}
                style={view === option.id ? { background: 'var(--cruush-gradient)' } : undefined}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Close side panel"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-background/55 text-white/80 backdrop-blur-md transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="profile-card-scroll min-h-0 flex-1" data-testid="map-side-panel-content">
          <Suspense fallback={<p className="px-4 py-6 text-sm text-white/62">Loading...</p>}>
            {view === 'feed' ? <LocalFeed embedded /> : null}
            {view === 'activity' ? <CruushActivity embedded /> : null}
            {view === 'messages' ? <DirectMessages embedded /> : null}
          </Suspense>
        </div>
      </div>
    </DesktopDockPanel>
  );
}
