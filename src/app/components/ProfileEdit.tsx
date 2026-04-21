import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Camera, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Checkbox } from './ui/checkbox';
import MultiSelect from './MultiSelect';

const IDENTITIES = [
  'agender', 'androgynous', 'bigender', 'cis man', 'cis woman', 'demiboy', 'demigirl',
  'demi-nonbinary', "fa'afafine", 'femme', 'genderfluid', 'gender nonconforming', 'genderqueer',
  'intersex', 'man', 'māhū', 'maverique', 'neutrois', 'nonbinary', 'pangender', 'polygender',
  'queer', 'questioning', 'third gender', 'trans man', 'trans woman', 'transfeminine',
  'transmasculine', 'travesti', 'two-spirit', 'woman', 'x-gender', 'hijra', 'bakla', 'kathoey', 'muxé'
];

const PRESENTATIONS = [
  'androgynous', 'butch', 'femme', 'masc', 'femme queen', 'stud', 'soft butch', 'hard femme',
  'high femme', 'tomboy', 'boi', 'drag king', 'drag queen', 'genderpunk', 'stone butch', 'stone femme', 'nonconforming'
];

const PRONOUNS = ['they/them', 'she/her', 'he/him', 'ze/zir', 'xe/xem', 'fae/faer', 've/ver', 'ey/em', 'per/per', "it/its", 'ask me'];

const ETHNICITIES = ['Black', 'East Asian', 'Indigenous', 'Latinx', 'Middle Eastern', 'Mixed', 'Pacific Islander', 'South Asian', 'Southeast Asian', 'White', 'Other'];

const BODY_TYPES = ['slim', 'average', 'athletic', 'muscular', 'curvy', 'full-figured', 'bear', 'chubby', 'stocky', 'petite', 'tall', 'short', 'plus-size', 'other'];

const POSITIONS = ['top', 'bottom', 'versatile', 'side', 'oral', 'service', 'dominant', 'submissive', 'switch', 'none'];

const LOOKING_FOR = ['hookup', 'date', 'friends', 'relationship', 'chat', 'group', 'third', 'event', 'other'];

const TIMING = ['now', 'later', 'open'];

const HOSTING = ['can host', 'can travel', "can't host", "can't travel", 'hotel', 'outdoors', 'ask me'];

const VIBES = [
  'Bear', 'Otter', 'Twink', 'Cub', 'Wolf', 'Daddy', 'Geek', 'Leather', 'Pup', 'Chub', 'Clean-cut',
  'Rugged', 'T4T', 'Goddess', 'Pixie', 'Mommy', 'Doll', 'Goth', 'Alt', 'Punk', 'Cottagecore', 'Granola',
  'Artsy', 'Sporty', 'Homebody', 'Hippie', 'E-Girl/E-Boy', 'Princess', 'Baddie', 'Sober', 'Raver',
  'Spiritual', 'Kitten', 'Pony', 'Bimbo', 'Corporate'
];

const PROTECTION = ['always', 'sometimes', 'never', 'discuss', 'PrEP', 'DoxyPEP', 'condoms', 'undetectable'];

const KINKS = [
  'anal', 'bondage', 'breath play', 'chastity', 'cock and ball torture', 'costumes', 'dirty talk',
  'edging', 'exhibitionism', 'feet', 'fisting', 'group', 'impact', 'leather', 'lingerie', 'massage',
  'mutual masturbation', 'nipple play', 'oral', 'pegging', 'pet play', 'praise', 'public', 'roleplay',
  'rimming', 'rough', 'sensation', 'spanking', 'toys', 'uniforms', 'voyeurism', 'wax', 'watersports'
];

const HOBBIES = [
  'music', 'gaming', 'drag', 'fitness', 'cooking', 'art', 'photography', 'dancing', 'reading', 'writing',
  'hiking', 'yoga', 'thrifting', 'cosplay', 'diy', 'film/tv', 'gardening', 'travel', 'fashion',
  'roller skating', 'tattoos', 'karaoke', 'activism', 'astrology', 'anime/manga', 'board games',
  'clubbing', 'camping', 'crafts', 'meditation', 'volunteering', 'pottery', 'journaling', 'skateboarding',
  'swimming', 'martial arts', 'poetry', 'streaming', 'baking', 'vintage collecting', 'tarot', 'singing',
  'djing', 'makeup', 'cycling', 'running', 'rock climbing', 'painting', 'theater', 'podcasts', 'movies'
];

export default function ProfileEdit() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<string[]>([]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center justify-between z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Edit Profile</h2>
        <Button
          size="sm"
          style={{
            background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
          }}
        >
          Save
        </Button>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        <Tabs defaultValue="photos" className="w-full">
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="intimacy">Intimacy</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
          </TabsList>

          <TabsContent value="photos" className="space-y-4 mt-6">
            <div className="grid grid-cols-3 gap-4">
              {photos.map((photo, index) => (
                <div key={index} className="relative aspect-square bg-muted rounded-lg overflow-hidden">
                  <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => setPhotos(photos.filter((_, i) => i !== index))}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ))}
              {photos.length < 9 && (
                <button className="aspect-square bg-muted rounded-lg flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border hover:border-primary transition-colors">
                  <Camera className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Add Photo</span>
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Add up to 9 photos. Your first photo will be your profile picture.</p>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell people about yourself..."
                className="min-h-[120px] bg-input-background"
              />
            </div>

            <div className="space-y-2">
              <Label>Looking For</Label>
              <MultiSelect options={LOOKING_FOR} />
            </div>

            <div className="space-y-2">
              <Label>Timing</Label>
              <div className="flex gap-2">
                {TIMING.map((time) => (
                  <Button key={time} variant="outline" size="sm" className="flex-1">
                    {time}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Hosting/Travel</Label>
              <MultiSelect options={HOSTING} />
            </div>

            <div className="space-y-2">
              <Label>Vibes</Label>
              <MultiSelect options={VIBES} />
            </div>
          </TabsContent>

          <TabsContent value="basics" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Pronouns</Label>
              <MultiSelect options={PRONOUNS} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input id="age" type="number" placeholder="28" className="bg-input-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ethnicity">Ethnicity</Label>
                <select className="w-full h-10 px-3 rounded-md bg-input-background border border-input">
                  <option value="">Select...</option>
                  {ETHNICITIES.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Identities</Label>
              <MultiSelect options={IDENTITIES} />
            </div>

            <div className="space-y-2">
              <Label>Presentation</Label>
              <MultiSelect options={PRESENTATIONS} />
            </div>

            <div className="space-y-2">
              <Label>Body Type</Label>
              <MultiSelect options={BODY_TYPES} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="height">Height</Label>
                <Input id="height" placeholder="5'8&quot;" className="bg-input-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight</Label>
                <Input id="weight" placeholder="155 lbs" className="bg-input-background" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Hobbies</Label>
              <MultiSelect options={HOBBIES} />
            </div>
          </TabsContent>

          <TabsContent value="intimacy" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Position</Label>
              <MultiSelect options={POSITIONS} />
            </div>

            <div className="space-y-2">
              <Label>Protection</Label>
              <MultiSelect options={PROTECTION} />
            </div>

            <div className="space-y-2">
              <Label>Kinks</Label>
              <MultiSelect options={KINKS} />
            </div>
          </TabsContent>

          <TabsContent value="health" className="space-y-6 mt-6">
            <div className="space-y-4">
              <SelectField label="HIV Status" options={['negative', 'positive', 'undetectable', 'unknown', 'prefer not to say']} />
              <SelectField label="HRT Status" options={['on HRT', 'not on HRT', 'prefer not to say']} />
              <SelectField label="Surgery Status" options={['had surgery', 'planning', 'not planning', 'prefer not to say']} />
              <SelectField label="Drugs" options={['never', 'sometimes', 'often', 'prefer not to say']} />
              <SelectField label="420" options={['never', 'sometimes', 'often', 'prefer not to say']} />
              <SelectField label="Smoking" options={['never', 'sometimes', 'often', 'social', 'prefer not to say']} />
              <SelectField label="Drinking" options={['never', 'sometimes', 'often', 'prefer not to say']} />
              <SelectField label="COVID Vaccine" options={['yes', 'no', 'partial', 'prefer not to say']} />
              <SelectField label="PrEP" options={['yes', 'no', 'partial', 'prefer not to say']} />
              <SelectField label="DoxyPEP" options={['yes', 'no', 'partial', 'prefer not to say']} />
              <SelectField label="MPOX Vaccine" options={['yes', 'no', 'partial', 'prefer not to say']} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SelectField({ label, options }: { label: string; options: string[] }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select className="w-full h-10 px-3 rounded-md bg-input-background border border-input">
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
