import { useState } from 'react';
// Import option arrays from ProfileEdit for consistency
import { IDENTITIES, PRESENTATIONS, PRONOUNS, SEXUALITY, BODY_TYPES, POSITIONS, AVAILABILITY, LOOKING_FOR, VIBES } from './ProfileEdit';
import { Heart, ArrowRight, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import supabase from '../../../utils/supabase/client';


interface ProfileOnboardingProps {
  onComplete: () => void;
}

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
  ];
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({
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
    smoking: [],
    drinking: [],
    drugs: [],
    weed: [],
    custom_pronouns: '',
    custom_hobby: '',
    custom_hiv_status: '',
    custom_condoms: '',
    custom_prep: '',
    custom_doxypep: '',
    custom_covid_vaccine: '',
    custom_mpox_vaccine: '',
    custom_smoking: '',
    custom_drinking: '',
    custom_drugs: '',
    custom_weed: '',
    sexuality: [],
  });
  const [ageError, setAgeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setProfileField = (field: string, value: any) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    const field = steps[step];
    switch (field) {
      case 'name':
        return profile.name.trim().length > 1;
      case 'age':
        const year = parseInt(profile.age);
        const currentYear = new Date().getFullYear();
        const ageNum = currentYear - year;
        return (
          profile.age &&
          !isNaN(year) &&
          ageNum >= 18 &&
          ageNum < 120
        );
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
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('Not authenticated');
      const upsertProfile = {
        id: user.id,
        display_name: profile.name,
        year_of_birth: profile.age ? parseInt(profile.age) : null,
        pronouns: profile.pronouns,
        gender_identity: profile.identities,
        looking_for: profile.lookingFor,
        vibes: profile.vibes,
        bio: profile.bio,
        // All other fields included for completeness, but above are required for onboarding gating
        photos: profile.photos,
        gender_presentation: profile.gender_presentation,
        ethnicity: profile.ethnicity,
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
        smoking: profile.smoking,
        drinking: profile.drinking,
        drugs: profile.drugs,
        weed: profile.weed,
        updated_at: new Date().toISOString(),
        custom_pronouns: profile.custom_pronouns,
        custom_hobby: profile.custom_hobby,
        custom_hiv_status: profile.custom_hiv_status,
        custom_condoms: profile.custom_condoms,
        custom_prep: profile.custom_prep,
        custom_doxypep: profile.custom_doxypep,
        custom_covid_vaccine: profile.custom_covid_vaccine,
        custom_mpox_vaccine: profile.custom_mpox_vaccine,
        custom_smoking: profile.custom_smoking,
        custom_drinking: profile.custom_drinking,
        custom_drugs: profile.custom_drugs,
        custom_weed: profile.custom_weed,
        sexuality: profile.sexuality,
      };
      const { error } = await supabase
        .from('profiles')
        .upsert(upsertProfile);
      if (error) throw error;
      onComplete();
    } catch (error) {
      console.error('Error saving profile:', error);
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'UnifrakturMaguntia, serif', background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>cruush</h1>
        <p className="text-center text-muted-foreground mt-2">Set up your profile</p>
      </header>
      <div className="w-full max-w-md bg-card p-6 rounded-lg shadow space-y-8">
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
                      const ageNum = currentYear - parseInt(year);
                      if (!year || isNaN(parseInt(year))) {
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
