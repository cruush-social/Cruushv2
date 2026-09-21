import { useTrustRestrictions } from '../lib/trustRestrictions';
import TrustRestrictionNotice from './TrustRestrictionNotice';
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import PhotoUploadSpinner from './PhotoUploadSpinner';
import { PHOTO_UPLOAD_ACCEPT, PHOTO_UPLOAD_FORMAT_MESSAGE } from '../lib/photoUploadFormats';
import { CROWDS, ONBOARDING_IDENTITIES, LOOKING_FOR, MAX_PROFILE_SEXUALITIES, POSITIONS, PRONOUNS, ROLES, SEXUALITY, VIBE_GROUPS } from '../lib/profileOptions';
import { ArrowRight, Check, Clipboard, Gift, Share2, ShieldCheck } from 'lucide-react';
import { toast } from '../lib/toast';
import { enablePushNotifications } from '../lib/pushNotifications';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { acceptCodeOfConduct, attachReferralCode, getAuthSession, type AuthSessionPayload } from '../lib/authApi';
import CodeOfConduct from './CodeOfConduct';
import { emptyProfilePayload, emptySideBadges, saveMyProfile, toDefaultKinkInterest, type ProfilePayload, type SideBadges, uploadProfilePhoto } from '../lib/profileApi';
import { ApiClientError } from '../lib/apiClient';
import HeartPhoto from './HeartPhoto';
import SignalBadge from './SignalBadge';
import { HEART_PIN_THEMES } from '../lib/heartPin';
import {
  getPhotoUploadRejectedMessage,
  ProfilePhotoCropper,
  readProfilePhotoPreviewUrl,
  type PendingProfilePhoto,
} from './ProfileEdit';
import { SIGNAL_MAX_LENGTH } from '../lib/profileLimits';
import {
  completeTwoFactorSetup,
  getRewardSummary,
  startTwoFactorSetup,
  type RewardSummary,
  type TwoFactorSetup,
} from '../lib/rewardsApi';
import { clearOnboardingDraft, readOnboardingDraft, writeOnboardingDraft } from '../lib/onboardingDraft';
import { extractReferralCode } from '../lib/referralCode';
import { persistCurrentUser } from '../lib/sessionUser';
import CruushPlusWord from './CruushPlusWord';
import MultiSelect from './MultiSelect';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import cruushLogo from '../assets/brand/cruush-logo.svg';

interface ProfileOnboardingProps {
  onComplete: (session?: AuthSessionPayload, destination?: 'map' | 'rewards', rewardGranted?: boolean) => void;
  needsCodeOfConduct?: boolean;
  codeOfConductVersion?: string;
  constrainedViewport?: boolean;
  previewMode?: boolean;
  /** Renders only the already-signed Code of Conduct, checked and read-only. */
  signedCodeOfConductAt?: string | null;
}

type OnboardingStep =
  | 'name'
  | 'identities'
  | 'crowds'
  | 'lookingFor'
  | 'vibes'
  | 'bio'
  | 'rolePosition'
  | 'oath'
  | 'twoFactor'
  | 'affiliateShare';

const PROFILE_STEPS: OnboardingStep[] = [
  'name',
  'identities',
  'crowds',
  'vibes',
  'bio',
  'rolePosition',
];

const STEP_COPY: Record<OnboardingStep, { rite: string; title: string; detail: string }> = {
  name: {
    rite: 'speak your name',
    title: 'What should the room call you?',
    detail: 'This is the name other members see first.',
  },
  identities: {
    rite: 'name your form',
    title: 'Choose the words that fit.',
    detail: 'Pick up to 3.',
  },
  crowds: {
    rite: 'find your crowd',
    title: 'Choose your crowds.',
    detail: 'Optional. Think of crowds like gay or dyke bars: shared social spaces, not identity labels. Pick up to 3. Find Crowd Mode in Map Controls > Visibility. Turn it on to be seen only by people in your selected crowds. Choosing crowds here does not turn it on.',
  },
  lookingFor: {
    rite: 'declare your hunger',
    title: 'What are you seeking tonight?',
    detail: 'Pick up to 3.',
  },
  vibes: {
    rite: 'reveal your aura',
    title: 'Set the signal around you.',
    detail: 'Optional. Pick up to 3.',
  },
  bio: {
    rite: 'leave your confession',
    title: 'Give them a reason to look twice.',
    detail: 'Optional. Keep it real, specific, and safe.',
  },
  rolePosition: {
    rite: 'name your role',
    title: 'Choose your role and position.',
    detail: 'These become your default left and right badges.',
  },
  oath: {
    rite: 'take the oath',
    title: 'Before the map opens.',
    detail: 'Every member agrees to the cruush code of conduct.',
  },
  twoFactor: {
    rite: 'protect your key',
    title: 'Set up 2FA?',
    detail: 'Optional. New accounts can receive one free day of cruush+ when 2FA is enabled.',
  },
  affiliateShare: {
    rite: 'summon your circle',
    title: 'Share your affiliate link.',
    detail: 'Optional. Send it to trusted contacts before you enter the map.',
  },
};

function limitToThree(values: string[]) {
  const seen = new Set<string>();
  const nextValues: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]?.trim();

    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    nextValues.unshift(value);
  }

  return nextValues.slice(-3);
}

const ONBOARDING_FIELD_LABELS: Record<string, string> = {
  display_name: 'Display name',
  photos: 'Profile photo',
  bio: 'Bio',
  signal: 'Signal',
  pronouns: 'Pronouns',
  identities: 'Gender Identity',
  crowds: 'Crowds',
  looking_for: 'Looking for',
  vibes: 'Vibes',
};

function getOnboardingSaveError(error: unknown) {
  if (error instanceof ApiClientError && error.code === 'VALIDATION_ERROR') {
    const fieldErrors = (error.details as { fieldErrors?: Record<string, unknown> } | null)?.fieldErrors;
    const firstInvalidField = fieldErrors
      ? Object.entries(fieldErrors).find(([, messages]) => Array.isArray(messages) && messages.length > 0)
      : null;

    if (firstInvalidField) {
      const [field] = firstInvalidField;
      if (field === 'signal') {
        return `Signal must be ${SIGNAL_MAX_LENGTH} characters or fewer.`;
      }

      const label = ONBOARDING_FIELD_LABELS[field] ?? field.replaceAll('_', ' ');
      return `${label.charAt(0).toUpperCase()}${label.slice(1)} needs attention before your profile can be saved.`;
    }
  }

  return error instanceof Error ? error.message : 'Failed to save profile.';
}

type OnboardingProfileState = {
  name: string;
  bio: string;
  signal: string;
  identities: string[];
  pronouns: string[];
  lookingFor: string[];
  vibes: string[];
  photos: string[];
  gender_presentation: string[];
  ethnicity: string[];
  body_type: string[];
  height: string;
  weight: string;
  position: string[];
  role: string[];
  is_trans: boolean | null;
  trans_status_visibility: ProfilePayload['trans_status_visibility'];
  crowds: string[];
  availability: string[];
  hosting_travel: string[];
  preferred_spots: string[];
  kinks: string[];
  kinks_visibility: ProfilePayload['kinks_visibility'];
  scenes: string[];
  archetypes: string[];
  hobbies: string[];
  hiv_status: string[];
  hiv_status_visibility: ProfilePayload['hiv_status_visibility'];
  condoms: string[];
  prep: string[];
  doxypep: string[];
  covid_vaccine: string[];
  mpox_vaccine: string[];
  birth_control: string[];
  substance_boundaries: string[];
  protection_boundaries: string[];
  custom_pronouns: string;
  custom_hobby: string;
  custom_hiv_status: string;
  custom_condoms: string;
  custom_prep: string;
  custom_doxypep: string;
  custom_covid_vaccine: string;
  custom_mpox_vaccine: string;
  sexuality: string[];
  sideBadges: SideBadges;
};

export default function ProfileOnboarding({
  onComplete,
  needsCodeOfConduct = false,
  codeOfConductVersion = '',
  constrainedViewport = false,
  previewMode = false,
  signedCodeOfConductAt = null,
}: ProfileOnboardingProps) {
  const trust = useTrustRestrictions(!previewMode);
  // Minimal onboarding steps, but state includes all schema fields for upsert
  const steps: OnboardingStep[] = signedCodeOfConductAt
    ? ['oath']
    : needsCodeOfConduct
    ? [...PROFILE_STEPS, 'twoFactor', 'affiliateShare', 'oath']
    : [...PROFILE_STEPS, 'twoFactor', 'affiliateShare'];
  // A preview renders the flow for inspection, so it never reads or writes the
  // real draft.
  const restoredDraft = previewMode ? null : readOnboardingDraft<OnboardingProfileState>();
  const [step, setStep] = useState(() => {
    const savedStep = Math.min(Math.max(restoredDraft?.step ?? 0, 0), steps.length - 1);
    if (!restoredDraft) return savedStep;
    // Older drafts could pass Identity without the required answers. Return
    // to the first missing field without discarding the draft.
    const saved = restoredDraft.profile;
    if (!(typeof saved.name === 'string' && saved.name.trim().length > 1)) return 0;
    if (savedStep > 1 && (!saved.identities?.length || !saved.sexuality?.length)) return 1;
    return savedStep;
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<OnboardingProfileState>({
    name: '',
    bio: '',
    signal: '',
    identities: [],
    pronouns: [],
    lookingFor: [],
    vibes: [],
    photos: [],
    gender_presentation: [],
    ethnicity: [],
    body_type: [],
    height: '',
    weight: '',
    position: [],
    role: [],
    is_trans: false,
    trans_status_visibility: 'mutual_cruushes',
    crowds: [],
    availability: [],
    hosting_travel: [],
    preferred_spots: [],
    kinks: [],
    kinks_visibility: 'public',
    scenes: [],
    archetypes: [],
    hobbies: [],
    hiv_status: [],
    hiv_status_visibility: 'mutual_cruushes',
    condoms: [],
    prep: [],
    doxypep: [],
    covid_vaccine: [],
    mpox_vaccine: [],
    birth_control: [],
    substance_boundaries: [],
    protection_boundaries: [],
    custom_pronouns: '',
    custom_hobby: '',
    custom_hiv_status: '',
    custom_condoms: '',
    custom_prep: '',
    custom_doxypep: '',
    custom_covid_vaccine: '',
    custom_mpox_vaccine: '',
    sexuality: [],
    sideBadges: emptySideBadges,
    ...(restoredDraft?.profile ?? {}),
  });
  const [oathAccepted, setOathAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<PendingProfilePhoto | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [photoUploadNotice, setPhotoUploadNotice] = useState<string | null>(null);
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [twoFactorRecoveryCodes, setTwoFactorRecoveryCodes] = useState<string[]>([]);
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorPromoDaysGranted, setTwoFactorPromoDaysGranted] = useState(0);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [rewardSummary, setRewardSummary] = useState<RewardSummary | null>(null);
  const [rewardSummaryLoading, setRewardSummaryLoading] = useState(false);
  const [rewardSummaryError, setRewardSummaryError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteCodeAttached, setInviteCodeAttached] = useState(false);
  const [inviteCodeSaving, setInviteCodeSaving] = useState(false);
  const [inviteCodeError, setInviteCodeError] = useState<string | null>(null);
  const currentStep = steps[step];

  // Save on every step and every answer, so a reload resumes where it left off.
  useEffect(() => {
    if (previewMode) {
      return;
    }

    writeOnboardingDraft({ step, profile });
  }, [previewMode, step, profile]);
  const affiliateLink = previewMode ? 'https://cruush.app/join/preview' : rewardSummary?.referrals.link ?? '';
  const canUseNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

  useLayoutEffect(() => {
    const viewport = scrollContainerRef.current;
    const content = stepContentRef.current;
    if (!viewport || !content) return;

    let frame = 0;
    const fitStep = () => {
      const visualViewport = window.visualViewport;
      const viewportTop = viewport.getBoundingClientRect().top;
      const visibleTop = visualViewport?.offsetTop ?? 0;
      // The on-screen keyboard shrinks the visual viewport but not the layout
      // viewport. Fitting to the visual viewport rescaled and reflowed the whole
      // step the moment a field was focused, so the step is sized against the
      // layout viewport and the visual viewport only pans it into view.
      viewport.style.setProperty('--onboarding-pan-offset', `${Math.max(0, visibleTop - viewportTop)}px`);
      viewport.style.maxHeight = `${Math.max(0, window.innerHeight - viewportTop)}px`;
      const style = getComputedStyle(viewport);
      const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const availableHeight = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const availableWidth = Math.min(viewport.clientWidth, 28 * parseFloat(getComputedStyle(document.documentElement).fontSize)) - horizontalPadding;
      if (availableHeight <= 0 || availableWidth <= 0) return;

      // Keep the full available width while sizing the existing step as a unit.
      // Reflowing at that width avoids shrinking a long conduct page into a
      // narrow column. Menus already portal outside this fitted content.
      const applyScale = (scale: number) => {
        content.style.zoom = String(scale);
        content.style.width = `${availableWidth / scale}px`;
      };
      applyScale(1);
      if (content.getBoundingClientRect().height > availableHeight) {
        let low = 0;
        let high = 1;
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const scale = (low + high) / 2;
          applyScale(scale);
          if (content.getBoundingClientRect().height <= availableHeight) low = scale;
          else high = scale;
        }
        applyScale(low);
      }
    };
    const scheduleFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitStep);
    };
    fitStep();
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(viewport);
    observer.observe(content);
    window.addEventListener('resize', scheduleFit);
    window.visualViewport?.addEventListener('resize', scheduleFit);
    window.visualViewport?.addEventListener('scroll', scheduleFit);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', scheduleFit);
      window.visualViewport?.removeEventListener('resize', scheduleFit);
      window.visualViewport?.removeEventListener('scroll', scheduleFit);
    };
  }, [currentStep]);

  const setProfileField = <K extends keyof OnboardingProfileState>(field: K, value: OnboardingProfileState[K]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  // Onboarding uploaded the raw file straight from the picker while Edit
  // Profile framed it first, so the one photo people set up front was the one
  // they had no say over. Both go through the same cropper now, and the same
  // uploader with it, which is what accepts the formats a phone camera makes.
  const handleOnboardingPhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const photo = event.target.files?.[0];
    event.target.value = '';

    if (!photo || trust.restricted('photo_uploads')) {
      return;
    }

    setPhotoUploadError(null);
    setPhotoUploadNotice(null);

    setPhotoUploading(true);
    try {
      setPendingPhoto(await readProfilePhotoPreviewUrl(photo, { previewOnly: previewMode }));
    } catch (previewError) {
      setPhotoUploadError(previewError instanceof Error ? previewError.message : 'Failed to read that photo.');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleCancelOnboardingCrop = () => {
    if (pendingPhoto?.objectUrl) {
      URL.revokeObjectURL(pendingPhoto.objectUrl);
    }

    setPendingPhoto(null);
  };

  const handleConfirmOnboardingCrop = async (croppedPhoto: File) => {
    setPhotoUploading(true);
    setPhotoUploadError(null);
    setPhotoUploadNotice(null);

    if (previewMode) {
      setProfileField('photos', [...profile.photos, URL.createObjectURL(croppedPhoto)].slice(0, 4));
      setPhotoUploadNotice('Photo added. You can change it later in Edit Profile.');
      setPhotoUploading(false);
      setPendingPhoto(null);
      return;
    }

    try {
      const uploaded = await uploadProfilePhoto(croppedPhoto);

      if (uploaded.status === 'pending_review') {
        setPhotoUploadNotice('Photo submitted for review. You can continue onboarding.');
        return;
      }

      setProfileField('photos', (uploaded.photos ?? [...profile.photos, uploaded.url]).slice(0, 4));
      setPhotoUploadNotice('Photo added. You can change it later in Edit Profile.');
    } catch (error) {
      setPhotoUploadError(getPhotoUploadRejectedMessage(error));
    } finally {
      setPhotoUploading(false);
      setPendingPhoto(null);
    }
  };

  const loadRewardSummary = async () => {
    setRewardSummaryLoading(true);
    setRewardSummaryError(null);

    try {
      setRewardSummary(await getRewardSummary());
    } catch (error) {
      setRewardSummaryError(error instanceof Error ? error.message : 'Unable to load your affiliate link.');
    } finally {
      setRewardSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!previewMode && currentStep === 'affiliateShare' && !rewardSummary && !rewardSummaryLoading && !rewardSummaryError) {
      void loadRewardSummary();
    }
  }, [currentStep, previewMode]);

  const canProceed = (): boolean => {
    const field = steps[step];
    switch (field) {
      case 'name':
        return profile.name.trim().length > 1;
      case 'identities':
        return profile.identities.length > 0 && profile.sexuality.length > 0;
      case 'crowds':
        return true;
      case 'lookingFor':
        return profile.lookingFor.length > 0;
      case 'vibes':
        return true;
      case 'bio':
        return true;
      case 'rolePosition':
        return true;
      case 'oath':
        return oathAccepted;
      case 'twoFactor':
        return true;
      case 'affiliateShare':
        return true;
      default:
        return true;
    }
  };

  const ensureInviteCodeAttached = async () => {
    if (!inviteCode.trim() || inviteCodeAttached) {
      return true;
    }

    setInviteCodeSaving(true);
    setInviteCodeError(null);

    try {
      if (!previewMode) {
        // The link is the only thing the app hands out, so pasting it works.
        await attachReferralCode(extractReferralCode(inviteCode));
      }
      setInviteCodeAttached(true);
      return true;
    } catch (error) {
      setInviteCodeError(error instanceof Error ? error.message : 'Unable to attach this invite code.');
      return false;
    } finally {
      setInviteCodeSaving(false);
    }
  };

  const handleNextRite = async () => {
    if (currentStep === 'twoFactor' && inviteCode.trim() && !inviteCodeAttached
      && !(await ensureInviteCodeAttached())) return;
    setStep((current) => current + 1);
  };

  const retryRewardSummary = () => {
    setRewardSummary(null);
    void loadRewardSummary();
  };

  const copyTwoFactorValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const copyAffiliateLink = async () => {
    if (!affiliateLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(affiliateLink);
      toast.success('Affiliate link copied.');
    } catch {
      setRewardSummaryError('Unable to copy your affiliate link.');
    }
  };

  const shareAffiliateLink = async () => {
    if (!affiliateLink || !canUseNativeShare) {
      return;
    }

    try {
      await navigator.share({
        title: 'Join me on cruush',
        text: 'Join me on cruush.',
        url: affiliateLink,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      setRewardSummaryError('Unable to open sharing right now.');
    }
  };

  const handleStartTwoFactorSetup = async (event: FormEvent) => {
    event.preventDefault();

    if (!twoFactorPassword.trim()) {
      setTwoFactorError('Enter your cruush login password to start 2FA setup.');
      return;
    }

    if (!(await ensureInviteCodeAttached())) return;

    setTwoFactorSaving(true);
    setTwoFactorError(null);

    if (previewMode) {
      setTwoFactorRecoveryCodes(['PREVIEW-ONLY', 'NOT-A-REAL-CODE']);
      setTwoFactorPassword('');
      setTwoFactorEnabled(true);
      setTwoFactorSaving(false);
      return;
    }

    try {
      setTwoFactorSetup(await startTwoFactorSetup(twoFactorPassword));
      setTwoFactorPassword('');
      setTwoFactorToken('');
    } catch (error) {
      setTwoFactorError(error instanceof Error ? error.message : 'Unable to start 2FA setup.');
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const handleCompleteTwoFactorSetup = async (event: FormEvent) => {
    event.preventDefault();

    if (!twoFactorToken.trim()) {
      setTwoFactorError('Enter the code from your authenticator app.');
      return;
    }

    if (!(await ensureInviteCodeAttached())) return;

    setTwoFactorSaving(true);
    setTwoFactorError(null);

    if (previewMode) {
      setTwoFactorRecoveryCodes(['PREVIEW-ONLY', 'NOT-A-REAL-CODE']);
      setTwoFactorSetup(null);
      setTwoFactorToken('');
      setTwoFactorEnabled(true);
      setTwoFactorSaving(false);
      return;
    }

    try {
      const result = await completeTwoFactorSetup(twoFactorToken);
      setTwoFactorRecoveryCodes(result.recoveryCodes);
      setTwoFactorPromoDaysGranted(result.promotionalDaysGranted ?? 0);
      setTwoFactorSetup(null);
      setTwoFactorToken('');
      setTwoFactorEnabled(true);
    } catch (error) {
      setTwoFactorError(error instanceof Error ? error.message : 'Unable to confirm 2FA.');
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const handleComplete = async (destination: 'map' | 'rewards') => {
    setSaving(true);
    setSaveError(null);
    if (previewMode) {
      setSaving(false);
      onComplete(undefined, destination, twoFactorPromoDaysGranted > 0);
      return;
    }
    try {
      const displayName = profile.name.trim();
      const bio = profile.bio.trim();
      const signal = profile.signal.trim();
      const customPronouns = profile.custom_pronouns.trim();
      const customHobby = profile.custom_hobby.trim();
      const customHivStatus = profile.custom_hiv_status.trim();
      const customCondoms = profile.custom_condoms.trim();
      const customPrep = profile.custom_prep.trim();
      const customDoxypep = profile.custom_doxypep.trim();
      const customCovidVaccine = profile.custom_covid_vaccine.trim();
      const customMpoxVaccine = profile.custom_mpox_vaccine.trim();
      const sanitizedCrowds = profile.is_trans === true
        ? profile.crowds
        : profile.crowds.filter((crowd) => crowd !== 'T4T');
      const payload: ProfilePayload = {
        ...emptyProfilePayload,
        display_name: displayName,
        year_of_birth: null,
        pronouns: profile.pronouns,
        identities: profile.identities,
        looking_for: profile.lookingFor,
        vibes: profile.vibes,
        bio,
        tags: [],
        signal,
        photos: profile.photos,
        presentation: profile.gender_presentation,
        ethnicity: Array.isArray(profile.ethnicity) ? profile.ethnicity[0] ?? '' : '',
        body_type: profile.body_type,
        height: profile.height,
        weight: profile.weight,
        position: profile.position,
        role: profile.role,
        side_badges: profile.sideBadges,
        is_trans: profile.is_trans,
        trans_status_visibility: 'mutual_cruushes',
        crowds: sanitizedCrowds,
        availability: profile.availability,
        hosting_travel: profile.hosting_travel,
        preferred_spots: profile.preferred_spots,
        kinks: profile.kinks,
        kink_interests: profile.kinks.map(toDefaultKinkInterest),
        kinks_visibility: profile.kinks_visibility,
        scenes: profile.scenes,
        archetypes: profile.archetypes,
        hobbies: profile.hobbies,
        hiv_status: profile.hiv_status,
        hiv_status_visibility: 'mutual_cruushes',
        condoms: profile.condoms,
        prep: profile.prep,
        doxypep: profile.doxypep,
        covid_vaccine: profile.covid_vaccine,
        mpox_vaccine: profile.mpox_vaccine,
        health_preferences: [],
        birth_control: profile.birth_control,
        substance_boundaries: profile.substance_boundaries,
        protection_boundaries: profile.protection_boundaries,
        custom_pronouns: customPronouns,
        custom_hobby: customHobby,
        custom_hiv_status: customHivStatus,
        custom_condoms: customCondoms,
        custom_prep: customPrep,
        custom_doxypep: customDoxypep,
        custom_covid_vaccine: customCovidVaccine,
        custom_mpox_vaccine: customMpoxVaccine,
        sexuality: profile.sexuality,
      };

      const savedProfile = await saveMyProfile(payload);
      persistCurrentUser({
        id: savedProfile.id,
        name: savedProfile.display_name,
        display_name: savedProfile.display_name,
        age: savedProfile.year_of_birth ? new Date().getFullYear() - savedProfile.year_of_birth : null,
        year_of_birth: savedProfile.year_of_birth,
      });
      const nextSession = needsCodeOfConduct
        ? await acceptCodeOfConduct(codeOfConductVersion)
        : await getAuthSession();

      if (nextSession.needsOnboarding) {
        throw new Error("We couldn't finish setting up your profile. Try again.");
      }

      // The profile is saved server side now, so the draft has nothing left to
      // protect and would otherwise reopen a finished flow.
      clearOnboardingDraft();
      void enablePushNotifications().catch(() => undefined);
      onComplete(nextSession, destination, twoFactorPromoDaysGranted > 0);
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveError(getOnboardingSaveError(error));
    } finally {
      setSaving(false);
    }
  };
  const isFinalStep = step === steps.length - 1;
  const availableCrowds = profile.is_trans === true ? CROWDS : CROWDS.filter((crowd) => crowd !== 'T4T');

  const setTransStatus = (isTrans: boolean) => {
    setProfile((prev) => ({
      ...prev,
      is_trans: isTrans,
      crowds: isTrans ? prev.crowds : prev.crowds.filter((crowd) => crowd !== 'T4T'),
    }));
  };

  return (
    <div
      ref={scrollContainerRef}
      className={`${constrainedViewport ? 'h-full' : 'h-[100dvh]'} flex max-w-full flex-col items-center justify-center overflow-hidden bg-[#050505] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[calc(max(0.75rem,env(safe-area-inset-top))+var(--onboarding-pan-offset,0px))] text-foreground sm:px-4`}
    >
      <div ref={stepContentRef} className="flex w-full shrink-0 flex-col">
        <header className="mb-4 text-center sm:mb-6">
          <img className="cruush-brand-logo mx-auto mb-2 h-auto w-24" src={cruushLogo} alt="cruush" />
          <p className="mt-2 text-center text-white/58">the rites</p>
        </header>
        <div className="w-full space-y-5 rounded-lg border border-white/12 bg-black/82 p-4 shadow-[0_28px_90px_rgba(0,0,0,0.52)] backdrop-blur sm:space-y-8 sm:p-6">
        {saveError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}
        <div className="flex items-center gap-2 mb-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-primary' : 'bg-white/10'}`}
            />
          ))}
        </div>
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {STEP_COPY[currentStep].rite}
          </p>
          <h2 className="text-2xl font-semibold text-foreground">{STEP_COPY[currentStep].title}</h2>
          <p className="text-base text-white/62">{STEP_COPY[currentStep].detail}</p>
          <p className="text-sm text-white/42">Rite {step + 1} of {steps.length}</p>
        </div>
        {/* Step content */}
        {(() => {
          const field = currentStep;
          switch (field) {
            case 'name':
              return (
                <div className="space-y-4">
                  <label className="text-sm mb-2 block">Display Name</label>
                  <Input
                    type="text"
                    placeholder="Your name"
                    value={profile.name}
                    onChange={e => setProfileField('name', e.target.value)}
                  />
                  {profile.name.length > 0 && profile.name.trim().length < 2 ? (
                    <p role="alert" className="text-xs text-destructive">Name must be at least 2 characters.</p>
                  ) : null}
                  <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <label className="text-sm block text-white/82" htmlFor="onboarding-profile-photo">Profile photo</label>
                    <p className="text-xs leading-5 text-white/58">Optional. NSFW is allowed. Your face is optional, but the photo must show you or your gear.</p>
                    <Input
                      id="onboarding-profile-photo"
                      aria-label="Profile photo"
                      type="file"
                      accept={PHOTO_UPLOAD_ACCEPT}
                      disabled={photoUploading || trust.restricted('photo_uploads')}
                      onChange={(event) => void handleOnboardingPhotoUpload(event)}
                    />
                    {photoUploading ? <PhotoUploadSpinner /> : null}
                    <TrustRestrictionNotice message={trust.message('photo_uploads', 'Photo uploading')} />
                    <p className="text-xs text-white/58">{PHOTO_UPLOAD_FORMAT_MESSAGE}</p>
                    {photoUploadNotice ? <p className="text-xs text-primary">{photoUploadNotice}</p> : null}
                    {photoUploadError ? <p role="alert" className="text-xs text-destructive">{photoUploadError}</p> : null}
                  </div>
                </div>
              );
            case 'identities':
              return (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm mb-2 block text-white/82">Gender Identity</label>
                    <MultiSelect
                      menuPortal
                      ariaLabel="Gender Identity"
                      searchable
                      maxSelections={3}
                      options={ONBOARDING_IDENTITIES}
                      value={profile.identities}
                      onChange={(values) => setProfileField('identities', limitToThree(values))}
                    />
                    <p className="text-xs text-white/58 mt-1">Pick up to 3</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-white/12 bg-white/[0.04] p-3 text-sm text-white/82">
                    <input
                      type="checkbox"
                      checked={profile.is_trans === true}
                      onChange={(event) => setTransStatus(event.target.checked)}
                      className="h-4 w-4 rounded border-white/25 bg-input-background accent-primary"
                    />
                    <span>
                      <span className="block">I am trans</span>
                      <span className="mt-1 block text-xs leading-5 text-white/58">
                        Optional. We ask this to offer you the optional T4T crowd. It does not add a trans label to your profile.
                      </span>
                    </span>
                  </label>
                  <div>
                    <label className="text-sm mb-2 block text-white/82">Sexuality</label>
                    <MultiSelect
                      menuPortal
                      ariaLabel="Sexuality"
                      maxSelections={MAX_PROFILE_SEXUALITIES}
                      options={SEXUALITY}
                      value={profile.sexuality}
                      onChange={(values) => setProfileField('sexuality', limitToThree(values))}
                    />
                    <p className="text-xs text-white/58 mt-1">Pick up to {MAX_PROFILE_SEXUALITIES}</p>
                  </div>
                  <div>
                    <label className="text-sm mb-2 block text-white/82">Pronouns</label>
                    <MultiSelect
                      menuPortal
                      ariaLabel="Pronouns"
                      maxSelections={3}
                      options={PRONOUNS}
                      value={profile.pronouns}
                      onChange={(values) => setProfileField('pronouns', limitToThree(values))}
                    />
                    <p className="text-xs text-white/58 mt-1">Optional. Pick up to 3</p>
                  </div>
                </div>
              );
            case 'crowds':
              return (
                <div>
                  <label className="text-sm mb-2 block text-white/82">Crowds</label>
                  <MultiSelect
                    menuPortal
                    ariaLabel="Crowds"
                    maxSelections={3}
                    options={availableCrowds}
                    value={profile.crowds}
                    onChange={(values) => setProfileField('crowds', limitToThree(values))}
                  />
                  <p className="text-xs text-white/58 mt-1">Pick up to 3</p>
                </div>
              );
            case 'lookingFor':
              return (
                <div>
                  <label className="text-sm mb-2 block text-white/82">Looking For</label>
                  <MultiSelect
                    menuPortal
                    ariaLabel="Looking For"
                    maxSelections={3}
                    options={LOOKING_FOR}
                    value={profile.lookingFor}
                    onChange={(values) => setProfileField('lookingFor', limitToThree(values))}
                  />
                  <p className="text-xs text-white/58 mt-1">Pick up to 3</p>
                </div>
              );
            case 'vibes':
              return (
                <div>
                  <label className="text-sm mb-2 block text-white/82">Vibes</label>
                  <MultiSelect
                    menuPortal
                    ariaLabel="Vibes"
                    maxSelections={3}
                    optionGroups={VIBE_GROUPS}
                    value={profile.vibes}
                    onChange={(values) => setProfileField('vibes', limitToThree(values))}
                  />
                  <p className="text-xs text-white/58 mt-1">Pick up to 3</p>
                </div>
              );
            case 'bio':
              return (
                <div>
                  <label className="text-sm mb-2 block">Bio</label>
                  <Input
                    type="text"
                    placeholder="A little about you..."
                    value={profile.bio}
                    onChange={e => setProfileField('bio', e.target.value)}
                  />
                  <div className="mt-4 flex items-baseline justify-between gap-3">
                    <label className="text-sm">Signal</label>
                    <span className="shrink-0 text-xs text-white/50">{profile.signal.length}/{SIGNAL_MAX_LENGTH}</span>
                  </div>
                  {/* The same badge the map draws, over the same heart, so the
                      words are read at the size they will actually be read at.
                      The explanatory line under the field was wrapping off the
                      bottom on a narrow phone; the example says it instead. */}
                  <div className="mb-3 mt-2 flex w-full min-w-0 flex-col items-center gap-1 overflow-hidden rounded-2xl border border-white/10 bg-black/35 px-3 py-4">
                    <SignalBadge
                      borderColor={HEART_PIN_THEMES.current.border}
                      className="max-w-full"
                    >
                      {profile.signal.trim() || 'A few words on your pin'}
                    </SignalBadge>
                    <HeartPhoto
                      className="w-16"
                      label="Your heart pin"
                      masked={false}
                      photo={profile.photos[0] ?? null}
                      theme="current"
                    />
                  </div>
                  <p className="mb-2 text-xs text-white/58">Text above your heart pin on hover.</p>
                  <Input
                    type="text"
                    maxLength={SIGNAL_MAX_LENGTH}
                    value={profile.signal}
                    onChange={e => setProfileField('signal', e.target.value)}
                  />
                </div>
              );
            case 'rolePosition':
              return (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm mb-2 block text-white/82">Role</label>
                    <MultiSelect
                      menuPortal
                      ariaLabel="Role"
                      maxSelections={1}
                      options={ROLES}
                      value={profile.role}
                      onChange={(values) => setProfileField('role', values.slice(-1))}
                    />
                    <p className="mt-1 text-xs text-white/58">Optional. This becomes your left badge.</p>
                  </div>
                  <div>
                    <label className="text-sm mb-2 block text-white/82">Position</label>
                    <MultiSelect
                      menuPortal
                      ariaLabel="Position"
                      maxSelections={1}
                      options={POSITIONS}
                      value={profile.position}
                      onChange={(values) => setProfileField('position', values.slice(-1))}
                    />
                    <p className="mt-1 text-xs text-white/58">Optional. This becomes your right badge.</p>
                  </div>
                </div>
              );
            case 'oath':
              return signedCodeOfConductAt ? (
                <CodeOfConduct checked readOnly signedAt={signedCodeOfConductAt} />
              ) : (
                <CodeOfConduct checked={oathAccepted} onCheckedChange={setOathAccepted} />
              );
            case 'twoFactor':
              return (
                <div className="space-y-4">
                  {twoFactorError ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      {twoFactorError}
                    </div>
                  ) : null}

                  {twoFactorRecoveryCodes.length > 0 ? (
                    <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/10 p-4">
                      <div className="flex items-center gap-2 text-primary">
                        <ShieldCheck className="h-5 w-5" />
                        <p className="text-sm font-semibold">2FA is active.</p>
                      </div>
                      {twoFactorPromoDaysGranted > 0 ? (
                        <p className="text-sm leading-6 text-white/78">
                          One free day of cruush+ has been added to your account.
                        </p>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2 rounded-md bg-black/40 p-3 font-mono text-xs text-white/78">
                        {twoFactorRecoveryCodes.map((code) => (
                          <span key={code}>{code}</span>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => void copyTwoFactorValue(twoFactorRecoveryCodes.join('\n'), 'Recovery codes')}
                      >
                        <Clipboard className="h-4 w-4" aria-hidden="true" />
                        Copy recovery codes
                      </Button>
                    </div>
                  ) : null}

                  {!twoFactorSetup && !twoFactorEnabled ? (
                    <form className="space-y-3" onSubmit={(event) => void handleStartTwoFactorSetup(event)}>
                      <label className="space-y-2 block">
                        <span className="text-sm">cruush login password</span>
                        <Input
                          type="password"
                          autoComplete="current-password"
                          aria-describedby="two-factor-password-help"
                          value={twoFactorPassword}
                          onChange={(event) => setTwoFactorPassword(event.target.value)}
                        />
                        <span id="two-factor-password-help" className="block text-xs leading-5 text-white/58">
                          Use the same password you use to sign in. This is not a separate 2FA password.
                        </span>
                      </label>
                      <Button type="submit" className="w-full" disabled={twoFactorSaving || inviteCodeSaving}>
                        {twoFactorSaving ? 'Starting...' : 'Start 2FA setup'}
                      </Button>
                    </form>
                  ) : null}

                  {twoFactorSetup ? (
                    <form className="space-y-4" onSubmit={(event) => void handleCompleteTwoFactorSetup(event)}>
                      <div className="rounded-lg border border-white/10 bg-white p-3">
                        <img src={twoFactorSetup.qrCodeDataUrl} alt="2FA QR code" className="mx-auto h-44 w-44" />
                      </div>
                      <button
                        type="button"
                        aria-label="Copy setup key"
                        className="flex w-full items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 p-3 text-left text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => void copyTwoFactorValue(twoFactorSetup.secret, 'Setup key')}
                      >
                        <span className="min-w-0 break-all font-mono text-xs">{twoFactorSetup.secret}</span>
                        <Clipboard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      </button>
                      <label className="space-y-2 block">
                        <span className="text-sm">Authenticator code</span>
                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={twoFactorToken}
                          onChange={(event) => setTwoFactorToken(event.target.value)}
                        />
                      </label>
                      <Button type="submit" className="w-full" disabled={twoFactorSaving || inviteCodeSaving}>
                        {twoFactorSaving ? 'Confirming...' : 'Confirm and enable 2FA'}
                      </Button>
                    </form>
                  ) : null}
                  <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <label className="text-sm block text-white/82" htmlFor="onboarding-invite-code">Friend invite code</label>
                    <Input
                      id="onboarding-invite-code"
                      autoCapitalize="none"
                      autoCorrect="off"
                      disabled={inviteCodeAttached || inviteCodeSaving || twoFactorSaving}
                      placeholder="Optional"
                      value={inviteCode}
                      onChange={(event) => {
                        setInviteCode(event.target.value);
                        setInviteCodeError(null);
                      }}
                    />
                    <p className="text-xs leading-5 text-white/58">
                      If a friend invited you, paste their invite link or code here. You must enable 2FA before they can redeem their benefit.
                    </p>
                    {inviteCodeAttached ? <p className="text-xs text-primary">Invite code attached.</p> : null}
                    {inviteCodeError ? <p className="text-xs text-destructive" role="alert">{inviteCodeError}</p> : null}
                  </div>
                </div>
              );
            case 'affiliateShare':
              return (
                <div className="space-y-4">
                  {rewardSummaryError ? (
                    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      <p>{rewardSummaryError}</p>
                      <Button className="mt-3" variant="outline" size="sm" onClick={retryRewardSummary}>
                        Try again
                      </Button>
                    </div>
                  ) : null}

                  <div className="flex items-start gap-3 rounded-md border border-primary/25 bg-primary/10 p-4">
                    <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <p className="text-sm leading-6 text-white/72">
                      You get {rewardSummary?.rules.referralRewardDays ?? 7} <CruushPlusWord /> days after a trusted
                      invite verifies 2FA.
                    </p>
                  </div>

                  {rewardSummaryLoading ? (
                    <LoadingCardSkeletons count={1} label="Loading your affiliate link" />
                  ) : null}

                  {!rewardSummaryLoading && affiliateLink ? (
                    <div className="space-y-3">
                      <label className="text-sm mb-2 block text-white/82">Affiliate link</label>
                      <Input aria-label="Affiliate link" value={affiliateLink} readOnly />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {canUseNativeShare ? (
                          <Button onClick={() => void shareAffiliateLink()} style={{ background: 'var(--cruush-gradient)' }}>
                            <Share2 className="h-4 w-4" />
                            Share to contacts
                          </Button>
                        ) : null}
                        <Button variant={canUseNativeShare ? 'outline' : 'default'} onClick={() => void copyAffiliateLink()}>
                          <Clipboard className="h-4 w-4" />
                          Copy link
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {!rewardSummaryLoading && rewardSummary && !affiliateLink ? (
                    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-white/58">
                      Your affiliate link is not ready yet. You can find it in Rewards later.
                    </div>
                  ) : null}
                </div>
              );
            default:
              return null;
          }
        })()}
        {signedCodeOfConductAt ? null : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 sm:mt-8">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || inviteCodeSaving}>
            Back
          </Button>
          {currentStep === 'twoFactor' && !isFinalStep ? (
            <div className="flex flex-wrap justify-end gap-2">
              {!twoFactorEnabled ? (
                <Button
                  variant="outline"
                  onClick={() => void handleNextRite()}
                  disabled={!canProceed() || twoFactorSaving || inviteCodeSaving}
                >
                  Skip 2FA for now <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={() => void handleNextRite()} disabled={!canProceed() || twoFactorSaving || inviteCodeSaving}>
                  Continue <ShieldCheck className="ml-2 w-4 h-4" />
                </Button>
              )}
            </div>
          ) : step < steps.length - 1 ? (
            <Button onClick={() => void handleNextRite()} disabled={!canProceed() || inviteCodeSaving}>
              {inviteCodeSaving ? 'Checking code...' : 'Next rite'} {!inviteCodeSaving ? <ArrowRight className="ml-2 w-4 h-4" /> : null}
            </Button>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => void handleComplete('map')} disabled={!canProceed() || saving || twoFactorSaving}>
                Enter cruush <Check className="ml-2 w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        )}
        </div>
      </div>
      {pendingPhoto ? (
        <ProfilePhotoCropper
          onCancel={handleCancelOnboardingCrop}
          onConfirm={handleConfirmOnboardingCrop}
          processing={photoUploading}
          sourceUrl={pendingPhoto.url}
        />
      ) : null}
    </div>
  );
}
