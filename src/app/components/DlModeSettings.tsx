import { ghostSettingsBodyClassName, ghostSettingsCardClassName, ghostSettingsChoiceClassName, ghostSettingsSelectedChoiceClassName, ghostSettingsIdleChoiceClassName } from './ghostSettingsStyles';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Image as ImageIcon, MessageCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import DlModeMark from './DlModeMark';
import BugButtonSlot from './BugButtonSlot';
import { addDlModeChangedListener, isDlModeEnabled, setDlModeEnabled } from '../lib/dlMode';

export default function DlModeSettings() {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(() => isDlModeEnabled());

  useEffect(() => addDlModeChangedListener(setEnabled), []);

  const setDlMode = (nextEnabled: boolean) => {
    setDlModeEnabled(nextEnabled);
    setEnabled(nextEnabled);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
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

      <div className={ghostSettingsBodyClassName}>
        <div className={ghostSettingsCardClassName}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <DlModeMark active={enabled} className="mt-1 h-5 w-5" />
              <div>
                <p>DL Mode</p>
                <p className="text-sm text-muted-foreground">Hide explicit images behind deterministic gradients while you browse.</p>
              </div>
            </div>
            <Switch
              aria-label="Toggle DL Mode"
              checked={enabled}
              onCheckedChange={setDlMode}
            />
          </div>
        </div>

        <div className={ghostSettingsCardClassName}>
          <div className="flex items-start gap-3">
            <MessageCircle className="mt-1 h-5 w-5 text-primary" />
            <div>
              <p>Messages</p>
              <p className="mt-1 text-sm text-muted-foreground">Explicit message uploads and favorite images render as gradients when DL Mode is active.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ImageIcon className="mt-1 h-5 w-5 text-primary" />
            <div>
              <p>Favorite image gallery</p>
              <p className="mt-1 text-sm text-muted-foreground">Explicit favorites stay available for sending, but their previews are masked while DL Mode is on.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
