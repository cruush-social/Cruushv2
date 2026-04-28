import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import supabase from '../../../utils/supabase/client';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import MultiSelect from './MultiSelect';
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
  const [profile, setProfile] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (!error && data) {
        setProfile(data);
      }
      setLoading(false);
    };
    fetchProfile();
  }, []);

  const handleChange = (field: string, value: any) => {
    setProfile((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      setSaving(false);
      return;
    }
    const upsertProfile = {
      id: user.id,
      display_name: profile.display_name,
      photos: profile.photos || [],
      bio: profile.bio,
      gender_identity: profile.identities || [],
      gender_presentation: profile.presentation || [],
      pronouns: profile.pronouns || [],
      custom_pronouns: profile.custom_pronouns || '',
      year_of_birth: profile.year_of_birth ? parseInt(profile.year_of_birth) : null,
      ethnicity: profile.ethnicity ? [profile.ethnicity] : [],
      body_type: profile.body_type || [],
      height: profile.height || '',
      weight: profile.weight || '',
      position: profile.position || [],
      availability: profile.availability || [],
      hosting_travel: profile.hosting_travel || profile.hosting || [],
      kinks: profile.kinks || [],
      vibes: profile.vibes || [],
      hobbies: profile.hobbies || [],
      custom_hobby: profile.custom_hobby || '',
      looking_for: profile.looking_for || [],
      hiv_status: profile.hiv_status || [],
      custom_hiv_status: profile.custom_hiv_status || '',
      condoms: profile.condoms || [],
      custom_condoms: profile.custom_condoms || '',
      prep: profile.prep || [],
      custom_prep: profile.custom_prep || '',
      doxypep: profile.doxypep || [],
      custom_doxypep: profile.custom_doxypep || '',
      covid_vaccine: profile.covid_vaccine || [],
      custom_covid_vaccine: profile.custom_covid_vaccine || '',
      mpox_vaccine: profile.mpox_vaccine || [],
      custom_mpox_vaccine: profile.custom_mpox_vaccine || '',
      smoking: profile.smoking || [],
      custom_smoking: profile.custom_smoking || '',
      drinking: profile.drinking || [],
      custom_drinking: profile.custom_drinking || '',
      drugs: profile.drugs || [],
      custom_drugs: profile.custom_drugs || '',
      weed: profile.weed || [],
      custom_weed: profile.custom_weed || '',
      sexuality: profile.sexuality || [],
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('profiles')
      .upsert(upsertProfile);
    setSaving(false);
    if (!error) navigate(-1);
  };

  if (loading) return <div>Loading...</div>;

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
              <Label>Looking For</Label>
                <MultiSelect options={LOOKING_FOR} value={profile.looking_for || []} onChange={vals => handleChange('looking_for', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Availability</Label>
              <MultiSelect options={AVAILABILITY} value={profile.availability || []} onChange={vals => handleChange('availability', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Hosting/Travel</Label>
              <MultiSelect options={HOSTING} value={profile.hosting || []} onChange={vals => handleChange('hosting', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Vibes</Label>
                <MultiSelect options={VIBES} value={profile.vibes || []} onChange={vals => handleChange('vibes', vals)} />
                <MultiSelect options={PRONOUNS} value={profile.pronouns || []} onChange={vals => handleChange('pronouns', vals)} />
            </div>
          </TabsContent>

          <TabsContent value="basics" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell people about yourself..."
                value={profile.bio || ''}
                onChange={e => handleChange('bio', e.target.value)}
                className="min-h-[120px] bg-input-background"
              />
            </div>

            <div className="space-y-2">
              <Label>Pronouns</Label>
              <MultiSelect options={PRONOUNS} value={profile.pronouns ? [profile.pronouns] : []} onChange={vals => handleChange('pronouns', vals[0] || '')} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Year of Birth</Label>
                <Input id="age" type="number" placeholder="2000" value={profile.year_of_birth || ''} onChange={e => handleChange('year_of_birth', e.target.value)} className="bg-input-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ethnicity">Ethnicity</Label>
                <select className="w-full h-10 px-3 rounded-md bg-input-background border border-input" value={profile.ethnicity || ''} onChange={e => handleChange('ethnicity', e.target.value)}>
                  <option value="">Select...</option>
                  {ETHNICITIES.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Identities</Label>
                <MultiSelect options={IDENTITIES} value={profile.identities || []} onChange={vals => handleChange('identities', vals)} />
            </div>


            <div className="space-y-2">
              <Label>Presentation</Label>
              <MultiSelect options={PRESENTATIONS} value={profile.presentation || []} onChange={vals => handleChange('presentation', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Sexuality</Label>
              <MultiSelect options={SEXUALITY} value={profile.sexuality || []} onChange={vals => handleChange('sexuality', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Body Type</Label>
              <MultiSelect options={BODY_TYPES} value={profile.body_type || []} onChange={vals => handleChange('body_type', vals)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="height">Height</Label>
                <Input id="height" placeholder={'5\'8"'} value={profile.height || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('height', e.target.value)} className="bg-input-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight</Label>
                  <Input id="weight" placeholder="155 lbs" value={profile.weight || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('weight', e.target.value)} className="bg-input-background" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Hobbies</Label>
              <MultiSelect options={HOBBIES} value={profile.hobbies || []} onChange={vals => handleChange('hobbies', vals)} />
            </div>
          </TabsContent>

          <TabsContent value="intimacy" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Position</Label>
              <MultiSelect options={POSITIONS} value={profile.position || []} onChange={vals => handleChange('position', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Availability</Label>
              <MultiSelect options={AVAILABILITY} value={profile.availability || []} onChange={vals => handleChange('availability', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Hosting/Travel</Label>
              <MultiSelect options={HOSTING} value={profile.hosting_travel || []} onChange={vals => handleChange('hosting_travel', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Kinks</Label>
              <MultiSelect options={KINKS} value={profile.kinks || []} onChange={vals => handleChange('kinks', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Vibes</Label>
              <MultiSelect options={VIBES} value={profile.vibes || []} onChange={vals => handleChange('vibes', vals)} />
            </div>
          </TabsContent>

          <TabsContent value="health" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>HIV Status</Label>
              <MultiSelect options={HIV_STATUS} value={profile.hiv_status || []} onChange={vals => handleChange('hiv_status', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Condoms</Label>
              <MultiSelect options={CONDOMS} value={profile.condoms || []} onChange={vals => handleChange('condoms', vals)} />
            </div>
            <div className="space-y-2">
              <Label>PrEP</Label>
              <MultiSelect options={PREP} value={profile.prep || []} onChange={vals => handleChange('prep', vals)} />
            </div>
            <div className="space-y-2">
              <Label>DoxyPEP</Label>
              <MultiSelect options={DOXYPEP} value={profile.doxypep || []} onChange={vals => handleChange('doxypep', vals)} />
            </div>
            <div className="space-y-2">
              <Label>COVID Vaccine</Label>
              <MultiSelect options={COVID_VACCINE} value={profile.covid_vaccine || []} onChange={vals => handleChange('covid_vaccine', vals)} />
            </div>
            <div className="space-y-2">
              <Label>MPOX Vaccine</Label>
              <MultiSelect options={MPOX_VACCINE} value={profile.mpox_vaccine || []} onChange={vals => handleChange('mpox_vaccine', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Smoking</Label>
              <MultiSelect options={SMOKING} value={profile.smoking || []} onChange={vals => handleChange('smoking', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Drinking</Label>
              <MultiSelect options={DRINKING} value={profile.drinking || []} onChange={vals => handleChange('drinking', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Drugs</Label>
              <MultiSelect options={DRUGS} value={profile.drugs || []} onChange={vals => handleChange('drugs', vals)} />
            </div>
            <div className="space-y-2">
              <Label>420</Label>
              <MultiSelect options={WEED} value={profile.weed || []} onChange={vals => handleChange('weed', vals)} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
