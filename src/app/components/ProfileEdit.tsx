import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
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
  toDefaultKinkInterest,
  toKinkId,
  type ProfileVisibility,
  type ProfilePayload,
  type ProfileVisibilityRules,
} from '../lib/profileApi';
import { getStoredCurrentUser, persistCurrentUser } from '../lib/sessionUser';
import {
  AVAILABILITY,
  BODY_TYPES,
  CONDOMS,
  COVID_VACCINE,
  CROWDS,
  DOXYPEP,
  ETHNICITIES,
  HIV_STATUS,
  HOBBIES,
  HOSTING,
  IDENTITIES,
  KINK_GROUPS,
  LOOKING_FOR,
  MPOX_VACCINE,
  POSITIONS,
  PREP,
  PRESENTATIONS,
  PROFILE_VISIBILITY_OPTIONS,
  PRONOUNS,
  ROLES,
  SEXUALITY,
  SUBSTANCE_BOUNDARIES,
  VIBE_GROUPS,
} from '../lib/profileOptions';

const VISIBILITY_OPTION_LABELS = PROFILE_VISIBILITY_OPTIONS.map((option) => option.label);

function getVisibilityLabel(value: ProfileVisibility): string {
  return PROFILE_VISIBILITY_OPTIONS.find((option) => option.value === value)?.label ?? 'Public';
}

function getVisibilityValue(label: string | undefined): ProfileVisibility {
  return (PROFILE_VISIBILITY_OPTIONS.find((option) => option.label === label)?.value ?? 'public') as ProfileVisibility;
}

function getSaveDisplayName(profile: ProfilePayload) {
  const profileDisplayName = (profile.display_name ?? '').trim();

  if (profileDisplayName.length >= 2) {
    return profileDisplayName;
  }

  const storedUser = getStoredCurrentUser();

  return (storedUser?.display_name ?? storedUser?.name ?? 'Cruush user').trim();
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function mergeCategorizedVibes(profile: ProfilePayload) {
  return uniqueValues([
    ...(profile.vibes ?? []),
    ...(profile.scenes ?? []),
    ...(profile.archetypes ?? []),
  ]);
}

function sanitizeCrowds(profile: ProfilePayload) {
  const allowedCrowds = new Set(profile.is_trans === true ? CROWDS : CROWDS.filter((crowd) => crowd !== 'T4T'));

  return uniqueValues(profile.crowds ?? []).filter((crowd) => allowedCrowds.has(crowd));
}

function sanitizeKinkInterests(profile: ProfilePayload): ProfilePayload['kink_interests'] {
  const sourceInterests = (profile.kink_interests ?? []).length > 0
    ? profile.kink_interests ?? []
    : (profile.kinks ?? []).map(toDefaultKinkInterest);
  const seen = new Set<string>();

  return sourceInterests
    .map((interest) => {
      const kinkId = toKinkId(interest.kink_id || interest.label || '');

      if (!kinkId || seen.has(kinkId)) {
        return null;
      }

      seen.add(kinkId);

      return {
        kink_id: kinkId,
        label: interest.label?.trim() || interest.kink_id,
        category: interest.category?.trim() || undefined,
      };
    })
    .filter((interest): interest is ProfilePayload['kink_interests'][number] => Boolean(interest));
}

function sanitizeVisibilityRules(profile: ProfilePayload): ProfileVisibilityRules {
  const rules = profile.visibility_rules ?? emptyProfilePayload.visibility_rules;
  const allowedActiveCrowds = new Set(sanitizeCrowds(profile));

  return {
    ...emptyProfilePayload.visibility_rules,
    ...rules,
    active_crowd_modes: uniqueValues(rules.active_crowd_modes ?? []).filter((crowd) => allowedActiveCrowds.has(crowd)),
    identities: uniqueValues(rules.identities ?? []),
    presentations: uniqueValues(rules.presentations ?? []),
    looking_for: uniqueValues(rules.looking_for ?? []),
    timing: uniqueValues(rules.timing ?? []),
    hosting: uniqueValues(rules.hosting ?? []),
    vibes: uniqueValues(rules.vibes ?? []),
    crowds: uniqueValues(rules.crowds ?? []),
    hobbies: uniqueValues(rules.hobbies ?? []),
    positions: uniqueValues(rules.positions ?? []),
    roles: uniqueValues(rules.roles ?? []),
    kinks: uniqueValues(rules.kinks ?? []),
    body_types: uniqueValues(rules.body_types ?? []),
    sexuality: uniqueValues(rules.sexuality ?? []),
    substance_boundaries: uniqueValues(rules.substance_boundaries ?? []),
    age_range: rules.age_range ?? null,
    distance: rules.distance ?? null,
  };
}

function toProfileSavePayload(profile: ProfilePayload): ProfilePayload {
  return {
    display_name: getSaveDisplayName(profile),
    photos: profile.photos ?? [],
    bio: (profile.bio ?? '').trim(),
    pronouns: profile.pronouns ?? [],
    custom_pronouns: (profile.custom_pronouns ?? '').trim(),
    year_of_birth: profile.year_of_birth ?? null,
    ethnicity: profile.ethnicity ?? '',
    identities: profile.identities ?? [],
    presentation: profile.presentation ?? [],
    sexuality: profile.sexuality ?? [],
    body_type: profile.body_type ?? [],
    height: profile.height ?? '',
    weight: profile.weight ?? '',
    position: profile.position ?? [],
    role: profile.role ?? [],
    is_trans: profile.is_trans ?? null,
    trans_status_visibility: profile.trans_status_visibility ?? 'public',
    crowds: sanitizeCrowds(profile),
    availability: profile.availability ?? [],
    hosting_travel: profile.hosting_travel ?? [],
    kinks: profile.kinks ?? [],
    kink_interests: sanitizeKinkInterests(profile),
    kinks_visibility: profile.kinks_visibility ?? 'public',
    vibes: mergeCategorizedVibes(profile),
    scenes: [],
    archetypes: [],
    hobbies: profile.hobbies ?? [],
    custom_hobby: (profile.custom_hobby ?? '').trim(),
    looking_for: profile.looking_for ?? [],
    hiv_status: profile.hiv_status ?? [],
    hiv_status_visibility: profile.hiv_status_visibility ?? 'mutual_cruushes',
    custom_hiv_status: (profile.custom_hiv_status ?? '').trim(),
    condoms: profile.condoms ?? [],
    custom_condoms: (profile.custom_condoms ?? '').trim(),
    prep: profile.prep ?? [],
    custom_prep: (profile.custom_prep ?? '').trim(),
    doxypep: profile.doxypep ?? [],
    custom_doxypep: (profile.custom_doxypep ?? '').trim(),
    covid_vaccine: profile.covid_vaccine ?? [],
    custom_covid_vaccine: (profile.custom_covid_vaccine ?? '').trim(),
    mpox_vaccine: profile.mpox_vaccine ?? [],
    custom_mpox_vaccine: (profile.custom_mpox_vaccine ?? '').trim(),
    substance_boundaries: profile.substance_boundaries ?? [],
    visibility_rules: sanitizeVisibilityRules(profile),
  };
}

export default function ProfileEdit() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfilePayload>(emptyProfilePayload);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('profile');

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

  const handleTransChange = (checked: boolean) => {
    setProfile((prev) => ({
      ...prev,
      is_trans: checked,
      crowds: checked ? prev.crowds ?? [] : (prev.crowds ?? []).filter((crowd) => crowd !== 'T4T'),
      visibility_rules: checked
        ? prev.visibility_rules
        : {
            ...(prev.visibility_rules ?? emptyProfilePayload.visibility_rules),
            active_crowd_modes: (prev.visibility_rules?.active_crowd_modes ?? []).filter((crowd) => crowd !== 'T4T'),
          },
    }));
  };

  const handleCrowdsChange = (crowds: string[]) => {
    setProfile((prev) => ({
      ...prev,
      crowds,
      visibility_rules: {
        ...(prev.visibility_rules ?? emptyProfilePayload.visibility_rules),
        active_crowd_modes: (prev.visibility_rules?.active_crowd_modes ?? []).filter((crowd) => crowds.includes(crowd)),
      },
    }));
  };

  const handleKinksChange = (selectedKinks: string[]) => {
    setProfile((prev) => {
      const existingById = new Map((prev.kink_interests ?? []).map((interest) => [interest.kink_id, interest]));

      return {
        ...prev,
        kinks: selectedKinks,
        kink_interests: selectedKinks.map((kink) => existingById.get(toKinkId(kink)) ?? toDefaultKinkInterest(kink)),
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const savedProfile = await saveMyProfile(toProfileSavePayload(profile));
      setProfile({
        ...emptyProfilePayload,
        ...savedProfile,
      });
      persistCurrentUser({
        id: savedProfile.id,
        name: savedProfile.display_name,
        display_name: savedProfile.display_name,
        age: savedProfile.year_of_birth ? new Date().getFullYear() - savedProfile.year_of_birth : null,
        year_of_birth: savedProfile.year_of_birth,
      });
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
    role: profile.role || [],
    is_trans: profile.is_trans ?? null,
    trans_status_visibility: profile.trans_status_visibility || 'public',
    crowds: sanitizeCrowds(profile),
    availability: profile.availability || [],
    hosting_travel: profile.hosting_travel || [],
    kinks: profile.kinks || [],
    kink_interests: profile.kink_interests || [],
    kinks_visibility: profile.kinks_visibility || 'public',
    vibes: mergeCategorizedVibes(profile),
    scenes: [],
    archetypes: [],
    hobbies: profile.hobbies || [],
    looking_for: profile.looking_for || [],
    hiv_status: profile.hiv_status || [],
    hiv_status_visibility: profile.hiv_status_visibility || 'mutual_cruushes',
    condoms: profile.condoms || [],
    prep: profile.prep || [],
    doxypep: profile.doxypep || [],
    covid_vaccine: profile.covid_vaccine || [],
    mpox_vaccine: profile.mpox_vaccine || [],
    substance_boundaries: profile.substance_boundaries || [],
    visibility_rules: sanitizeVisibilityRules(profile),
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
            background: 'var(--cruush-gradient)',
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* ...existing code for TabsList... */}
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="photos" onClick={() => setActiveTab('photos')}>Photos</TabsTrigger>
            <TabsTrigger value="profile" onClick={() => setActiveTab('profile')}>Profile</TabsTrigger>
            <TabsTrigger value="basics" onClick={() => setActiveTab('basics')}>Basics</TabsTrigger>
            <TabsTrigger value="intimacy" onClick={() => setActiveTab('intimacy')}>Intimacy</TabsTrigger>
            <TabsTrigger value="health" onClick={() => setActiveTab('health')}>Health</TabsTrigger>
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
              <MultiSelect
                ariaLabel="Vibes"
                optionGroups={VIBE_GROUPS}
                value={normalizedProfile.vibes}
                onChange={(vals) => handleChange('vibes', vals)}
              />
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

            <div className="space-y-3 rounded-md border border-border bg-card/40 p-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="is_trans"
                  checked={normalizedProfile.is_trans === true}
                  onCheckedChange={(checked) => handleTransChange(checked === true)}
                />
                <Label htmlFor="is_trans">I am trans</Label>
              </div>

              <div className="space-y-2">
                <Label>Trans status visibility</Label>
                <MultiSelect
                  ariaLabel="Trans status visibility"
                  options={VISIBILITY_OPTION_LABELS}
                  value={[getVisibilityLabel(normalizedProfile.trans_status_visibility)]}
                  onChange={(values) => handleChange('trans_status_visibility', getVisibilityValue(values[0]))}
                  selectionMode="single"
                  placeholder="Select visibility..."
                />
              </div>

              <div className="space-y-2">
                <Label>Crowds</Label>
                <MultiSelect
                  ariaLabel="Crowds"
                  options={normalizedProfile.is_trans === true ? CROWDS : CROWDS.filter((crowd) => crowd !== 'T4T')}
                  value={normalizedProfile.crowds}
                  onChange={handleCrowdsChange}
                />
              </div>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Position</Label>
                <MultiSelect
                  ariaLabel="Position"
                  options={POSITIONS}
                  value={normalizedProfile.position}
                  onChange={(vals) => handleChange('position', vals)}
                  selectionMode="single"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <MultiSelect
                  ariaLabel="Role"
                  options={ROLES}
                  value={normalizedProfile.role}
                  onChange={(vals) => handleChange('role', vals)}
                  selectionMode="single"
                />
              </div>
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
              <Label>Kinks & Fetishes</Label>
              <MultiSelect
                ariaLabel="Kinks & Fetishes"
                optionGroups={KINK_GROUPS}
                value={normalizedProfile.kinks}
                onChange={handleKinksChange}
              />
            </div>
            <div className="space-y-2">
              <Label>Kinks & Fetishes visibility</Label>
              <MultiSelect
                ariaLabel="Kinks & Fetishes visibility"
                options={VISIBILITY_OPTION_LABELS}
                value={[getVisibilityLabel(normalizedProfile.kinks_visibility)]}
                onChange={(values) => handleChange('kinks_visibility', getVisibilityValue(values[0]))}
                selectionMode="single"
                placeholder="Select visibility..."
              />
            </div>
          </TabsContent>

          <TabsContent value="health" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>HIV Status</Label>
              <MultiSelect ariaLabel="HIV Status" options={HIV_STATUS} value={normalizedProfile.hiv_status} onChange={vals => handleChange('hiv_status', vals)} />
            </div>
            <div className="space-y-2">
              <Label>HIV status visibility</Label>
              <MultiSelect
                ariaLabel="HIV status visibility"
                options={VISIBILITY_OPTION_LABELS}
                value={[getVisibilityLabel(normalizedProfile.hiv_status_visibility)]}
                onChange={(values) => handleChange('hiv_status_visibility', getVisibilityValue(values[0]))}
                selectionMode="single"
                placeholder="Select visibility..."
              />
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
              <Label>Substance Boundaries</Label>
              <p className="text-sm text-muted-foreground">Select anything you do not want involved when meeting.</p>
              <MultiSelect
                options={SUBSTANCE_BOUNDARIES}
                value={normalizedProfile.substance_boundaries}
                onChange={vals => handleChange('substance_boundaries', vals)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
