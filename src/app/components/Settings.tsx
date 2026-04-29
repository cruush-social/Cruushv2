import { useNavigate } from 'react-router';
import { useState } from 'react';
import { ArrowLeft, User, Bell, Shield, HelpCircle, LogOut, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { signOut } from '../lib/authApi';
import { clearCurrentUser } from '../lib/sessionUser';

export default function Settings() {
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const settingsSections = [
    {
      title: 'Account',
      items: [
        { icon: User, label: 'Edit Profile', action: () => navigate('/profile/edit') },
        { icon: Bell, label: 'Notifications', action: () => {} },
        { icon: Shield, label: 'Privacy & Safety', action: () => navigate('/safety') },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: HelpCircle, label: 'Help & Support', action: () => {} },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Settings</h2>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div className="flex items-center gap-4 p-6 bg-card rounded-2xl border border-border">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
            style={{
              background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
            }}
          >
            A
          </div>
          <div className="flex-1">
            <h3 className="text-xl">Alex</h3>
            <p className="text-sm text-muted-foreground">they/them • 28</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/profile/edit')}>
            Edit
          </Button>
        </div>

        {settingsSections.map((section) => (
          <div key={section.title} className="space-y-2">
            <h3 className="text-sm text-muted-foreground px-2">{section.title}</h3>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {section.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className={`w-full p-4 flex items-center gap-3 hover:bg-accent transition-colors ${
                      index !== section.items.length - 1 ? 'border-b border-border' : ''
                    }`}
                  >
                    <Icon className="w-5 h-5 text-muted-foreground" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <h3 className="text-sm text-muted-foreground px-2">Preferences</h3>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p>Stealth Mode</p>
                <p className="text-sm text-muted-foreground">Hide your presence from others</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p>Show Distance</p>
                <p className="text-sm text-muted-foreground">Display your distance to others</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
          disabled={isSigningOut}
          onClick={async () => {
            setIsSigningOut(true);
            try {
              await signOut();
            } finally {
              clearCurrentUser();
              window.location.href = '/';
            }
          }}
        >
          <LogOut className="w-4 h-4 mr-2" />
          {isSigningOut ? 'Signing Out...' : 'Sign Out'}
        </Button>

        <div className="text-center space-y-2 pt-8">
          <p
            className="text-2xl"
            style={{
              fontFamily: 'UnifrakturMaguntia, serif',
              background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            cruush
          </p>
          <p className="text-xs text-muted-foreground">Version 1.0.0</p>
          <div className="flex justify-center gap-4 text-xs text-muted-foreground">
            <button className="hover:text-foreground">Terms</button>
            <button className="hover:text-foreground">Privacy</button>
            <button className="hover:text-foreground">Support</button>
          </div>
        </div>
      </div>
    </div>
  );
}
