import { useNavigate, useLocation } from 'react-router';
import { Map, Compass, Heart, MessageCircle, User } from 'lucide-react';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path);

  const navItems = [
    { path: '/map', icon: Map, label: 'Map' },
    { path: '/feed', icon: Compass, label: 'Feed' },
    { path: '/cruush', icon: Heart, label: 'cruush' },
    { path: '/messages', icon: MessageCircle, label: 'Messages' },
    { path: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-background px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
      <div className="relative z-10 mx-auto flex max-w-lg items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-4 py-3 transition-colors ${
                active
                  ? 'bg-white/[0.055] text-primary shadow-[0_0_24px_rgba(255,7,114,0.14)]'
                  : 'text-white/52 hover:bg-white/[0.035] hover:text-white/78'
              }`}
            >
              <Icon className={`h-6 w-6 ${active ? 'drop-shadow-[0_0_10px_rgba(255,7,114,0.55)]' : ''}`} />
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
