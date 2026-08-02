import type { CSSProperties } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import cruushIconColored from '../assets/ui-icons/cruush-colored.png';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import feedIconColored from '../assets/ui-icons/feed-colored.png';
import feedIconWhite from '../assets/ui-icons/feed-white.png';
import mapIconColored from '../assets/ui-icons/map-colored.png';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import messagesIconColored from '../assets/ui-icons/messages-colored.png';
import messagesIconWhite from '../assets/ui-icons/messages-white.png';
import profileIconColored from '../assets/ui-icons/profile-colored.png';
import profileIconWhite from '../assets/ui-icons/profile-white.png';
import { useIsMobile } from './ui/use-mobile';

const navItems = [
  { path: '/map', icon: mapIconWhite, activeIcon: mapIconColored, label: 'Map' },
  { path: '/feed', icon: feedIconWhite, activeIcon: feedIconColored, label: 'Feed' },
  { path: '/cruush', icon: cruushIconWhite, activeIcon: cruushIconColored, label: 'cruush' },
  { path: '/messages', icon: messagesIconWhite, activeIcon: messagesIconColored, label: 'Messages' },
  { path: '/profile', icon: profileIconWhite, activeIcon: profileIconColored, label: 'Profile' },
];

type BottomNavStyle = CSSProperties & {
  '--bottom-nav-active-offset': string;
  '--bottom-nav-indicator-origin': string;
};

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path);
  };
  const isMapRoute = location.pathname === '/map' || location.pathname.startsWith('/map/');
  const navClassName = `pointer-events-none fixed bottom-0 left-0 right-0 z-50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2${isMapRoute ? ' cruush-map-nav' : ''}`;
  const activeIndex = navItems.findIndex((item) => isActive(item.path));
  const hasActiveItem = activeIndex >= 0;
  const activeIndexRef = useRef(Math.max(activeIndex, 0));
  const [previousActiveIndex, setPreviousActiveIndex] = useState(Math.max(activeIndex, 0));
  const [indicatorMotionKey, setIndicatorMotionKey] = useState(0);
  const activeIndicatorIndex = hasActiveItem ? activeIndex : activeIndexRef.current;
  const indicatorDirection = activeIndicatorIndex > previousActiveIndex ? 'forward' : activeIndicatorIndex < previousActiveIndex ? 'backward' : 'still';
  const indicatorDistance = Math.min(Math.abs(activeIndicatorIndex - previousActiveIndex), navItems.length - 1);
  const bottomNavStyle: BottomNavStyle = {
    '--bottom-nav-active-offset': activeIndicatorIndex === 0 ? '0rem' : `calc(${activeIndicatorIndex * 25}% - ${activeIndicatorIndex * 1.125}rem)`,
    '--bottom-nav-indicator-origin': indicatorDirection === 'forward' ? 'left' : indicatorDirection === 'backward' ? 'right' : 'center',
  };

  useLayoutEffect(() => {
    if (!hasActiveItem || activeIndexRef.current === activeIndex) {
      return;
    }

    setPreviousActiveIndex(activeIndexRef.current);
    activeIndexRef.current = activeIndex;
    setIndicatorMotionKey((key) => key + 1);
  }, [activeIndex, hasActiveItem]);

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
    <nav className={navClassName}>
      {!isMapRoute ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background from-[68%] via-background/96 via-[82%] to-background/0"
        />
      ) : null}
      <div
        data-testid="bottom-nav-pill"
        className="cruush-bottom-nav-pill cruush-liquid-glass-dock cruush-glass-bar cruush-glass-menu-toggle pointer-events-auto relative z-10 mx-auto flex w-full max-w-[23rem] items-center justify-between overflow-hidden rounded-full border border-white/10 bg-background/68 px-1.5 pb-1.5 pt-2 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-md"
        style={bottomNavStyle}
      >
        {hasActiveItem ? (
          <span aria-hidden="true" className="cruush-bottom-nav-indicator" data-testid="bottom-nav-indicator">
            <span
              key={indicatorMotionKey}
              className="cruush-bottom-nav-indicator-surface cruush-liquid-glass-current"
              data-direction={indicatorDirection}
              data-distance={indicatorDistance}
            />
          </span>
        ) : null}
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => handleNavClick(item.path)}
              className={`group relative z-10 flex h-[3.75rem] w-[3.75rem] min-w-0 shrink-0 items-center justify-center overflow-hidden rounded-full ${
                active
                  ? 'cruush-bottom-nav-current-page text-white'
                  : 'text-white/52 hover:bg-white/[0.08] hover:text-white/78'
              }`}
            >
              <img
                alt=""
                aria-hidden="true"
                className={`relative z-10 h-[3.6rem] w-[3.6rem] object-contain ${active ? '' : 'transition-transform duration-200 ease-[cubic-bezier(0.5,0,0,1)] group-hover:scale-[1.08]'}`.trim()}
                draggable={false}
                src={active ? item.activeIcon : item.icon}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
