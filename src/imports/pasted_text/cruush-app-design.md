
Design a mobile-first queer cruising app and website called **cruush** (always lowercase).  
The logo text must always be exactly **cruush** (all lowercase).  
You cannot inspect any existing app or code. Use only the requirements below.

## Goal
Create a premium, dark, cinematic, map-first cruising app for nearby queer discovery, immediate intent, local expiring posts, and discreet coordination.  
It should feel erotic, polished, intimate, and nightlife-forward, not like a generic dating app.

## Audience Positioning
Center the product on everyone except cis men as the primary audience voice and visual framing, while still allowing cis men to join and participate.  
Handle this as tone/copy/UX emphasis, not hard exclusion.

## Brand
- Wordmark: cruush (lowercase only)
- Fonts:
  - Logo: UnifrakturMaguntia
  - Headings: Cormorant Garamond
  - Body/UI: Spectral
- Core colors: #ff2f72, #7a2bff, #22b8ff
- Logo gradient: linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)
- Map style: dark and cinematic

### Map Pins
- All pins on the map must be heart-shaped.
- Each user’s pin should display their primary profile photo inside the heart shape.
- If a user has no profile photo, their pin should be a deep crimson glowing heart (use #d11f3a, #9f1730, #690f1f), with no image inside.
- Pins for groups, events, and places should also be heart-shaped, using the app’s accent gradients or deep crimson glow for visual consistency.

## Product Rules (Do Not Simplify)
Preserve dense profile/filter architecture and improve clarity through hierarchy and progressive disclosure.

### Profile Edit Structure
Sections:
- Photos
- Profile
- Basics
- Intimacy
- Health & Safety

**Basics fields:**  
- Pronouns (see list below)
- Age
- Ethnicity (see list below)
- Body type (see list below)
- Height
- Weight

**Identities (35):**  
agender, androgynous, bigender, cis man, cis woman, demiboy, demigirl, demi-nonbinary, fa’afafine, femme, genderfluid, gender nonconforming, genderqueer, intersex, man, māhū, maverique, neutrois, nonbinary, pangender, polygender, queer, questioning, third gender, trans man, trans woman, transfeminine, transmasculine, travesti, two-spirit, woman, x-gender, hijra, bakla, kathoey, muxé

**Gender Presentation (17):**  
androgynous, butch, femme, masc, femme queen, stud, soft butch, hard femme, high femme, tomboy, boi, drag king, drag queen, genderpunk, stone butch, stone femme, nonconforming

**Pronouns (11):**  
they/them, she/her, he/him, ze/zir, xe/xem, fae/faer, ve/ver, ey/em, per/per, it/its, ask me

**Ethnicity (11):**  
Black, East Asian, Indigenous, Latinx, Middle Eastern, Mixed, Pacific Islander, South Asian, Southeast Asian, White, Other

**Body Type (14):**  
slim, average, athletic, muscular, curvy, full-figured, bear, chubby, stocky, petite, tall, short, plus-size, other

**Position (10):**  
top, bottom, versatile, side, oral, service, dominant, submissive, switch, none

**Looking For (9):**  
hookup, date, friends, relationship, chat, group, third, event, other

**Looking Timing (3):**  
now, later, open

**Hosting/Travel (7):**  
can host, can travel, can’t host, can’t travel, hotel, outdoors, ask me

**Vibes (36):**  
Bear, Otter, Twink, Cub, Wolf, Daddy, Geek, Leather, Pup, Chub, Clean-cut, Rugged, T4T, Goddess, Pixie, Mommy, Doll, Goth, Alt, Punk, Cottagecore, Granola, Artsy, Sporty, Homebody, Hippie, E-Girl/E-Boy, Princess, Baddie, Sober, Raver, Spiritual, Kitten, Pony, Bimbo, Corporate

**Protection (8):**  
always, sometimes, never, discuss, PrEP, DoxyPEP, condoms, undetectable

**Kinks (33):**  
anal, bondage, breath play, chastity, cock and ball torture, costumes, dirty talk, edging, exhibitionism, feet, fisting, group, impact, leather, lingerie, massage, mutual masturbation, nipple play, oral, pegging, pet play, praise, public, roleplay, rimming, rough, sensation, spanking, toys, uniforms, voyeurism, wax, watersports

**Hobbies (51):**  
music, gaming, drag, fitness, cooking, art, photography, dancing, reading, writing, hiking, yoga, thrifting, cosplay, diy, film/tv, gardening, travel, fashion, roller skating, tattoos, karaoke, activism, astrology, anime/manga, board games, clubbing, camping, crafts, meditation, volunteering, pottery, journaling, skateboarding, swimming, martial arts, poetry, streaming, baking, vintage collecting, tarot, singing, djing, makeup, cycling, running, rock climbing, painting, theater, podcasts, movies

**Health & Safety fields:**  
- **HIV status (5):** negative, positive, undetectable, unknown, prefer not to say
- **HRT status (3):** on HRT, not on HRT, prefer not to say
- **Surgery status (4):** had surgery, planning, not planning, prefer not to say
- **Drugs (4):** never, sometimes, often, prefer not to say
- **420 (4):** never, sometimes, often, prefer not to say
- **COVID vaccine (4):** yes, no, partial, prefer not to say
- **PrEP (4):** yes, no, partial, prefer not to say
- **DoxyPEP (4):** yes, no, partial, prefer not to say
- **MPOX vaccine (4):** yes, no, partial, prefer not to say
- **Smoking (5):** never, sometimes, often, social, prefer not to say
- **Drinking (4):** never, sometimes, often, prefer not to say

### Filter Architecture (15 Groups)
- Age Range
- Gender Identities
- Presentation
- Hosting/Travel
- Position
- Looking For
- Timing
- Vibes
- Kinks
- Hobbies
- Drugs
- 420
- Smoking
- Drinking
- Protection

## Core Features

1. Panic Button / Safe Exit  
Discreet but reachable panic control. Realistic web behavior only: clear app session/local app state, dismiss overlays, redirect to google.com. Confirm flow, optional one-tap mode, stealth-safe states.

2. Hookup Check-in Timer + Emergency Contacts  
Start timer before meetup. Reminder + grace period + missed check-in escalation + safe resolution. Multi-channel fallback: in-app/push first, then SMS/email. Contact management, privacy controls, templates, and logs.

3. Couple/Poly Context (No Partnered Profile System)  
One primary profile per user. Lightweight metadata only (relationship dynamic, looking for a third, open to group play, hosting/travel context). No linked multi-partner profile architecture.

4. Public Map Pins  
Groups pins: couples/poly pods seeking a third or group play. Events pins: queer shows and parties. Places pins: cruising spots. Distinct visuals, metadata, and details per pin type.

5. Public Groups Behavior  
Request-to-join only. States: pending, approved, denied, waitlisted. Owner/mod approval queue + moderation tools.

6. Events + Places Layers  
Events: attendee visibility + dedicated event feed. Places: who-is-here / recently-here + dedicated place feed. Optional stealth/anonymous presence mode. Sniffies-like behavior but with cruush brand language and UI.

7. Private Group Chat  
Invite-only planning chats for threesomes/group encounters. Roles, invites/approvals, media states, reporting/safety controls.

8. Unified Local Feed (Expiring Posts)  
One unified nearby feed by default (not segmented by type). Short local messages that expire. Composer, expiry countdown, distance context, moderation, and empty states. Map-adjacent and proximity-first.

9. I’m Feeling Lucky  
Random nearby eligible profile. Reroll + no-result fallback.

10. Cruush Interaction (Tap-like)  
A “cruush” is a one-tap, low-friction signal—like a “tap” on Grindr.  
- Users can send a cruush from the map card, profile preview, or full profile.
- When two users cruush each other, both receive a notification and the cruush becomes “mutual.”
- Anti-spam limits and privacy controls apply.

## Design System
- Mostly monochrome interface with selective gradient accents
- One unified panel/sheet language across map, feed, profile, filters, messages, safety, groups/events/places, settings
- One spacing/radius/elevation/border/typography system
- Dense info should feel elegant and fast to scan
- Must work well on both mobile and desktop

## Required Screens
- Map home
- Unified local feed + composer
- Filters panel
- Profile preview + full profile
- Full profile edit flow
- Safety center
- Group detail + join-request flow
- Event detail + event feed + attendee list
- Place detail + place feed + who-is-here
- Private group chat
- DMs
- Cruush activity 
- Auth
- Settings
- I’m Feeling Lucky state
- Requests/attendance dashboard

## Hard Constraints
- Always lowercase cruush
- Keep map-first cruising behavior central
- Keep local feed unified
- Use Vibes (not Tribes) in user-facing language
- Preserve exact section structure and option counts
- Do not reduce complexity; make it coherent and premium