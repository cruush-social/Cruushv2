import { useState } from 'react';
import { Heart, ArrowRight, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface ProfileOnboardingProps {
  onComplete: () => void;
}

export default function ProfileOnboarding({ onComplete }: ProfileOnboardingProps) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState({
    name: '',
    age: '',
    pronouns: '',
    lookingFor: [] as string[],
    vibes: [] as string[],
    bio: '',
  });

  // Match filter options with rest of app
  const lookingForOptions = ['Friends', 'Dates', 'Fun', 'Relationship', 'Community', 'Networking'];
  const vibesOptions = ['Artsy', 'Chill', 'Nerdy', 'Adventurous', 'Outdoorsy', 'Creative', 'Activist', 'Thoughtful', 'Musical', 'Playful', 'Alt', 'Goth'];

  const toggleOption = (field: 'lookingFor' | 'vibes', option: string) => {
    setProfile((prev) => ({
      ...prev,
      [field]: prev[field].includes(option)
        ? prev[field].filter((item) => item !== option)
        : [...prev[field], option],
    }));
  };

  const handleComplete = async () => {
    // Save profile to backend
    try {
      const userData = JSON.parse(localStorage.getItem('cruush_user') || '{}');
      const userProfile = {
        id: userData.id || `user_${Date.now()}`,
        ...profile,
        age: parseInt(profile.age) || 0,
        email: userData.email,
        lat: 40.6782 + (Math.random() - 0.5) * 0.01, // Brooklyn
        lng: -73.9442 + (Math.random() - 0.5) * 0.01,
        distance: '0.0 mi',
        lastActive: 'just now',
        photo: null,
      };

      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-546a0ad0/seed-users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      // Update localStorage with full profile
      localStorage.setItem('cruush_user', JSON.stringify(userProfile));

      onComplete();
    } catch (error) {
      console.error('Error saving profile:', error);
      onComplete();
    }
  };

  const canProceed = () => {
    if (step === 1) return profile.name && profile.age && profile.pronouns;
    if (step === 2) return profile.lookingFor.length > 0;
    if (step === 3) return profile.vibes.length > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6 border-b border-border">
        <h1
          className="text-4xl text-center tracking-tight"
          style={{
            fontFamily: 'UnifrakturMaguntia, serif',
            background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          cruush
        </h1>
        <p className="text-center text-muted-foreground mt-2">Set up your profile</p>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-lg mx-auto w-full">
        <div className="w-full mb-8">
          <div className="flex items-center gap-2 mb-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full ${
                  s <= step ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground text-center">Step {step} of 4</p>
        </div>

        {step === 1 && (
          <div className="w-full space-y-6">
            <div className="text-center mb-8">
              <div
                className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
                }}
              >
                <Heart className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl mb-2">Let's get to know you</h2>
              <p className="text-muted-foreground">Tell us a bit about yourself</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm mb-2 block">Display Name</label>
                <Input
                  type="text"
                  placeholder="Your name"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="bg-input-background border-border"
                />
              </div>

              <div>
                <label className="text-sm mb-2 block">Age</label>
                <Input
                  type="number"
                  placeholder="18+"
                  value={profile.age}
                  onChange={(e) => setProfile({ ...profile, age: e.target.value })}
                  className="bg-input-background border-border"
                />
              </div>

              <div>
                <label className="text-sm mb-2 block">Pronouns</label>
                <Input
                  type="text"
                  placeholder="e.g., they/them, he/him, she/her"
                  value={profile.pronouns}
                  onChange={(e) => setProfile({ ...profile, pronouns: e.target.value })}
                  className="bg-input-background border-border"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="w-full space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl mb-2">What are you looking for?</h2>
              <p className="text-muted-foreground">Select all that apply</p>
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              {lookingForOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => toggleOption('lookingFor', option)}
                  className="transition-all"
                >
                  <Badge
                    variant={profile.lookingFor.includes(option) ? 'default' : 'outline'}
                    className="text-base py-2 px-4 cursor-pointer"
                    style={
                      profile.lookingFor.includes(option)
                        ? {
                            background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
                          }
                        : undefined
                    }
                  >
                    {option}
                    {profile.lookingFor.includes(option) && (
                      <Check className="w-4 h-4 ml-2" />
                    )}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="w-full space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl mb-2">What's your vibe?</h2>
              <p className="text-muted-foreground">Pick a few that resonate</p>
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              {vibesOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => toggleOption('vibes', option)}
                  className="transition-all"
                >
                  <Badge
                    variant={profile.vibes.includes(option) ? 'default' : 'outline'}
                    className="text-base py-2 px-4 cursor-pointer"
                    style={
                      profile.vibes.includes(option)
                        ? {
                            background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
                          }
                        : undefined
                    }
                  >
                    {option}
                    {profile.vibes.includes(option) && (
                      <Check className="w-4 h-4 ml-2" />
                    )}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="w-full space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl mb-2">Tell your story</h2>
              <p className="text-muted-foreground">Write a short bio (optional)</p>
            </div>

            <div>
              <textarea
                placeholder="Share a bit about yourself, your interests, or what you're looking for..."
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                className="w-full h-40 p-4 bg-input-background border border-border rounded-lg resize-none text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {profile.bio.length} characters
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 border-t border-border">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              className="flex-1"
            >
              Back
            </Button>
          )}
          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex-1"
              style={{
                background: canProceed()
                  ? 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)'
                  : undefined,
              }}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleComplete}
              className="flex-1"
              style={{
                background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
              }}
            >
              Complete Setup
              <Check className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
