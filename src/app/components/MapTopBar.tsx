import { useLayoutEffect, useRef, useState } from 'react';
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
  outsideServiceArea?: boolean;
};

export default function MapTopBar({ setMapControlsHovered, handleFeelingLucky, navigate, privacySettings, dlModeActive, usesFullPageProfile, sidePanelView, setSidePanelReturnView, setSidePanelView, notificationUnreadCount, outsideServiceArea = false }: MapTopBarProps) {
  const availableWidthRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const capsuleWidth = outsideServiceArea ? 128 : 298;

  useLayoutEffect(() => {
    const frame = availableWidthRef.current;
    if (!frame) return;
    const resize = () => setScale(Math.min(1, frame.clientWidth / capsuleWidth));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [capsuleWidth]);

  return (
          <div ref={availableWidthRef} className="relative min-w-0 flex-1" style={{ height: 70 * scale }}>
            <div
              className="cruush-map-top-actions pointer-events-auto absolute left-1/2 top-0 flex h-[70px] w-[298px] shrink-0 items-center justify-center gap-1 rounded-full border border-white/10 bg-[color:var(--cruush-black-glass)] px-2.5 py-2 backdrop-blur-[var(--cruush-black-glass-blur)]"
              data-capsule-width={capsuleWidth}
              style={{ width: `${capsuleWidth}px`, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}
              data-map-control-hit-layer="true"
              data-testid="map-top-actions"
              onPointerEnter={() => setMapControlsHovered(true)}
              onPointerLeave={() => setMapControlsHovered(false)}
            >
            {!outsideServiceArea ? <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFeelingLucky}
              data-tutorial-target="carousel"
              aria-label="Cruise Carousel"
              title="Cruise Carousel"
              className="size-[3.25rem] rounded-full bg-transparent text-white/90 hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent"
            >
              <CruushIconImage src={luckyIconWhite} className="h-11 w-11 scale-[1.28] object-contain" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/privacy/ghost-mode')}
              data-tutorial-target="ghost"
              aria-label="Ghost Mode Settings"
              title="Ghost Mode Settings"
              className="size-[3.25rem] rounded-full bg-transparent text-white/90 hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent"
            >
              {privacySettings.baseMode === 'STEALTH' ? (
                <DarkRoomMark active className="!h-11 !w-11 text-white" />
              ) : (
                <CruushIcon
                  name="ghost"
                  variant={privacySettings.ghostModeEnabled ? 'colored' : 'white'}
                  // The ghost art carries padding inside its own viewBox, so
                  // at the shared box size it drew smaller than its neighbours.
                  // Scaled to match, the way the lucky and DL Mode marks are.
                  className="h-11 w-11 scale-[1.22] object-contain"
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
              className="size-[3.25rem] overflow-visible rounded-full bg-transparent text-white/90 hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent [&_img]:!overflow-visible"
            >
              {/* The gradient mark is the active state. Hover does not add a circle around it. */}
              <DlModeMark active={dlModeActive} className="!h-11 !w-11 scale-[1.18] overflow-visible" />
            </Button>
            </> : null}
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
                className="size-[3.25rem] rounded-full bg-transparent text-white/90 hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent"
              >
                <CruushIconImage src={settingsIconWhite} className="h-11 w-11 object-contain" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/notifications')}
              data-tutorial-target="notifications"
              aria-label="Notifications"
              title="Notifications"
              className="relative size-[3.25rem] rounded-full bg-transparent text-white/90 hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent"
            >
              <CruushIconImage src={notificationsIconWhite} className="h-11 w-11 scale-[1.28] object-contain" />
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
