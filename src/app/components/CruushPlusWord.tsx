export default function CruushPlusWord({ className = '' }: { className?: string }) {
  return (
    <span className={`cruush-plus-word cruush-logo-font font-normal normal-case tracking-normal ${className}`.trim()} data-text="cruush+">
      cruush+
    </span>
  );
}
