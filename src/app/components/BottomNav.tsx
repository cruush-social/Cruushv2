import { useNavigate, useLocation } from 'react-router';
import cruushLogo from '../assets/brand/cruush-logo.svg';
import cruushIconColored from '../assets/ui-icons/cruush-colored.png';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import globeIconMask from '../assets/ui-icons/globe-noun-project-7869983.png';
import messagesIconColored from '../assets/ui-icons/messages-colored.png';
import messagesIconWhite from '../assets/ui-icons/messages-white.png';
import humanityProfileIcon from '../assets/ui-icons/humanity-profile-selected-winged-heart-symmetric.png';
import humanityProfileIconGradient from '../assets/ui-icons/humanity-profile-selected-winged-heart-symmetric-gradient.png';
import { useEffect, useState } from 'react';
import {
  addDesktopPageLayoutChangedListener,
  getDesktopPageLayout,
  isDesktopPageLayoutDevice,
} from '../lib/desktopPageLayoutPreferences';
import { getMyCruushActivity } from '../lib/cruushApi';
import { getConversations } from '../lib/messagesApi';

const CRUUSH_SEEN_AT_KEY = 'cruush.activity.seenAt';

const navItems = [
  { path: '/map', globe: true, label: 'Map' },
  { path: '/feed', icon: cruushIconWhite, activeIcon: cruushIconColored, label: 'Feed' },
  { path: '/cruush', brand: true, label: 'cruush' },
  { path: '/messages', icon: messagesIconWhite, activeIcon: messagesIconColored, label: 'Messages' },
  { path: '/profile', profile: true, label: 'Profile' },
];

function MapNavIcon({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="block h-12 w-12 shrink-0"
      data-source="Noun Project globe 7869983 by poernomo hasikin"
      data-testid="bottom-nav-map-icon"
      data-tone={active ? 'gradient' : 'white'}
      style={{
        WebkitMaskImage: `url(${globeIconMask})`,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        background: active ? 'var(--cruush-gradient)' : '#ffffff',
        maskImage: `url(${globeIconMask})`,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
      }}
    />
  );
}

function ProfileNavIcon({ active }: { active: boolean }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-11 w-11 object-contain"
      data-testid="bottom-nav-profile-icon"
      data-tone={active ? 'gradient' : 'white'}
      draggable={false}
      src={active ? humanityProfileIconGradient : humanityProfileIcon}
    />
  );
}

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const desktopPageLayoutDevice = isDesktopPageLayoutDevice();
  const [desktopPageLayout, setDesktopPageLayout] = useState(getDesktopPageLayout);
  const [unreadMessages, setUnreadMessages] = useState(false);
  const [unreadCruushes, setUnreadCruushes] = useState(false);
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
  const isCruiseCarouselRoute = location.pathname === '/lucky' || location.pathname.startsWith('/lucky/');
  const desktopSidePanelViews: Record<string, 'feed' | 'activity' | 'messages'> = {
    '/feed': 'feed',
    '/cruush': 'activity',
    '/messages': 'messages',
  };

  useEffect(() => addDesktopPageLayoutChangedListener(setDesktopPageLayout), []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (location.pathname.startsWith('/cruush')) {
        window.localStorage.setItem(CRUUSH_SEEN_AT_KEY, new Date().toISOString());
      }
      const [messagesResult, cruushResult] = await Promise.allSettled([
        getConversations(),
        getMyCruushActivity(),
      ]);
      if (cancelled) return;
      if (messagesResult.status === 'fulfilled') {
        setUnreadMessages(messagesResult.value.some((thread) => thread.unreadCount > 0));
      }
      if (cruushResult.status === 'fulfilled') {
        const seenAt = Date.parse(window.localStorage.getItem(CRUUSH_SEEN_AT_KEY) ?? '') || 0;
        setUnreadCruushes(!location.pathname.startsWith('/cruush')
          && cruushResult.value.incoming.some((item) => Date.parse(item.createdAt) > seenAt));
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [location.pathname]);

  const handleNavClick = (path: string) => {
    if (path === '/cruush') {
      window.localStorage.setItem(CRUUSH_SEEN_AT_KEY, new Date().toISOString());
      setUnreadCruushes(false);
    }
    const sidePanelView = desktopSidePanelViews[path];
    const usesDesktopPopups = desktopPageLayoutDevice && desktopPageLayout === 'popups';

    if (sidePanelView && usesDesktopPopups) {
      navigate('/map', {
        state: {
          openSidePanel: sidePanelView,
        },
      });
      return;
    }

    if (path === '/profile' && usesDesktopPopups) {
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
    <nav className="pointer-events-none fixed bottom-0 left-0 right-0 z-[60] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
      {!isMapRoute && !isCruiseCarouselRoute ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background from-[68%] via-background/96 via-[82%] to-background/0"
        />
      ) : null}
      <div
        data-testid="bottom-nav-pill"
        className="cruush-bottom-nav-pill pointer-events-auto relative z-10 mx-auto flex w-full max-w-[23rem] items-center justify-between rounded-full border border-white/10 bg-background/68 px-1.5 pb-1.5 pt-2 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-md transition-transform"
      >
        {navItems.map((item) => {
          const active = isActive(item.path);
          const hasUnread = item.path === '/messages'
            ? unreadMessages
            : item.path === '/cruush'
              ? unreadCruushes
              : false;
          const gradientIcon = active || hasUnread;
          return (
            <button
              key={item.path}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              aria-description={hasUnread ? (item.path === '/messages' ? 'Unread messages' : 'New incoming cruushes') : undefined}
              data-tutorial-target={item.path === '/feed' ? 'feed' : undefined}
              onClick={() => handleNavClick(item.path)}
              className={`relative flex h-[3.75rem] w-[3.75rem] min-w-0 shrink-0 items-center justify-center rounded-full bg-transparent transition-colors ${
                active
                  ? 'text-primary'
                  : 'text-white/52 hover:text-white/78'
              }`}
            >
              {'globe' in item ? (
                <MapNavIcon active={active} />
              ) : 'profile' in item ? (
                <ProfileNavIcon active={active} />
              ) : 'brand' in item ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className={`h-12 w-12 object-contain ${gradientIcon ? '' : 'brightness-0 invert'}`}
                  data-tone={gradientIcon ? 'gradient-white-wordmark' : 'white'}
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
                  src={gradientIcon ? item.activeIcon : item.icon}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
