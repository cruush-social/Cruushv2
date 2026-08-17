import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { CROWDS, IDENTITIES, LOOKING_FOR, MAX_PROFILE_SEXUALITIES, PRONOUNS, SEXUALITY, VIBE_GROUPS } from '../lib/profileOptions';
import { ArrowRight, Check, Clipboard, Gift, Share2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { acceptCodeOfConduct, getAuthSession, type AuthSessionPayload } from '../lib/authApi';
import { CODE_OF_CONDUCT_ITEMS } from '../lib/codeOfConduct';
import { saveMyProfile, toDefaultKinkInterest, type ProfilePayload, uploadProfilePhoto } from '../lib/profileApi';
import {
  completeTwoFactorSetup,
  getRewardSummary,
  startTwoFactorSetup,
  type RewardSummary,
  type TwoFactorSetup,
} from '../lib/rewardsApi';
import { persistCurrentUser } from '../lib/sessionUser';
import CruushPlusWord from './CruushPlusWord';
import MultiSelect from './MultiSelect';

interface ProfileOnboardingProps {
  onComplete: (session?: AuthSessionPayload, destination?: 'map' | 'rewards') => void;
  needsCodeOfConduct?: boolean;
  codeOfConductVersion?: string;
}

type OnboardingStep =
  | 'name'
  | 'pronouns'
  | 'identities'
  | 'crowds'
  | 'lookingFor'
  | 'vibes'
  | 'bio'
  | 'oath'
  | 'twoFactor'
  | 'affiliateShare';

const PROFILE_STEPS: OnboardingStep[] = [
  'name',
  'pronouns',
  'identities',
  'crowds',
  'lookingFor',
  'vibes',
  'bio',
];

const STEP_COPY: Record<OnboardingStep, { rite: string; title: string; detail: string }> = {
  name: {
    rite: 'speak your name',
    title: 'What should the room call you?',
    detail: 'This is the name other members see first.',
  },
  pronouns: {
    rite: 'choose your invocation',
    title: 'How should people refer to you?',
    detail: 'Pick up to three.',
  },
  identities: {
    rite: 'name your form',
    title: 'Choose the words that fit.',
    detail: 'Pick up to three.',
  },
  crowds: {
    rite: 'find your crowd',
    title: 'Choose your crowds.',
    detail: 'Optional visibility rooms, not identity labels. Think of a gay bar, dyke bar, or another room you choose to enter. Turn Crowd Mode on to be seen only by your selected crowds; turn it off to return to your normal visibility. Leave this empty for broader visibility.',
  },
  lookingFor: {
    rite: 'declare your hunger',
    title: 'What are you seeking tonight?',
    detail: 'Pick up to three.',
  },
  vibes: {
    rite: 'reveal your aura',
    title: 'Set the signal around you.',
    detail: 'Pick up to three.',
  },
  bio: {
    rite: 'leave your confession',
    title: 'Give them a reason to look twice.',
    detail: 'Keep it real, specific, and safe.',
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
    detail: 'Send it to trusted contacts before you enter the map.',
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

function limitToFive(values: string[]) {
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

  return nextValues.slice(-5);
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
  substance_boundaries: string[];
  custom_pronouns: string;
  custom_hobby: string;
  custom_hiv_status: string;
  custom_condoms: string;
  custom_prep: string;
  custom_doxypep: string;
  custom_covid_vaccine: string;
  custom_mpox_vaccine: string;
  sexuality: string[];
};

export default function ProfileOnboarding({
  onComplete,
  needsCodeOfConduct = false,
  codeOfConductVersion = '',
}: ProfileOnboardingProps) {
  // Minimal onboarding steps, but state includes all schema fields for upsert
  const steps: OnboardingStep[] = needsCodeOfConduct
    ? [...PROFILE_STEPS, 'oath', 'twoFactor', 'affiliateShare']
    : [...PROFILE_STEPS, 'twoFactor', 'affiliateShare'];
  const [step, setStep] = useState(0);
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
    substance_boundaries: [],
    custom_pronouns: '',
    custom_hobby: '',
    custom_hiv_status: '',
    custom_condoms: '',
    custom_prep: '',
    custom_doxypep: '',
    custom_covid_vaccine: '',
    custom_mpox_vaccine: '',
    sexuality: [],
  });
  const [oathAccepted, setOathAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
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
  const currentStep = steps[step];
  const affiliateLink = rewardSummary?.referrals.link ?? '';
  const canUseNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const setProfileField = <K extends keyof OnboardingProfileState>(field: K, value: OnboardingProfileState[K]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleOnboardingPhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const photo = event.target.files?.[0];
    event.target.value = '';

    if (!photo) {
      return;
    }

    setPhotoUploading(true);
    setPhotoUploadError(null);
    setPhotoUploadNotice(null);

    try {
      const uploaded = await uploadProfilePhoto(photo);

      if (uploaded.status === 'pending_review') {
        setPhotoUploadNotice('Photo submitted for review. You can continue onboarding.');
        return;
      }

      setProfileField('photos', (uploaded.photos ?? [...profile.photos, uploaded.url]).slice(0, 4));
      setPhotoUploadNotice('Photo added. You can change it later in Edit Profile.');
    } catch (error) {
      setPhotoUploadError(error instanceof Error ? error.message : 'Failed to upload profile photo.');
    } finally {
      setPhotoUploading(false);
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
    if (currentStep === 'affiliateShare' && !rewardSummary && !rewardSummaryLoading && !rewardSummaryError) {
      void loadRewardSummary();
    }
  }, [currentStep]);

  const canProceed = (): boolean => {
    const field = steps[step];
    switch (field) {
      case 'name':
        return profile.name.trim().length > 1;
      case 'pronouns':
        return profile.pronouns.length > 0;
      case 'identities':
        return profile.identities.length > 0;
      case 'crowds':
        return true;
      case 'lookingFor':
        return profile.lookingFor.length > 0;
      case 'vibes':
        return profile.vibes.length > 0;
      case 'bio':
        return profile.bio.trim().length > 0;
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

  const retryRewardSummary = () => {
    setRewardSummary(null);
    void loadRewardSummary();
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

    setTwoFactorSaving(true);
    setTwoFactorError(null);

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

    setTwoFactorSaving(true);
    setTwoFactorError(null);

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
        display_name: displayName,
        year_of_birth: null,
        pronouns: profile.pronouns,
        identities: profile.identities,
        looking_for: profile.lookingFor,
        vibes: profile.vibes,
        bio,
        signal,
        photos: profile.photos,
        presentation: profile.gender_presentation,
        ethnicity: Array.isArray(profile.ethnicity) ? profile.ethnicity[0] ?? '' : '',
        body_type: profile.body_type,
        height: profile.height,
        weight: profile.weight,
        position: profile.position,
        role: profile.role,
        is_trans: profile.is_trans,
        trans_status_visibility: 'mutual_cruushes',
        crowds: sanitizedCrowds,
        availability: profile.availability,
        hosting_travel: profile.hosting_travel,
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
        substance_boundaries: profile.substance_boundaries,
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

      onComplete(nextSession, destination);
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save profile.');
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] p-4 text-foreground">
      <header className="mb-6 text-center">
        <h1 className="cruush-logo-text text-5xl font-bold mb-2">cruush</h1>
        <p className="text-center text-white/58 mt-2">the rites</p>
      </header>
      <div className="w-full max-w-md rounded-lg border border-white/12 bg-black/82 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.52)] backdrop-blur space-y-8">
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            {STEP_COPY[currentStep].rite}
          </p>
          <h2 className="text-xl font-semibold text-foreground">{STEP_COPY[currentStep].title}</h2>
          <p className="text-sm text-white/62">{STEP_COPY[currentStep].detail}</p>
          <p className="text-xs text-white/42">Rite {step + 1} of {steps.length}</p>
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
                  <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <label className="text-sm block text-white/82" htmlFor="onboarding-profile-photo">Profile photo</label>
                    <p className="text-xs leading-5 text-white/58">Add a photo so people can recognize you. Optional for now; you can add one later.</p>
                    <Input
                      id="onboarding-profile-photo"
                      aria-label="Profile photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={photoUploading}
                      onChange={(event) => void handleOnboardingPhotoUpload(event)}
                    />
                    {photoUploading ? <p className="text-xs text-white/58">Uploading...</p> : null}
                    {photoUploadNotice ? <p className="text-xs text-primary">{photoUploadNotice}</p> : null}
                    {photoUploadError ? <p role="alert" className="text-xs text-destructive">{photoUploadError}</p> : null}
                  </div>
                </div>
              );
            case 'pronouns':
              return (
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
                  <p className="text-xs text-white/58 mt-1">Select up to 3</p>
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
                      maxSelections={3}
                      options={IDENTITIES}
                      value={profile.identities}
                      onChange={(values) => setProfileField('identities', limitToThree(values))}
                    />
                    <p className="text-xs text-white/58 mt-1">Optional · select up to 3, or leave empty</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-white/12 bg-white/[0.04] p-3 text-sm text-white/82">
                    <input
                      type="checkbox"
                      checked={profile.is_trans === true}
                      onChange={(event) => setTransStatus(event.target.checked)}
                      className="h-4 w-4 rounded border-white/25 bg-input-background accent-primary"
                    />
                    <span>I am trans</span>
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
                    <p className="text-xs text-white/58 mt-1">Optional · select up to {MAX_PROFILE_SEXUALITIES}</p>
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
                  <p className="text-xs text-white/58 mt-1">Select up to 3</p>
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
                  <p className="text-xs text-white/58 mt-1">Select up to 3</p>
                </div>
              );
            case 'vibes':
              return (
                <div>
                  <label className="text-sm mb-2 block text-white/82">Vibes</label>
                  <MultiSelect
                    menuPortal
                    ariaLabel="Vibes"
                    maxSelections={5}
                    optionGroups={VIBE_GROUPS}
                    value={profile.vibes}
                    onChange={(values) => setProfileField('vibes', limitToFive(values))}
                  />
                  <p className="text-xs text-white/58 mt-1">Select up to 5</p>
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
                  <label className="mt-4 text-sm mb-2 block">Signal</label>
                  <Input
                    type="text"
                    maxLength={180}
                    placeholder="A few words people see when they hover your heart pin"
                    value={profile.signal}
                    onChange={e => setProfileField('signal', e.target.value)}
                  />
                  <p className="mt-2 text-xs text-white/50">Your signal appears when someone hovers over your heart pin on the map.</p>
                </div>
              );
            case 'oath':
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">
                    <ShieldCheck className="h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">This agreement is required before entering cruush.</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/60 p-4">
                    <ul className="space-y-3 text-sm leading-6 text-white/72">
                      {CODE_OF_CONDUCT_ITEMS.map((item) => (
                        <li key={item} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/55 p-4 text-sm leading-6 text-white/80">
                    <input
                      type="checkbox"
                      checked={oathAccepted}
                      onChange={(event) => setOathAccepted(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-white/25 bg-input-background accent-primary"
                    />
                    <span>I have read and agree to the cruush code of conduct.</span>
                  </label>
                </div>
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
                      <Button type="submit" className="w-full" disabled={twoFactorSaving}>
                        {twoFactorSaving ? 'Starting...' : 'Start 2FA setup'}
                      </Button>
                    </form>
                  ) : null}

                  {twoFactorSetup ? (
                    <form className="space-y-4" onSubmit={(event) => void handleCompleteTwoFactorSetup(event)}>
                      <div className="rounded-lg border border-white/10 bg-white p-3">
                        <img src={twoFactorSetup.qrCodeDataUrl} alt="2FA QR code" className="mx-auto h-44 w-44" />
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/45 p-3 font-mono text-xs break-all text-white/72">
                        {twoFactorSetup.secret}
                      </div>
                      <label className="space-y-2 block">
                        <span className="text-sm">Authenticator code</span>
                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={twoFactorToken}
                          onChange={(event) => setTwoFactorToken(event.target.value)}
                        />
                      </label>
                      <Button type="submit" className="w-full" disabled={twoFactorSaving}>
                        {twoFactorSaving ? 'Confirming...' : 'Confirm and enable 2FA'}
                      </Button>
                    </form>
                  ) : null}
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
                    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-white/58">
                      Loading your affiliate link...
                    </div>
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
        <div className="flex flex-wrap items-center justify-between gap-3 mt-8">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </Button>
          {currentStep === 'twoFactor' && !isFinalStep ? (
            <div className="flex flex-wrap justify-end gap-2">
              {!twoFactorEnabled ? (
                <Button
                  variant="outline"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canProceed() || twoFactorSaving}
                >
                  Skip 2FA for now <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed() || twoFactorSaving}>
                  Continue <ShieldCheck className="ml-2 w-4 h-4" />
                </Button>
              )}
            </div>
          ) : step < steps.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
              Next rite <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => void handleComplete('map')} disabled={!canProceed() || saving || twoFactorSaving}>
                Enter cruush <Check className="ml-2 w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
