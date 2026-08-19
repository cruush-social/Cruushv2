import { useNavigate } from 'react-router';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Accessibility, ArrowLeft, BookOpen, ChevronRight, Contrast, ExternalLink, Eye, Gift, History, KeyRound, LifeBuoy, LogOut, MapPin, MessageCircle, MessageSquareReply, ShieldAlert, ShieldCheck, Trash2, Type, UserX, type LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import CruushPlusWord from './CruushPlusWord';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { CruushIcon, type CruushIconName, type CruushIconVariant } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import PublicPolicyLinks from './PublicPolicyLinks';
import { changePassword, deleteAccount, sendVerificationEmail, signOut } from '../lib/authApi';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto } from '../lib/dlMode';
import { addProfileChangedListener, getMyProfile, type ProfileRecord } from '../lib/profileApi';
import SupportRequestForm from './SupportRequestForm';
import {
  clearCurrentUser,
  getStoredCurrentUser,
  getVerificationPreviewUrl,
  setVerificationPreviewUrl,
} from '../lib/sessionUser';
import cruushLogo from '../assets/brand/cruush-logo.svg';
import {
  addAccessibilityPreferencesChangedListener,
  getAccessibilityPreferences,
  saveAccessibilityPreferences,
  type AccessibilityPreferences,
} from '../lib/accessibilityPreferences';
import { saveDistancePreferences, useDistancePreferences } from '../lib/distancePreferences';

type SettingsActionItem = {
  icon?: LucideIcon;
  iconName?: CruushIconName;
  iconVariant?: CruushIconVariant;
  label: ReactNode;
  description?: string;
  action: () => void;
  destructive?: boolean;
};

type SettingsToggleItem = {
  checked: boolean;
  icon: LucideIcon;
  label: string;
  onCheckedChange: (checked: boolean) => void;
};

type SettingsItem = SettingsActionItem | SettingsToggleItem;

export default function Settings() {
  const navigate = useNavigate();
  const distancePreferences = useDistancePreferences();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const storedUser = useMemo(() => getStoredCurrentUser(), []);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const [accessibilityPreferences, setAccessibilityPreferences] = useState(getAccessibilityPreferences);
  const [previewUrl, setPreviewUrlState] = useState(() => getVerificationPreviewUrl());
  const isEmailVerified = Boolean(storedUser?.email_verified_at);
  const displayName = profile?.display_name?.trim() || storedUser?.display_name || storedUser?.name || 'cruush user';
  const age = storedUser?.age ?? null;
  const moderatorRole = storedUser?.moderator_role ?? null;

  useEffect(() => {
    let active = true;

    getMyProfile()
      .then((loadedProfile) => {
        if (active) {
          setProfile(loadedProfile);
        }
      })
      .catch(() => {
        if (active) {
          setProfile(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);
  useEffect(() => addProfileChangedListener(setProfile), []);
  useEffect(() => addDlModeChangedListener(setDlModeActive), []);
  useEffect(() => addAccessibilityPreferencesChangedListener(setAccessibilityPreferences), []);

  const updateAccessibilityPreference = (
    preference: keyof AccessibilityPreferences,
    checked: boolean,
  ) => {
    const nextPreferences = {
      ...accessibilityPreferences,
      [preference]: checked,
    };
    setAccessibilityPreferences(nextPreferences);
    saveAccessibilityPreferences(nextPreferences);
  };

  const resetPasswordDialog = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError(null);
    setPasswordNotice(null);
  };

  const resetDeleteDialog = () => {
    setDeletePassword('');
    setDeleteConfirmation('');
    setDeleteError(null);
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordNotice(null);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setIsChangingPassword(true);

    try {
      await changePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordNotice('Password updated.');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to update password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async (event: FormEvent) => {
    event.preventDefault();
    setDeleteError(null);

    if (deleteConfirmation !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.');
      return;
    }

    setIsDeletingAccount(true);

    try {
      await deleteAccount({
        password: deletePassword,
        confirmation: 'DELETE',
      });
      clearCurrentUser();
      window.location.href = '/';
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete account.');
      setIsDeletingAccount(false);
    }
  };

  const settingsSections: Array<{ title: string; items: SettingsItem[] }> = [
    ...(moderatorRole ? [{
      title: 'Moderation',
      items: [{
        icon: ShieldAlert,
        label: 'Moderator dashboard',
        description: `Signed in as ${moderatorRole}.`,
        action: () => navigate('/admin/moderation'),
      }, {
        icon: MessageSquareReply,
        label: 'Bug reports',
        description: 'Read and reply to support and bug reports.',
        action: () => navigate('/requests'),
      }],
    }] : []),
    {
      title: 'Account',
      items: [
        { iconName: 'profile' as const, iconVariant: 'gradient', label: 'Edit Profile', action: () => navigate('/profile/edit') },
        {
          icon: Gift,
          label: <>Rewards & <CruushPlusWord /></>,
          description: 'Streaks, referrals, and promotional access.',
          action: () => navigate('/rewards'),
        },
        { icon: KeyRound, label: 'Change password', action: () => setIsPasswordDialogOpen(true) },
        {
          icon: ShieldCheck,
          label: 'Two-factor authentication',
          description: 'Authenticator app and recovery codes.',
          action: () => navigate('/settings/2fa'),
        },
        { iconName: 'notifications' as const, label: 'Notifications', action: () => navigate('/settings/notifications') },
        { icon: LifeBuoy, label: 'Contact support', action: () => navigate('/support') },
      ],
    },
    {
      title: 'Privacy',
      items: [
        {
          iconName: 'ghost' as const,
          label: 'Location privacy',
          description: 'Ghost Mode and precise location access for mutual cruushes.',
          action: () => navigate('/privacy/ghost-mode'),
        },
        {
          icon: Eye,
          label: 'DL Mode',
          description: 'Mask explicit message and favorite-image previews with gradients.',
          action: () => navigate('/privacy/dl-mode'),
        },
        {
          icon: MessageCircle,
          label: 'Message permissions',
          description: 'Mutuals is the default. Choose Public, Mutuals, or Crowd.',
          action: () => navigate('/cruush/settings'),
        },
        {
          icon: BookOpen,
          label: 'Tutorial',
          description: 'Review the main cruush defaults and privacy controls.',
          action: () => navigate('/settings/tutorial'),
        },
        {
          icon: History,
          label: 'Changelog',
          description: 'See what is new in cruush.',
          action: () => navigate('/settings/changelog'),
        },
        {
          icon: MapPin,
          label: 'Map presence',
          description: 'How many days you stay on the map after you were last active.',
          action: () => navigate('/privacy/map-presence'),
        },
        {
          icon: MapPin,
          label: 'Approximate distance labels',
          description: distancePreferences.mode === 'approximate' ? 'Showing approximate distances (~0.5 mi)' : 'Showing exact distances (0.4 mi)',
          checked: distancePreferences.mode === 'approximate',
          onCheckedChange: (checked: boolean) => saveDistancePreferences({ mode: checked ? 'approximate' : 'exact' }),
        },
        {
          icon: UserX,
          label: 'Blocked users',
          description: 'Open a dedicated page to review blocks and unblock people.',
          action: () => navigate('/settings/blocked-users'),
        },
      ],
    },
    {
      title: 'Accessibility',
      items: [
        {
          icon: Accessibility,
          label: 'Reduce motion',
          checked: accessibilityPreferences.reduceMotion,
          onCheckedChange: (checked: boolean) => updateAccessibilityPreference('reduceMotion', checked),
        },
        {
          icon: Type,
          label: 'Larger text',
          checked: accessibilityPreferences.largerText,
          onCheckedChange: (checked: boolean) => updateAccessibilityPreference('largerText', checked),
        },
        {
          icon: Contrast,
          label: 'Increase contrast',
          checked: accessibilityPreferences.highContrast,
          onCheckedChange: (checked: boolean) => updateAccessibilityPreference('highContrast', checked),
        },
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
          <HeartPhoto
            className="w-16 shrink-0"
            label={`${displayName} profile photo`}
            masked={shouldMaskPhoto(dlModeActive, profile?.photo_metadata?.[0]?.explicit)}
            photo={profile?.photos?.[0] ?? null}
            theme="current"
            userId={profile?.id ?? storedUser?.id ?? null}
          />
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
                <CruushIcon name="notifications" className="mt-0.5 h-5 w-5" variant="colored" />
              ) : (
                <CruushIcon name="notifications" className="mt-0.5 h-5 w-5 opacity-75" />
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
                const dividerClass = index !== section.items.length - 1 ? 'border-b border-border' : '';

                if ('checked' in item) {
                  const Icon = item.icon;
                  const inputId = `accessibility-${item.label.toLowerCase().replace(/\s+/g, '-')}`;

                  return (
                    <div
                      key={`${section.title}-${item.label}`}
                      className={`flex w-full items-center gap-3 p-4 ${dividerClass}`}
                    >
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <Label className="flex-1" htmlFor={inputId}>{item.label}</Label>
                      <Switch
                        checked={item.checked}
                        id={inputId}
                        onCheckedChange={item.onCheckedChange}
                      />
                    </div>
                  );
                }

                const Icon = item.icon ?? null;
                return (
                  <button
                    key={`${section.title}-${index}`}
                    aria-label={item.destructive && typeof item.label === 'string' ? item.label : undefined}
                    onClick={item.action}
                    className={`w-full p-4 flex items-center gap-3 hover:bg-accent transition-colors ${
                      item.destructive ? 'text-destructive' : ''
                    } ${dividerClass}`}
                  >
                    {'iconName' in item ? (
                      <CruushIcon
                        name={item.iconName as CruushIconName}
                        className={item.iconVariant === 'gradient' ? 'h-5 w-5' : 'h-5 w-5 opacity-65'}
                        variant={item.iconVariant ?? 'white'}
                      />
                    ) : Icon ? (
                      <Icon className={`w-5 h-5 ${item.destructive ? '' : 'text-muted-foreground'}`} />
                    ) : null}
                    <span className="flex-1 text-left">
                      <span className="block">{item.label}</span>
                      {item.description ? (
                        <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
                      ) : null}
                    </span>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <h3 className="text-sm text-muted-foreground px-2">Map attribution</h3>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <div>
              <p>Open map data</p>
              <p className="text-sm text-muted-foreground">
                cruush maps use open map data and tile services. Map data &copy; OpenStreetMap contributors.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <a
                className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4 hover:text-foreground"
                href="https://www.openstreetmap.org/copyright"
                rel="noreferrer"
                target="_blank"
              >
                OpenStreetMap contributors
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4 hover:text-foreground"
                href="https://openfreemap.org/"
                rel="noreferrer"
                target="_blank"
              >
                OpenFreeMap
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4 hover:text-foreground"
                href="https://www.openmaptiles.org/"
                rel="noreferrer"
                target="_blank"
              >
                OpenMapTiles
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4 hover:text-foreground"
                href="https://carto.com/attributions"
                rel="noreferrer"
                target="_blank"
              >
                CARTO
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <PublicPolicyLinks />
        </div>

        <div className="space-y-2">
          <h3 className="px-2 text-sm text-muted-foreground">Account</h3>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <button
              type="button"
              aria-label="Delete account"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="flex w-full items-center gap-3 p-4 text-destructive transition-colors hover:bg-accent"
            >
              <Trash2 className="h-5 w-5" />
              <span className="flex-1 text-left">
                <span className="block">Delete account</span>
                <span className="mt-1 block text-sm text-muted-foreground">Permanently delete your cruush account.</span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="space-y-4" data-testid="settings-release-footer">
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

          <div className="space-y-1 text-center">
            <img
              alt="cruush"
              className="mx-auto h-16 w-16 object-contain"
              draggable={false}
              src={cruushLogo}
            />
            <p className="flex items-center justify-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
              <span>Version 1.4</span>
              <span>OPEN BETA</span>
            </p>
          </div>
        </div>
      </div>

      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={(open) => {
          setIsPasswordDialogOpen(open);
          if (!open) {
            resetPasswordDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Update your password for this account.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleChangePassword}>
            {passwordError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {passwordError}
              </div>
            ) : null}

            {passwordNotice ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                {passwordNotice}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="settings-current-password">Current password</Label>
              <Input
                autoComplete="current-password"
                disabled={isChangingPassword}
                id="settings-current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-new-password">New password</Label>
              <Input
                autoComplete="new-password"
                disabled={isChangingPassword}
                id="settings-new-password"
                minLength={8}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-confirm-new-password">Confirm new password</Label>
              <Input
                autoComplete="new-password"
                disabled={isChangingPassword}
                id="settings-confirm-new-password"
                minLength={8}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                required
                type="password"
                value={confirmNewPassword}
              />
            </div>

            <DialogFooter>
              <Button disabled={isChangingPassword} type="submit">
                {isChangingPassword ? 'Saving...' : 'Save password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) {
            resetDeleteDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and signs you out.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form className="space-y-4" onSubmit={handleDeleteAccount}>
            {deleteError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {deleteError}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="settings-delete-password">Password</Label>
              <Input
                autoComplete="current-password"
                disabled={isDeletingAccount}
                id="settings-delete-password"
                onChange={(event) => setDeletePassword(event.target.value)}
                required
                type="password"
                value={deletePassword}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-delete-confirmation">Type DELETE</Label>
              <Input
                disabled={isDeletingAccount}
                id="settings-delete-confirmation"
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                required
                value={deleteConfirmation}
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingAccount} type="button">
                Cancel
              </AlertDialogCancel>
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isDeletingAccount}
                type="submit"
              >
                {isDeletingAccount ? 'Deleting...' : 'Delete account'}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
