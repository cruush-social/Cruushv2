import { useNavigate } from 'react-router';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import MultiSelect from './MultiSelect';
import {
  AVAILABILITY,
  HOBBIES,
  HOSTING,
  IDENTITIES,
  KINKS,
  LOOKING_FOR,
  POSITIONS,
  PRESENTATIONS,
  VIBES,
} from '../lib/profileOptions';

const TIMING = AVAILABILITY;

export default function FiltersPanel() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center justify-between z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Filters</h2>
        <Button variant="ghost" size="sm">
          <X className="w-4 h-4 mr-1" />
          Clear
        </Button>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        <Tabs defaultValue="basics" className="w-full">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="looking">Looking</TabsTrigger>
            <TabsTrigger value="intimacy">Intimacy</TabsTrigger>
            <TabsTrigger value="lifestyle">Lifestyle</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-6 mt-6">
            <div className="space-y-4">
              <Label>Distance (miles)</Label>
              <Slider defaultValue={[5]} max={100} step={1} />
              <p className="text-sm text-muted-foreground">Up to 5 miles</p>
            </div>

            <div className="space-y-4">
              <Label>Age Range</Label>
              <Slider defaultValue={[18, 99]} max={99} min={18} step={1} />
              <p className="text-sm text-muted-foreground">18 - 99</p>
            </div>

            <div className="space-y-2">
              <Label>Gender Identities</Label>
              <MultiSelect options={IDENTITIES} />
            </div>

            <div className="space-y-2">
              <Label>Presentation</Label>
              <MultiSelect options={PRESENTATIONS} />
            </div>
          </TabsContent>

          <TabsContent value="looking" className="space-y-6 mt-6">
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
              <Label>Kinks</Label>
              <MultiSelect options={KINKS} />
            </div>

            <div className="space-y-2">
              <Label>Protection</Label>
              <div className="flex flex-wrap gap-2">
                {['always', 'PrEP', 'condoms', 'undetectable'].map((prot) => (
                  <Button key={prot} variant="outline" size="sm">
                    {prot}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="lifestyle" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Drugs</Label>
              <div className="flex gap-2">
                {['never', 'sometimes', 'often'].map((opt) => (
                  <Button key={opt} variant="outline" size="sm" className="flex-1">
                    {opt}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>420</Label>
              <div className="flex gap-2">
                {['never', 'sometimes', 'often'].map((opt) => (
                  <Button key={opt} variant="outline" size="sm" className="flex-1">
                    {opt}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Smoking</Label>
              <div className="flex gap-2">
                {['never', 'sometimes', 'social'].map((opt) => (
                  <Button key={opt} variant="outline" size="sm" className="flex-1">
                    {opt}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Drinking</Label>
              <div className="flex gap-2">
                {['never', 'sometimes', 'often'].map((opt) => (
                  <Button key={opt} variant="outline" size="sm" className="flex-1">
                    {opt}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-8 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={() => navigate(-1)}
            style={{
              background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
            }}
          >
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
}
