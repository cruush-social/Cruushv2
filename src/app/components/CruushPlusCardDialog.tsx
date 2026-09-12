import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import CruushPlusWord from './CruushPlusWord';
import './CruushPlusCardDialog.css';

type CruushPlusCardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onUpgrade: () => void;
};

export default function CruushPlusCardDialog({
  open,
  onOpenChange,
  title,
  description,
  onUpgrade,
}: CruushPlusCardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cruush-plus-card-dialog z-[100] max-w-sm rounded-lg">
        <div className="cruush-plus-card-scene" aria-hidden="true">
          <div className="cruush-plus-card" data-testid="cruush-plus-card">
            <div className="cruush-plus-card__moire" />
            <div className="cruush-plus-card__pattern cruush-plus-card__pattern--base" />
            <div className="cruush-plus-card__pattern cruush-plus-card__pattern--drift" />
            <div className="cruush-plus-card__pattern cruush-plus-card__pattern--counter" />
            <div className="cruush-plus-card__shine" />
            <div className="cruush-plus-card__label">
              <span><CruushPlusWord /></span>
            </div>
          </div>
        </div>
        <DialogHeader bugButton={false}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-base text-white/70">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button
            type="button"
            className="text-white"
            onClick={() => {
              onOpenChange(false);
              onUpgrade();
            }}
            style={{ background: 'var(--cruush-gradient)' }}
          >
            See <CruushPlusWord className="ml-1 text-[0.8em]" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
