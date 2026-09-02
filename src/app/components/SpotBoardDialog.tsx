import PlaceDetail from './PlaceDetail';
import DesktopDockPanel from './DesktopDockPanel';
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
      <DesktopDockPanel ariaLabel={`${spotName ?? 'Spot'} Pink Book`} layer="modal" slot="right" minWidth={390}>
        <div className="relative flex h-full min-h-0 flex-col bg-background/92">
          <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
            <PlaceDetail embedded placeIdOverride={placeId} onBack={() => onOpenChange(false)} />
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
        <DialogTitle className="sr-only">{spotName ?? 'Spot'} Pink Book</DialogTitle>
        <DialogDescription className="sr-only">Spot details, ratings, check-ins, activity, and Pink Book posts.</DialogDescription>
        <PlaceDetail embedded placeIdOverride={placeId} onBack={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
