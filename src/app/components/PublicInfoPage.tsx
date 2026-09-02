import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { useBackOrFallback } from '../lib/useBackOrFallback';
import {
  billingSections,
  billingUpdated,
  legalContact,
  legalUpdated,
  privacySections,
  privacyUpdated,
  safetySections,
  statement2257Sections,
  takedownSections,
  termsSections,
  traffickingSections,
  type PolicySection,
} from '../lib/publicLegalContent';

export type PublicInfoPageId =
  | 'about'
  | 'terms'
  | 'privacy'
  | 'safety'
  | 'security'
  | 'billing'
  | 'content-removal'
  | 'human-trafficking'
  | 'takedown'
  | '2257';

type PublicInfoPageContent = {
  eyebrow: string;
  title: string;
  updated?: string;
  sections: PolicySection[];
};

const securityUpdated = 'July 28, 2026';
const statement2257Updated = 'July 28, 2026';

const aboutSections: PolicySection[] = [
  {
    title: 'cruush',
    body: ['cruush is developed by three queers in a trenchcoat.'],
  },
  {
    title: 'julien',
    body: [<a href="mailto:julien@cruush.app">julien@cruush.app</a>],
  },
  {
    title: 'hazel',
    body: [<a href="mailto:hazel@cruush.app">hazel@cruush.app</a>],
  },
  {
    title: 'cyberomancer',
    body: [<a href="mailto:cyberomancer@cruush.app">cyberomancer@cruush.app</a>],
  },
];

const contentRemovalSections: PolicySection[] = [
  {
    title: 'Before you submit',
    body: [
      'If someone is in immediate physical danger, contact 911 or local emergency services first. cruush is not an emergency response service.',
      'If the content appears to involve child sexual exploitation, you can also report it to the NCMEC CyberTipline. If the concern involves human trafficking, you can also contact the National Human Trafficking Hotline.',
    ],
  },
  {
    title: 'Where this request goes',
    body: [
      <>
        Send removal requests to <a href={`mailto:${legalContact}`}>{legalContact}</a>. cruush may use the
        information you provide to review the content, contact you, remove or restrict content, preserve evidence,
        enforce policies, or report serious safety or legal issues.
      </>,
    ],
  },
  {
    title: 'In the app',
    body: [
      <>
        Signed-in users can also use <a href="/support">support</a> or the in-app bug report button when available.
      </>,
    ],
  },
];

const securitySections: PolicySection[] = [
  {
    title: 'Is cruush end-to-end encrypted?',
    body: [
      'Not in the open beta. cruush uses server-side encryption at rest for sensitive data, with separate server-side keys for different data types and purposes, authenticated encryption to detect tampering, and versioned key derivation. Login sessions use 256-bit random tokens, with only hashed session tokens stored server-side. This lets cruush support matching, visibility controls, account recovery, moderation, and abuse prevention during beta. We plan to evaluate end-to-end encryption after launch.',
    ],
  },
  {
    title: 'What data is encrypted?',
    body: [
      'Sensitive profile and relationship data is encrypted at rest on the server. Messages and photos will also be encrypted at least server-side for the open beta launch. Some operational data needs to remain queryable so cruush can support matching, visibility filters, account state, abuse prevention, and core app functionality.',
    ],
  },
  {
    title: 'Can cruush read user data?',
    body: [
      'During the open beta, the backend can decrypt data when required to operate the app. cruush is not zero-knowledge and does not claim that the server is unable to access user data.',
    ],
  },
  {
    title: 'How are passwords stored?',
    body: ['Passwords are never stored directly. They are hashed with scrypt using per-password salts before being stored.'],
  },
  {
    title: 'How are login sessions protected?',
    body: [
      'Login sessions use 256-bit random tokens. The raw session token is sent only as an HttpOnly cookie, and the server stores only a SHA-256 hash of the token.',
    ],
  },
  {
    title: 'What happens if the database is exposed?',
    body: [
      'A database-only exposure should not reveal encrypted sensitive fields without the server-side encryption keys. Some account, operational, or queryable data may still be readable, so encryption is one layer of protection rather than the entire security model.',
    ],
  },
  {
    title: 'Do you rotate encryption keys?',
    body: [
      'Sensitive encrypted records use versioned key derivation so newer records can move to newer key versions while older records remain readable. Searchable blind indexes require a more careful migration plan before rotation because they are used for lookup.',
    ],
  },
  {
    title: 'Do you protect against brute force and abuse?',
    body: ['Yes. cruush uses rate limits on login, signup, password reset, messaging, posting, and other sensitive actions to reduce brute-force attempts, spam, and abuse.'],
  },
  {
    title: 'Do you protect against unsafe links and XSS?',
    body: [
      'Yes. cruush validates public HTTPS URLs for user-supplied image fields and rejects unsafe URL patterns such as javascript:, localhost, private-network, and metadata-service URLs. Authentication email links are escaped before being inserted into HTML.',
    ],
  },
  {
    title: 'Why not enable E2EE during beta?',
    body: [
      'E2EE changes product architecture, account recovery, moderation, abuse handling, search, matching, and multi-device behavior. For the open beta, cruush is prioritizing secure server-side encryption, abuse prevention, and reliable product behavior first.',
    ],
  },
];

const pageContent: Record<PublicInfoPageId, PublicInfoPageContent> = {
  about: {
    eyebrow: 'About',
    title: 'about',
    sections: aboutSections,
  },
  terms: {
    eyebrow: 'Legal',
    title: 'terms of service',
    updated: legalUpdated,
    sections: termsSections,
  },
  privacy: {
    eyebrow: 'Privacy',
    title: 'privacy policy',
    updated: privacyUpdated,
    sections: privacySections,
  },
  safety: {
    eyebrow: 'Safety',
    title: 'safety policy',
    updated: legalUpdated,
    sections: safetySections,
  },
  security: {
    eyebrow: 'Security',
    title: 'security faq',
    updated: securityUpdated,
    sections: securitySections,
  },
  billing: {
    eyebrow: 'Billing',
    title: 'billing policy',
    updated: billingUpdated,
    sections: billingSections,
  },
  'content-removal': {
    eyebrow: 'Removal request',
    title: 'report or request removal of content',
    updated: legalUpdated,
    sections: contentRemovalSections,
  },
  'human-trafficking': {
    eyebrow: 'Safety',
    title: 'human trafficking policy',
    updated: legalUpdated,
    sections: traffickingSections,
  },
  takedown: {
    eyebrow: 'Removal',
    title: 'take it down policy',
    updated: legalUpdated,
    sections: takedownSections,
  },
  '2257': {
    eyebrow: 'Adult content',
    title: '18 u.s.c. § 2257 statement',
    updated: statement2257Updated,
    sections: statement2257Sections,
  },
};

type PublicInfoPageProps = {
  page: PublicInfoPageId;
};

export default function PublicInfoPage({ page }: PublicInfoPageProps) {
  const goBack = useBackOrFallback('/');
  const content = pageContent[page];

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-primary">{content.eyebrow}</p>
          <h1 className="text-xl">{content.title}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 p-6">
        {content.updated ? (
          <p className="text-sm text-muted-foreground">Last updated: {content.updated}</p>
        ) : null}
        {content.sections.map((section) => (
          <section key={section.title} className="rounded-lg border border-border bg-card/70 p-5">
            <h2 className="text-lg">{section.title}</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4">
              {section.body.map((paragraph, index) => (
                <p key={`${section.title}-${index}`}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
