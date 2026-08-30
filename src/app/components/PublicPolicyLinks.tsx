import { Fragment, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from './ui/utils';

export const PUBLIC_POLICY_LINKS = [
  { label: 'About', path: '/about' },
  { label: 'Help', path: '/help' },
  { label: 'Blog', path: '/blog' },
  { label: 'Human trafficking policy', path: '/human-trafficking-policy' },
  { label: 'Report or request removal of content', path: '/content-removal' },
  { label: 'Safety', path: '/safety' },
  { label: 'Privacy', path: '/privacy' },
  { label: 'Terms', path: '/terms' },
  { label: 'Security', path: '/security' },
  { label: '2257', path: '/2257' },
  { label: 'Takedown policy', path: '/takedown-policy' },
];

const AUTH_HIDDEN_POLICY_PATHS = ['/terms', '/privacy'];
const AUTH_CONSENT_POLICY_PATHS = ['/terms', '/privacy'];

export const AUTH_POLICY_LINKS = [
  { label: 'Terms of Service', path: '/terms' },
  { label: 'Privacy Policy', path: '/privacy' },
  ...PUBLIC_POLICY_LINKS.filter((link) => !AUTH_HIDDEN_POLICY_PATHS.includes(link.path)),
];

type PublicPolicyLinksProps = {
  className?: string;
  variant?: 'card' | 'compact';
  excludePaths?: string[];
  /** Rendered inside the disclosure, between the consent line and the links. */
  children?: ReactNode;
};

export default function PublicPolicyLinks({ className, variant = 'card', excludePaths = [], children }: PublicPolicyLinksProps) {
  const visiblePolicyLinks = PUBLIC_POLICY_LINKS.filter((link) => !excludePaths.includes(link.path));

  if (variant === 'compact') {
    // The consent line sits above the disclosure so the disclosure is still
    // made at the point of action. Its two documents are reachable from here as
    // well as from inside the list below.
    const consentLinks = AUTH_POLICY_LINKS.filter((link) => AUTH_CONSENT_POLICY_PATHS.includes(link.path));
    // Terms and Privacy are reachable from the consent line, so listing them
    // again inside the disclosure would show the same link twice in one block.
    const secondaryLinks = AUTH_POLICY_LINKS.filter((link) => !AUTH_CONSENT_POLICY_PATHS.includes(link.path));

    return (
      <div aria-label="Legal and safety links" className={cn('text-center text-white/30', className)}>
        <p className="text-[0.7rem] leading-relaxed">
          By continuing, you agree to our{' '}
          {consentLinks.map((link, index) => (
            <Fragment key={link.path}>
              {index > 0 ? (index === consentLinks.length - 1 ? ' and ' : ', ') : null}
              <a
                className="text-white underline underline-offset-2 transition-colors hover:text-primary"
                href={link.path}
                rel="noreferrer"
                target="_blank"
              >
                {link.label}
              </a>
            </Fragment>
          ))}
          .
        </p>

        <details className="group mt-1">
          <summary className="cursor-pointer list-none text-[0.65rem] uppercase tracking-[0.14em] text-white/35 transition hover:text-white/60">
            More policies
          </summary>
          {children ? (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[0.7rem]">
              {children}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[0.65rem]">
            {secondaryLinks.map((link) => (
              <a
                className="underline hover:text-white/50"
                href={link.path}
                key={link.path}
                rel="noreferrer"
                target="_blank"
              >
                {link.label}
              </a>
            ))}
          </div>
        </details>

      </div>
    );
  }

  return (
    <section className={cn('rounded-lg border border-border bg-card/70 p-4', className)}>
      <h3 className="text-sm text-muted-foreground">Legal and safety</h3>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visiblePolicyLinks.map((link) => (
          <a
            key={link.path}
            className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
            href={link.path}
            rel="noreferrer"
            target="_blank"
          >
            <span>{link.label}</span>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        ))}
      </div>
    </section>
  );
}
