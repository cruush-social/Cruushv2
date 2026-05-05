import { useNavigate } from 'react-router';
import { useMemo, useState } from 'react';
import { ArrowLeft, User, Bell, Shield, HelpCircle, LogOut, ChevronRight, MailCheck, MailWarning, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { sendVerificationEmail, signOut } from '../lib/authApi';
import {
  clearCurrentUser,
  getStoredCurrentUser,
  getVerificationPreviewUrl,
  setVerificationPreviewUrl,
} from '../lib/sessionUser';

export default function Settings() {
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const storedUser = useMemo(() => getStoredCurrentUser(), []);
  const [previewUrl, setPreviewUrlState] = useState(() => getVerificationPreviewUrl());
  const isEmailVerified = Boolean(storedUser?.email_verified_at);
  const displayName = storedUser?.display_name ?? storedUser?.name ?? 'Cruush user';
  const age = storedUser?.age ?? null;

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
              background: 'var(--cruush-gradient)',
            }}
          >
            A
          </div>
          <div className="flex-1">
            <h3 className="text-xl">{displayName}</h3>
            <p className="text-sm text-muted-foreground">{age ? `${age}` : 'Profile in progress'}</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/profile/edit')}>
            Edit
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm text-muted-foreground px-2">Email</h3>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <div className="flex items-start gap-3">
              {isEmailVerified ? (
                <MailCheck className="w-5 h-5 text-emerald-400 mt-0.5" />
              ) : (
                <MailWarning className="w-5 h-5 text-amber-400 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <p>{isEmailVerified ? 'Email verified' : 'Email verification pending'}</p>
                <p className="text-sm text-muted-foreground">
                  {isEmailVerified
                    ? 'Your account is verified.'
                    : 'We send verification after onboarding. You can resend the link from here.'}
                </p>
              </div>
            </div>

            {verificationError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {verificationError}
              </div>
            ) : null}

            {verificationNotice ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                {verificationNotice}
              </div>
            ) : null}

            {!isEmailVerified ? (
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={isResendingVerification}
                  onClick={async () => {
                    setVerificationError(null);
                    setVerificationNotice(null);
                    setIsResendingVerification(true);

                    try {
                      const delivery = await sendVerificationEmail();
                      setVerificationPreviewUrl(delivery.previewUrl);
                      setPreviewUrlState(delivery.previewUrl);
                      setVerificationNotice(
                        delivery.alreadyVerified
                          ? 'This account is already verified.'
                          : 'Verification email sent.',
                      );
                    } catch (error) {
                      setVerificationError(
                        error instanceof Error ? error.message : 'Failed to send verification email.',
                      );
                    } finally {
                      setIsResendingVerification(false);
                    }
                  }}
                >
                  {isResendingVerification ? 'Sending...' : 'Resend email'}
                </Button>

                {previewUrl ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      window.location.href = previewUrl;
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open dev link
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
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
            className="cruush-logo-text text-2xl"
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
