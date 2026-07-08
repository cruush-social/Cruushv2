import { useState } from 'react';
import { IDENTITIES, LOOKING_FOR, PRONOUNS, VIBE_GROUPS } from '../lib/profileOptions';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { acceptCodeOfConduct, type AuthSessionPayload } from '../lib/authApi';
import { CODE_OF_CONDUCT_ITEMS } from '../lib/codeOfConduct';
import { saveMyProfile, toDefaultKinkInterest, type ProfilePayload } from '../lib/profileApi';
import { persistCurrentUser } from '../lib/sessionUser';
import MultiSelect from './MultiSelect';

interface ProfileOnboardingProps {
  onComplete: (session?: AuthSessionPayload) => void;
  needsCodeOfConduct?: boolean;
  codeOfConductVersion?: string;
}

type OnboardingStep = 'name' | 'age' | 'pronouns' | 'identities' | 'lookingFor' | 'vibes' | 'bio' | 'oath';

const PROFILE_STEPS: OnboardingStep[] = [
  'name',
  'age',
  'pronouns',
  'identities',
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
  age: {
    rite: 'prove you may enter',
    title: 'The gates are adults only.',
    detail: 'Your birth year keeps cruush 18+.',
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
};

function limitToThree(values: string[]) {
  return values.slice(0, 3);
}

type OnboardingProfileState = {
  name: string;
  age: string;
  bio: string;
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
  const steps = needsCodeOfConduct ? [...PROFILE_STEPS, 'oath'] : PROFILE_STEPS;
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<OnboardingProfileState>({
    name: '',
    age: '',
    bio: '',
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
    is_trans: null,
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
  const [ageError, setAgeError] = useState<string | null>(null);
  const [oathAccepted, setOathAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setProfileField = <K extends keyof OnboardingProfileState>(field: K, value: OnboardingProfileState[K]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = (): boolean => {
    const field = steps[step];
    switch (field) {
      case 'name':
        return profile.name.trim().length > 1;
      case 'age': {
        const year = parseInt(profile.age);
        const currentYear = new Date().getFullYear();
        const ageNum = currentYear - year;
        return Boolean(
          profile.age &&
          !isNaN(year) &&
          ageNum >= 18 &&
          ageNum < 120
        );
      }
      case 'pronouns':
        return profile.pronouns.length > 0;
      case 'identities':
        return profile.identities.length > 0;
      case 'lookingFor':
        return profile.lookingFor.length > 0;
      case 'vibes':
        return profile.vibes.length > 0;
      case 'bio':
        return profile.bio.trim().length > 0;
      case 'oath':
        return oathAccepted;
      default:
        return true;
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const displayName = profile.name.trim();
      const bio = profile.bio.trim();
      const customPronouns = profile.custom_pronouns.trim();
      const customHobby = profile.custom_hobby.trim();
      const customHivStatus = profile.custom_hiv_status.trim();
      const customCondoms = profile.custom_condoms.trim();
      const customPrep = profile.custom_prep.trim();
      const customDoxypep = profile.custom_doxypep.trim();
      const customCovidVaccine = profile.custom_covid_vaccine.trim();
      const customMpoxVaccine = profile.custom_mpox_vaccine.trim();
      const payload: ProfilePayload = {
        display_name: displayName,
        year_of_birth: profile.age ? parseInt(profile.age, 10) : null,
        pronouns: profile.pronouns,
        identities: profile.identities,
        looking_for: profile.lookingFor,
        vibes: profile.vibes,
        bio,
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
        crowds: profile.crowds,
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
        : undefined;
      onComplete(nextSession);
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] p-4 text-foreground">
      <header className="mb-6 text-center">
        <h1 className="cruush-logo-text text-5xl font-bold mb-2">cruush</h1>
        <p className="text-center text-white/58 mt-2">the seven rites</p>
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
            {STEP_COPY[steps[step]].rite}
          </p>
          <h2 className="text-xl font-semibold text-foreground">{STEP_COPY[steps[step]].title}</h2>
          <p className="text-sm text-white/62">{STEP_COPY[steps[step]].detail}</p>
          <p className="text-xs text-white/42">Rite {step + 1} of {steps.length}</p>
        </div>
        {/* Step content */}
        {(() => {
          const field = steps[step];
          switch (field) {
            case 'name':
              return (
                <div>
                  <label className="text-sm mb-2 block">Display Name</label>
                  <Input
                    type="text"
                    placeholder="Your name"
                    value={profile.name}
                    onChange={e => setProfileField('name', e.target.value)}
                  />
                </div>
              );
            case 'age':
              return (
                <div>
                  <label className="text-sm mb-2 block">Year of Birth</label>
                  <Input
                    type="number"
                    placeholder="e.g. 2000"
                    value={profile.age}
                    onChange={e => {
                      const year = e.target.value;
                      setProfileField('age', year);
                      const currentYear = new Date().getFullYear();
                      const parsedYear = parseInt(year, 10);
                      const ageNum = currentYear - parsedYear;
                      if (!year || isNaN(parsedYear)) {
                        setAgeError(null);
                      } else if (ageNum < 0 || ageNum > 120) {
                        setAgeError('Please enter a valid year.');
                      } else if (ageNum < 18) {
                        setAgeError('You must be at least 18 to use this app.');
                      } else {
                        setAgeError(null);
                      }
                    }}
                  />
                  {ageError && <p className="text-red-500 text-xs mt-1">{ageError}</p>}
                </div>
              );
            case 'pronouns':
              return (
                <div>
                  <label className="text-sm mb-2 block text-white/82">Pronouns</label>
                  <MultiSelect
                    ariaLabel="Pronouns"
                    options={PRONOUNS}
                    value={profile.pronouns}
                    onChange={(values) => setProfileField('pronouns', limitToThree(values))}
                  />
                  <p className="text-xs text-white/58 mt-1">Select up to 3</p>
                </div>
              );
            case 'identities':
              return (
                <div>
                  <label className="text-sm mb-2 block text-white/82">Gender Identity</label>
                  <MultiSelect
                    ariaLabel="Gender Identity"
                    options={IDENTITIES}
                    value={profile.identities}
                    onChange={(values) => setProfileField('identities', limitToThree(values))}
                  />
                  <p className="text-xs text-white/58 mt-1">Select up to 3</p>
                </div>
              );
            case 'lookingFor':
              return (
                <div>
                  <label className="text-sm mb-2 block text-white/82">Looking For</label>
                  <MultiSelect
                    ariaLabel="Looking For"
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
                    ariaLabel="Vibes"
                    optionGroups={VIBE_GROUPS}
                    value={profile.vibes}
                    onChange={(values) => setProfileField('vibes', limitToThree(values))}
                  />
                  <p className="text-xs text-white/58 mt-1">Select up to 3</p>
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
            default:
              return null;
          }
        })()}
        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
              Next rite <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={!canProceed() || saving}>
              {needsCodeOfConduct ? 'I agree and enter' : 'Enter cruush'} <Check className="ml-2 w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
