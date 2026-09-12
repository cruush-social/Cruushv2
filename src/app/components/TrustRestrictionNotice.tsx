/** Reuses the existing message composer's restriction notice presentation. */
export default function TrustRestrictionNotice({ message }: { message: string | null }) {
  return message ? (
    <div role="status" className="rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm text-muted-foreground">
      {message}
    </div>
  ) : null;
}
