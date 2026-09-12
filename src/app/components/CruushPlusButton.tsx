import { Button } from './ui/button';
import CruushPlusWord from './CruushPlusWord';

export default function CruushPlusButton({ onClick }: { onClick: () => void }) {
  return (
            <Button
              type="button"
              onClick={onClick}
              aria-label="cruush+ rewards"
              title="cruush+ rewards"
              className="cruush-plus-shimmer-button cruush-logo-font pointer-events-auto h-12 rounded-full px-3 text-base font-normal leading-none tracking-normal normal-case text-white max-[360px]:h-11 max-[360px]:px-1.5 max-[360px]:text-xs sm:h-20 sm:px-7 sm:text-4xl lg:h-[5.5rem] lg:px-8 lg:text-[2.5rem]"
              style={{ background: 'var(--cruush-gradient)' }}
            >
              <CruushPlusWord />
            </Button>
  );
}
