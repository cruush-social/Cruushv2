# cruush Master Design Guide

This is the canonical product and design guide for cruush. If older pasted design prompts, generated docs, or implementation details conflict with this file, this file wins unless a newer explicit product decision says otherwise.

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
- User-facing language should not call the primary interaction a like, tap, wink, or crush. It is a `cruush`.
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

Cruush copy examples:

- `{displayName} has a cruush on you!`
- `You have a cruush on {displayName}.`
- `It's mutual. You and {displayName} have a cruush on each other.`
- `Send a cruush`
- `Cruush back`
- `New cruush`
- `Mutual cruush`

Do not replace this with generic copy such as `{displayName} liked you`, `Someone tapped you`, or `You matched`.

## Brand System

- Logo font: UnifrakturMaguntia.
- Heading font: Cormorant Garamond.
- Body and UI font: Spectral.
- Core colors: #FF0072, #6F00FF, #3826FF, #004BFF, #1181FF 
- Logo gradient: linear-gradient(90deg, #FF0072 6.08%, #6F00FF 53.27%, #004BFF 100%)
- Button gradient: linear-gradient(90deg, #FF0072 6.08%, #6F00FF 43.11%, #3826FF 58.46%, #004BFF 73.81%, #1181FF 100%);
- All gradient accents across the app should reuse the same pink-to-violet-to-blue progression as the logo mock, without extra glow.
- Heart fallback rules:
  - Map pins for other users without photos use the red-to-crimson heart gradient.
  - The signed-in user without a photo uses the blue heart gradient.
  - Compact heart avatars on feed, messages, and similar surfaces use the pink-to-red heart gradient instead of the older red-to-crimson version.
- Fallback heart colors for profiles without photos: `#d11f3a`, `#9f1730`, `#690f1f`.
- Overall interface: mostly monochrome with selective gradient accents.
- Map style: dark, cinematic, dense urban street map.

## Visual Reference Direction

Primary design reference:

- Figma Make reference: `https://www.figma.com/make/tcRqXasuzRNORtCLFyKUzZ/cruushv1--Copy-`
- Use this reference for general vibe, color temperature, glow intensity, and dark cinematic surface language.
- Do not treat it as a locked implementation. The website can improve layout, interaction quality, accessibility, and component consistency while preserving the mood.

Logo and icon direction:

- The current preferred logo direction is a gothic lowercase `cruush` wordmark with neon magenta, violet, and electric blue gradient lighting on a black field.
- A future human-designed SVG mark may wrap or sit around the wordmark using a heart-like flame, wing, horn, crown, or spark form.
- The icon should feel sharp, romantic, nocturnal, queer, and a little dangerous, not soft or generic.
- The heart shape should be recognizable but stylized enough to avoid generic dating-site branding.
- The mark can use flame-like curves and a central star or spark motif, but it must remain legible at favicon, homescreen shortcut, nav, and social preview sizes.
- Final production logo assets should be vector SVG supplied or refined by a human designer. Do not ship an auto-traced raster draft as the final mark.
- Provide single-color, gradient, dark-background, and small-size variants before treating the logo as final.

## Interface Principles

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

Last active display:

- Every pin should show or expose a last active timestamp.
- Every bottom tray card should show a last active badge.
- Every profile peek card should show last active time.

## Heart Pin System

All map pins must be heart-shaped.

User pins:

- Display the user's primary profile photo inside the heart shape when available.
- Use a deep crimson glowing heart when no profile photo exists.
- May display a small intent badge underneath, such as looking now, hosting, or traveling.

Groups, events, and places:

- Also use heart-shaped pins.
- Use accent gradients or deep crimson glow for visual consistency.
- Must remain visually distinct through metadata, badges, icons, or layer controls.

Privacy state:

- Users with high location fuzziness enabled should show a soft pulsing glow ring around their pin to indicate approximate location.

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

## NSFW Photo Handling

cruush is a self-hosted adult website and may host NSFW user photos. Do not design around App Store or Google Play content restrictions. Design around adult-web realities: age gating, consent, moderation, hosting/provider policies, payment-provider constraints, legal compliance, and user control.

Photos marked explicit or NSFW must be blurred by default across:

- Map pins
- Profile cards
- Bottom tray cards
- Profile previews
- Full profiles
- Message and group-chat media surfaces

Settings must include `Show Explicit Photos` under Content Preferences. When disabled, NSFW photos render with blur plus a lock or eye-slash indicator.

If a user taps a blurred photo, show a prompt that explicit content is hidden and offer a shortcut to settings. Profile edit must let users mark individual photos as explicit or NSFW.

Required adult-content controls:

- Age gate the product before account creation or content access.
- Require users to confirm they are allowed to view and upload adult content.
- Require user consent/rights confirmation before photo upload.
- Provide clear report reasons for non-consensual imagery, minors, impersonation, coercion, trafficking, illegal activity, spam/scams, and harassment.
- Keep public/discovery surfaces moderatable even when sensitive profile fields are encrypted at rest.
- Store originals privately and generate intentional display variants, including blurred variants for explicit photos.
- Do not use third-party image hosting that prohibits adult content.
- Do not rely on app-store review assumptions for policy decisions.

## Location Privacy

Settings must include Location Fuzziness under Privacy & Location.

Rules:

- Slider labels: Exact to Fuzzy.
- 4-5 graduated steps.
- Exact means the user's true GPS position.
- Maximum fuzziness randomizes the visible pin within approximately 500m.
- High fuzziness shows a soft pulsing glow ring around the user's pin.

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
- Position is the top/bottom/versatile-style field, including vers top, vers bottom, pillow princess, and stone top. Role is the dominant/submissive/switch-style field, including service.
- Kinks and fetishes use a catalog-backed tap-to-select list. The whole Kinks & Fetishes field has one visibility setting instead of per-kink role or seeking controls.
- Visibility options should use the same vocabulary across profile fields: public, mutual Cruushes, and mutual crowds.
- Dropdown/selectable-control rule for future implementation: do not create one-off dropdown UI or raw `<select>` controls for profile, filter, or visibility taxonomies. Use the existing shared `MultiSelect` control for multi-select and single-select taxonomy pickers; extend that component if the app needs new dropdown behavior.

## Filter Architecture

Filters should be grouped into 13 major groups:

- Age Range
- Gender Identities
- Presentation
- Hosting/Travel
- Position
- Role
- Looking For
- Timing
- Vibes
- Kinks & Fetishes
- Hobbies
- Substance Boundaries
- Protection

Filters should be dense but scannable. Do not flatten the architecture into a small dating-app filter set.
On the map, the filter button should open a branded popup/sheet that reuses the same filter groups, tabs, and pill selection language as the standalone filters screen.

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
- Composer
- Distance context
- Moderation states
- Empty states
- Map-adjacent behavior

### Cruush Interaction

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

- Show Explicit Photos
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

- Map home with last-active sort, bottom tray, heart pins, and fuzziness glow rings
- Unified local feed and composer
- Filters panel
- Profile preview and full profile
- Full profile edit flow, including per-photo NSFW toggle
- Safety and privacy center
- Group detail and join-request flow
- Event detail, event feed, and attendee list
- Place detail, place feed, and who-is-here
- Private group chat
- DMs
- Cruush activity
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
- Use cruush-specific interaction copy: `{displayName} has a cruush on you!`, `Cruush back`, and `Mutual cruush`.
- Do not call cruushes likes, taps, matches, or crushes in user-facing UI.
- Use `Vibes`, not `Tribes`.
- Preserve dense profile and filter architecture.
- Do not reduce complexity; make it coherent and premium.
- Use heart-shaped map pins.
- Use `4:5` profile photo surfaces for primary people/media blocks except tiny avatars and pin crops.
- Blur NSFW photos by default until users enable explicit photos.
- Assume cruush hosts NSFW user photos; use adult-web compliance, moderation, and hosting constraints rather than app-store constraints.
- Include Location Fuzziness in settings.
- Show last-active context prominently on map surfaces.
- Do not put profile encryption keys or other backend secrets in frontend code.
