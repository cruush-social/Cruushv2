import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import MultiSelect from './MultiSelect';
import {
  emptyProfilePayload,
  getMyProfile,
  ProfileApiError,
  saveMyProfile,
  type ProfilePayload,
} from '../lib/profileApi';
import {
  AVAILABILITY,
  BODY_TYPES,
  CONDOMS,
  COVID_VACCINE,
  DOXYPEP,
  DRINKING,
  DRUGS,
  ETHNICITIES,
  HIV_STATUS,
  HOBBIES,
  HOSTING,
  IDENTITIES,
  KINKS,
  LOOKING_FOR,
  MPOX_VACCINE,
  POSITIONS,
  PREP,
  PRESENTATIONS,
  PRONOUNS,
  SEXUALITY,
  SMOKING,
  VIBES,
  WEED,
} from '../lib/profileOptions';

export default function ProfileEdit() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfilePayload>(emptyProfilePayload);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMyProfile();
        setProfile({
          ...emptyProfilePayload,
          ...data,
        });
      } catch (fetchError) {
        if (fetchError instanceof ProfileApiError && fetchError.status === 404) {
          setProfile(emptyProfilePayload);
        } else {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load profile.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleChange = <K extends keyof ProfilePayload>(field: K, value: ProfilePayload[K]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const savedProfile = await saveMyProfile({
        ...profile,
        display_name: profile.display_name.trim(),
        bio: profile.bio.trim(),
        custom_pronouns: profile.custom_pronouns.trim(),
        custom_hobby: profile.custom_hobby.trim(),
        custom_hiv_status: profile.custom_hiv_status.trim(),
        custom_condoms: profile.custom_condoms.trim(),
        custom_prep: profile.custom_prep.trim(),
        custom_doxypep: profile.custom_doxypep.trim(),
        custom_covid_vaccine: profile.custom_covid_vaccine.trim(),
        custom_mpox_vaccine: profile.custom_mpox_vaccine.trim(),
        custom_smoking: profile.custom_smoking.trim(),
        custom_drinking: profile.custom_drinking.trim(),
        custom_drugs: profile.custom_drugs.trim(),
        custom_weed: profile.custom_weed.trim(),
      });
      setProfile({
        ...emptyProfilePayload,
        ...savedProfile,
      });
      localStorage.setItem('cruush_user', JSON.stringify({
        id: savedProfile.id,
        name: savedProfile.display_name,
        display_name: savedProfile.display_name,
        age: savedProfile.year_of_birth ? new Date().getFullYear() - savedProfile.year_of_birth : null,
        year_of_birth: savedProfile.year_of_birth,
      }));
      navigate(-1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  const normalizedProfile: ProfilePayload = {
    ...profile,
    photos: profile.photos || [],
    pronouns: profile.pronouns || [],
    identities: profile.identities || [],
    presentation: profile.presentation || [],
    sexuality: profile.sexuality || [],
    body_type: profile.body_type || [],
    position: profile.position || [],
    availability: profile.availability || [],
    hosting_travel: profile.hosting_travel || [],
    kinks: profile.kinks || [],
    vibes: profile.vibes || [],
    hobbies: profile.hobbies || [],
    looking_for: profile.looking_for || [],
    hiv_status: profile.hiv_status || [],
    condoms: profile.condoms || [],
    prep: profile.prep || [],
    doxypep: profile.doxypep || [],
    covid_vaccine: profile.covid_vaccine || [],
    mpox_vaccine: profile.mpox_vaccine || [],
    smoking: profile.smoking || [],
    drinking: profile.drinking || [],
    drugs: profile.drugs || [],
    weed: profile.weed || [],
    year_of_birth: profile.year_of_birth,
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center justify-between z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Edit Profile</h2>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <Tabs defaultValue="profile" className="w-full">
          {/* ...existing code for TabsList... */}
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="intimacy">Intimacy</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
          </TabsList>

          {/* ...Photos tab (not migrated)... */}
          <TabsContent value="photos" className="space-y-4 mt-6">
            <div className="grid grid-cols-3 gap-4">
              {/* Photos logic here */}
            </div>
            <p className="text-sm text-muted-foreground">Add up to 9 photos. Your first photo will be your profile picture.</p>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                placeholder="Your display name"
                value={normalizedProfile.display_name}
                onChange={(e) => handleChange('display_name', e.target.value)}
                className="bg-input-background"
              />
            </div>

            <div className="space-y-2">
              <Label>Looking For</Label>
              <MultiSelect options={LOOKING_FOR} value={normalizedProfile.looking_for} onChange={(vals) => handleChange('looking_for', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Availability</Label>
              <MultiSelect options={AVAILABILITY} value={normalizedProfile.availability} onChange={(vals) => handleChange('availability', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Hosting/Travel</Label>
              <MultiSelect options={HOSTING} value={normalizedProfile.hosting_travel} onChange={(vals) => handleChange('hosting_travel', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Vibes</Label>
              <MultiSelect options={VIBES} value={normalizedProfile.vibes} onChange={(vals) => handleChange('vibes', vals)} />
            </div>
          </TabsContent>

          <TabsContent value="basics" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell people about yourself..."
                value={normalizedProfile.bio}
                onChange={e => handleChange('bio', e.target.value)}
                className="min-h-[120px] bg-input-background"
              />
            </div>

            <div className="space-y-2">
              <Label>Pronouns</Label>
              <MultiSelect options={PRONOUNS} value={normalizedProfile.pronouns} onChange={(vals) => handleChange('pronouns', vals)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Year of Birth</Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="2000"
                  value={normalizedProfile.year_of_birth ?? ''}
                  onChange={e => handleChange('year_of_birth', e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="bg-input-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ethnicity">Ethnicity</Label>
                <select className="w-full h-10 px-3 rounded-md bg-input-background border border-input" value={normalizedProfile.ethnicity} onChange={e => handleChange('ethnicity', e.target.value)}>
                  <option value="">Select...</option>
                  {ETHNICITIES.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Identities</Label>
              <MultiSelect options={IDENTITIES} value={normalizedProfile.identities} onChange={(vals) => handleChange('identities', vals)} />
            </div>


            <div className="space-y-2">
              <Label>Presentation</Label>
              <MultiSelect options={PRESENTATIONS} value={normalizedProfile.presentation} onChange={(vals) => handleChange('presentation', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Sexuality</Label>
              <MultiSelect options={SEXUALITY} value={normalizedProfile.sexuality} onChange={(vals) => handleChange('sexuality', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Body Type</Label>
              <MultiSelect options={BODY_TYPES} value={normalizedProfile.body_type} onChange={(vals) => handleChange('body_type', vals)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="height">Height</Label>
                <Input id="height" placeholder={'5\'8"'} value={normalizedProfile.height} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('height', e.target.value)} className="bg-input-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight</Label>
                <Input id="weight" placeholder="155 lbs" value={normalizedProfile.weight} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('weight', e.target.value)} className="bg-input-background" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Hobbies</Label>
              <MultiSelect options={HOBBIES} value={normalizedProfile.hobbies} onChange={(vals) => handleChange('hobbies', vals)} />
            </div>
          </TabsContent>

          <TabsContent value="intimacy" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Position</Label>
              <MultiSelect options={POSITIONS} value={normalizedProfile.position} onChange={vals => handleChange('position', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Availability</Label>
              <MultiSelect options={AVAILABILITY} value={normalizedProfile.availability} onChange={vals => handleChange('availability', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Hosting/Travel</Label>
              <MultiSelect options={HOSTING} value={normalizedProfile.hosting_travel} onChange={vals => handleChange('hosting_travel', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Kinks</Label>
              <MultiSelect options={KINKS} value={normalizedProfile.kinks} onChange={vals => handleChange('kinks', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Vibes</Label>
              <MultiSelect options={VIBES} value={normalizedProfile.vibes} onChange={vals => handleChange('vibes', vals)} />
            </div>
          </TabsContent>

          <TabsContent value="health" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>HIV Status</Label>
              <MultiSelect options={HIV_STATUS} value={normalizedProfile.hiv_status} onChange={vals => handleChange('hiv_status', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Condoms</Label>
              <MultiSelect options={CONDOMS} value={normalizedProfile.condoms} onChange={vals => handleChange('condoms', vals)} />
            </div>
            <div className="space-y-2">
              <Label>PrEP</Label>
              <MultiSelect options={PREP} value={normalizedProfile.prep} onChange={vals => handleChange('prep', vals)} />
            </div>
            <div className="space-y-2">
              <Label>DoxyPEP</Label>
              <MultiSelect options={DOXYPEP} value={normalizedProfile.doxypep} onChange={vals => handleChange('doxypep', vals)} />
            </div>
            <div className="space-y-2">
              <Label>COVID Vaccine</Label>
              <MultiSelect options={COVID_VACCINE} value={normalizedProfile.covid_vaccine} onChange={vals => handleChange('covid_vaccine', vals)} />
            </div>
            <div className="space-y-2">
              <Label>MPOX Vaccine</Label>
              <MultiSelect options={MPOX_VACCINE} value={normalizedProfile.mpox_vaccine} onChange={vals => handleChange('mpox_vaccine', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Smoking</Label>
              <MultiSelect options={SMOKING} value={normalizedProfile.smoking} onChange={vals => handleChange('smoking', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Drinking</Label>
              <MultiSelect options={DRINKING} value={normalizedProfile.drinking} onChange={vals => handleChange('drinking', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Drugs</Label>
              <MultiSelect options={DRUGS} value={normalizedProfile.drugs} onChange={vals => handleChange('drugs', vals)} />
            </div>
            <div className="space-y-2">
              <Label>420</Label>
              <MultiSelect options={WEED} value={normalizedProfile.weed} onChange={vals => handleChange('weed', vals)} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
