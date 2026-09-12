import type { NavigateFunction } from 'react-router';
import { Button } from './ui/button';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import DarkRoomMark from './DarkRoomMark';
import DlModeMark from './DlModeMark';
import type { PrivacySettings } from '../lib/privacyApi';
import type { MapSidePanelView } from './MapSidePanel';
import luckyIconWhite from '../assets/ui-icons/lucky-white.png';
import notificationsIconWhite from '../assets/ui-icons/notifications-white.png';
import settingsIconWhite from '../assets/ui-icons/settings-white.png';

type MapTopBarProps = {
  setMapControlsHovered: (hovered: boolean) => void;
  handleFeelingLucky: () => void;
  navigate: NavigateFunction;
  privacySettings: PrivacySettings;
  dlModeActive: boolean;
  usesFullPageProfile: boolean;
  sidePanelView: MapSidePanelView | null;
  setSidePanelReturnView: (view: Exclude<MapSidePanelView, 'settings'> | null) => void;
  setSidePanelView: (view: MapSidePanelView | null) => void;
  notificationUnreadCount: number;
};

export default function MapTopBar({ setMapControlsHovered, handleFeelingLucky, navigate, privacySettings, dlModeActive, usesFullPageProfile, sidePanelView, setSidePanelReturnView, setSidePanelView, notificationUnreadCount }: MapTopBarProps) {
  return (
          <div className="flex min-w-0 flex-1 justify-center">
            <div
              className="cruush-map-top-actions pointer-events-auto mt-0 flex w-full min-w-0 max-w-full items-center justify-between sm:w-auto sm:justify-center gap-0.5 rounded-full border border-white/10 bg-background/25 px-1 py-1 backdrop-blur-md transition-[width,margin,transform] max-[430px]:gap-0 max-[430px]:px-0.5 sm:gap-1 sm:px-2.5 sm:py-2"
              data-map-control-hit-layer="true"
              data-testid="map-top-actions"
              onPointerEnter={() => setMapControlsHovered(true)}
              onPointerLeave={() => setMapControlsHovered(false)}
            >
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFeelingLucky}
              data-tutorial-target="carousel"
              aria-label="Cruise Carousel"
              title="Cruise Carousel"
              className="size-11 rounded-full bg-transparent text-white/90 hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent max-[360px]:size-10 sm:size-12 lg:size-[3.25rem]"
            >
              <CruushIconImage src={luckyIconWhite} className="h-10 w-10 scale-[1.28] object-contain max-[360px]:h-9 max-[360px]:w-9 lg:h-11 lg:w-11" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/privacy/ghost-mode')}
              data-tutorial-target="ghost"
              aria-label="Ghost Mode Settings"
              title="Ghost Mode Settings"
              className="size-11 rounded-full bg-transparent text-white/90 hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent max-[360px]:size-10 sm:size-12 lg:size-[3.25rem]"
            >
              {privacySettings.baseMode === 'STEALTH' ? (
                <DarkRoomMark active className="!h-10 !w-10 text-white max-[360px]:!h-9 max-[360px]:!w-9 lg:!h-11 lg:!w-11" />
              ) : (
                <CruushIcon
                  name="ghost"
                  variant={privacySettings.ghostModeEnabled ? 'colored' : 'white'}
                  // The ghost art carries padding inside its own viewBox, so
                  // at the shared box size it drew smaller than its neighbours.
                  // Scaled to match, the way the lucky and DL Mode marks are.
                  className="h-10 w-10 scale-[1.22] object-contain max-[360px]:h-9 max-[360px]:w-9 lg:h-11 lg:w-11"
                />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/privacy/dl-mode')}
              data-tutorial-target="dl-mode"
              aria-label="DL Mode settings"
              title="DL Mode settings"
              className="size-11 overflow-visible rounded-full bg-transparent text-white/90 hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent max-[360px]:size-10 sm:size-12 lg:size-[3.25rem] [&_img]:!overflow-visible"
            >
              {/* The gradient mark is the active state. Hover does not add a circle around it. */}
              <DlModeMark active={dlModeActive} className="!h-10 !w-10 scale-[1.18] overflow-visible max-[360px]:!h-9 max-[360px]:!w-9 lg:!h-11 lg:!w-11" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (usesFullPageProfile) {
                    navigate('/settings');
                    return;
                  }

                  setSidePanelReturnView(sidePanelView && sidePanelView !== 'settings' ? sidePanelView : null);
                  setSidePanelView('settings');
                }}
                aria-label="Settings"
                title="Settings"
                className="size-11 rounded-full bg-transparent text-white/90 hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent max-[360px]:size-10 sm:size-12 lg:size-[3.25rem]"
              >
                <CruushIconImage src={settingsIconWhite} className="h-10 w-10 object-contain max-[360px]:h-9 max-[360px]:w-9 lg:h-11 lg:w-11" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/notifications')}
              data-tutorial-target="notifications"
              aria-label="Notifications"
              title="Notifications"
              className="relative size-11 rounded-full bg-transparent text-white/90 hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent max-[360px]:size-10 sm:size-12 lg:size-[3.25rem]"
            >
              <CruushIconImage src={notificationsIconWhite} className="h-10 w-10 scale-[1.28] object-contain max-[360px]:h-9 max-[360px]:w-9 lg:h-11 lg:w-11" />
              {notificationUnreadCount > 0 ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.62rem] font-semibold leading-none text-primary-foreground">
                  {notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}
                </span>
              ) : null}
            </Button>
            </div>
          </div>
  );
}
