import PlaceDetail from './PlaceDetail';
import DesktopDockPanel from './DesktopDockPanel';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

type SpotBoardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeId: string | null;
  spotName: string | null;
  docked?: boolean;
};

export default function SpotBoardDialog({
  open,
  onOpenChange,
  placeId,
  spotName,
  docked = false,
}: SpotBoardDialogProps) {
  if (!placeId) return null;

  if (docked) {
    if (!open) return null;

    return (
      <DesktopDockPanel ariaLabel={`${spotName ?? 'Spot'} board`} layer="modal" slot="right" minWidth={390}>
        <div className="relative flex h-full min-h-0 flex-col bg-background/92">
          <button
            aria-label="Close spot board"
            className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-black/70 text-white transition hover:bg-white/[0.08]"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
            <PlaceDetail embedded placeIdOverride={placeId} />
          </div>
        </div>
      </DesktopDockPanel>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="scrollbar-hide gap-0 border-white/10 bg-background/95 p-0 sm:max-w-3xl"
        data-testid="spot-board-dialog"
      >
        <DialogTitle className="sr-only">{spotName ?? 'Spot'} board</DialogTitle>
        <DialogDescription className="sr-only">Spot details, ratings, check-ins, activity, and board messages.</DialogDescription>
        <PlaceDetail embedded placeIdOverride={placeId} />
      </DialogContent>
    </Dialog>
  );
}
