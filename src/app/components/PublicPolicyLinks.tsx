import { Fragment } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from './ui/utils';

export const PUBLIC_POLICY_LINKS = [
  { label: 'About', path: '/about' },
  { label: 'Human trafficking policy', path: '/human-trafficking-policy' },
  { label: 'Report or request removal of content', path: '/content-removal' },
  { label: 'Safety', path: '/safety' },
  { label: 'Privacy', path: '/privacy' },
  { label: 'Terms', path: '/terms' },
  { label: 'Security', path: '/security' },
  { label: 'Billing policy', path: '/billing-policy' },
  { label: '2257', path: '/2257' },
  { label: 'Takedown policy', path: '/takedown-policy' },
];

export const AUTH_POLICY_LINKS = [
  { label: 'Terms of Service', path: '/terms' },
  { label: 'Privacy Policy', path: '/privacy' },
  ...PUBLIC_POLICY_LINKS.filter((link) => link.path !== '/terms' && link.path !== '/privacy'),
];

type PublicPolicyLinksProps = {
  className?: string;
  variant?: 'card' | 'compact';
};

export default function PublicPolicyLinks({ className, variant = 'card' }: PublicPolicyLinksProps) {
  if (variant === 'compact') {
    return (
      <p
        aria-label="Legal and safety links"
        className={cn('text-xs text-center text-white/30 leading-relaxed', className)}
      >
        By continuing, you agree to our{' '}
        {AUTH_POLICY_LINKS.map((link, index) => (
          <Fragment key={link.path}>
            {index > 0 ? (index === AUTH_POLICY_LINKS.length - 1 ? ', and ' : ', ') : null}
            <a
              className="underline hover:text-white/50"
              href={link.path}
              rel="noreferrer"
              target="_blank"
            >
              {link.label}
            </a>
          </Fragment>
        ))}
      </p>
    );
  }

  return (
    <section className={cn('rounded-lg border border-border bg-card/70 p-4', className)}>
      <h3 className="text-sm text-muted-foreground">Legal and safety</h3>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PUBLIC_POLICY_LINKS.map((link) => (
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
