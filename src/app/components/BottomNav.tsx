import { type CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router';
import cruushLogo from '../assets/brand/cruush-logo.svg';
import cruushIconColored from '../assets/ui-icons/cruush-colored.png';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import mapIconColored from '../assets/ui-icons/map-colored.png';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import messagesIconColored from '../assets/ui-icons/messages-colored.png';
import messagesIconWhite from '../assets/ui-icons/messages-white.png';
import humanityProfileIcon from '../assets/ui-icons/humanity-profile-selected-winged-heart.png';
import { useIsMobile } from './ui/use-mobile';

const CRUUSH_GRADIENT = 'linear-gradient(135deg, #ff0072 0%, #6f00ff 32%, #004bff 66%, #03ecfc 100%)';

const navItems = [
  { path: '/map', icon: mapIconWhite, activeIcon: mapIconColored, label: 'Map' },
  { path: '/feed', icon: cruushIconWhite, activeIcon: cruushIconColored, label: 'Feed' },
  { path: '/cruush', brand: true, label: 'cruush' },
  { path: '/messages', icon: messagesIconWhite, activeIcon: messagesIconColored, label: 'Messages' },
  { path: '/profile', profile: true, label: 'Profile' },
];

function ProfileNavIcon({ active }: { active: boolean }) {
  if (!active) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className="h-11 w-11 object-contain"
        data-testid="bottom-nav-profile-icon"
        data-tone="white"
        draggable={false}
        src={humanityProfileIcon}
      />
    );
  }

  const maskStyle: CSSProperties = {
    background: CRUUSH_GRADIENT,
    maskImage: `url(${humanityProfileIcon})`,
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
    WebkitMaskImage: `url(${humanityProfileIcon})`,
    WebkitMaskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
  };

  return (
    <span
      aria-hidden="true"
      className="h-11 w-11"
      data-testid="bottom-nav-profile-icon"
      data-tone="gradient"
      style={maskStyle}
    />
  );
}

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const isOwnProfilePanelOpen = Boolean(
    (location.state as { openOwnProfilePanel?: boolean } | null)?.openOwnProfilePanel
  );

  const isActive = (path: string) => {
    if (path === '/profile') {
      return isOwnProfilePanelOpen || location.pathname === path || location.pathname.startsWith(`${path}/`);
    }

    if (path === '/map' && isOwnProfilePanelOpen) {
      return false;
    }

    return location.pathname === path || location.pathname.startsWith(path);
  };
  const isMapRoute = location.pathname === '/map' || location.pathname.startsWith('/map/');
  const handleNavClick = (path: string) => {
    if (path === '/profile' && !isMobile) {
      navigate('/map', {
        state: {
          openOwnProfilePanel: true,
        },
      });
      return;
    }

    navigate(path);
  };

  return (
    <nav className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
      {!isMapRoute ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background from-[68%] via-background/96 via-[82%] to-background/0"
        />
      ) : null}
      <div
        data-testid="bottom-nav-pill"
        className="pointer-events-auto relative z-10 mx-auto flex w-full max-w-[23rem] items-center justify-between rounded-full border border-white/10 bg-background/68 px-1.5 pb-1.5 pt-2 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-md"
      >
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              data-tutorial-target={item.path === '/feed' ? 'feed' : undefined}
              onClick={() => handleNavClick(item.path)}
              className={`flex h-[3.75rem] w-[3.75rem] min-w-0 shrink-0 items-center justify-center rounded-full transition-colors ${
                active
                  ? 'bg-white/[0.10] text-primary hover:bg-white/[0.12]'
                  : 'text-white/52 hover:bg-white/[0.08] hover:text-white/78'
              }`}
            >
              {'profile' in item ? (
                <ProfileNavIcon active={active} />
              ) : 'brand' in item ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className={`h-12 w-12 object-contain ${active ? '' : 'brightness-0 invert'}`}
                  data-tone={active ? 'gradient-white-wordmark' : 'white'}
                  draggable={false}
                  src={cruushLogo}
                />
              ) : (
                <img
                  alt=""
                  aria-hidden="true"
                  className={item.path === '/feed'
                    ? 'h-[4.25rem] w-[4.25rem] max-w-none object-contain'
                    : 'h-[3.6rem] w-[3.6rem] object-contain'}
                  draggable={false}
                  src={active ? item.activeIcon : item.icon}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
