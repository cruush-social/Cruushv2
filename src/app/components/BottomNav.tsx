import { useNavigate, useLocation } from 'react-router';
import cruushIconColored from '../assets/nav-icons/cruush-colored.png';
import cruushIconWhite from '../assets/nav-icons/cruush-white.png';
import feedIconColored from '../assets/nav-icons/feed-colored.png';
import feedIconWhite from '../assets/nav-icons/feed-white.png';
import mapIconColored from '../assets/nav-icons/map-colored.png';
import mapIconWhite from '../assets/nav-icons/map-white.png';
import messagesIconColored from '../assets/nav-icons/messages-colored.png';
import messagesIconWhite from '../assets/nav-icons/messages-white.png';
import profileIconColored from '../assets/nav-icons/profile-colored.png';
import profileIconWhite from '../assets/nav-icons/profile-white.png';

const navItems = [
  { path: '/map', icon: mapIconWhite, activeIcon: mapIconColored, label: 'Map' },
  { path: '/feed', icon: feedIconWhite, activeIcon: feedIconColored, label: 'Feed' },
  { path: '/cruush', icon: cruushIconWhite, activeIcon: cruushIconColored, label: 'cruush' },
  { path: '/messages', icon: messagesIconWhite, activeIcon: messagesIconColored, label: 'Messages' },
  { path: '/profile', icon: profileIconWhite, activeIcon: profileIconColored, label: 'Profile' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-background px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
      <div className="relative z-10 mx-auto flex max-w-lg items-center justify-around">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => navigate(item.path)}
              className={`flex h-14 min-w-[64px] items-center justify-center rounded-2xl px-4 transition-colors ${
                active
                  ? 'bg-white/[0.055] text-primary'
                  : 'text-white/52 hover:bg-white/[0.035] hover:text-white/78'
              }`}
            >
              <img
                alt=""
                aria-hidden="true"
                className="h-10 w-10 object-contain"
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
