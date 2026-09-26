import { ghostSettingsBodyClassName, ghostSettingsCardClassName, ghostSettingsChoiceClassName, ghostSettingsSelectedChoiceClassName, ghostSettingsIdleChoiceClassName } from './ghostSettingsStyles';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import DlModeMark from './DlModeMark';
import BugButtonSlot from './BugButtonSlot';
import {
  addDlModeChangedListener,
  getDlModeShowOnlyException,
  isDlModeEnabled,
  setDlModeEnabled,
  setDlModeShowOnlyException,
  type DlModeShowOnlyException,
} from '../lib/dlMode';
import { requestApi } from '../lib/apiClient';
import { addDesktopPageLayoutChangedListener, getDesktopPageLayout, useCanChoosePopupLayout } from '../lib/desktopPageLayoutPreferences';

type NsfwPhotoAudience = 'public' | 'mutual_cruushes' | 'mutual_crowds';

export default function DlModeSettings() {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(() => isDlModeEnabled());
  const [matchSettings, setMatchSettings] = useState<{ audience: NsfwPhotoAudience }>({ audience: 'public' });
  const [audienceReady, setAudienceReady] = useState(false);
  const [savingAudience, setSavingAudience] = useState(false);
  const [showOnlyException, setShowOnlyException] = useState<DlModeShowOnlyException>(() => getDlModeShowOnlyException());
  const canChooseLayout = useCanChoosePopupLayout();
  const [desktopLayout, setDesktopLayout] = useState(getDesktopPageLayout);
  useEffect(() => addDesktopPageLayoutChangedListener(setDesktopLayout), []);
  const desktopPopupLayout = canChooseLayout && desktopLayout === 'popups';

  useEffect(() => addDlModeChangedListener((nextEnabled) => {
    setEnabled(nextEnabled);
    setShowOnlyException(getDlModeShowOnlyException());
  }), []);

  useEffect(() => {
    let active = true;

    void requestApi<{ audience: NsfwPhotoAudience }>('/api/privacy/nsfw-photo-audience')
      .then((settings) => {
        if (!active) return;
        setMatchSettings(settings);
        setAudienceReady(true);
      })
      .catch(() => {
        if (active) setAudienceReady(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const setDlMode = (nextEnabled: boolean) => {
    setDlModeEnabled(nextEnabled);
    setEnabled(nextEnabled);
  };

  const setNsfwAudience = async (nsfwSendVisibility: NsfwPhotoAudience) => {
    if (!audienceReady) return;

    setSavingAudience(true);

    try {
      setMatchSettings(await requestApi<{ audience: NsfwPhotoAudience }>('/api/privacy/nsfw-photo-audience', {
        method: 'PUT',
        body: JSON.stringify({ audience: nsfwSendVisibility }),
      }));
    } catch {
      // Keep the last server-confirmed policy selected after a failed save.
    } finally {
      setSavingAudience(false);
    }
  };

  const nsfwAudience = matchSettings.audience;

  const nsfwAudienceOptions: Array<{
    value: NsfwPhotoAudience;
    label: string;
  }> = [
    { value: 'public', label: 'Public' },
    { value: 'mutual_cruushes', label: 'mutual cruushes only' },
    { value: 'mutual_crowds', label: 'mutual Crowds only' },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-20">
      {/* Desktop popup layout keeps its original header; full-screen matches Ghost Mode. */}
      {desktopPopupLayout ? (
        <header className="sticky top-0 z-10 border-b border-border bg-card/80 px-3 py-3 backdrop-blur-sm sm:p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex min-w-0 items-center gap-3">
              <DlModeMark active={enabled} className="h-7 w-7 shrink-0" />
              <h2 className="truncate text-xl">DL Mode</h2>
            </div>
            <BugButtonSlot testId="dl-mode-settings-bug-button-slot" />
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">Explicit photo controls.</p>
        </header>
      ) : (
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/80 px-3 py-3 backdrop-blur-sm sm:gap-4 sm:p-4">
          <Button className="shrink-0" variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <DlModeMark active={enabled} className="h-7 w-7 shrink-0" />
            <h2 className="truncate text-xl">DL Mode</h2>
          </div>
          <BugButtonSlot testId="dl-mode-settings-bug-button-slot" />
        </header>
      )}

      <div className={`${ghostSettingsBodyClassName} min-w-0 !space-y-4 !px-3 !py-4 sm:!space-y-6 sm:!p-6`} data-testid="dl-mode-mobile-body">
        <div className={`${ghostSettingsCardClassName} min-w-0 !p-3 sm:!p-4`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <DlModeMark active={enabled} className="mt-1 h-5 w-5" />
              <p>DL Mode</p>
            </div>
            <Switch
              aria-label="Toggle DL Mode"
              checked={enabled}
              onCheckedChange={setDlMode}
            />
          </div>
        </div>

        <section aria-label="Share explicit images with" className={`${ghostSettingsCardClassName} min-w-0 !p-3 sm:!p-4`}>
          <p>Share explicit images with</p>
          <div className="mt-3 grid gap-2">
            {nsfwAudienceOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={nsfwAudience === option.value}
                disabled={!audienceReady || savingAudience}
                onClick={() => void setNsfwAudience(option.value)}
                className={`${ghostSettingsChoiceClassName} ${nsfwAudience === option.value
                  ? ghostSettingsSelectedChoiceClassName
                  : ghostSettingsIdleChoiceClassName}`}
                style={nsfwAudience === option.value ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {enabled ? (
          <section aria-label="Show only exception" className={`${ghostSettingsCardClassName} min-w-0 !p-3 sm:!p-4`}>
            <p>Show only exception</p>
            <div className="mt-3 grid gap-2">
              {[
                { value: 'none', label: 'No show only exceptions' },
                { value: 'mutual_cruushes', label: 'mutual cruushes only' },
                { value: 'mutual_crowds', label: 'mutual Crowds only' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={showOnlyException === option.value}
                  onClick={() => {
                    const next = option.value as DlModeShowOnlyException;
                    setDlModeShowOnlyException(next);
                    setShowOnlyException(next);
                  }}
                  className={`${ghostSettingsChoiceClassName} ${showOnlyException === option.value
                    ? ghostSettingsSelectedChoiceClassName
                    : ghostSettingsIdleChoiceClassName}`}
                  style={showOnlyException === option.value ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

      </div>
    </div>
  );
}
