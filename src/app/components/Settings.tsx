import { useNavigate } from 'react-router';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  KeyRound,
  LifeBuoy,
  LogOut,
  ShieldAlert,
  Gift,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { CruushIcon, type CruushIconName } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import PublicPolicyLinks from './PublicPolicyLinks';
import { changePassword, deleteAccount, sendVerificationEmail, signOut } from '../lib/authApi';
import SupportRequestForm from './SupportRequestForm';
import { getBlockedUsers, unblockUser, type BlockedUser } from '../lib/blockApi';
import {
  clearCurrentUser,
  getStoredCurrentUser,
  getVerificationPreviewUrl,
  setVerificationPreviewUrl,
} from '../lib/sessionUser';

type SettingsItem = {
  icon?: LucideIcon;
  iconName?: CruushIconName;
  label: ReactNode;
  description?: string;
  action: () => void;
  destructive?: boolean;
};

function formatBlockedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Blocked';
  }

  return `Blocked ${date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

export default function Settings() {
  const navigate = useNavigate();
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
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(true);
  const [blockedUsersError, setBlockedUsersError] = useState<string | null>(null);
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);
  const storedUser = useMemo(() => getStoredCurrentUser(), []);
  const [previewUrl, setPreviewUrlState] = useState(() => getVerificationPreviewUrl());
  const isEmailVerified = Boolean(storedUser?.email_verified_at);
  const displayName = storedUser?.display_name ?? storedUser?.name ?? 'cruush user';
  const age = storedUser?.age ?? null;
  const moderatorRole = storedUser?.moderator_role ?? null;

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

  useEffect(() => {
    let active = true;

    setBlockedUsersLoading(true);
    getBlockedUsers()
      .then((data) => {
        if (!active) {
          return;
        }

        setBlockedUsers(Array.isArray(data.blockedUsers) ? data.blockedUsers : []);
        setBlockedUsersError(null);
      })
      .catch((error) => {
        console.error('Error loading blocked users:', error);
        if (active) {
          setBlockedUsersError('Unable to load blocked users.');
        }
      })
      .finally(() => {
        if (active) {
          setBlockedUsersLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleUnblock = async (blockedUser: BlockedUser) => {
    setUnblockingUserId(blockedUser.userId);

    try {
      await unblockUser(blockedUser.userId);
      setBlockedUsers((currentUsers) => currentUsers.filter((user) => user.userId !== blockedUser.userId));
      toast.success(`${blockedUser.displayName || 'User'} unblocked.`);
    } catch (error) {
      console.error('Error unblocking user:', error);
      toast.error('Unable to unblock this user right now.');
    } finally {
      setUnblockingUserId(null);
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
      }],
    }] : []),
    {
      title: 'Account',
      items: [
        { iconName: 'profile' as const, label: 'Edit Profile', action: () => navigate('/profile/edit') },
        {
          icon: Gift,
          label: <>Rewards & <CruushPlusWord /></>,
          description: 'Streaks, referrals, promotional access, and 2FA.',
          action: () => navigate('/rewards'),
        },
        { icon: KeyRound, label: 'Change password', action: () => setIsPasswordDialogOpen(true) },
        { iconName: 'notifications' as const, label: 'Notifications', action: () => navigate('/settings/notifications') },
        { icon: LifeBuoy, label: 'Contact support', action: () => navigate('/support') },
        { icon: Trash2, label: 'Delete account', action: () => setIsDeleteDialogOpen(true), destructive: true },
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
                const Icon = 'icon' in item ? item.icon : null;
                return (
                  <button
                    key={`${section.title}-${index}`}
                    onClick={item.action}
                    className={`w-full p-4 flex items-center gap-3 hover:bg-accent transition-colors ${
                      item.destructive ? 'text-destructive' : ''
                    } ${
                      index !== section.items.length - 1 ? 'border-b border-border' : ''
                    }`}
                  >
                    {'iconName' in item ? (
                      <CruushIcon name={item.iconName as CruushIconName} className="h-5 w-5 opacity-65" />
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

        <div className="space-y-2">
          <h3 className="text-sm text-muted-foreground px-2">Blocked users</h3>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <div>
              <p>People you have blocked</p>
              <p className="text-sm text-muted-foreground">
                Manage people you no longer want to see or interact with.
              </p>
            </div>

            {blockedUsersLoading ? (
              <div className="rounded-xl border border-border bg-background/50 p-3 text-sm text-muted-foreground">
                Loading blocked users...
              </div>
            ) : null}

            {!blockedUsersLoading && blockedUsersError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {blockedUsersError}
              </div>
            ) : null}

            {!blockedUsersLoading && !blockedUsersError && blockedUsers.length === 0 ? (
              <div className="rounded-xl border border-border bg-background/50 p-3 text-sm text-muted-foreground">
                You have not blocked anyone.
              </div>
            ) : null}

            {!blockedUsersLoading && !blockedUsersError && blockedUsers.map((blockedUser) => (
              <div
                key={blockedUser.userId}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <HeartPhoto
                    className="w-11 shrink-0"
                    label={`${blockedUser.displayName} avatar`}
                    photo={blockedUser.photo}
                    fallback={<CruushIcon name="profile" className="size-4 opacity-75" />}
                  />
                  <div className="min-w-0">
                    <p className="truncate">{blockedUser.displayName || 'cruush user'}</p>
                    <p className="text-xs text-muted-foreground">{formatBlockedDate(blockedUser.createdAt)}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={unblockingUserId === blockedUser.userId}
                  onClick={() => {
                    void handleUnblock(blockedUser);
                  }}
                >
                  {unblockingUserId === blockedUser.userId ? 'Unblocking...' : 'Unblock'}
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <PublicPolicyLinks />
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
