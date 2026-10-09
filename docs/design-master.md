# cruush Master Design Guide

This is the canonical product and design guide for cruush. If older pasted design prompts, generated docs, or implementation details conflict with this file, this file wins unless a newer explicit product decision says otherwise.

Engineering handoff and implementation order live in `docs/master-architecture.md`. Use this file for product/design intent and `docs/master-architecture.md` for current runtime architecture, backend/frontend surfaces, moderation/encryption/storage decisions, infrastructure direction, and co-developer next steps.

## Product North Star

cruush is a web-first queer cruising website for finding nearby people who are available now. The primary use case is opening cruush in a phone browser while out, not installing a native app. The primary product job is immediate local intent: who is around, who is looking right here and right now, and how to coordinate discreetly and safely.

cruush is a queer app, not a gay app. The audience voice and visual framing should center everyone except cis men while still allowing cis men to join and participate. This is a tone, copy, UX, and community framing rule, not a hard exclusion rule.

The product is inspired by the map-first immediacy of Sniffies, but the goal is not to clone Sniffies. cruush should feel cooler, more cinematic, more feature-rich, safer, more polished, and more inclusive. It should keep the raw utility of seeing who is nearby and available now, while adding stronger identity architecture, richer coordination tools, more intentional safety features, and a visual system that feels premium rather than utilitarian.

The website should feel premium, dark, romantic, erotic, intimate, polished, cinematic, and nightlife-forward. It should not feel like a generic dating site, a swipe product, or a date-planning product. Dating can happen, but the default energy is immediate local desire, not matching for later.

## Naming And Brand Rules

- The product name is always `cruush`, all lowercase.
- The logo text must always be exactly `cruush`.
- `cruush` is both the product name and the core interaction language.
- User-facing language should use `Vibes`, never `Tribes`.
- User-facing language should not call the primary interaction a like, tap, wink, or the misspelling of our name. It is a `cruush`.
- Map-first cruising behavior must remain central.
- The unified local feed must remain proximity-first and map-adjacent.

## Voice And Copy

The voice should be direct, intimate, queer, playful, and nightlife-aware without becoming cheesy or corporate. Copy should feel like it belongs in a cruising product: clear enough to use fast, charged enough to feel alive, and calm enough to feel safe.

Core copy rules:

- Use plain language for safety, consent, privacy, location, and account states.
- Use more playful language for desire, discovery, and cruush interactions.
- Avoid dating-product language that implies long courtship as the default.
- Avoid gay-male-only slang as the dominant voice.
- Keep text short on high-intent surfaces like map cards, pins, sheets, and chat.

cruush copy examples:

- `{displayName} has a cruush on you!`
- `You have a cruush on {displayName}.`
- `It's mutual. You and {displayName} have a cruush on each other.`
- `Send a cruush`
- `cruush back`
- `New cruush`
- `Mutual cruush`

Do not replace this with generic copy such as `{displayName} liked you`, `Someone tapped you`, or `You matched`.

## Brand System

- Logo font: UnifrakturMaguntia.
- Heading font: Cormorant Garamond.
- Body and UI font: Spectral.
- Core colors: #FF0072, #6F00FF, #3826FF, #004BFF, #1181FF, #03ECFC
- Logo gradient: linear-gradient(90deg, #FF0072 6.08%, #6F00FF 53.27%, #004BFF 100%)
- Button gradient: linear-gradient(90deg, #FF0072 6.08%, #6F00FF 43.11%, #3826FF 58.46%, #004BFF 73.81%, #1181FF 100%);
- Primary and selected buttons in Club menus use `--cruush-gradient`; the old solid or translucent pink button fill must not be applied to Club menu buttons. This rule is Club-specific and does not restyle non-Club surfaces. Julien: “you make these menus iwth old style pink buttons, make them gradients like the new style and change stuff to make you stop applying the old styel,” clarified with “i meant in the club shit” (October 7, 2026).
- All gradient accents across the app should reuse the same pink-to-violet-to-blue progression as the logo mock, without extra glow.
- The cyan accent is `#03ECFC`; use it where older green/emerald success or launch accents need to feel on-brand.
- No glow rule: do not use halo effects, neon shadows, drop-shadow glows, blurred light blooms, or radial glow overlays. Use flat colors, solid surfaces, borders, and approved gradients instead.
- Heart fallback rules:
  - Map pins for other users without photos use the red-to-crimson heart gradient.
  - The signed-in user without a photo uses the same pink-to-red heart treatment and must not appear blue.
  - Compact heart avatars on feed, messages, and similar surfaces use the pink-to-red heart gradient instead of the older red-to-crimson version.
- Fallback heart colors for profiles without photos: `#d11f3a`, `#9f1730`, `#690f1f`.
- Overall interface: mostly monochrome with selective gradient accents.
- Map style: dark, cinematic, dense urban street map.

## Visual Reference Direction

Primary design reference:

- Figma Make reference: `https://www.figma.com/make/tcRqXasuzRNORtCLFyKUzZ/cruushv1--Copy-`
- Use this reference for general vibe, color temperature, and dark cinematic surface language.
- Do not treat it as a locked implementation. The website can improve layout, interaction quality, accessibility, and component consistency while preserving the mood.

Logo and icon direction:

- The current preferred logo direction is a gothic lowercase `cruush` wordmark with magenta, violet, and electric blue gradient styling on a black field.
- A future human-designed SVG mark may wrap or sit around the wordmark using a heart-like flame, wing, horn, crown, or spark form.
- The icon should feel sharp, romantic, nocturnal, queer, and a little dangerous, not soft or generic.
- The heart shape should be recognizable but stylized enough to avoid generic dating-site branding.
- The mark can use flame-like curves and a central star or spark motif, but it must remain legible at favicon, homescreen shortcut, nav, and social preview sizes.
- Final production logo assets should be vector SVG supplied or refined by a human designer. Do not ship an auto-traced raster draft as the final mark.
- Provide single-color, gradient, dark-background, and small-size variants before treating the logo as final.

## Interface Principles

- October 8 center-column sizing: “all the content in the center column and fill to the width of that column ... on mobile, that is also the window.” Primary content, including profile hero media and its overlays, fills the existing centered app-content column on desktop. It does not size to the browser window. On mobile, the same column is the viewport width. Preserve each surface’s existing internal composition unless Julien names a change.

- The website should feel dense but elegant. Do not reduce profile or filter complexity to make screens easier.
- Use progressive disclosure, sheets, tabs, sections, and hierarchy to make dense data fast to scan.
- Use one unified panel and bottom-sheet language across map, feed, profile, filters, messages, safety, groups, events, places, and settings.
- Use one spacing, radius, elevation, border, and typography system.
- Phone browser is the primary surface; desktop web must still feel intentional.
- Mobile web design target: `390x844px`.
- Desktop web design target: `1440x900px`.
- Respect mobile browser safe areas and dynamic browser chrome. No critical controls should sit under the browser address bar, bottom toolbar, or home indicator areas.
- Test core flows in Safari on iPhone-sized viewports and Chrome on Android-sized viewports before treating mobile work as complete.
- Minimum touch target: `44x44px`.
- Tags and filter chips need at least 12px vertical padding and 16px horizontal padding.
- On mobile, use full-width bottom sheets with 24px top radius. Do not use centered modals for primary flows.

## Navigation

Phone browser screens should include a fixed 80px bottom navigation bar above the browser/home-indicator safe area.

Required tabs:

- Map
- Feed
- Messages
- Activity
- Profile

The active tab uses the brand gradient. The nav background should be a solid dark surface with a subtle top border. Do not add a progressive dark fade, transparent scrim, or backdrop blur at the bottom edge of the viewport.

For members outside the map service area, Julien said “let out of service area users have the feed in their bottom bar” and “the bottom bar should be the same otherwise in terms of size and appearance of icons etc” (October 8, 2026). Keep the ordinary capsule and icon sizes, omit only Map, and retain that navigation state while they use Feed, Messages, and Profile until a new map service-area result confirms they are inside.

## Map Home

The map home is the core product surface. It must never be represented as a placeholder.

Map requirements:

- Fully rendered dark street map graphic or live map.
- Dark charcoal land, slightly lighter road fills, muted dark teal or navy water, and low-opacity road labels.
- Dense urban street-grid feel.
- 8-12 visible heart-shaped pins in design mocks.
- Map-first layout with overlays that preserve map context.
- Mobile map interactions should go directly to the full profile when a user pin or recent-tray user is tapped.
- Desktop map interactions should open a scrollable mini-profile popup that acts as the desktop profile surface on the map.

Map controls:

- Last Active sort control anchored near the bottom-right above the card tray.
- Default sort: Last Active.
- Sort options: Last Active, Newest, Closest.
- Cluster Markers setting can group nearby pins into count bubbles when zoomed out.
- On mobile, tapping a person on the map or in the recent tray should open their full profile directly.
- On desktop, tapping a person on the map or in the recent tray should open a floating mini-profile popup in cruush styling.
- Desktop map popups should make messaging the clearest primary action.
- October 8, 2026: at tablet widths, the cruush+ map control uses the desktop control size. Map Controls must clear the top bar instead of overlapping it.
- October 8, 2026: map Signal text and capsules match Spot hover-title sizing; side-badge hover labels and Spot titles use tight padding.

Last active display:

- Every pin should show or expose a last active timestamp.
- Every bottom tray card should show a last active badge.
- Every profile peek card should show last active time.

## Heart Pin System

All map pins must be heart-shaped.

User pins:

- Display the user's primary profile photo inside the heart shape when available.
- Use a red-to-crimson heart gradient when no profile photo exists.
- May display a small intent badge underneath, such as looking now, hosting, or traveling.

Groups, events, and places:

- Also use heart-shaped pins.
- Use flat accent gradients or red-to-crimson heart gradients for visual consistency.
- Must remain visually distinct through metadata, badges, icons, or layer controls.

Privacy state:

- Users with high location fuzziness enabled should show a flat pulsing outline or badge around their pin to indicate approximate location.

## Shared User Preview Unit

`UserActivityCapsule` is the canonical compact user preview for Feed posts, message previews,
cruush activity, Spot boards, Who's Here, and people pickers. These surfaces must not independently
redesign the card. They supply surface-specific content and controls to the same hierarchy.

### Fixed hierarchy

1. The heart sits in the left column and uses the same canonical profile-heart geometry as map pins.
2. Both side badges sit together directly below the heart. They never sit below the card text or in
   the action column. Each badge exposes its user-visible meaning.
3. Name and pronouns lead the center column on one wrapping identity row. Identity adornments, such
   as compact profile badges or state labels, follow them without replacing either field.
4. Activity metadata stacks below identity. Use two short lines when both time and distance exist.
5. The person-action trio occupies the right column when the surface permits actions. Its order is
   always cruush, Pin that user, Message. Person-to-person Message always uses the arrow glyph.
6. Surface content spans the center and right columns below identity. Feed post text and the latest
   message preview use this same content slot and the same typographic scale as the name.
7. Expiration, Delete, Report, or a disclosure control may occupy the upper-right corner without
   moving the heart, identity, metadata, or action trio.

The heart and both side badges are identity, not decoration. Preserve their geometry, photo crop,
fallback treatment, DL Mode masking, and state colors across every surface. The shared capsule owns
container-responsive spacing and type. Individual surfaces must not introduce alternate heart sizes,
badge placement, or card grids.

### Information rules

- Compact user previews never show Vibe capsules. Vibes belong on profile views and profile editing.
- Show only server-authorized distance. If distance is unavailable, use the approved nearby label or
  omit it; never infer precise location.
- Preserve name, pronouns, profile badges, side badges, and travel treatment from the same user data.
- The signed-in heart is indigo, a mutual heart is purple, and another member is pink. One-way
  Incoming and Sent states are not mutual and never use mutual purple. Pulse temporarily uses lime.
  Ghost uses electric blue. Active Mile High Club profiles use `#77B9DA` for the heart, side badges,
  and Signal borders across every app surface.
- The entire row can become a keyboard-selectable control in chooser surfaces. Its selected state
  must be exposed through `aria-pressed`; do not add a separate checkbox or checkmark.
- Nested identity, content, safety, and action controls retain their own accessible labels and must
  not accidentally trigger row selection.

### Surface contracts

Feed posts:

- Use the content slot for post text and optional approved Feed attachments.
- Keep expiration plus owner Delete in the upper-right. Other-member Report and Block controls sit
  below the side badges.
- Preserve reversible cruush, authorized Pin, and arrow Message actions for other members.

Message previews:

- Use the content slot for the latest message. A missing preview leaves the slot empty rather than
  adding filler text.
- Keep unread, quiet, role, timer, and closed state as compact identity or content adornments.
- Keep owner-authorized conversation Delete or the disclosure affordance in the upper-right.
- Group previews may use the shared heart fallback and omit person actions; direct-message previews
  use the normal person-action trio.

cruush activity:

- Incoming, Sent, Mutual, and Views share one card geometry. Tabs change data and relationship state,
  not the card structure.
- Sent and Mutual cruush controls remain actionable so a second press can undo the state. The control
  returns to the bright available treatment after the server confirms removal.
- Locked items may hide identity and actions, but they retain the same card frame and metadata slots.

Spot and chooser previews:

- Pink Book posts reuse the Feed structure, including post text and owner Delete or viewer Report.
  Pink Book posts do not expire. Reading or writing the Pink Book requires an active Spot check-in,
  but authors can delete their own posts later from their own post history. Who's Here stays publicly
  viewable and reuses the identity unit without manufacturing a post.
- New Message and group-member pickers reuse the same identity hierarchy. Group selection uses the
  complete row and never displays a separate selection checkbox.

### Canonical implementation

- Structure and slots: `src/app/components/UserActivityCapsule.tsx`
- Responsive geometry and typography: `.cruush-user-activity-*` in `src/styles/theme.css`
- Heart rendering: `src/app/components/HeartPhoto.tsx`
- Side badges: `src/app/components/SideBadgePair.tsx`
- Person actions: `src/app/components/ProfileActionTrio.tsx`

Changes to this unit must be made at the shared layer unless a surface contract above explicitly
requires a different content or corner control. Verify changes in Feed, Messages, Cruushes, a Spot
board, and at least one chooser before treating the shared unit as complete.

## Photo Rules

All user profile photos must follow a split media system.

Required rules:

- Main full-size profile photos use a `4:5` aspect ratio.
- Compact preview-size profile photos should use heart crops that visually match the pins.
- The full profile should read like a direct vertical scroll surface: photo first, then profile content below.
- Desktop may widen to `1:1` on dense surfaces, but primary profile media should never be wider than tall.
- Small avatars and tiny pin crops may be circular or heart-cropped.

Surface-specific rules:

- Map and tray previews: use heart-cropped profile photos consistent with the pins. On mobile they open the full profile directly; on desktop they open the scrollable popup profile.
- Full profile: primary photo occupies full mobile width at `4:5`.
- Full profile: put the name, distance, actions, and profile sections below the image in a continuous scroll.
- Full profile: use three primary tabs that mirror the edit architecture: `Basics`, `Intimacy`, and `Health`.
- Profile edit photos: use `9:16` tiles in a 2-column grid.
- DMs, activity, feed, map trays, and group chats: compact person previews should be heart-shaped, using the same visual language as the pins.
- Event, place, and group detail media should prefer `4:5` or square unless the content specifically needs a taller crop.

## Nudity and Explicit Photo Handling

NSFW photos are allowed in the favorites gallery, Feed, profile photos, and authenticated direct and group messages when they comply with the current media policy. Profile photos may show the account holder, any part of their body without requiring a face, or their gear. A profile photo may contain no more than one person, and every person shown across that profile's photos must be the same person.

Explicit classification must drive the approved DL Mode masking on public profile and Feed surfaces. Independent rules against minors, non-consensual imagery, exploitation, bestiality, revenge porn, trafficking, and other prohibited content always apply.

Do not offer an explicit-photo profile toggle or a global `Show Explicit Photos` preference. A profile or Feed upload rejected by an independent safety rule must not be published. Quarantined media must follow the current retention or deletion rule for that decision. Private-message eligibility never overrides prohibited-content rules.

Required adult-content controls:

- Age gate the product before account creation or content access.
- Require users to confirm they are allowed to view and upload adult content.
- Require user consent/rights confirmation before photo upload.
- Provide clear report reasons for non-consensual imagery, minors, impersonation, coercion, trafficking, illegal activity, spam/scams, and harassment.
- Keep public/discovery surfaces moderatable even when sensitive profile fields are encrypted at rest.
- Store originals privately and serve message attachments only through authenticated, conversation-authorized media routes.
- Do not use third-party image hosting that prohibits adult content.
- Do not rely on app-store review assumptions for policy decisions.

## Location Privacy

Settings must include Location Fuzziness under Privacy & Location.

Rules:

- Slider labels: Exact to Fuzzy.
- 4-5 graduated steps.
- Exact means the user's true GPS position.
- Maximum fuzziness randomizes the visible pin within approximately 500m.
- High fuzziness shows a flat pulsing outline or badge around the user's pin.

## Profile Architecture

Preserve dense profile architecture and improve clarity through hierarchy.

Profile edit sections:

- Photos
- Profile
- Basics
- Intimacy
- Health & Safety

Public profile sections:

- Basics
- Intimacy
- Health
- Profile attribute capsule lists fit up to three capsules per row; in Intimacy, non-Kinks cards use two columns and Kinks & Fetishes remains its own full-width row. (2026-10-08, Julien)

Basics fields:

- Pronouns
- Age or year of birth
- Ethnicity
- Body type
- Height
- Weight

Mutable taxonomy source:

- The canonical mutable option lists live in `src/app/lib/profileOptions.ts`.
- Add, remove, rename, or reorder options there first.
- The master guide should describe the architecture and category intent; the code owns the current exact lists.
- This applies to pronouns, identities, presentations, ethnicities, body types, positions, roles, looking-for values, timing, hosting/travel, vibes, protection, kinks/fetishes, hobbies, and health/safety values.
- Position is the top/bottom/versatile-style field, including vers top, vers bottom, stone bottom, stone top, hands only, and oral only. Role is the dominant/submissive/switch-style field, including service.
- Kinks and fetishes use a catalog-backed tap-to-select list. The whole Kinks & Fetishes field has one visibility setting instead of per-kink role or seeking controls.
- Basic profiles can save up to 3 kinks and 3 profile tags. cruush+ profiles have no product kink limit and can save up to 10 profile tags.
- Hosting/Travel contains logistics only. Preferred spots is a separate field directly below it, accepts up to 3 choices, and includes the current Spot categories plus private-place choices.
- Protection and Protection boundaries are separate fields. Protection boundaries use meaningful choices rather than unexplained yes values.
- Identity values can appear on profiles and in Seeking filters, but Visibility Controls do not expose Identity filtering.
- Profile tags cannot duplicate a structured profile choice. A rejected tag directs the member to the matching profile field.
- Visibility options should use the same vocabulary across profile fields: public, mutual Cruushes, and mutual crowds.
- HIV status, raw trans status, and ethnicity are profile/display fields only. They must not be used as seeking filters, visibility predicates, saved visibility set predicates, or blind-token filter signals.
- T4T is the explicit exception as a self-selected crowd and crowd-mode audience gate. Do not treat T4T as a raw trans-status filter.
- Dropdown/selectable-control rule for future implementation: do not create one-off dropdown UI or raw `<select>` controls for profile, filter, or visibility taxonomies. Use the existing shared `MultiSelect` control for multi-select and single-select taxonomy pickers; extend that component if the app needs new dropdown behavior.

Badge rules:

- All members can choose current custom side badges. Paid badge packs remain later work.
- Left defaults to the member's role and right defaults to position until the member selects custom badges.
- The badge intent choices are the undescribed default, Give, Receive, and Switch only.
- Role, Position, Pride, Vibes, Kinks, and Hanky code are badge groups. There is no separate Acts, Presentation, or Boundaries badge group.
- Hanky code remains the act-signaling system. Its deployed unbordered icons and member-selected Dom, Sub, Switch, and taken variants do not change during icon curation.
- Pride flags fill the circular badge while keeping identity-defining symbols visible. A concept can offer both a recognized symbol and a flag variant.
- Saved side badges render under the heart on Feed, Messages, cruush activity, Spots, map previews, and profile previews. Their border always matches the heart border, including Mile High Club.

## Filter Architecture

Filters should be grouped into these major groups:

- Age Range
- Gender Identities
- Presentation
- Hosting/Travel
- Preferred spots
- Position
- Role
- Looking For
- Timing
- Vibes
- Kinks & Fetishes
- Hobbies
- Substance Boundaries
- Protection
- Protection boundaries

Filters should be dense but scannable. Do not flatten the architecture into a small dating-app filter set.
On the map, the filter button should open a branded popup/sheet that reuses the same filter groups, tabs, and pill selection language as the standalone filters screen.

## Spots

- People and Spots cluster independently. People clusters use the shared count-only person cluster; Spot clusters use the count-only Spot treatment. Both counts use the logo typeface. Never combine people and Spots into one count.
- Hover labels sit directly above and centered on their Spot marker.
- A Spot page header is one line: back, singular Spot category, and Bug. The Spot name starts the page content.
- Top two reported vibes and available amenities appear with the Spot details. Members can contribute vibes, amenities, and access details without checking in or being nearby.
- Here now and ratings stay compact. Attribution appears before the Pink Book tabs. The Pink Book and Who's Here tabs appear before Popular times on compact screens.
- Who's Here is publicly viewable. Reading or writing the Pink Book requires an active check-in. A check-in has a selected duration and sends an expiry notification. Pink Book posts do not expire and remain deletable by their author.
- A successful check-in creates one moderated public Feed post per member, Spot, and hourly check-in event. Pink Book posts remain separate.
- Spot shares and profile shares stay inside cruush.

## Core Features

### Safety And Privacy Strategy

Safety is part of the product promise because cruush is built around immediate nearby meetups. It should feel like quiet user control, not paperwork, moralizing, or a guarantee the app cannot keep.

Tone rules:

- Do not say or imply that cruush can keep someone safe.
- Do not imply automated rescue, policing, or emergency intervention.
- Use plain language such as privacy controls, quick exit, trusted contacts, check-in timer, block, report, and location controls.
- Keep safety actions discreet, reachable, and fast.
- Safety UX should support the mood of the app instead of interrupting it unless the user intentionally opens a safety flow.

MVP safety scope:

- Safe Exit / panic button.
- Block and report from profiles, messages, groups, events, places, and feeds.
- Location Fuzziness.
- Last Active Visibility.
- Profile Visibility.
- NSFW blur toggle.
- Trusted contact check-in timer with in-app reminders and a clear manual resolution flow.

Later safety scope:

- SMS/email escalation to user-chosen trusted contacts.
- Emergency contact templates.
- Check-in logs.
- Automated missed check-in escalation with grace period and cancel flow.
- Moderation dashboards.
- Contact verification.

Hard safety boundaries:

- Never auto-contact police or emergency services.
- Never message trusted contacts without explicit user setup and consent.
- Always provide a grace period and obvious cancel/safe resolution action before escalation.
- Keep logs private and user-controlled unless needed for moderation or legal compliance.

### Panic Button / Safe Exit

Provide a discreet but reachable panic control. On the web, the realistic behavior is to clear app session/local app state, dismiss overlays, and redirect to `google.com`. Include a confirmation flow by default, optional one-tap mode, and stealth-safe states.

This is a privacy and quick-exit tool. Do not present it as an emergency response system.

### Check-In Timer And Emergency Contacts

Users can start a check-in timer before a meetup. In the MVP, this should be a trusted-contact reminder and resolution tool: set a timer, receive reminders, extend/cancel/mark safe, and optionally keep trusted contact details ready.

Advanced escalation belongs later. When added, missed check-ins should use in-app or push reminders first, then SMS/email only to user-chosen trusted contacts after explicit setup, grace period, and cancel flow.

### Partnered, Couple, And Poly Context

The current product can start with one primary profile per user plus lightweight metadata for relationship dynamic, looking for a third, open to group play, and hosting/travel context.

Future direction: cruush should allow a real partnered profile system when the product is ready. Do not design the data model in a way that blocks linked partner profiles, couple profiles, poly pods, or shared availability/context later.

### Public Map Pins

Support public pins for:

- Groups or pods seeking a third or group play
- Events, shows, and parties
- Places and cruising spots

Each type needs distinct metadata and detail pages while preserving the heart-pin visual language.

### Public Groups

Groups are request-to-join only.

Required states:

- Pending
- Approved
- Denied
- Waitlisted

Owners and moderators need approval queues and moderation tools.

### Events And Places

Events:

- Attendee visibility
- Dedicated event feed
- Event detail page

Places:

- Who-is-here
- Recently-here
- Dedicated place feed
- Optional stealth or anonymous presence mode

### Private Group Chat

Invite-only planning chats for group encounters. Include roles, invites, approvals, media states, reporting, and safety controls.

### Unified Local Feed

One unified nearby feed by default. Do not segment by type as the default experience.

Feed requirements:

- Short local posts
- Expiration countdowns
- Post expiry `Never` means the post does not expire; it is not a seven-day lifetime. Julien: “I never said i wanted a 7 day expiry windows” (2026-10-07). Updated October 9: the selected `Posted within` creation-time filter applies to every post, including never-expiring posts. Removing `Never` from the Posted within control does not remove post-expiry `Never` or delete older posts.
- Composer
- Distance context
- Moderation states
- Empty states
- Map-adjacent behavior

### cruush Interaction

A `cruush` is a one-tap, low-friction signal of interest. The interaction is built around the phrase `has a cruush on you`, which should be treated as a core brand mechanic, not a throwaway notification line.

Rules:

- Users can send a cruush from the map card, profile preview, or full profile.
- When a user receives one, the notification should read like `{displayName} has a cruush on you!`.
- When a user sends one, the confirmation can read like `You have a cruush on {displayName}.`.
- When two users cruush each other, both receive a mutual notification.
- Mutual cruushes should become visible as mutual.
- Mutual copy should preserve the pun, such as `It's mutual. You and {displayName} have a cruush on each other.`
- Anti-spam limits and privacy controls apply.
- Internal documentation can compare this to a tap-like mechanic, but user-facing UI should say `cruush`.

### Lucky Discovery

Support an `I'm Feeling Lucky` style state for random nearby eligible profiles, with reroll and no-result states.

## Settings Architecture

Settings must be grouped into clear sections.

Content Preferences:

- Cluster Markers
- Sounds

Privacy & Location:

- Location Fuzziness
- Profile Visibility: everyone, cruushes only, hidden
- Last Active Visibility

Safety:

- Safe Exit configuration
- Trusted contacts
- Check-in timer defaults
- Blocked accounts
- Reporting history or status, if appropriate

Account:

- Upgrade to cruush+
- Host a Group
- Add a Place
- Logout
- Refresh App
- Information / About

## Required Screens

- Map home with last-active sort, bottom tray, heart pins, and fuzziness indicators
- Unified local feed and composer
- Filters panel
- Profile preview and full profile
- Full profile edit flow, including per-photo NSFW toggle
- Safety and privacy center
- Group detail and join-request flow
- Event detail, event feed, and attendee list
- Spot detail, Pink Book, and Who's Here
- Private group chat
- DMs
- cruush activity
- Auth
- Settings
- Lucky discovery state
- Requests and attendance dashboard

## Implementation Direction

The product is a website/web application migrating from Supabase toward a self-hosted architecture. Keep deployment details in `docs/self-hosted-migration.md`, but product/design decisions should assume cruush will eventually own its backend surface.

Primary platform direction:

- Build for the web first, similar to Sniffies' browser-first model.
- Do not plan for App Store or Google Play distribution.
- Native apps are out of scope because cruush hosts NSFW photos and the canonical product experience is the responsive website.
- Phone browser should feel first-class, not like a squeezed desktop site.
- Do not require installation, homescreen add, push permissions, or native-app-style onboarding for the core experience.
- Desktop web should preserve the map-first density and should not become a marketing landing page.
- Web privacy realities matter: Safe Exit should clear local web state where possible, dismiss overlays, and redirect away.

Design implications:

- Do not design flows that require Supabase-specific UI or behavior.
- Do not design flows that require native-only app capabilities unless there is a web fallback.
- Profile options are currently code-owned in `src/app/lib/profileOptions.ts`.
- Future admin-editable taxonomy should be possible through Postgres-backed option tables.
- Partnered profiles should be possible in the future through backend-owned relationships rather than hardcoded client-only state.

### Future Profile Encryption

cruush should be designed so profiles can move toward stronger encryption later. Do not build the profile model in a way that makes encryption impossible.

Likely direction:

- Split profile data into public/discoverable fields, private sensitive fields, and operational metadata.
- Keep only the minimum discoverable fields needed for map display, matching, filtering, moderation, and abuse prevention queryable by the backend.
- Encrypt sensitive profile fields at the application layer before storage when those fields do not need direct database filtering.
- Use server-managed keys or an external key-management system for app-level encryption; do not put encryption keys in frontend code.
- Keep exact location separate from display location. Store and expose fuzzed map coordinates where possible.
- Treat photos separately from profile text. Originals should be private object-storage assets; public/resized/blurred variants should be generated intentionally.
- Build future user export/delete flows around encrypted data from the start.

Tradeoff:

- Fully encrypted fields cannot be searched or filtered normally. If a field must drive filters, nearby discovery, moderation, or abuse prevention, it either needs to remain queryable, use a carefully designed derived index, or be excluded from those product behaviors.
- Do not claim end-to-end encryption for profiles unless keys are user-held and the server truly cannot decrypt the data. The likely future target is stronger at-rest and application-layer protection, not full E2EE for discoverable profiles.

## Hard Constraints

- Always write `cruush` lowercase.
- Keep immediate nearby intent as the primary product purpose.
- Keep the website queer-centered, not gay-male-centered.
- Treat Sniffies as inspiration for map-first cruising immediacy, not as a design ceiling or clone target.
- Keep map-first cruising behavior central.
- Keep local feed unified by default.
- Use cruush-specific interaction copy: `{displayName} has a cruush on you!`, `cruush back`, and `Mutual cruush`.
- Do not call cruushes likes, taps, matches, or crushes in user-facing UI.
- Use `Vibes`, not `Tribes`.
- Preserve dense profile and filter architecture.
- Do not reduce complexity; make it coherent and premium.
- Do not use glow effects; use flat colors, solid surfaces, borders, and gradients for emphasis.
- Use heart-shaped map pins.
- Use `4:5` profile photo surfaces for primary people/media blocks except tiny avatars and pin crops.
- Allow policy-compliant NSFW photos in favorites, Feed, profile photos, and authenticated direct and group messages. Profile photos may show the account holder, any part of their body without requiring a face, or their gear, while preserving the one-person and same-person rules.
- Treat permitted adult content as adult-web content requiring consent, moderation, authenticated storage, and hosting/provider compliance. Independent prohibited-content rules always apply.
- Include Location Fuzziness in settings.
- Show last-active context prominently on map surfaces.
- Do not put profile encryption keys or other backend secrets in frontend code.

## Current style: Feed posts and Cruushes (October 7, 2026)

Julien, October 7, 2026: “new style as in feed post style and cruushes style.” “no fuckihg pink buttons.” “we dont use white buttons anywhere.”

The Feed post card and the Cruushes page are the reference for how a screen looks. Copy their real code when building or restyling a screen. Where an older section of this document or an existing screen disagrees with them, they win.

Reference code:
- Page and header: `src/app/components/CruushActivity.tsx` (the `cruush-activity-header` block) and the Feed header in `src/app/components/LocalFeed.tsx`.
- Card: `src/app/components/UserActivityCapsule.tsx`, the shell both Feed posts and Cruushes rows use.
- Filled action button: the Feed `Post` button in `LocalFeed.tsx` and the cruush+ button in `CruushActivity.tsx`.

What that style is:
- Page background `#050505`.
- Header: `border-b border-white/10 bg-black/88` with backdrop blur, one row. The back control is a round bordered icon button (`rounded-full border border-white/10 bg-background/55`). The title sits beside it, left aligned, `text-2xl` white. Header actions are the same round bordered icon buttons.
- Card: `border border-white/10 bg-card/70`, large radius (`rounded-2xl` or the capsule radius), soft drop shadow `0_12px_32px_rgba(0,0,0,0.24)`.
- Filled action button: `background: var(--cruush-gradient)` with white text. Quiet or already-done states use `--cruush-gradient-soft-28`. Secondary actions are bordered dark buttons.

Old style, not a reference:
- A flat pink button (`Button` default variant, `bg-primary`) or a white button.
- Settings pages built from plain `Card` blocks with the square ghost back arrow, such as the current Two-factor authentication and Notification settings pages.
- A form opened as a pop-up with an X and a centred title where the rest of the flow is pages.

Do not restyle an old-style screen unless Julien names it. Use this section when he does, and for anything new.

### Club creation access (October 7, 2026)

Julien: “actually like anyone create a club.” Any member may create a Club. Club creation does not require cruush+ and does not redirect to checkout. Existing trust restrictions, moderation, membership limits, visibility rules, and all other Club behavior remain unchanged.

### Shared tab bars (October 7, 2026)

Julien: “Ths tabs of the checkout arent the same bro make ais stop that shit.”

- Pages joined by one tab bar are one surface. They use the same header component (`AppPageHeader`) and the same content frame classes, and render the same tab component as the first item in that frame.
- The tab bar must have the same position, inset and width on every page it links. Check it by switching tabs at phone width: nothing in the header or tab bar moves.
- Never hand-build a header or content frame for a page that joins an existing tab bar. Copy the frame of the page it is tabbed with.
- Current case: cruush+ Checkout (`CruushPlusStore.tsx`) and Rewards (`Rewards.tsx`) through `CruushPlusSectionTabs.tsx`.

## Component Language (2026-08-21)

These are the decisions taken while shipping the 1.5 fixes. Follow them instead of inventing a new treatment per surface.

### Gradients
- `--cruush-gradient` is the only bright gradient, and its stops are fixed. Do not re-weight it; every button, pill and badge in the app inherits it.
- `--cruush-gradient-soft-28` is the quiet state of that same gradient. Use it for anything already done: a cruush you sent, a mutual you already have, a secondary card.
- `--cruush-gradient-soft-18` is the quietest tint. Use it for large surfaces that must stay readable behind text.
- Never introduce a one-off gradient (no `from-fuchsia-500 via-violet-500` style stacks). If a surface needs emphasis, use the tokens plus a border or brighter text.

### Colour meanings
- Pink `#FF0072`: someone you have no mutual with.
- Purple `#6F00FF`: mutuals. The `Mutual` tag is always purple, never a gradient.
- Indigo `#3826FF`: you.
- Green `#c8ff31`: pings, everywhere. Ping controls never use the cruush gradient.
- Red is reserved for the bug report button. No other control, icon, chip or hover state is red.

### Profile controls
- Every surface that shows a profile offers the same three controls through `ProfileActionTrio`: cruush, message, centre their pin. Each one appears only when that person's privacy allows it.
- The cruush control uses the double-heart `safety` icon once a cruush exists (sent or mutual) and the `cruush` icon when none does.
- A cruush you already sent uses the quiet gradient. Only an available cruush uses the bright one.
- Vibe capsules take the colour of the relationship: pink, purple, or indigo for your own.
- Crowds never appear in a vibe capsule row.

### Page chrome
- Feed, Activity and Messages share one header: back control on the left, centred title, page controls on the right next to the fixed bug button.
- Page settings open as a popup on the page. They do not navigate to another route.
- The bug report button is fixed at the top right on every page at `z-[70]`, outside every header. Page chrome reserves room for it instead of overlapping it.
- On the desktop map, the profile docks on the left and feed, activity or messages dock on the right. Both are draggable and resizable and remember their position.

### Photos and text over photos
- People and media blocks are 4:5. The carousel never shows a square tile.
- Text over a photo uses a hard one pixel outline in all eight directions plus one tight drop shadow. No blur haloes and no text stroke on the glyphs.

## Hard rules (2026-08-22)

These are not preferences. Breaking one is a bug.

### Signal
- A signal is at most **35 characters**, which is what the field holds on a
  phone without wrapping. The editor input, the server payload schema, and the
  map preview all hold that number, and it lives in one place:
  `SIGNAL_MAX_LENGTH` in `server/src/profile-schema.ts`.
- A signal renders on **one line**, everywhere. It truncates; it never wraps to
  a second line and never grows the block it sits in.

### Colour
- Never change a colour, a surface opacity, or a shadow that the request did not
  name. A complaint about one element is not permission to restyle its
  neighbours.
- Green (`#C8FF31`) belongs to Ping and to nothing else. Notifications, unread
  states, and accents use the brand accent or the gradient.
- The quiet gradient variants are the bright gradient dimmed, never a rebuilt
  stop list: `--cruush-gradient-soft-18` and `--cruush-gradient-soft-28` layer a
  flat black over `--cruush-gradient` so both read as the same colour.
- Red belongs to the bug report control alone. That control is fixed to the top
  right and never moves.

### Layering
- Nothing covers the top chrome, the bottom nav, or an open dialog. The order is
  map (own stacking context) < dock panels (base 30) < top chrome and bottom nav
  (60) < dialogs (80) < the bug report control (70 within its own corner).
- A hovered or previewed map pin stays inside the map's stacking context.

### Capsules
- Profile previews show **vibe capsules only**. Crowds are never rendered as
  vibe capsules anywhere.
- A capsule is filled with its own border colour, which is the colour that
  person's heart pin is drawn with: pink for no mutual, purple for a mutual,
  indigo for you.

### Control shapes
- Every icon control is a **circle**. Rounded squares are not part of the
  language and do not appear on profile chrome, map chrome, or panels.
- A control that carries a word rather than an icon is a **pill**, fully
  rounded, never a rounded rectangle.
- October 8 badge-title editing: "always used filled icons for this btw no
  outline ones." The badge-picker title-edit pencil is filled, never outlined.
  This applies to that pencil control only; other icon controls remain unchanged
  unless named.

### Notifications
- Back, title, Settings, and Bug remain on one header line at every width. Bulk mark-read and delete
  actions sit below the header on compact layouts so they never hide or overlap the title.

### Page headers
- A page header is **one line**: back control, title, and icon controls all sit
  on the same row, at every width, in a full page or in a dock panel. Sizes may
  shrink; the row never wraps and the title never moves to its own line.
- The title truncates before the row wraps.

### Pulse
- Pulse green (`#C8FF31`) is a **border and an icon colour**, never a fill. The
  surface stays grey or black.
- The one exception is the send control itself, which is filled green and picks
  up the hover sheen.
- The sheet floats above the bottom nav. Nothing opens behind it.
- Basic members receive 1 Pulse per rolling day. cruush+ members receive 5 Pulses per rolling day.
  The rolling window has no calendar reset or carryover. Earned bonus Pulses persist until used and
  are spent only after the included allowance is exhausted.
- Sending has no cooldown. Recipient Pulse alerts are optional, limited to one alert every 4 hours,
  and limited to one alert from the same sender per day.
- Group owners and admins spend one of their own Pulses to alert a group. Group alerts use the same
  recipient preference and repeat limits. Parties remain deferred.

### Spots

- Spot markers and Spot clusters use the established blue Spot treatment. Ping green never marks a Spot.
- People clusters remain circular. Spot clusters remain diamond-shaped and show only their count in the logo font.
- Adult shop, Music venue, and Sports venue are first-class Spot categories alongside the existing category set.
- Public imports exclude private residences, unnamed rows, visitor data, access codes, profile media, active visits, and user-authored sexual descriptions.

## Owner-restricted NSFW photo covers, September 12, 2026

When an owner's explicit-photo sharing policy excludes the viewer, show the existing translucent white DL icon and replace the non-heart cover's “DL MODE ON” line with exactly “MUTUAL CRUUSHES ONLY” or “MUTUAL CROWDS ONLY”, according to the actual server-enforced restriction. A viewer's DL setting or show-only exception cannot bypass that owner policy. Preserve the icon, photo geometry, non-explicit photos and independent authorization rules. Whether the previously icon-only heart covers also gain this text is pending the owner's clarification; no extra heart text is approved yet. Source: task01a09549, September12 latest “if you encounter a picture” request.

On October 6, 2026, Julien clarified: “DL mode censoring should change its preview text if we become mutuals and then i could see them with dl mode off” and “i still see inconsitent dl cruushes only text dude.” When mutual status removes an owner's mutual-only restriction, an explicit photo that remains masked by the viewer's enabled DL Mode uses the established `DL MODE ON` label. Turning DL Mode off reveals that unrestricted photo. Owner-enforced audience labels and rules remain unchanged.


## Shared black glass, September 12, 2026

The black-glass consistency request applies only to Map Controls, the map top bar and bottom navigation bar. Match the existing top bar background (background color at 25 percent opacity, 12px blur) only within those named controls. Preserve their geometry and approved hover states. Signals, badges, Ghost internals, other panels, headers, capsules, inputs and dimming backdrops are excluded. A separate explicit approval makes the inner Settings page transparent only when embedded in a popup; fullscreen Settings stays unchanged. Source: task 01a09549, September 12, “mapcontrols, top and bottom bar, thats it” and the popup-only Settings approval. The earlier app-wide interpretation was unauthorized and is superseded.

## Tab treatment, October 9, 2026

Julien: “the grey tab style IS THE STYLE.” Use the existing grey active-tab treatment for new selector tabs unless a later request explicitly names another fill. Do not substitute pink button fills.
