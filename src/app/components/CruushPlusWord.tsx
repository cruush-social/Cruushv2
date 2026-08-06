export default function CruushPlusWord({ className = '' }: { className?: string }) {
  return (
    <span className={`cruush-logo-font font-normal normal-case tracking-normal ${className}`.trim()}>
      cruush+
    </span>
  );
}
