import type { CSSProperties, ImgHTMLAttributes } from 'react';
import cruushColored from '../assets/ui-icons/cruush-colored.png';
import cruushWhite from '../assets/ui-icons/cruush-white.png';
import cameraColored from '../assets/ui-icons/camera-colored.png';
import cameraWhite from '../assets/ui-icons/camera-white.png';
import crowdHydraWhite from '../assets/ui-icons/crowd-hydra-8441396-white.png';
import feedColored from '../assets/ui-icons/feed-colored.png';
import feedWhite from '../assets/ui-icons/feed-white.png';
import ghostColored from '../assets/ui-icons/ghost-colored.svg';
import ghostStealth from '../assets/ui-icons/ghost-stealth.svg';
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
  /** For a lit state, which a bitmap icon can only carry as a filter. */
  style?: CSSProperties;
}

export type CruushIconName =
  | 'camera'
  | 'cruush'
  | 'crowds'
  | 'feed'
  | 'ghost'
  | 'lucky'
  | 'map'
  | 'messages'
  | 'mutual'
  | 'notifications'
  | 'profile'
  | 'safety'
  | 'send'
  | 'settings'
  | 'visibility';

export type CruushIconVariant = 'colored' | 'white' | 'gradient' | 'stealth';

type CruushIconAssetVariant = Exclude<CruushIconVariant, 'gradient' | 'stealth'>;

const CRUUSH_ICON_SOURCES: Record<CruushIconName, Record<CruushIconAssetVariant, string>> = {
  camera: {
    colored: cameraColored,
    white: cameraWhite,
  },
  cruush: {
    colored: cruushColored,
    white: cruushWhite,
  },
  crowds: {
    colored: crowdHydraWhite,
    white: crowdHydraWhite,
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
  // Mutual is always the approved double-heart. The winged-heart `cruush`
  // asset belongs to Feed and must never be substituted for this state.
  mutual: {
    colored: safetyColored,
    white: safetyWhite,
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

export function GhostColoredIcon({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      {...props}
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-contain ${className ?? ''}`}
      draggable={false}
      src={ghostColored}
    />
  );
}

export default function CruushIconImage({
  className = 'h-[1.5625rem] w-[1.5625rem]',
  src,
  style,
}: CruushIconImageProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-contain ${className}`}
      draggable={false}
      src={src}
      style={style}
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
  if (name === 'ghost' && variant === 'colored') {
    return <GhostColoredIcon className={className} />;
  }

  if (variant === 'stealth') {
    return <CruushIconImage className={className} src={name === 'ghost' ? ghostStealth : CRUUSH_ICON_SOURCES[name].white} />;
  }

  if (variant === 'gradient') {
    const iconMask = CRUUSH_ICON_SOURCES[name].white;
    const style: CSSProperties = {
      background: 'var(--cruush-gradient)',
      maskImage: `url(${iconMask})`,
      maskPosition: 'center',
      maskRepeat: 'no-repeat',
      maskSize: 'contain',
      WebkitMaskImage: `url(${iconMask})`,
      WebkitMaskPosition: 'center',
      WebkitMaskRepeat: 'no-repeat',
      WebkitMaskSize: 'contain',
    };

    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 ${className}`}
        data-tone="gradient"
        style={style}
      />
    );
  }

  return <CruushIconImage className={className} src={CRUUSH_ICON_SOURCES[name][variant]} />;
}
