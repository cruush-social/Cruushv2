import { Suspense, lazy, useEffect, useState } from 'react';
import DesktopDockPanel from './DesktopDockPanel';
import type { TravelPin } from '../lib/privacyApi';

const LocalFeed = lazy(() => import('./LocalFeed'));
const CruushActivity = lazy(() => import('./CruushActivity'));
const DirectMessages = lazy(() => import('./DirectMessages'));
const PrivateGroupChat = lazy(() => import('./PrivateGroupChat'));
const Settings = lazy(() => import('./Settings'));
const TravelModeSettings = lazy(() => import('./TravelModeSettings'));

export type MapSidePanelView = 'feed' | 'activity' | 'messages' | 'settings';

export const MAP_SIDE_PANEL_VIEWS: { id: MapSidePanelView; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'activity', label: 'Cruushes' },
  { id: 'messages', label: 'Messages' },
  { id: 'settings', label: 'Settings' },
];

type MapSidePanelProps = {
  view: MapSidePanelView;
  /** Opens straight into this person's thread instead of the inbox list. */
  openConversationWithUserId?: string | null;
  onOpenSettings?: () => void;
  onBackFromSettings?: () => void;
  openMileHighClub?: boolean;
  onTravelPinChange?: (pin: TravelPin | null) => void;
  onClose: () => void;
};

export default function MapSidePanel({
  view,
  openConversationWithUserId,
  onOpenSettings,
  onBackFromSettings,
  openMileHighClub = false,
  onTravelPinChange,
  onClose,
}: MapSidePanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [settingsDetail, setSettingsDetail] = useState<'mile-high-club' | null>(null);

  useEffect(() => {
    if (view !== 'settings') {
      setSettingsDetail(null);
    }
  }, [view]);

  useEffect(() => {
    if (view === 'settings' && openMileHighClub) {
      setSettingsDetail('mile-high-club');
    }
  }, [openMileHighClub, view]);

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
        <div className="profile-card-scroll min-h-0 flex-1" data-testid="map-side-panel-content">
          <Suspense fallback={<p className="px-4 py-6 text-sm text-white/62">Loading...</p>}>
            {conversationId ? (
              <PrivateGroupChat
                backLabel={view === 'activity' ? 'Back to Cruushes' : 'Back to messages'}
                conversationId={conversationId}
                embedded
                onBack={() => setConversationId(null)}
                onClose={onClose}
              />
            ) : null}
            {!conversationId && view === 'feed' ? <LocalFeed embedded onClose={onClose} onOpenSettings={onOpenSettings} /> : null}
            {!conversationId && view === 'activity' ? <CruushActivity embedded onClose={onClose} onOpenConversation={setConversationId} onOpenSettings={onOpenSettings} /> : null}
            {!conversationId && view === 'settings' && settingsDetail === 'mile-high-club' ? (
              <TravelModeSettings
                embedded
                onBack={() => setSettingsDetail(null)}
                onClose={onClose}
                onTravelPinChange={onTravelPinChange}
              />
            ) : null}
            {!conversationId && view === 'settings' && !settingsDetail ? (
              <Settings
                embedded
                onBack={onBackFromSettings}
                onClose={onClose}
                onOpenMileHighClub={() => setSettingsDetail('mile-high-club')}
              />
            ) : null}
            {!conversationId && view === 'messages' ? (
              <DirectMessages embedded onClose={onClose} onOpenConversation={setConversationId} />
            ) : null}
          </Suspense>
        </div>
      </div>
    </DesktopDockPanel>
  );
}
