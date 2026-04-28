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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-4 py-3 transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
