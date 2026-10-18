import { Link } from 'react-router';
import type { ReactNode } from 'react';

export type PolicySection = {
  title: string;
  body: ReactNode[];
};

export const legalUpdated = "July 10, 2026";
export const termsUpdated = "October 2, 2026";
export const privacyUpdated = "October 13, 2026";
export const billingUpdated = "october 17, 2026";
export const legalContact = "hello@cruush.app";
export const legalEntity = "cruush technologies LLC";

export const contactLink = (
  <a href={`mailto:${legalContact}`}>{legalContact}</a>
);

export const safetyResources = (
  <>
    If someone is in immediate danger, contact 911 or local emergency services.
    Reports involving child sexual exploitation can also be made to the{" "}
    <a href="https://report.cybertip.org/">NCMEC CyberTipline</a>. Human
    trafficking concerns can also be reported to the{" "}
    <a href="https://humantraffickinghotline.org/en">
      National Human Trafficking Hotline
    </a>
    .
  </>
);

export const termsSections: PolicySection[] = [
  {
    title: "Who operates cruush",
    body: [
      <>
        These Terms of Service are between you and {legalEntity}, doing business
        as cruush. Questions about these Terms can be sent to {contactLink}.
      </>,
      "cruush is currently in an NYC open beta. The website and app access are intended for people located in the United States.",
      "Additional product-specific notices, in-app disclosures, safety prompts, community guidelines, or event terms may also apply. If there is a conflict, the more specific notice controls for that feature or activity."
    ]
  },
  {
    title: "Adult-only service",
    body: [
      "cruush is only for adults who are at least 18 years old. You may not use the website, create an account, view profiles, upload content, send messages, or attend cruush-operated launch experiences if you are under 18.",
      "By using cruush, you represent that the age you provide is accurate, that you are at least 18, and that you are legally allowed to use an adult-oriented social, dating, and discovery service."
    ]
  },
  {
    title: "Accounts and profile information",
    body: [
      "You are responsible for the information you submit, the content you upload, and activity under your account. Do not provide false age information, impersonate another person, create accounts for anyone else, or use someone else's account without permission.",
      "cruush may refuse, suspend, limit, remove, or terminate access when we believe an account, profile, message, or submission violates these Terms, creates safety risk, appears fraudulent, or may expose cruush or users to legal or operational harm.",
      "You are responsible for keeping login credentials, devices, and session links secure. Notify cruush if you believe your account was accessed without permission."
    ]
  },
  {
    title: "User content and adult content",
    body: [
      "cruush allows adult users to upload profile photos, explicit photos, messages, local Confessional posts, and other user content. You keep your rights in your content, but you give cruush the license needed to host, store, display, transmit, process, moderate, remove, and operate that content inside the service.",
      "You may upload nude or sexually explicit content only if every person depicted is at least 18, the content is lawful, you have all required rights and consent, the content does not involve coercion or trafficking, and the content follows cruush's safety and content rules.",
      "Profile photos may be evaluated by third-party automated photo moderation services. cruush may temporarily decrypt and securely transmit photos for this purpose, and automated results may cause cruush to automatically reject, restrict, or remove content or account features.",
      "cruush does not endorse user content and is not responsible for content posted by users, but we may review, restrict, blur, remove, preserve, or report content when needed for safety, legal compliance, moderation, abuse prevention, or product operation."
    ]
  },
  {
    title: "Prohibited conduct",
    body: [
      "You may not use cruush for child sexual abuse material, minors, trafficking, exploitation, coercion, blackmail, revenge porn, non-consensual intimate content, sexual assault, threats, harassment, stalking, hate, impersonation, doxxing, scams, spam, malware, illegal drugs, weapons trafficking, or paid sexual services.",
      "You may not scrape, reverse engineer, bypass security, automate account creation, misuse reporting flows, interfere with the service, submit false takedowns, evade enforcement, or use cruush in a way that violates law or another person's rights.",
      "You may not sell, rent, transfer, sublicense, or commercially exploit cruush accounts, access, data, profiles, messages, user photos, local map information, or paid features without written permission from cruush."
    ]
  },
  {
    title: "Location, map, and meeting risk",
    body: [
      "cruush may use approximate or precise location signals to power map-based discovery, visibility controls, nearby users, safety features, and service reliability. You are responsible for deciding what information to share and whether to meet someone offline.",
      "cruush does not screen every user or guarantee any user's identity, age beyond available checks, intentions, health status, criminal history, location accuracy, or offline conduct. Meet carefully, use available privacy controls, and report concerning behavior."
    ]
  },
  {
    title: "Safety reporting and removals",
    body: [
      <>
        Report safety issues, illegal content, impersonation, non-consensual
        content, copyright concerns, or requests to remove content through the{" "}
        <a href="/content-removal">Report or Request Removal of Content page</a>{" "}
        or by emailing {contactLink}.
      </>,
      "cruush may remove content, limit visibility, preserve evidence, suspend accounts, contact affected users, or report matters to law enforcement, NCMEC, hotlines, hosting providers, or other appropriate channels when we believe it is necessary or legally required."
    ]
  },
  {
    title: "DMCA and intellectual property",
    body: [
      <>
        If you believe content on cruush infringes your copyright, follow the
        process in our <a href="/takedown-policy">Take It Down Policy</a>. A
        DMCA notice should include the information required by law and be sent
        to {contactLink}.
      </>,
      "You may not upload content unless you own it, created it, have permission to use it, or are otherwise legally allowed to share it."
    ]
  },
  {
    title: "cruush+ purchases",
    body: [
      "Every cruush+ checkout currently offered by cruush is a one-time purchase for the access period shown at checkout. Nothing renews automatically, and cruush does not bill the purchase again.",
      <>
        Crypto order timing, transfer requirements, and refund terms are described
        in the <a href="/billing-policy">Billing Policy</a>.
      </>
    ]
  },
  {
    title: "Privacy and communications",
    body: [
      <>
        Our data practices are described in the <a href="/privacy">Privacy Policy</a>.
        By using cruush, you consent to service communications such as safety
        notices, account notices, policy updates, verification
        messages, and support replies.
      </>,
      "We will never sell user data nor use it to train AI.",
      "Marketing messages may be sent only where permitted by law and can be unsubscribed from where an unsubscribe option is provided."
    ]
  },
  {
    title: "NYC open beta and changes",
    body: [
      "cruush is in an NYC open beta and may run beta tests, limited releases, city-specific launches, feature experiments, and temporary promotions. Access, features, pricing, timing, eligibility, and availability may change.",
      "Receiving a promotional message does not guarantee account approval, product access, launch timing, event access, or continued feature availability."
    ]
  },
  {
    title: "Indemnity",
    body: [
      "To the fullest extent allowed by law, you agree to defend and hold harmless cruush technologies LLC from claims, losses, liabilities, damages, costs, and expenses arising from your content, your account activity, your violation of these Terms, your misuse of cruush, or your violation of another person's rights."
    ]
  },
  {
    title: "No warranties",
    body: [
      "cruush is provided as is and as available. We do not promise uninterrupted access, error-free operation, specific matches, specific profile visibility, specific launch timing, availability in every city, or that every harmful user or piece of content will be detected immediately."
    ]
  },
  {
    title: "Limitation of liability",
    body: [
      "To the fullest extent allowed by law, cruush technologies LLC will not be liable for indirect, incidental, consequential, special, exemplary, or punitive damages, or for lost profits, lost data, lost goodwill, or service interruptions arising from or related to cruush."
    ]
  },
  {
    title: "Governing law",
    body: [
      "These Terms are governed by the laws of the State of New York, without regard to conflict-of-law rules, except where applicable law requires otherwise."
    ]
  },
  {
    title: "Arbitration and class-action waiver",
    body: [
      "Except for disputes that qualify for small-claims court, requests for emergency injunctive relief, intellectual-property enforcement, or claims that cannot be arbitrated under applicable law, you and cruush agree to resolve disputes through final and binding individual arbitration administered by a mutually agreed arbitration provider or, if no provider is agreed, by the American Arbitration Association under its applicable consumer rules.",
      "You and cruush waive the right to a jury trial and agree that disputes will be brought only on an individual basis, not as a class action, collective action, representative action, private attorney general action, or consolidated proceeding, unless applicable law requires otherwise.",
      "If any part of this arbitration or class-action waiver section is found unenforceable, the unenforceable part will be severed to the extent allowed by law and the rest of the Terms will remain in effect."
    ]
  },
  {
    title: "Termination",
    body: [
      "You may stop using cruush at any time. cruush may suspend, restrict, or terminate access at any time where allowed by law, including for safety, legal, operational, fraud, abuse-prevention, or policy reasons.",
      "Sections that by their nature should survive termination, including content licenses needed for operation, safety records, disclaimers, limits of liability, indemnity, governing law, and enforcement terms, survive account closure or access termination."
    ]
  },
  {
    title: "Changes",
    body: [
      "We may update these Terms as the website, product, safety systems, legal requirements, and launch plans evolve. The updated version will be posted on this page with a new last updated date."
    ]
  }
];

export const privacySections: PolicySection[] = [
  {
    title: "What this policy covers",
    body: [
      "We will never sell your data or use it to train AI. Deleting your account removes your personal account data from the live service immediately when deletion succeeds. The account deletion and retention sections below explain what is removed and the limited records or copies that may remain.",
      `This Privacy Policy explains how ${legalEntity}, doing business as cruush, collects, uses, shares, stores, and protects information for the cruush website, waitlist, launch communications, account flows, content moderation, safety reporting, and U.S. app access.`,
      "cruush is intended for adults in the United States. We do not knowingly collect personal information from anyone under 18."
    ]
  },
  {
    title: "Information you provide",
    body: [
      "We may collect your email address, optional phone number for text reminders after ticket links are unlocked, SMS opt-in status, age or date-of-birth information, waitlist city, requested city, profile fields, identity and preference fields you choose to provide, photos, explicit photos, messages, local Confessional posts, reports, removal requests, billing choices, customer-support messages, consent confirmations, and any files you attach to a report or removal request.",
      "Ticket links can be unlocked without providing a phone number. Promotional SMS consent is optional, separate, and is not a condition of ticket access or purchase.",
      "If we later add stronger age, identity, performer-consent, or explicit-content checks, we may collect additional information needed to run those checks and comply with law."
    ]
  },
  {
    title: "Sensitive information",
    body: [
      "Because cruush is an adult queer dating, cruising, and local discovery service, information you provide or generate may reveal sensitive details such as sexual orientation, gender identity, sexual preferences, approximate location, relationship interests, explicit content, event interest, safety reports, and communications with other users.",
      "Do not submit information or media you are not comfortable sharing with cruush systems, service providers, moderators, support staff, payment providers, or legal/safety channels where needed to operate, secure, moderate, or comply with law."
    ]
  },
  {
    title: "Information collected automatically",
    body: [
      "We may collect timestamps, source metadata, SMS consent text and version, device and browser information, IP address, approximate location signals, cookies or similar technologies, analytics events, security logs, session information, signup number, and abuse-prevention signals.",
      "The app may process location information to power the map, nearby discovery, Ghost Mode, visibility controls, safety features, matching, moderation, and service reliability."
    ]
  },
  {
    title: "Cookies, analytics, and anti-abuse tools",
    body: [
      "The website may use cookies, local storage, pixels, analytics tags, captcha or challenge tools, fraud-prevention signals, and similar technologies for login, security, remembering preferences, measuring aggregate usage, debugging, abuse prevention, and attribution.",
      "Where required, non-essential analytics or marketing technologies will be handled through consent controls or other legally required choices."
    ]
  },
  {
    title: "How we use information",
    body: [
      "We use information to operate cruush, manage the waitlist, provide accounts, show nearby users, support cruushes, process subscriptions, send service, launch, event, and ticket communications when you opt in, provide support, enforce our policies, investigate reports, prevent abuse, improve the product, comply with law, and protect users and the service.",
      "We will never sell your data or use your profiles, photos, messages, location, or activity to train or fine-tune AI models. Automated safety checks evaluate content for prohibited material; they are not permission to train models on your content."
    ]
  },
  {
    title: "Sensitive content and moderation",
    body: [
      "cruush may host adult user content, including explicit photos. We may process, blur, review, restrict, preserve, remove, or report content and related metadata when needed for moderation, safety, law enforcement requests, child-safety obligations, trafficking prevention, 2257-related review, or legal compliance.",
      "For third-party automated photo moderation, cruush may temporarily decrypt and securely transmit a photo to a moderation provider. Automated results may reject or restrict an upload. This provider processing is not zero-knowledge, even when cruush stores the photo using server-side encryption before and after the check.",
      "cruush uses server-side encryption, not end-to-end encryption. The service can decrypt content, and authorized personnel may access relevant information for necessary service operation, support, security, safety investigations, or legal obligations. That access does not permit selling your data or training AI on it."
    ]
  },
  {
    title: "Service providers",
    body: [
      "We use service providers for database hosting, email delivery, analytics, security, abuse prevention, automated content moderation, payment processing, hosting, file handling, SMS delivery if enabled, and customer support. These include Stream and AWS Rekognition for moderation when enabled and approved, Resend for email, Cloudflare Turnstile for abuse prevention, PostHog for usage measurement, and database infrastructure for waitlist and app records.",
      "Member content is not submitted to Stream, AWS Rekognition, or PhotoDNA unless that provider's no-training terms or applicable opt-out have been verified. If an approved safety check is unavailable, an upload may be rejected rather than sent to an unapproved provider or allowed without the required check.",
      "A moderation provider may process or retain submitted images, derived moderation results, or limited technical metadata under its own contract, security controls, and retention practices. cruush limits what it sends but cannot promise that every provider performs zero-retention processing.",
      "Payment processors, app stores, event-ticketing providers, and other third parties may process information under their own terms and privacy practices when you use those services."
    ]
  },
  {
    title: "Advertising, attribution, and promotions",
    body: [
      "cruush may measure referral sources, waitlist campaigns, promotions, coupon eligibility, ad performance, event interest, and aggregate product usage. We try to keep public-site measurement limited and proportionate.",
      "If cruush later offers ads, sponsored placements, affiliate links, merch, events, or partner promotions, those features may involve additional disclosures or choices."
    ]
  },
  {
    title: "Legal, safety, and law enforcement sharing",
    body: [
      "We may share information when we believe it is necessary to comply with law, respond to lawful requests, enforce our policies, prevent harm, investigate trafficking or exploitation, report child sexual exploitation, respond to emergencies, protect rights and safety, or preserve evidence.",
      "Reports involving apparent child sexual exploitation may be reported to NCMEC or law enforcement. Human trafficking, credible threats, imminent harm, or serious abuse may be reported to appropriate emergency, hotline, law-enforcement, platform, hosting, or payment-provider channels."
    ]
  },
  {
    title: "Account deletion",
    body: [
      "You can delete your account in Settings. When deletion succeeds, your account and profile, messages and posts you authored, live location and visibility records, photos and their live decryption keys, account-linked cruush and profile-view records, Coven memberships, support submissions, and appeal documents are removed from the active service. Your sessions are revoked immediately, so the deleted account cannot keep using the app.",
      "Photo and attachment files are scheduled for deletion as part of the same request, and removal starts before the deletion response is returned. If file storage is unavailable or removal takes longer, the service retries automatically; live access and the associated decryption keys have already been removed. This is immediate removal from the live service, not a promise that every backup or external copy vanishes at the same moment.",
      "For a verified account email, deletion also requests removal of the email-provider contact. If the provider is unavailable, only the encrypted contact information needed to finish that request is retained while removal is retried. It is erased when removal is confirmed, or after verifying that a later account owns the address so the old request does not delete that account's current contact.",
      "Deleting your account does not delete another member's content or recall screenshots, downloads, already-delivered email, or public blockchain transactions. The limited retention exceptions below also apply."
    ]
  },
  {
    title: "Retention",
    body: [
      "While your account is active, we keep information needed to provide the service. Account deletion removes the live personal account data described above, rather than leaving the profile hidden or deactivated.",
      "Limited payment and forwarding records, formal safety reports, legally required evidence, and security or abuse-prevention records may remain for their specific accounting, dispute, safety, or legal purpose. Payment records are unlinked from the deleted account; wallet addresses and transactions can still be identifiable on public blockchains. Records that remain are not used for AI training.",
      "Older encrypted activity records that cannot be reliably matched to your account may remain outside your live profile until they can be safely identified and removed.",
      "Backups, provider-held records, and previously delivered communications may outlast live-account deletion. Those copies are not covered by an instant-erasure promise and are subject to the relevant retention and legal requirements. We cannot remotely erase copies saved by another person."
    ]
  },
  {
    title: "Location privacy",
    body: [
      "Location-based features may require location signals, map coordinates, visibility settings, movement-related timestamps, or derived proximity information. Location precision and visibility may vary by feature, device settings, safety controls, and user choices.",
      "Ghost Mode, Dark Room, blocking, blurring, city-level display, or other privacy controls reduce certain visibility, but they do not make cruush anonymous to cruush, payment providers, service providers, law enforcement where legally required, or everyone who may have already seen prior activity."
    ]
  },
  {
    title: "Security",
    body: [
      "We use technical, organizational, and administrative safeguards such as secure login sessions, rate limits, server-side encryption for sensitive data, access controls, abuse detection, and protections against unsafe links and spam.",
      "No online service can guarantee perfect security. You should use a strong password, protect your account, and report suspicious activity."
    ]
  },
  {
    title: "Your choices",
    body: [
      <>
        You can unsubscribe from marketing emails where an unsubscribe link is
        provided. You can also contact {contactLink} to request access,
        correction, deletion, waitlist removal, support, or privacy assistance.
      </>,
      "Some requests may be limited where retention is needed for safety, legal compliance, billing, disputes, fraud prevention, or abuse prevention."
    ]
  },
  {
    title: "State privacy rights",
    body: [
      "cruush supports legally required U.S. state privacy requests, including access, correction, deletion, portability, limitation, and opt-out requests where those rights apply. You can contact hello@cruush.app to make a request.",
      "We may need to verify your request and may decline or limit requests where allowed by law, including for safety, fraud prevention, legal compliance, billing, dispute handling, or another person's privacy."
    ]
  },
  {
    title: "Do not track and global privacy controls",
    body: [
      "Some browsers send Do Not Track signals. There is not a single industry standard for responding to those signals. Where legally required and technically feasible, cruush will honor recognized opt-out preference signals for applicable processing."
    ]
  },
  {
    title: "Business changes",
    body: [
      "If cruush is involved in a merger, acquisition, financing, reorganization, bankruptcy, asset sale, or similar transaction, information may be shared or transferred as part of that transaction subject to this policy and applicable law."
    ]
  }
];

export const safetySections: PolicySection[] = [
  {
    title: "Safety commitment",
    body: [
      "cruush is an adult-only queer dating, cruising, and local discovery service. Safety on cruush depends on consent, truthful age information, respect for boundaries, careful handling of explicit content, and fast reporting of harm.",
      "No app can eliminate all risk. cruush combines product controls, moderation, user reports, policy enforcement, and legal escalation where appropriate."
    ]
  },
  {
    title: "Consent and boundaries",
    body: [
      "Consent must be voluntary, specific, informed, and reversible. Do not pressure, threaten, coerce, blackmail, deceive, stalk, harass, out, dox, shame, or retaliate against another person.",
      "Do not share, request, threaten to share, or use intimate content without consent. Non-consensual intimate content, revenge porn, sextortion, and blackmail are prohibited."
    ]
  },
  {
    title: "Offline safety",
    body: [
      "Use caution before meeting someone from cruush. Consider meeting in a safer public setting first, telling a trusted person where you are going, arranging your own transportation, and leaving if boundaries change.",
      "cruush is not an emergency service and cannot guarantee offline safety, identity, health status, location accuracy, or another user's conduct."
    ]
  },
  {
    title: "Minors are banned",
    body: [
      "Anyone under 18 is prohibited from using cruush. Content that appears to involve a minor, sexualizes a minor, solicits a minor, or exploits a minor is prohibited and may be reported to NCMEC or law enforcement.",
      "Do not upload content unless every person shown is at least 18 and you have permission to share it."
    ]
  },
  {
    title: "Explicit content rules",
    body: [
      "Adult users may upload sexually explicit content only when it is lawful, consensual, accurately age-gated by the user, and compliant with cruush rules. cruush may blur, restrict, remove, or review explicit content.",
      "Prohibited content includes CSAM, non-consensual intimate content, hidden-camera content, trafficking or coercion, sexual violence, bestiality, incest, threats, blackmail, and content involving people who cannot consent."
    ]
  },
  {
    title: "Health, scams, and platform abuse",
    body: [
      "Do not misrepresent STI status, pressure anyone around safer-sex choices, send malicious links, solicit gift cards, impersonate cruush staff, move people off platform for scams, or use profile language to evade safety rules.",
      "Users should be cautious with links, phone numbers, external apps, payment requests, and claims that someone is a cruush employee or moderator."
    ]
  },
  {
    title: "Reporting safety concerns",
    body: [
      <>
        Use the <a href="/content-removal">Report or Request Removal of Content page</a>{" "}
        or email {contactLink} to report safety issues, impersonation,
        harassment, illegal content, trafficking concerns, minors,
        non-consensual content, or urgent removal requests.
      </>,
      safetyResources
    ]
  },
  {
    title: "Enforcement",
    body: [
      "cruush may remove content, limit reach, blur explicit media, restrict features, suspend accounts, terminate accounts, preserve evidence, block payment access, or report matters externally when we believe a safety rule has been violated.",
      "False reports, retaliatory reports, or abuse of safety tools may also lead to enforcement."
    ]
  }
];

export const traffickingSections: PolicySection[] = [
  {
    title: "Zero tolerance",
    body: [
      "cruush has zero tolerance for human trafficking, sex trafficking, labor trafficking, sexual exploitation, coercion, force, fraud, abuse of vulnerability, or commercial exploitation of another person.",
      "You may not use cruush to recruit, advertise, transport, harbor, solicit, exploit, control, threaten, blackmail, or profit from another person."
    ]
  },
  {
    title: "Commercial sexual activity",
    body: [
      "cruush prohibits offers, requests, ads, coded language, links, payment arrangements, third-party booking, or profile activity for paid sexual services, escorting, or commercial sexual exploitation.",
      "This policy applies whether payment is described as money, gifts, rent, travel, drugs, favors, subscriptions, tribute, content purchases, or any other thing of value."
    ]
  },
  {
    title: "Prohibited indicators",
    body: [
      "Prohibited activity includes paid sexual services, escorting or commercial-sex solicitation, third-party controlled accounts, coercive arrangements, debt bondage, threats, confiscated documents, blackmail using intimate content, trafficking-coded recruitment, or activity involving a minor.",
      "We may treat combinations of behavior, messages, profile text, payments, reports, and account metadata as trafficking risk signals even when any single item is ambiguous."
    ]
  },
  {
    title: "How cruush responds",
    body: [
      "cruush may remove content, restrict visibility, preserve evidence, suspend accounts, terminate accounts, block payment access, and report suspected trafficking or exploitation to appropriate law-enforcement, hotline, hosting, payment, or safety channels.",
      "We may prioritize reports involving minors, immediate danger, coercion, non-consensual intimate content, blackmail, or physical threats."
    ]
  },
  {
    title: "Victim-centered handling",
    body: [
      "cruush may limit notice to reported accounts when notice could increase risk to a potential victim, compromise an investigation, enable evidence destruction, or create legal risk.",
      "Reports are reviewed with attention to coercion, age, consent, immediate danger, retaliation risk, and the reporter's privacy."
    ]
  },
  {
    title: "How to report trafficking",
    body: [
      <>
        Report suspected trafficking through the{" "}
        <a href="/content-removal">Report or Request Removal of Content page</a>{" "}
        or by emailing {contactLink}. Include profile details, usernames, URLs,
        screenshots if safe to provide, dates, locations, and why you believe
        trafficking or coercion is involved.
      </>,
      safetyResources
    ]
  }
];

export const takedownSections: PolicySection[] = [
  {
    title: "What this policy covers",
    body: [
      "This Take It Down Policy explains how to request removal of content from cruush, including non-consensual intimate content, impersonation, harassment, doxxing, trafficking-related content, content involving minors, copyright infringement, illegal content, and other policy violations.",
      <>
        You can submit requests through the{" "}
        <a href="/content-removal">Report or Request Removal of Content page</a>{" "}
        or by emailing {contactLink}.
      </>
    ]
  },
  {
    title: "Highest-priority removals",
    body: [
      "We prioritize reports involving minors, child sexual exploitation, non-consensual intimate content, human trafficking, credible threats, blackmail, impersonation, doxxing, and immediate physical danger.",
      "For emergencies, contact 911 or local emergency services first. cruush is not an emergency response service."
    ]
  },
  {
    title: "Non-consensual intimate content",
    body: [
      "cruush treats non-consensual intimate content, threats to share intimate content, hidden-camera content, sexual blackmail, and revenge porn as urgent safety concerns.",
      "A person depicted in intimate content, their authorized representative, or another person with credible safety information may request review or removal."
    ]
  },
  {
    title: "DMCA copyright notices",
    body: [
      "A DMCA notice should identify the copyrighted work, identify the material claimed to infringe, include your contact information, include a good-faith statement, include a statement under penalty of perjury that your notice is accurate and that you are authorized to act, and include your physical or electronic signature.",
      "Send DMCA notices to hello@cruush.app. cruush may remove or disable access to allegedly infringing material and may terminate repeat infringers where appropriate.",
      "If you believe your content was removed by mistake or misidentification, you may send a counter-notice with the information required by the DMCA. cruush may restore content where legally appropriate."
    ]
  },
  {
    title: "Repeat infringement and abusive notices",
    body: [
      "cruush may terminate or restrict repeat infringers where appropriate. cruush may also reject or limit notices that are incomplete, fraudulent, abusive, retaliatory, or unrelated to content on cruush.",
      "Knowingly submitting a false copyright notice or counter-notice may create legal liability."
    ]
  },
  {
    title: "What to include",
    body: [
      "Include your name, email, relationship to the content, profile name or user identifier, URL or location of the content, why removal is requested, whether the content involves a minor, whether there is immediate danger, and any supporting files you are legally allowed to share.",
      "Do not send illegal content unless necessary for a legally required report. If content appears to involve child sexual exploitation, report it to NCMEC and tell cruush where it appears without redistributing it unnecessarily."
    ]
  },
  {
    title: "What cruush may do",
    body: [
      "cruush may remove or restrict content, limit accounts, preserve evidence, request more information, notify affected users, reject incomplete or abusive requests, or report matters externally when required or appropriate.",
      "Submitting a request does not guarantee removal, but safety, consent, legal compliance, and user privacy are weighed heavily."
    ]
  }
];

export const statement2257Sections: PolicySection[] = [
  {
    title: "User-generated adult content",
    body: [
      "cruush may host adult user-generated content, including sexually explicit user-uploaded photos. cruush does not produce, commission, hire performers for, or create user-uploaded sexually explicit content.",
      "Users are responsible for ensuring that every person depicted in sexually explicit content they upload is at least 18, that all depicted people consented to the creation and sharing of the content, and that the upload complies with all applicable laws and cruush policies."
    ]
  },
  {
    title: "2257 position",
    body: [
      "To the extent 18 U.S.C. § 2257 and related regulations apply to producers of actual sexually explicit depictions, the producer or uploader of that content is responsible for maintaining any required age, identity, consent, and recordkeeping documentation.",
      "cruush reserves the right to require age, identity, consent, performer, or recordkeeping information from users or content submitters where needed for safety, moderation, legal compliance, investigation, or continued hosting of content."
    ]
  },
  {
    title: "No minors",
    body: [
      "Content involving anyone under 18 is strictly prohibited. Apparent child sexual exploitation may be removed, preserved, and reported to NCMEC or law enforcement.",
      "Users who upload false age information, non-consensual content, content involving minors, or content without required rights may be banned and may be reported."
    ]
  },
  {
    title: "Age and consent records",
    body: [
      "cruush may request information showing that explicit user-generated content was created and uploaded lawfully, that every depicted person was at least 18 at the time of creation, and that every depicted person consented to the content being shared on cruush.",
      "Failure to provide requested information may lead to removal, account restriction, termination, preservation, or reporting where appropriate."
    ]
  },
  {
    title: "Records contact",
    body: [
      <>
        Questions about this 18 U.S.C. § 2257 Statement can be sent to{" "}
        {contactLink}. cruush may update this statement as explicit-content
        features, moderation practices, or legal requirements change.
      </>
    ]
  }
];

export const billingSections: PolicySection[] = [
  {
    title: "one-time purchases",
    body: [
      "cruush+ and pulse packs are one-time purchases. checkout shows the purchase price and access period or number of credits before you pay. nothing renews automatically, and cruush does not charge you again for that purchase.",
      <>
        open <a href="/store">cruush+ checkout</a> or <a href="/store/pulse">pulse checkout</a>.
        view your purchases in <Link to="/settings/orders">order history</Link>.
      </>
    ]
  },
  {
    title: "your payment amount and fees",
    body: [
      "checkout fixes the bitcoin amount for your order and shows the total before you send. that amount includes the purchase price and cruush’s quoted processing fee. later bitcoin price changes do not change the amount owed for that order.",
      "send the exact amount shown to the order address. your wallet or sending app may charge a separate fee. any ‘have available’ amount estimates the balance you may need in that app; it is not an additional amount to send to cruush or a guaranteed maximum fee. check your app’s final fee before confirming."
    ]
  },
  {
    title: "paying with bitcoin",
    body: [
      "scan the qr code or copy the payment address and exact bitcoin amount into a compatible wallet. scanning does not authorize payment: review the details and confirm in your wallet. use the bitcoin network shown in checkout.",
      "cash app, paypal, and venmo require an eligible, crypto-enabled account with external bitcoin transfers available. each app has sending minimums and fees. checkout shows which purchases meet the selected app’s minimum; smaller purchases may require another compatible bitcoin wallet."
    ]
  },
  {
    title: "pulse packs",
    body: [
      "purchased pulse credits do not expire. cruush uses your rolling pulse allowance before consuming a purchased or earned pulse credit.",
      "each pulse credit activates one pulse for 30 minutes. buying more credits does not extend the duration of an active pulse."
    ]
  },
  {
    title: "payment deadlines and cancellation",
    body: [
      "each order has a unique bitcoin address, an exact amount, and a 24-hour payment window. the matching transfer must be included on-chain by the displayed deadline. your sending app showing ‘pending’ or ‘sent’ does not by itself establish on-chain arrival.",
      "a timely payment can continue confirming after the timer ends. if you already sent payment, check the order status before doing anything else. do not send another full payment just because access is still pending.",
      "before sending, you may cancel an unpaid order or cancel it to choose another payment method. cancellation closes the order but preserves its record, and its address is never reused. it cannot recall a transfer you have sent. do not cancel after sending or pay an expired or canceled order."
    ]
  },
  {
    title: "when your purchase is delivered",
    body: [
      "cruush adds your cruush+ access or purchased pulse credits after the matching bitcoin payment reaches six network confirmations. confirmation time varies, and checkout updates the payment status. a submitted transaction or copied address is not proof of payment.",
      "a fixed-term cruush+ purchase adds the purchased period from your existing access expiry or the time the purchase is applied, whichever is later. renewing before your access expires preserves your remaining time.",
      <>
        if your order shows paid but your purchase is missing, report a{' '}
        <a href="/support?billing=payment">payment issue</a> with your order id. do not pay again to fix
        a delivery problem.
      </>
    ]
  },
  {
    title: "expiry reminders and renewal",
    body: [
      "cruush sends cruush+ expiry reminders 3 days and 1 day before your access ends, by email and in-app notification. push reminders are also available when push notifications are enabled, subject to your quiet hours. email reminders use your verified account email.",
      <>
        renew through <a href="/store">cruush+ checkout</a>. renewal requires a new one-time payment;
        receiving a reminder does not renew or charge your account.
      </>
    ]
  },
  {
    title: "refunds and your rights",
    body: [
      "cruush offers voluntary refunds for cruush+ or pulse packs if your paid order wasn’t applied or you experienced a technical checkout issue. otherwise, purchases are final and non-refundable except where applicable law requires a withdrawal, refund, remedy, or forced reversal.",
      "unused time, partial terms, price changes, promotions, sending mistakes, and account closure alone do not create a voluntary refund right. this policy does not remove any withdrawal, refund, price reduction, or other remedy required by applicable law.",
      "completed blockchain payments generally cannot be reversed through the payment network. that does not decide whether a separate refund or other remedy is owed.",
      <>
        if your paid order wasn’t applied, you experienced a technical checkout issue, or you believe applicable law requires a billing remedy,{' '}
        <a href="/support?refund=1">submit a refund request</a>. include your order id, transaction
        hash, purchase date, country or region, and reason. cruush will review the request under this policy and applicable law.
      </>
    ]
  },
  {
    title: "payment mistakes and unmatched transfers",
    body: [
      "send only the asset, network, amount, and address shown for the active order. a late, incomplete, underpaid, wrong-asset, wrong-network, or otherwise unmatched transfer does not automatically activate cruush+ or add pulse credits. recovery is not guaranteed.",
      "if you sent too much, sent twice, or paid an expired or canceled order, report a payment issue. these cases may need manual review and do not automatically add access, extra credits, or a refund. available blockchain evidence may be retained for support, fraud prevention, accounting, disputes, and legally required handling.",
      <>
        report a <a href="/support?billing=payment">payment issue</a> with your order id,
        transaction hash, amount, and sending time. never send cruush your wallet recovery words,
        private key, or seed phrase.
      </>
    ]
  },
  {
    title: "billing support",
    body: [
      <>
        contact support about a <a href="/support?billing=payment">payment issue</a>,{' '}
        <a href="/support?billing=subscription">subscription or renewal</a>,{' '}
        <a href="/support?billing=pulse">pulse purchase issue</a>, or{' '}
        <a href="/support?refund=1">refund request</a>. you can also email{' '}
        <a href={`mailto:${legalContact}`}>{legalContact}</a>.
      </>
    ]
  }
];
