import cruushColored from '../assets/ui-icons/cruush-colored.png';
import cruushWhite from '../assets/ui-icons/cruush-white.png';
import cameraColored from '../assets/ui-icons/camera-colored.png';
import cameraWhite from '../assets/ui-icons/camera-white.png';
import feedColored from '../assets/ui-icons/feed-colored.png';
import feedWhite from '../assets/ui-icons/feed-white.png';
import ghostColored from '../assets/ui-icons/ghost-colored.svg';
import ghostWhite from '../assets/ui-icons/ghost-white.svg';
import luckyColored from '../assets/ui-icons/lucky-colored.png';
import luckyWhite from '../assets/ui-icons/lucky-white.png';
import mapColored from '../assets/ui-icons/map-colored.png';
import mapWhite from '../assets/ui-icons/map-white.png';
import messagesColored from '../assets/ui-icons/messages-colored.png';
import messagesWhite from '../assets/ui-icons/messages-white.png';
import notificationsColored from '../assets/ui-icons/notifications-colored.png';
import notificationsWhite from '../assets/ui-icons/notifications-white.png';
import profileColored from '../assets/ui-icons/profile-colored.png';
import profileWhite from '../assets/ui-icons/profile-white.png';
import safetyColored from '../assets/ui-icons/safety-colored.png';
import safetyWhite from '../assets/ui-icons/safety-white.png';
import sendColored from '../assets/ui-icons/send-colored.png';
import sendWhite from '../assets/ui-icons/send-white.png';
import settingsColored from '../assets/ui-icons/settings-colored.png';
import settingsWhite from '../assets/ui-icons/settings-white.png';
import visibilityColored from '../assets/ui-icons/visibility-colored.png';
import visibilityWhite from '../assets/ui-icons/visibility-white.png';

interface CruushIconImageProps {
  className?: string;
  src: string;
}

export type CruushIconName =
  | 'camera'
  | 'cruush'
  | 'feed'
  | 'ghost'
  | 'lucky'
  | 'map'
  | 'messages'
  | 'notifications'
  | 'profile'
  | 'safety'
  | 'send'
  | 'settings'
  | 'visibility';

export type CruushIconVariant = 'colored' | 'white';

const CRUUSH_ICON_SOURCES: Record<CruushIconName, Record<CruushIconVariant, string>> = {
  camera: {
    colored: cameraColored,
    white: cameraWhite,
  },
  cruush: {
    colored: cruushColored,
    white: cruushWhite,
  },
  feed: {
    colored: feedColored,
    white: feedWhite,
  },
  ghost: {
    colored: ghostColored,
    white: ghostWhite,
  },
  lucky: {
    colored: luckyColored,
    white: luckyWhite,
  },
  map: {
    colored: mapColored,
    white: mapWhite,
  },
  messages: {
    colored: messagesColored,
    white: messagesWhite,
  },
  notifications: {
    colored: notificationsColored,
    white: notificationsWhite,
  },
  profile: {
    colored: profileColored,
    white: profileWhite,
  },
  safety: {
    colored: safetyColored,
    white: safetyWhite,
  },
  send: {
    colored: sendColored,
    white: sendWhite,
  },
  settings: {
    colored: settingsColored,
    white: settingsWhite,
  },
  visibility: {
    colored: visibilityColored,
    white: visibilityWhite,
  },
};

export default function CruushIconImage({ className = 'h-[1.5625rem] w-[1.5625rem]', src }: CruushIconImageProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-contain ${className}`}
      draggable={false}
      src={src}
    />
  );
}

export function CruushIcon({
  className = 'h-[1.5625rem] w-[1.5625rem]',
  name,
  variant = 'white',
}: {
  className?: string;
  name: CruushIconName;
  variant?: CruushIconVariant;
}) {
  return <CruushIconImage className={className} src={CRUUSH_ICON_SOURCES[name][variant]} />;
}
