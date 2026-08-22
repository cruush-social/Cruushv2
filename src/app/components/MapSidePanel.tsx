import { Suspense, lazy, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import DesktopDockPanel from './DesktopDockPanel';

const LocalFeed = lazy(() => import('./LocalFeed'));
const CruushActivity = lazy(() => import('./CruushActivity'));
const DirectMessages = lazy(() => import('./DirectMessages'));
const PrivateGroupChat = lazy(() => import('./PrivateGroupChat'));

export type MapSidePanelView = 'feed' | 'activity' | 'messages';

export const MAP_SIDE_PANEL_VIEWS: { id: MapSidePanelView; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'activity', label: 'Cruushes' },
  { id: 'messages', label: 'Messages' },
];

type MapSidePanelProps = {
  view: MapSidePanelView;
  /** Opens straight into this person's thread instead of the inbox list. */
  openConversationWithUserId?: string | null;
  onClose: () => void;
};

export default function MapSidePanel({ view, openConversationWithUserId, onClose }: MapSidePanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!openConversationWithUserId) {
      setConversationId(null);
      return;
    }

    let isMounted = true;

    void import('../lib/messagesApi')
      .then(({ openDirectConversation }) => openDirectConversation(openConversationWithUserId))
      .then((conversation) => {
        if (isMounted) {
          setConversationId(conversation.id);
        }
      })
      .catch(() => {
        if (isMounted) {
          setConversationId(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [openConversationWithUserId]);

  return (
    <DesktopDockPanel slot="right" ariaLabel="Side panel">
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-end px-4 pb-2 pt-2">
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
            {view === 'messages' ? (conversationId ? <PrivateGroupChat conversationId={conversationId} /> : <DirectMessages embedded />) : null}
          </Suspense>
        </div>
      </div>
    </DesktopDockPanel>
  );
}
