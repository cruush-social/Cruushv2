import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { CRUUSH_PLUS_FEATURES } from '../lib/cruushPlusFeatures';
import { attachCruushScratchInteraction } from '../lib/cruushScratchInteraction';
import type { EarnedCruushPlusCard } from '../lib/earnedCruushPlusCard';
import './CruushPlusScratchCard.css';

function CardPatterns({ back = false }: { back?: boolean }) {
  return <>
    <div className="beta-launch-plus-card__moire" />
    <div className="beta-launch-plus-card__pattern beta-launch-plus-card__pattern--base" />
    {!back && <div className="beta-launch-plus-card__pattern beta-launch-plus-card__pattern--drift" />}
    <div className="beta-launch-plus-card__pattern beta-launch-plus-card__pattern--counter" />
    {!back && <div className="beta-launch-plus-card__flicker" />}
    {!back && <div className="beta-launch-plus-card__shine" />}
  </>;
}

function ScratchCardBody({ card, onAccept }: { card: EarnedCruushPlusCard; onAccept: () => void }) {
  const isPingCard = card.kind === 'ping';
  const root = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [turns, setTurns] = useState(0);
  const press = useRef<{ x: number; y: number } | null>(null);
  const back = turns % 2 === 1;
  useEffect(() => {
    if (root.current) return attachCruushScratchInteraction(root.current, () => setRevealed(true));
  }, []);
  const turn = () => { if (revealed) setTurns(value => value + 1); };
  return <div ref={root} className="beta-launch-plus-dialog" data-revealed={revealed}>
    <div className="burst" data-fire={revealed} aria-hidden="true" />
    <div className="beta-launch-plus-card-scene"
      onPointerDown={event => {
        if (revealed) press.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={event => {
        const start = press.current;
        press.current = null;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 7) turn();
      }}
      onPointerCancel={() => { press.current = null; }}
      onPointerLeave={() => { press.current = null; }}
    >
      <div className="scratch-zone" data-foil={revealed ? 'off' : 'on'}>
        <div className="card-tilt">
          <div className="card-flip" data-face={back ? 'back' : 'front'} style={{ transform: `rotateY(${turns * 180}deg)` }}>
            <div className="beta-launch-plus-card" aria-hidden={!revealed || back}>
              <CardPatterns />
              <div className="beta-launch-plus-card__label">
                <span className="beta-launch-plus-card__label-text">{isPingCard ? <span>Pulse</span> : <span className="cruush-logo-font">cruush+</span>}</span>
              </div>
              <div className="beta-launch-plus-card__valid">
                <b data-format={card.format}><em>{card.amount}</em><i>{card.unit}</i></b>
              </div>
            </div>
            <div className="card-back" aria-hidden={!revealed || !back}>
              <CardPatterns back />
              <div className="card-back-veil" />
              <div className="card-back-body"><ul>
                {CRUUSH_PLUS_FEATURES.map(feature => <li key={feature.title}><b>{feature.title}.</b> {feature.description}</li>)}
              </ul></div>
            </div>
          </div>
        </div>
        <canvas className="scratch" data-done={revealed} role="button" tabIndex={revealed ? -1 : 0}
          aria-label="Scratch to reveal your reward" aria-hidden={revealed} />
        <span className="scratch-hint" data-done={revealed} aria-hidden="true">Scratch to reveal</span>
      </div>
    </div>
    {isPingCard ? null : (
      <button className="flip-tab" data-shown={revealed} disabled={!revealed} type="button" onClick={turn}>
        {back ? 'Tap to flip back' : 'Tap to see benefits'}
      </button>
    )}
    <div className="beta-launch-plus-dialog__footer locked" data-shown={revealed}>
      <button className="launch-login-auth-submit" type="button" disabled={!revealed} onClick={onAccept}><span>Done</span></button>
    </div>
    <canvas className="confetti" aria-hidden="true" />
  </div>;
}

export default function CruushPlusScratchCard({ card, onClose }: {
  card: EarnedCruushPlusCard;
  onClose: (accepted: boolean) => void;
}) {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const sync = () => setDesktop(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return <Dialog open onOpenChange={open => { if (!open) onClose(false); }}>
    <DialogContent className="cruush-scratch-dialog" data-layout={desktop ? 'desktop' : 'phone'} aria-describedby={undefined}
      onInteractOutside={event => event.preventDefault()}>
      <DialogTitle className="sr-only">cruush+ reward</DialogTitle>
      <ScratchCardBody key={card.id} card={card} onAccept={() => onClose(true)} />
    </DialogContent>
  </Dialog>;
}
