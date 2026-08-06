import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Eye, Image as ImageIcon, MessageCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { addDlModeChangedListener, isDlModeEnabled, setDlModeEnabled } from '../lib/dlMode';

const activeEyeStyle = { stroke: 'url(#cruush-dl-mode-settings-gradient)' };

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
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <defs>
          <linearGradient id="cruush-dl-mode-settings-gradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#FF0072" />
            <stop offset="52%" stopColor="#6F00FF" />
            <stop offset="100%" stopColor="#0BA8FF" />
          </linearGradient>
        </defs>
      </svg>

      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.045]">
            <Eye className="h-5 w-5 text-white/80" style={enabled ? activeEyeStyle : undefined} strokeWidth={2.35} />
          </span>
          <div>
            <h2 className="text-xl">DL Mode</h2>
            <p className="text-xs text-muted-foreground">Explicit media privacy display</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Eye className="mt-1 h-5 w-5 text-white/70" style={enabled ? activeEyeStyle : undefined} strokeWidth={2.35} />
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
