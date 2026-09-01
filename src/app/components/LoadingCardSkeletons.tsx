type LoadingCardSkeletonsProps = {
  label: string;
  count?: number;
  className?: string;
};

export default function LoadingCardSkeletons({
  label,
  count = 3,
  className = '',
}: LoadingCardSkeletonsProps) {
  return (
    <div aria-label={label} className={`space-y-2 ${className}`} role="status">
      {Array.from({ length: count }, (_, index) => (
        <div
          aria-hidden="true"
          className="flex animate-pulse items-start gap-3 rounded-xl border border-white/10 bg-black/72 p-4"
          key={index}
        >
          <div className="h-12 w-12 shrink-0 rounded-full bg-white/10" />
          <div className="min-w-0 flex-1 space-y-2 py-1">
            <div className="h-4 w-2/5 rounded-full bg-white/10" />
            <div className="h-3 w-4/5 rounded-full bg-white/[0.07]" />
            <div className="h-3 w-1/4 rounded-full bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  );
}
