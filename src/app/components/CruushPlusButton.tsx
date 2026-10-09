import { Button } from './ui/button';
import CruushPlusWord from './CruushPlusWord';

export default function CruushPlusButton({ compact = false, onClick }: { compact?: boolean; onClick: () => void }) {
  return (
            <Button
              type="button"
              onClick={onClick}
              aria-label="cruush+ rewards"
              title="cruush+ rewards"
              className={`cruush-plus-shimmer-button cruush-logo-font pointer-events-auto rounded-full font-normal leading-none tracking-normal normal-case text-white ${compact ? 'h-11 px-2 text-sm' : 'h-[3.315rem] px-[0.82875rem] text-[1.105rem] max-[360px]:h-[3.03875rem] max-[360px]:px-[0.414375rem] max-[360px]:text-[0.82875rem] sm:h-[3.85rem] sm:px-[1.4rem] sm:text-[1.75rem]'}`}
              style={{ background: 'var(--cruush-gradient)' }}
            >
              <CruushPlusWord />
            </Button>
  );
}
