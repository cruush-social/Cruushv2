import { lazy, Suspense, useState } from 'react';
import { Input } from './ui/input';
import MultiSelect from './MultiSelect';
import { POSITIONS, ROLES } from '../lib/profileOptions';
import { SIGNAL_MAX_LENGTH, truncateSignal } from '../lib/profileLimits';
import { createSavedMapMarkerBadge } from '../lib/mapMarkers';
import type { SideBadges } from '../lib/profileApi';

const MapMarkerPin = lazy(() => import('./MapView').then(module => ({ default: module.MapMarkerPin })));

type Props = {
  name: string;
  photo?: string;
  signal: string;
  role: string[];
  position: string[];
  badges: SideBadges;
  onSignalChange: (value: string) => void;
  onChoiceChange: (field: 'role' | 'position', values: string[]) => void;
};

export default function OnboardingMapPinStep({ name, photo, signal, role, position, badges, onSignalChange, onChoiceChange }: Props) {
  const [previewed, setPreviewed] = useState(true);
  return (
    <div className="space-y-4">
      <div className="flex min-h-[9.25rem] items-center justify-center pb-0 pt-[3.75rem]">
        <div
          role="button"
          tabIndex={0}
          aria-label="Preview your map pin"
          onPointerEnter={() => setPreviewed(true)}
          onPointerLeave={() => setPreviewed(false)}
          onFocus={() => setPreviewed(true)}
          onBlur={() => setPreviewed(false)}
          onClick={() => setPreviewed(true)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setPreviewed(true);
            }
          }}
        >
          <Suspense fallback={null}>
            <MapMarkerPin previewed={previewed} marker={{
              id: 'onboarding-preview', kind: 'person', displayName: name,
              isCurrentUser: true, approximateLatitude: 0, approximateLongitude: 0,
              photo, signal,
              roleBadge: createSavedMapMarkerBadge(badges.left, null),
              badge: createSavedMapMarkerBadge(badges.right, null),
            }} />
          </Suspense>
        </div>
      </div>
      <p className="text-sm text-white/60">The icons beside your heart pin are badges. Choose your role and position below to change them.</p>
      <div className="space-y-2">
        <label className="block text-base text-white/82" htmlFor="onboarding-signal">Signal</label>
        <Input id="onboarding-signal" value={signal} maxLength={SIGNAL_MAX_LENGTH}
          onChange={event => { onSignalChange(truncateSignal(event.target.value)); setPreviewed(true); }} />
      </div>
      {(['role', 'position'] as const).map(field => (
        <div className="space-y-2" key={field}>
          <label className="block text-base text-white/82">{field === 'role' ? 'Role' : 'Position'}</label>
          <MultiSelect menuPortal ariaLabel={field === 'role' ? 'Role' : 'Position'} maxSelections={1}
            options={field === 'role' ? ROLES : POSITIONS} value={(field === 'role' ? role : position).slice(-1)}
            onChange={values => { onChoiceChange(field, values); setPreviewed(true); }} />
        </div>
      ))}
    </div>
  );
}
