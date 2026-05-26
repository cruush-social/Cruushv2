import { useState } from 'react';
import { IDENTITIES, LOOKING_FOR, PRONOUNS, VIBES } from '../lib/profileOptions';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { saveMyProfile, type ProfilePayload } from '../lib/profileApi';
import { persistCurrentUser } from '../lib/sessionUser';

interface ProfileOnboardingProps {
  onComplete: () => void;
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
  availability: string[];
  hosting_travel: string[];
  kinks: string[];
  hobbies: string[];
  hiv_status: string[];
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

export default function ProfileOnboarding({ onComplete }: ProfileOnboardingProps) {
  // Minimal onboarding steps, but state includes all schema fields for upsert
  const steps = [
    'name',
    'age',
    'pronouns',
    'identities',
    'lookingFor',
    'vibes',
    'bio',
  ] as const;
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
    availability: [],
    hosting_travel: [],
    kinks: [],
    hobbies: [],
    hiv_status: [],
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
        availability: profile.availability,
        hosting_travel: profile.hosting_travel,
        kinks: profile.kinks,
        hobbies: profile.hobbies,
        hiv_status: profile.hiv_status,
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
      onComplete();
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <header className="mb-6 text-center">
        <h1 className="cruush-logo-text text-4xl font-bold mb-2">cruush</h1>
        <p className="text-center text-muted-foreground mt-2">Set up your profile</p>
      </header>
      <div className="w-full max-w-md bg-card p-6 rounded-lg shadow space-y-8">
        {saveError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}
        <div className="flex items-center gap-2 mb-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground text-center mb-4">Step {step + 1} of {steps.length}</p>
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
                  <label className="text-sm mb-2 block">Pronouns</label>
                  <select
                    multiple
                    value={profile.pronouns}
                    onChange={e => setProfileField('pronouns', Array.from(e.target.selectedOptions, o => o.value).slice(0, 3))}
                    className="w-full h-10 px-3 rounded-md bg-input-background border border-input"
                  >
                    {PRONOUNS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Select up to 3</p>
                </div>
              );
            case 'identities':
              return (
                <div>
                  <label className="text-sm mb-2 block">Gender Identity</label>
                  <select
                    multiple
                    value={profile.identities}
                    onChange={e => setProfileField('identities', Array.from(e.target.selectedOptions, o => o.value).slice(0, 3))}
                    className="w-full h-10 px-3 rounded-md bg-input-background border border-input"
                  >
                    {IDENTITIES.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Select up to 3</p>
                </div>
              );
            case 'lookingFor':
              return (
                <div>
                  <label className="text-sm mb-2 block">Looking For</label>
                  <select
                    multiple
                    value={profile.lookingFor}
                    onChange={e => setProfileField('lookingFor', Array.from(e.target.selectedOptions, o => o.value).slice(0, 3))}
                    className="w-full h-10 px-3 rounded-md bg-input-background border border-input"
                  >
                    {LOOKING_FOR.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Select up to 3</p>
                </div>
              );
            case 'vibes':
              return (
                <div>
                  <label className="text-sm mb-2 block">Vibes</label>
                  <select
                    multiple
                    value={profile.vibes}
                    onChange={e => setProfileField('vibes', Array.from(e.target.selectedOptions, o => o.value).slice(0, 3))}
                    className="w-full h-10 px-3 rounded-md bg-input-background border border-input"
                  >
                    {VIBES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Select up to 3</p>
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
              Next <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={!canProceed() || saving}>
              Finish <Check className="ml-2 w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
