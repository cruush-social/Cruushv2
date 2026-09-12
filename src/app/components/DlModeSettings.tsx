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
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.045]">
            <DlModeMark active={enabled} className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl">DL Mode</h2>
            <p className="text-xs text-muted-foreground">Explicit media privacy display</p>
          </div>
        </div>
      
        <BugButtonSlot testId="dl-mode-settings-bug-button-slot" />
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div className="rounded-lg border border-border bg-card p-4">
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

        <div className="space-y-3 rounded-lg border border-white/10 bg-card p-4">
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
