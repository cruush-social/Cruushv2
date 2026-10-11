import { useNavigate, useLocation } from 'react-router';
import cruushLogo from '../assets/brand/cruush-logo.svg';
import cruushIconColored from '../assets/ui-icons/cruush-colored.png';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import globeIconMask from '../assets/ui-icons/globe-noun-project-7869983.png';
import messagesIconColored from '../assets/ui-icons/messages-colored.png';
import messagesIconWhite from '../assets/ui-icons/messages-white.png';
import humanityProfileIcon from '../assets/ui-icons/humanity-profile-selected-winged-heart-symmetric.png';
import humanityProfileIconGradient from '../assets/ui-icons/humanity-profile-selected-winged-heart-symmetric-gradient.png';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  addDesktopPageLayoutChangedListener,
  getDesktopPageLayout,
  useCanChoosePopupLayout,
} from '../lib/desktopPageLayoutPreferences';
import { getMyCruushActivity } from '../lib/cruushApi';
import { getConversations } from '../lib/messagesApi';
import { getFeedPosts } from '../lib/postApi';
import { useMapServiceArea } from './MapServiceAreaContext';

const CRUUSH_SEEN_AT_KEY = 'cruush.activity.seenAt';
const MUTUAL_FEED_SEEN_AT_KEY = 'feed.mutual.seenAt';

const navItems = [
  { path: '/map', globe: true, label: 'Map' },
  { path: '/feed', icon: cruushIconWhite, activeIcon: cruushIconColored, label: 'Confessional' },
  { path: '/cruush', brand: true, label: 'cruush' },
  { path: '/messages', icon: messagesIconWhite, activeIcon: messagesIconColored, label: 'Messages' },
  { path: '/profile', profile: true, label: 'Profile' },
];

function MapNavIcon({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="block h-12 w-12 shrink-0 max-[360px]:h-10 max-[360px]:w-10"
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
      className={`h-11 w-11 object-contain max-[360px]:h-9 max-[360px]:w-9 ${active ? 'cruush-colored-ui-asset' : ''}`}
      data-testid="bottom-nav-profile-icon"
      data-tone={active ? 'gradient' : 'white'}
      draggable={false}
      src={active ? humanityProfileIconGradient : humanityProfileIcon}
    />
  );
}

function UnreadFlashingNavIcon({
  whiteSrc,
  gradientSrc,
  sizeClassName,
  gradientClassName = '',
}: {
  whiteSrc: string;
  gradientSrc: string;
  sizeClassName: string;
  gradientClassName?: string;
}) {
  return (
    <span aria-hidden="true" className={`relative block shrink-0 ${sizeClassName}`} data-tone="unread-flash">
      <img
        alt=""
        className="cruush-unread-nav-icon-white absolute inset-0 h-full w-full object-contain brightness-0 invert"
        draggable={false}
        src={whiteSrc}
      />
      <img
        alt=""
        className={`cruush-unread-nav-icon-gradient absolute inset-0 h-full w-full object-contain ${gradientClassName}`}
        draggable={false}
        src={gradientSrc}
      />
    </span>
  );
}

export default function BottomNav({
  outsideServiceArea: outsideServiceAreaOverride,
  mapSurface = false,
}: { outsideServiceArea?: boolean; mapSurface?: boolean } = {}) {
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const [dmKeyboardOpen, setDmKeyboardOpen] = useState(() => document.documentElement.dataset.cruushDmKeyboardOpen === 'true');

  useEffect(() => {
    const update = () => setDmKeyboardOpen(document.documentElement.dataset.cruushDmKeyboardOpen === 'true');
    update();
    window.addEventListener('cruush:dm-keyboard-changed', update);
    return () => window.removeEventListener('cruush:dm-keyboard-changed', update);
  }, []);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => document.documentElement.style.setProperty(
      "--cruush-nav-clearance", `${nav.getBoundingClientRect().height}px`
    );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--cruush-nav-clearance");
    };
  }, []);
  const location = useLocation();
  const desktopPageLayoutDevice = useCanChoosePopupLayout();
  const [desktopPageLayout, setDesktopPageLayout] = useState(getDesktopPageLayout);
  const [unreadMessages, setUnreadMessages] = useState(false);
  const [unreadCruushes, setUnreadCruushes] = useState(false);
  const [unreadMutualFeedPosts, setUnreadMutualFeedPosts] = useState(false);
  const [outsideServiceAreaFeedNudge, setOutsideServiceAreaFeedNudge] = useState(false);
  const hasShownOutsideServiceAreaFeedNudge = useRef(false);
  const mapServiceArea = useMapServiceArea();
  const outsideServiceArea = outsideServiceAreaOverride ?? mapServiceArea.outsideServiceArea;
  const visibleNavItems = navItems;
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
  const isChatComposerRoute = location.pathname.startsWith('/chat/') && !location.pathname.endsWith('/settings');
  const desktopSidePanelViews: Record<string, 'feed' | 'activity' | 'messages'> = {
    '/feed': 'feed',
    '/cruush': 'activity',
    '/messages': 'messages',
  };

  useEffect(() => addDesktopPageLayoutChangedListener(setDesktopPageLayout), []);

  // Feed is the useful first stop when a newly signed-in member cannot enter
  // the map. Show the existing unread flash once for this app session, then
  // clear it as soon as they open Feed.
  useEffect(() => {
    if (!outsideServiceArea || hasShownOutsideServiceAreaFeedNudge.current) return;
    hasShownOutsideServiceAreaFeedNudge.current = true;
    setOutsideServiceAreaFeedNudge(true);
  }, [outsideServiceArea]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (location.pathname.startsWith('/cruush')) {
        window.localStorage.setItem(CRUUSH_SEEN_AT_KEY, new Date().toISOString());
      }
      if (location.pathname.startsWith('/feed')) {
        window.localStorage.setItem(MUTUAL_FEED_SEEN_AT_KEY, new Date().toISOString());
      }
      const [messagesResult, cruushResult, feedResult] = await Promise.allSettled([
        getConversations(),
        getMyCruushActivity(),
        getFeedPosts({ within: '7d', limit: 30 }),
      ]);
      if (cancelled) return;
      if (messagesResult.status === 'fulfilled') {
        setUnreadMessages(messagesResult.value.some((thread) => thread.unreadCount > 0));
      }
      if (cruushResult.status === 'fulfilled') {
        const seenAt = Date.parse(window.localStorage.getItem(CRUUSH_SEEN_AT_KEY) ?? '') || 0;
        setUnreadCruushes(!location.pathname.startsWith('/cruush')
          && cruushResult.value.incoming.some((item) => Date.parse(item.createdAt) > seenAt));
        if (feedResult.status === 'fulfilled') {
          const seenAt = Date.parse(window.localStorage.getItem(MUTUAL_FEED_SEEN_AT_KEY) ?? '') || 0;
          const mutualUserIds = new Set(cruushResult.value.mutual.map((item) => item.user.id));
          setUnreadMutualFeedPosts(!location.pathname.startsWith('/feed')
            && feedResult.value.some((post) => mutualUserIds.has(post.user.id) && Date.parse(post.createdAt) > seenAt));
        }
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
    if (path === '/feed') {
      window.localStorage.setItem(MUTUAL_FEED_SEEN_AT_KEY, new Date().toISOString());
      setUnreadMutualFeedPosts(false);
      setOutsideServiceAreaFeedNudge(false);
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
    <nav ref={navRef} style={dmKeyboardOpen ? { visibility: 'hidden' } : undefined} className="pointer-events-none fixed bottom-0 left-0 right-0 z-[60] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
      {!outsideServiceArea && !isMapRoute && !isCruiseCarouselRoute && !mapSurface ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background from-[68%] via-background/96 via-[82%] to-background/0"
          style={isChatComposerRoute ? { height: 'var(--cruush-nav-clearance, calc(6rem + env(safe-area-inset-bottom)))' } : undefined}
        />
      ) : null}
      <div
        data-testid="bottom-nav-pill"
        className="cruush-bottom-nav-pill pointer-events-auto relative z-10 mx-auto flex w-full max-w-[23rem] items-center justify-between rounded-full border border-white/10 bg-[color:var(--cruush-black-glass)] px-1.5 pb-1.5 pt-2 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-[var(--cruush-black-glass-blur)] transition-transform"
        data-capsule-width={368}
      >
        {visibleNavItems.map((item) => {
          const active = isActive(item.path);
          const hasUnread = item.path === '/messages'
            ? unreadMessages
            : item.path === '/cruush'
              ? unreadCruushes
              : item.path === '/feed'
                ? unreadMutualFeedPosts || outsideServiceAreaFeedNudge
              : false;
          const gradientIcon = active || hasUnread;
          return (
            <button
              key={item.path}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              aria-description={hasUnread
                ? item.path === '/messages'
                  ? 'Unread messages'
                  : item.path === '/feed'
                    ? outsideServiceAreaFeedNudge
                      ? 'Open Confessional'
                      : 'New posts from mutual cruushes'
                    : 'New incoming cruushes'
                : undefined}
              data-tutorial-target={item.path === '/feed' ? 'feed' : undefined}
              onClick={() => handleNavClick(item.path)}
              className={`relative flex h-[3.75rem] w-[3.75rem] min-w-0 shrink-0 touch-manipulation items-center justify-center rounded-full bg-transparent transition-colors max-[360px]:h-12 max-[360px]:w-12 ${
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
                hasUnread ? (
                  <UnreadFlashingNavIcon
                    whiteSrc={cruushLogo}
                    gradientSrc={cruushLogo}
                    sizeClassName="h-12 w-12 max-[360px]:h-10 max-[360px]:w-10"
                    gradientClassName="cruush-brand-logo"
                  />
                ) : (
                  <img
                    alt=""
                    aria-hidden="true"
                    className={`h-12 w-12 object-contain max-[360px]:h-10 max-[360px]:w-10 ${gradientIcon ? 'cruush-brand-logo' : 'brightness-0 invert'}`}
                    data-tone={gradientIcon ? 'gradient-white-wordmark' : 'white'}
                    draggable={false}
                    src={cruushLogo}
                  />
                )
              ) : (
                hasUnread ? (
                  <UnreadFlashingNavIcon
                    whiteSrc={item.icon!}
                    gradientSrc={item.activeIcon!}
                    sizeClassName={item.path === '/feed'
                      ? 'h-[4.25rem] w-[4.25rem] max-[360px]:h-[3.4rem] max-[360px]:w-[3.4rem]'
                      : 'h-[3.6rem] w-[3.6rem] max-[360px]:h-[2.9rem] max-[360px]:w-[2.9rem]'}
                    gradientClassName="cruush-colored-ui-asset"
                  />
                ) : (
                  <img
                    alt=""
                    aria-hidden="true"
                    className={item.path === '/feed'
                      ? `h-[4.25rem] w-[4.25rem] max-w-none object-contain max-[360px]:h-[3.4rem] max-[360px]:w-[3.4rem] ${gradientIcon ? 'cruush-colored-ui-asset' : ''}`
                      : `h-[3.6rem] w-[3.6rem] object-contain max-[360px]:h-[2.9rem] max-[360px]:w-[2.9rem] ${gradientIcon ? 'cruush-colored-ui-asset' : ''}`}
                    draggable={false}
                    src={gradientIcon ? item.activeIcon : item.icon}
                  />
                )
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
