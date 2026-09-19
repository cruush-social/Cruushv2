import CodeOfConductPage from './CodeOfConductPage';
import { useNavigate } from 'react-router';
import profileNavIcon from '../assets/nav-icons/profile-white.png';
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Accessibility, ArrowLeft, ChevronRight, Contrast, ExternalLink, Gift, History, KeyRound, LifeBuoy, LogOut, Mail, MapPin, MessageCircle, MessageSquareReply, Palette, ShieldAlert, ShieldCheck, Trash2, Type, UserX, Vibrate, X, type LucideIcon, Download,
} from 'lucide-react';
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { CruushIcon, type CruushIconName, type CruushIconVariant } from './CruushIconImage';
import DlModeMark from './DlModeMark';
import PublicPolicyLinks from './PublicPolicyLinks';
import { changeEmail, changePassword, deleteAccount, getAuthSession, sendVerificationEmail, signOut } from '../lib/authApi';
import { canTestOnboarding } from '../lib/adminOnboarding';
import SupportRequestForm from './SupportRequestForm';
import BugButtonSlot from './BugButtonSlot';
import {
  clearCurrentUser,
  getStoredCurrentUser,
  getVerificationPreviewUrl,
  setVerificationPreviewUrl,
} from '../lib/sessionUser';
import cruushLogo from '../assets/brand/cruush-logo.svg';
import cruushHeartIcon from '../assets/ui-icons/cruush-white.png';
import {
  addAccessibilityPreferencesChangedListener,
  COLOR_VISION_MODES,
  getAccessibilityPreferences,
  saveAccessibilityPreferences,
  type AccessibilityPreferences,
  type ColorVisionMode,
} from '../lib/accessibilityPreferences';
import mileHighClubWhite from '../assets/ui-icons/mile-high-club-white.svg';
import {
  addDesktopPageLayoutChangedListener,
  getDesktopPageLayout,
  useCanChoosePopupLayout,
  saveDesktopPageLayout,
  type DesktopPageLayout,
} from '../lib/desktopPageLayoutPreferences';

type SettingsActionItem = {
  icon?: LucideIcon;
  iconName?: CruushIconName;
  iconVariant?: CruushIconVariant;
  iconSrc?: string;
  iconNode?: ReactNode;
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

type SettingsChoiceItem = {
  icon: LucideIcon;
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
};

type SettingsItem = SettingsActionItem | SettingsToggleItem | SettingsChoiceItem;

const COLOR_VISION_LABELS: Record<ColorVisionMode, string> = {
  off: 'Off',
  deuteranomaly: 'Deuteranomaly',
  deuteranopia: 'Deuteranopia',
  protanomaly: 'Protanomaly',
  protanopia: 'Protanopia',
  tritanomaly: 'Tritanomaly',
  tritanopia: 'Tritanopia',
  monochromacy: 'Monochromacy',
};

const editProfileIconStyle: CSSProperties = {
  background: 'var(--cruush-gradient)',
  maskImage: `url(${cruushHeartIcon})`,
  maskPosition: 'center',
  maskRepeat: 'no-repeat',
  maskSize: 'contain',
  WebkitMaskImage: `url(${cruushHeartIcon})`,
  WebkitMaskPosition: 'center',
  WebkitMaskRepeat: 'no-repeat',
  WebkitMaskSize: 'contain',
};

type SettingsProps = {
  embedded?: boolean;
  onBack?: () => void;
  onClose?: () => void;
  onOpenMileHighClub?: () => void;
};

export default function Settings({ embedded = false, onBack, onClose, onOpenMileHighClub }: SettingsProps = {}) {
  const navigate = useNavigate();
  const [showCodeOfConduct, setShowCodeOfConduct] = useState(false);
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
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailPassword, setEmailPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const storedUser = useMemo(() => getStoredCurrentUser(), []);
  const [accessibilityPreferences, setAccessibilityPreferences] = useState(getAccessibilityPreferences);
  const [previewUrl, setPreviewUrlState] = useState(() => getVerificationPreviewUrl());
  const [desktopPageLayout, setDesktopPageLayout] = useState(getDesktopPageLayout);
  const canChooseLayout = useCanChoosePopupLayout();
  const isEmailVerified = Boolean(storedUser?.email_verified_at);
  const moderatorRole = storedUser?.moderator_role ?? null;
  const [onboardingTestEnabled, setOnboardingTestEnabled] = useState(false);

  useEffect(() => {
    if (moderatorRole !== 'admin') return;
    let cancelled = false;
    void getAuthSession().then(session => {
      if (!cancelled) setOnboardingTestEnabled(canTestOnboarding(session.user));
    }).catch(() => { if (!cancelled) setOnboardingTestEnabled(false); });
    return () => { cancelled = true; };
  }, [moderatorRole]);

  useEffect(() => addAccessibilityPreferencesChangedListener(setAccessibilityPreferences), []);
  useEffect(() => addDesktopPageLayoutChangedListener(setDesktopPageLayout), []);

  const updateDesktopPageLayout = (layout: DesktopPageLayout) => {
    setDesktopPageLayout(layout);
    saveDesktopPageLayout(layout);
  };

  const updateAccessibilityPreference = (
    preference: Exclude<keyof AccessibilityPreferences, 'colorVisionMode'>,
    checked: boolean,
  ) => {
    const nextPreferences = {
      ...accessibilityPreferences,
      [preference]: checked,
    };
    setAccessibilityPreferences(nextPreferences);
    saveAccessibilityPreferences(nextPreferences);
  };

  const updateColorVisionMode = (colorVisionMode: ColorVisionMode) => {
    const nextPreferences = {
      ...accessibilityPreferences,
      colorBlindMode: colorVisionMode !== 'off',
      colorVisionMode,
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

  const resetEmailDialog = () => {
    setEmailPassword('');
    setNewEmail('');
    setEmailError(null);
    setEmailNotice(null);
  };

  const handleChangeEmail = async (event: FormEvent) => {
    event.preventDefault();
    setEmailError(null);
    setEmailNotice(null);
    setIsChangingEmail(true);

    try {
      const result = await changeEmail({ currentPassword: emailPassword, newEmail });
      setEmailPassword('');
      setEmailNotice(`Confirm the link sent to ${result.pendingEmail}. Your address changes when you open it.`);
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'Failed to change email.');
    } finally {
      setIsChangingEmail(false);
    }
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

  const [settingsQuery, setSettingsQuery] = useState('');
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
      }, ...(onboardingTestEnabled ? [{
        icon: History,
        label: 'Test onboarding',
        action: () => navigate('/settings/onboarding-test'),
      }] : [])],
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
        { icon: Mail, label: 'Change email', action: () => setIsEmailDialogOpen(true) },
        { icon: KeyRound, label: 'Change password', action: () => setIsPasswordDialogOpen(true) },
        {
          icon: ShieldCheck,
          label: 'Two-factor authentication',
          description: 'Authenticator app and recovery codes.',
          action: () => navigate('/settings/2fa'),
        },
        { iconName: 'notifications' as const, label: 'Notifications', action: () => navigate('/settings/notifications') },
        {
          icon: Download,
          label: 'Install cruush',
          description: 'Add cruush to your Home Screen.',
          action: () => window.dispatchEvent(new Event('cruush:install-requested')),
        },
        { icon: LifeBuoy, label: 'Contact support', action: () => navigate('/support') },
        { icon: ShieldCheck, label: 'Code of Conduct', action: () => embedded ? setShowCodeOfConduct(true) : navigate('/settings/code-of-conduct') },
      ],
    },
    {
      title: 'Privacy',
      items: [
        {
          iconName: 'ghost' as const,
          label: 'Location privacy',
          description: 'Ghost Mode and precise location access for cruushes.',
          action: () => navigate('/privacy/ghost-mode'),
        },
        {
          iconNode: <DlModeMark active={false} className="h-5 w-5 opacity-65" />,
          label: 'DL Mode',
          description: 'Mask explicit message and favorite-image previews with gradients.',
          action: () => navigate('/privacy/dl-mode'),
        },
        {
          icon: MessageCircle,
          label: 'Message permissions',
          description: 'Cruushes is the default. Choose Public, Cruushes, or Crowd.',
          action: () => navigate('/cruush/settings'),
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
          description: 'How long you stay on the map, and how distance reads on your profile.',
          action: () => navigate('/privacy/map-presence'),
        },
        {
          iconSrc: mileHighClubWhite,
          label: 'Mile High Club',
          description: 'Drop a pin where you are visiting and browse from there.',
          action: embedded && onOpenMileHighClub
            ? onOpenMileHighClub
            : () => navigate('/settings/travel'),
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
          icon: Palette,
          label: 'Color vision',
          value: accessibilityPreferences.colorVisionMode,
          options: COLOR_VISION_MODES.map((value) => ({ value, label: COLOR_VISION_LABELS[value] })),
          onValueChange: (value: string) => updateColorVisionMode(value as ColorVisionMode),
        },
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
        {
          icon: Vibrate,
          label: 'Haptic feedback',
          checked: accessibilityPreferences.hapticFeedback,
          onCheckedChange: (checked: boolean) => updateAccessibilityPreference('hapticFeedback', checked),
        },
      ],
    },
  ];

  const normalizedSettingsQuery = settingsQuery.trim().toLowerCase();
  const desktopLayoutMatchesQuery = !normalizedSettingsQuery
    || 'desktop page layout pop-ups full screen'.includes(normalizedSettingsQuery);
  const settingsItemText = (item: SettingsItem) => [
    typeof item.label === 'string' ? item.label : '',
    'description' in item && typeof item.description === 'string' ? item.description : '',
  ].join(' ').toLowerCase();
  const visibleSettingsSections = normalizedSettingsQuery
    ? settingsSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => (
          settingsItemText(item).includes(normalizedSettingsQuery)
          || section.title.toLowerCase().includes(normalizedSettingsQuery)
        )),
      }))
      .filter((section) => section.items.length > 0)
    : settingsSections;

  if (showCodeOfConduct) {
    return <CodeOfConductPage onBack={() => setShowCodeOfConduct(false)} onClose={onClose} />;
  }

  return (
    <div className={embedded ? 'min-h-full bg-transparent pb-6' : 'min-h-screen bg-background pb-20'}>
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={embedded ? (onBack ?? onClose) : () => navigate('/map')} aria-label={embedded ? 'Back' : 'Back to map'}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="flex-1 text-xl">Settings</h2>
        <BugButtonSlot testId="settings-bug-button-slot" />
        {embedded && onClose ? (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close Settings">
            <X className="h-5 w-5" />
          </Button>
        ) : null}
      </header>

      <div className={`max-w-2xl mx-auto space-y-8 ${embedded ? 'p-4' : 'p-6'}`}>
        <div className="px-2">
          <label className="sr-only" htmlFor="settings-search">Search settings</label>
          <Input
            autoComplete="off"
            className="bg-input-background"
            id="settings-search"
            onChange={(event) => setSettingsQuery(event.target.value)}
            placeholder="Search settings"
            type="search"
            value={settingsQuery}
          />
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

        {visibleSettingsSections.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No settings match that search.</p>
        ) : null}

        {desktopLayoutMatchesQuery ? (
          <div className="space-y-2">
            <h3 className="px-2 text-sm text-muted-foreground">Desktop</h3>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-4">
                <span>Page layout</span>
                <div
                  aria-label="Desktop page layout"
                  className="grid grid-cols-2 rounded-full border border-border bg-background/70 p-1"
                  role="radiogroup"
                >
                  {([
                    ['popups', 'Pop-ups'],
                    ['fullscreen', 'Full screen'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      aria-checked={(canChooseLayout ? desktopPageLayout : 'fullscreen') === value}
                      disabled={!canChooseLayout}
                      className={`rounded-full px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        (canChooseLayout ? desktopPageLayout : 'fullscreen') === value
                          ? 'bg-white/10 text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => updateDesktopPageLayout(value)}
                      role="radio"
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {visibleSettingsSections.map((section) => (
          <div key={section.title} className="space-y-2">
            <h3 className="text-sm text-muted-foreground px-2">{section.title}</h3>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {section.items.map((item, index) => {
                const dividerClass = index !== section.items.length - 1 ? 'border-b border-border' : '';

                if ('options' in item) {
                  const Icon = item.icon;
                  const inputId = `accessibility-${item.label.toLowerCase().replace(/\s+/g, '-')}`;

                  return (
                    <Accordion key={`${section.title}-${item.label}`} type="single" collapsible className={dividerClass}>
                      <AccordionItem value={inputId} className="border-0">
                        <AccordionTrigger className="min-h-14 px-4 py-3 hover:no-underline">
                          <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">{item.label}</span>
                            <span className="truncate text-sm text-muted-foreground">{item.options.find((option) => option.value === item.value)?.label ?? item.value}</span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 pt-0">
                          <div aria-label={item.label} className="grid grid-cols-2 gap-2" role="radiogroup">
                            {item.options.map((option) => (
                              <button
                                aria-checked={item.value === option.value}
                                className={`min-h-10 rounded-full border px-3 py-2 text-sm ${item.value === option.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground'}`}
                                key={option.value}
                                onClick={() => item.onValueChange(option.value)}
                                role="radio"
                                type="button"
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  );
                }

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
                    {item.iconNode ? (
                      item.iconNode
                    ) : item.iconSrc ? (
                      <img aria-hidden="true" alt="" className="h-5 w-5" src={item.iconSrc} />
                    ) : item.iconName === 'profile' && item.iconVariant === 'gradient' ? (
                      <img
                        aria-hidden="true"
                        alt=""
                        className="h-5 w-5 brightness-0 invert"
                        data-testid="edit-profile-bottom-nav-icon"
                        data-tone="nav"
                        src={profileNavIcon}
                      />
                    ) : 'iconName' in item ? (
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
              className="cruush-brand-logo mx-auto h-16 w-16 object-contain"
              draggable={false}
              src={cruushLogo}
            />
            <p className="flex flex-col items-center justify-center gap-0.5 whitespace-nowrap text-xs text-muted-foreground">
              <span className="tracking-[0.18em]">OPEN BETA</span>
              <span>Version 1.6</span>
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

      <Dialog
        open={isEmailDialogOpen}
        onOpenChange={(open) => {
          setIsEmailDialogOpen(open);
          if (!open) {
            resetEmailDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change email</DialogTitle>
            <DialogDescription>Your address changes only after you confirm the link sent to the new one.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleChangeEmail}>
            {emailError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {emailError}
              </div>
            ) : null}

            {emailNotice ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                {emailNotice}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="settings-new-email">New email</Label>
              <Input
                autoComplete="email"
                disabled={isChangingEmail}
                id="settings-new-email"
                onChange={(event) => setNewEmail(event.target.value)}
                required
                type="email"
                value={newEmail}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-email-password">Current password</Label>
              <Input
                autoComplete="current-password"
                disabled={isChangingEmail}
                id="settings-email-password"
                onChange={(event) => setEmailPassword(event.target.value)}
                required
                type="password"
                value={emailPassword}
              />
            </div>

            <DialogFooter>
              <Button disabled={isChangingEmail} type="submit">
                {isChangingEmail ? 'Sending...' : 'Send confirmation'}
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
