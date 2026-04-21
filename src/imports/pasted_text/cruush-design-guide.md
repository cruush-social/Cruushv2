Design a mobile-first queer cruising app and website called cruush (always lowercase). The logo text must always be exactly cruush (all lowercase). You cannot inspect any existing app or code. Use only the requirements below.

Goal

Create a premium, dark, romantic, map-first cruising app for nearby queer discovery, immediate intent, local expiring posts, and discreet coordination. It should feel erotic, polished, intimate, and nightlife-forward, not like a generic dating app.

Audience Positioning

Center the product on everyone except cis men as the primary audience voice and visual framing, while still allowing cis men to join and participate. Handle this as tone/copy/UX emphasis, not hard exclusion.

Brand

Wordmark: cruush (lowercase only)
Fonts:
Logo: UnifrakturMaguntia
Headings: Cormorant Garamond
Body/UI: Spectral
Core colors: #ff2f72, #7a2bff, #22b8ff
Logo gradient: linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)
Map style: dark and cinematic
Figma AI Rendering Instructions

— Render the map screen as a fully designed dark street map graphic. No placeholders, no gray boxes, no "map goes here" labels. Draw it as a dark tile-based street map in the style of Mapbox Dark or Google Maps Night Mode: dark charcoal (#0d0d0d–#1a1a1a) land, slightly lighter (#222) road fills, muted dark teal or navy water, and subtle white/grey road labels at low opacity. Show a realistic dense urban street grid (think NYC or London density). Overlay 8–12 heart-shaped user pins at varied positions across the map. — All mobile frames: 390×844px. Desktop: 1440×900px. — Respect iOS safe areas: 59px top status bar clearance, 34px bottom home indicator clearance. No interactive elements or text may bleed into these zones. — Use bottom sheets (24px top radius, full width) for all overlay panels — never centered modals on mobile. — Fixed bottom nav bar on all mobile screens: 80px tall, 5 tabs (Map, Feed, Messages, Activity, Profile), minimal line-style icons, active tab uses brand gradient, dark background #0d0d0d, 1px top border #2a2a2a, sits above home indicator safe area. — Minimum touch target: 44×44px on all interactive elements. Tags and filter chips: 12px vertical padding, 16px horizontal padding minimum. — Profile peek card on map: slides up to 40% screen height when a pin is tapped. Photo fills the left half at 9:16. Right side shows name, age, pronouns, one Vibe tag, distance, last active time, and a cruush button. Map remains visible in the top 60%. — All profile photos: 9:16 portrait aspect ratio on all full and preview surfaces. No landscape or square crops except small circular avatars.

Map Pins

All pins on the map must be heart-shaped.
Each user's pin should display their primary profile photo inside the heart shape.
If a user has no profile photo, their pin should be a deep crimson glowing heart (use #d11f3a, #9f1730, #690f1f), with no image inside.
Pins for groups, events, and places should also be heart-shaped, using the app's accent gradients or deep crimson glow for visual consistency.
Each pin may display a small emoji or icon badge beneath it indicating intent (e.g. looking now, hosting, traveling).
Photo Aspect Ratio — Critical Design Rule

All user profile photos must be displayed at a 9:16 portrait aspect ratio (tall rectangle, like a phone screen). This applies everywhere photos appear: profile cards on the map, profile previews, full profiles, the photo gallery/carousel, DMs, group chats, and any thumbnail context. Never crop photos into squares, short rectangles, or landscape ratios. The primary photo on a profile should fill the majority of the screen height on mobile, similar to the experience on Sniffies or a vertical story format. Photo stacks and carousels should scroll horizontally while maintaining 9:16 per frame. On desktop, photos may be displayed at up to a 2:3 ratio (still portrait), but never wider than tall. Small thumbnails (e.g. map card avatars inside heart pins) are exempt and may be circular crops, but all full-size and preview-size photo surfaces must be 9:16 portrait.

Map Features (Enforce All)

Last Active Sort + Display

The map must include a "Last Active" sort/filter control — a pill-shaped dropdown anchored to the bottom-right of the map, above the user card tray. Default sort: Last Active.
Sort options: Last Active, Newest, Closest.
Each pin on the map and each card in the bottom tray must display a last active timestamp (e.g. "3m", "12m", "1h") as a small badge overlaid on the top-left corner of the card or pin.
The bottom tray of profile cards (the horizontal scrolling row at the bottom of the map screen) must show: last active badge, blurred or clear photo depending on NSFW setting, and a short stats line (age, height, weight, or similar basics).
NSFW Photo Blur Toggle

All profile photos marked as explicit/NSFW must be blurred by default across all surfaces: map pins, profile cards, bottom tray, profile previews, and full profiles.
Users can toggle "Show Explicit Photos" on or off in Settings. When off, all NSFW photos render with a gaussian blur overlay and a small lock or eye-slash icon indicating content is hidden.
When a user taps a blurred photo, show a prompt: "Explicit content is hidden. Enable in Settings." with a shortcut link to the toggle.
In the profile edit flow, users can mark individual photos as explicit/NSFW. These photos are blurred for all viewers who have the toggle off.
The NSFW blur setting must appear prominently in Settings under a "Content Preferences" section.
Location Fuzziness (Randomizer)

Users can control how precisely their location appears on the map via a Location Fuzziness slider in Settings.
The slider has two labeled ends: "Exact" (left) and "Fuzzy" (right), with 4–5 graduated steps.
At maximum fuzziness, the user's pin is randomized within approximately a 500m radius of their actual location.
At minimum fuzziness (exact), the pin reflects the user's true GPS position.
The fuzziness slider must appear in Settings under a "Privacy & Location" section.
On the map, users with high fuzziness enabled show a soft pulsing glow ring around their pin to indicate their position is approximate — not precise.
Product Rules (Do Not Simplify)

Preserve dense profile/filter architecture and improve clarity through hierarchy and progressive disclosure.

Profile Edit Structure

Sections:

Photos
Profile
Basics
Intimacy
Health & Safety
Basics fields:

Pronouns (see list below)
Age
Ethnicity (see list below)
Body type (see list below)
Height
Weight
Identities (35): agender, androgynous, bigender, cis man, cis woman, demiboy, demigirl, demi-nonbinary, fa'afafine, femme, genderfluid, gender nonconforming, genderqueer, intersex, man, māhū, maverique, neutrois, nonbinary, pangender, polygender, queer, questioning, third gender, trans man, trans woman, transfeminine, transmasculine, travesti, two-spirit, woman, x-gender, hijra, bakla, kathoey, muxé

Gender Presentation (17): androgynous, butch, femme, masc, femme queen, stud, soft butch, hard femme, high femme, tomboy, boi, drag king, drag queen, genderpunk, stone butch, stone femme, nonconforming

Pronouns (11): they/them, she/her, he/him, ze/zir, xe/xem, fae/faer, ve/ver, ey/em, per/per, it/its, ask me

Ethnicity (11): Black, East Asian, Indigenous, Latinx, Middle Eastern, Mixed, Pacific Islander, South Asian, Southeast Asian, White, Other

Body Type (14): slim, average, athletic, muscular, curvy, full-figured, bear, chubby, stocky, petite, tall, short, plus-size, other

Position (10): top, bottom, versatile, side, oral, service, dominant, submissive, switch, none

Looking For (9): hookup, date, friends, relationship, chat, group, third, event, other

Looking Timing (3): now, later, open

Hosting/Travel (7): can host, can travel, can't host, can't travel, hotel, outdoors, ask me

Vibes (36): Bear, Otter, Twink, Cub, Wolf, Daddy, Geek, Leather, Pup, Chub, Clean-cut, Rugged, T4T, Goddess, Pixie, Mommy, Doll, Goth, Alt, Punk, Cottagecore, Granola, Artsy, Sporty, Homebody, Hippie, E-Girl/E-Boy, Princess, Baddie, Sober, Raver, Spiritual, Kitten, Pony, Bimbo, Corporate



Kinks (33): anal, bondage, breath play, chastity, cock and ball torture, costumes, dirty talk, edging, exhibitionism, feet, fisting, group, impact, leather, lingerie, massage, mutual masturbation, nipple play, oral, pegging, pet play, praise, public, roleplay, rimming, rough, sensation, spanking, toys, uniforms, voyeurism, wax, watersports

Hobbies (51): music, gaming, drag, fitness, cooking, art, photography, dancing, reading, writing, hiking, yoga, thrifting, cosplay, diy, film/tv, gardening, travel, fashion, roller skating, tattoos, karaoke, activism, astrology, anime/manga, board games, clubbing, camping, crafts, meditation, volunteering, pottery, journaling, skateboarding, swimming, martial arts, poetry, streaming, baking, vintage collecting, tarot, singing, djing, makeup, cycling, running, rock climbing, painting, theater, podcasts, movies

Health & Safety fields:

HIV status (5): negative, positive, undetectable, unknown, prefer not to say
Condoms (8): always, sometimes, never, discuss, prefer not to say
Drugs (4): never, sometimes, often, prefer not to say
420 (4): never, sometimes, often, prefer not to say
COVID vaccine (4): yes, no, partial, prefer not to say
PrEP (4): yes, no, partial, prefer not to say
DoxyPEP (4): yes, no, partial, prefer not to say
MPOX vaccine (4): yes, no, partial, prefer not to say
Smoking (5): never, sometimes, often, social, prefer not to say
Drinking (4): never, sometimes, often, prefer not to say
Filter Architecture (15 Groups)

Age Range
Gender Identities
Presentation
Hosting/Travel
Position
Looking For
Timing
Vibes
Kinks
Hobbies
Drugs
420
Smoking
Drinking
Protection
Core Features

Panic Button / Safe Exit Discreet but reachable panic control. Realistic web behavior only: clear app session/local app state, dismiss overlays, redirect to google.com. Confirm flow, optional one-tap mode, stealth-safe states.

Hookup Check-in Timer + Emergency Contacts Start timer before meetup. Reminder + grace period + missed check-in escalation + safe resolution. Multi-channel fallback: in-app/push first, then SMS/email. Contact management, privacy controls, templates, and logs.

Couple/Poly Context (No Partnered Profile System) One primary profile per user. Lightweight metadata only (relationship dynamic, looking for a third, open to group play, hosting/travel context). No linked multi-partner profile architecture.

Public Map Pins Groups pins: couples/poly pods seeking a third or group play. Events pins: queer shows and parties. Places pins: cruising spots. Distinct visuals, metadata, and details per pin type.

Public Groups Behavior Request-to-join only. States: pending, approved, denied, waitlisted. Owner/mod approval queue + moderation tools.

Events + Places Layers Events: attendee visibility + dedicated event feed. Places: who-is-here / recently-here + dedicated place feed. Optional stealth/anonymous presence mode. Sniffies-like behavior but with cruush brand language and UI.

Private Group Chat Invite-only planning chats for threesomes/group encounters. Roles, invites/approvals, media states, reporting/safety controls.

Unified Local Feed (Expiring Posts) One unified nearby feed by default (not segmented by type). Short local messages that expire. Composer, expiry countdown, distance context, moderation, and empty states. Map-adjacent and proximity-first.

Cruush Interaction (Tap-like) A "cruush" is a one-tap, low-friction signal—like a "tap" on Grindr.

Users can send a cruush from the map card, profile preview, or full profile.
When two users cruush each other, both receive a notification and the cruush becomes "mutual."
Anti-spam limits and privacy controls apply.
Settings Architecture

Settings must be organized into clearly labeled sections. Required sections:

Content Preferences

Show Explicit Photos: toggle on/off. When off, all NSFW-marked photos are blurred across all surfaces.
Cluster Markers: toggle on/off (groups nearby pins into a count bubble when zoomed out).
Sounds: toggle on/off.
Privacy & Location

Location Fuzziness: slider from Exact to Fuzzy (4–5 steps). At max fuzziness, pin is randomized within ~500m. Fuzzy pins display a soft pulsing glow ring on the map.
Profile Visibility: who can see your profile (everyone / cruushes only / hidden).
Last Active Visibility: show or hide your last active timestamp from other users.
Safety

Emergency contacts management.
Check-in timer defaults.
Panic button configuration (one-tap mode on/off).
Account

Upgrade to cruush+ (premium tier).
Host a Group (premium).
Add a Place (premium).
Logout.
Refresh App.
Information / About.
Design System

Mostly monochrome interface with selective gradient accents
One unified panel/sheet language across map, feed, profile, filters, messages, safety, groups/events/places, settings
One spacing/radius/elevation/border/typography system
Dense info should feel elegant and fast to scan
Must work well on both mobile and desktop
Photo Layout Specifications (Enforce in All Screens)

Profile card on map (bottom sheet / peek card): Photo fills the left half of the card at 9:16 portrait ratio, with profile metadata on the right. Card slides up to 40% screen height. Map remains visible above.
Full profile view: Primary photo occupies full screen width at 9:16 portrait. Subsequent photos in the carousel maintain 9:16. Profile info scrolls below or overlays with a bottom sheet.
Profile edit — Photos section: Photo slots displayed as 9:16 portrait tiles in a 2-column grid. Each photo can be individually marked as explicit/NSFW.
DMs and group chat: Shared media thumbnails render at 9:16 portrait, never landscape.
Event/Place/Group detail pages: Any featured or hero image must be 9:16 portrait or 2:3 at minimum. Never wider than tall.
Attendee/member lists: Small circular avatars are acceptable at this size only.
Bottom tray on map home: Horizontal scrolling row of profile cards at the bottom of the map. Each card is portrait-oriented (taller than wide), shows last active badge top-left, blurred photo if NSFW toggle is off, and a one-line stats summary.
Required Screens

Map home (with last active sort control, bottom tray, heart pins, fuzziness glow rings)
Unified local feed + composer
Filters panel
Profile preview + full profile
Full profile edit flow (including per-photo NSFW toggle)
Safety center
Group detail + join-request flow
Event detail + event feed + attendee list
Place detail + place feed + who-is-here
Private group chat
DMs
Cruush activity
Auth
Settings (with Content Preferences, Privacy & Location, Safety, Account sections)
Requests/attendance dashboard
Hard Constraints

Always lowercase cruush
Keep map-first cruising behavior central
Keep local feed unified
Use Vibes (not Tribes) in user-facing language
Preserve exact section structure and option counts
Do not reduce complexity; make it coherent and premium
All profile photo surfaces must use 9:16 portrait aspect ratio. No exceptions except small circular avatars.
The map home screen must be rendered as a fully designed dark street map. No placeholders.
All mobile frames must be 390×844px. All interactive elements must meet 44×44px minimum touch targets.
NSFW photos must be blurred by default on all surfaces until the user enables explicit content in Settings.
Location fuzziness slider must appear in Settings and fuzzy pins must render with a pulsing glow ring on the map.
Last active timestamp must appear on every pin, every tray card, and every profile peek card.
