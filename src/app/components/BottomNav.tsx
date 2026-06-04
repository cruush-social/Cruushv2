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

type BottomNavProps = {
  isProfilePreviewOpen?: boolean;
  onProfilePreviewRequest?: () => void;
};

export default function BottomNav({
  isProfilePreviewOpen = false,
  onProfilePreviewRequest,
}: BottomNavProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const isActive = (path: string) => {
    if (path === '/profile' && isProfilePreviewOpen) {
      return true;
    }

    return location.pathname === path || location.pathname.startsWith(path);
  };
  const isMapRoute = location.pathname === '/map' || location.pathname.startsWith('/map/');

  const handleNavClick = (path: string) => {
    if (path === '/profile' && !isMobile && onProfilePreviewRequest) {
      onProfilePreviewRequest();
      return;
    }

    navigate(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
      {!isMapRoute ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background from-[68%] via-background/96 via-[82%] to-background/0"
        />
      ) : null}
      <div
        data-testid="bottom-nav-pill"
        className="relative z-10 mx-auto flex w-full max-w-[23rem] items-center justify-between rounded-full border border-white/10 bg-background/68 px-1.5 pb-1.5 pt-2 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-md lg:ml-auto lg:mr-4"
      >
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => handleNavClick(item.path)}
              className={`flex h-[3.75rem] w-[3.75rem] min-w-0 shrink-0 items-center justify-center rounded-full transition-colors ${
                active
                  ? 'bg-white/[0.10] text-primary hover:bg-white/[0.12]'
                  : 'text-white/52 hover:bg-white/[0.08] hover:text-white/78'
              }`}
            >
              <img
                alt=""
                aria-hidden="true"
                className="h-[3.6rem] w-[3.6rem] object-contain"
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
