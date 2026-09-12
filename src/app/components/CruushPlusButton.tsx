import { Button } from './ui/button';
import CruushPlusWord from './CruushPlusWord';

export default function CruushPlusButton({ onClick }: { onClick: () => void }) {
  return (
            <Button
              type="button"
              onClick={onClick}
              aria-label="cruush+ rewards"
              title="cruush+ rewards"
              className="cruush-plus-shimmer-button cruush-logo-font pointer-events-auto h-[3.315rem] rounded-full px-[0.82875rem] text-[1.105rem] font-normal leading-none tracking-normal normal-case text-white max-[360px]:h-[3.03875rem] max-[360px]:px-[0.414375rem] max-[360px]:text-[0.82875rem] sm:h-20 sm:px-7 sm:text-4xl lg:h-[5.5rem] lg:px-8 lg:text-[2.5rem]"
              style={{ background: 'var(--cruush-gradient)' }}
            >
              <CruushPlusWord />
            </Button>
  );
}
