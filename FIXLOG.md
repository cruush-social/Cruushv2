# FIXLOG

- 2026-09-01: GitHub #140. Visibility Controls Apply no longer returns `Request validation failed`
  for profiles using canonical app-owned `/api/media/profile-photos/<uuid>.<ext>` photos. Regression
  coverage: `server/src/profile-schema.test.ts` and `server/src/app.test.ts`.
- 2026-09-01: Heart and saved-badge borders now resolve from one identity tone. Active MHC units use
  `#77B9DA` across Feed, Messages, cruush activity, profile hearts, Spots, and the map. `Far far away`
  stays inside its metadata column. Rendered assertion: populated Android-width cards showed identical
  heart and badge strokes on relationship and MHC states.
- 2026-09-01: cruush activity and Messages action trios now use 36px controls with 4px gaps. cruush
  centers identity, last active, and distance beside the heart; Messages preserves its preview spacing.
- 2026-09-01: Larger text no longer clips Notifications, Cruushes, Bug reports, Cruise Carousel, or
  the open Mile High Club picker at 390x844. Rendered assertion: each affected route showed its full
  heading, controls, and labels; Mile High Club kept address search, actions, map, and bottom nav on one screen.
- 2026-09-01: The Pulse sheet no longer accepts mobile drag input. Rendered assertion: a 75px diagonal
  drag left its mobile sheet rectangle unchanged at x=12, y=124.625, width=366, height=619.375.
- 2026-09-01: The current user's map pin now opens its signal preview on mobile tap. Rendered assertion:
  tapping the owner pin set its pressed state and displayed the signal above the heart.
- 2026-09-01: The current user's regular and Ghost Mode decoy previews now stay open after a mobile
  tap instead of closing on touch pointer-leave; tapping the same heart again closes the preview.
- 2026-09-02: GitHub #142. Onboarding now matches the server's 35-character Signal limit and names the invalid field instead of only showing `Request validation failed`; skipping optional 2FA remains supported.
- 2026-09-02: Stream `Flag` no longer rejects harassment-only text. Content publishes while its sexual-harassment label remains flagged for moderator review; mixed threats still reject. Regression coverage: `server/src/policy-mapper.test.ts` and `server/src/moderation-service.test.ts`.
- 2026-09-02: A valid suspended-account sign-in now opens a dedicated suspended screen with logout and the reason-appropriate public appeal link instead of returning the generic sign-in error.
- 2026-09-02: Color-blind mode now remaps shared brand, relationship, Pulse, Mile High Club, Dark Room, destructive, chart, focus, badge, selected-navigation, SVG, and logo colors while leaving member photos and map tiles unchanged.
- 2026-09-02: cruush+ Pulse allowance is now 5 per rolling day without a sender cooldown. Optional recipient alerts retain the 4-hour interruption cap and same-sender daily deduplication.
- 2026-09-02: Group owners and admins can now spend one of their own Pulses to alert active group members. Group Pulses share the recipient opt-out, quiet-hours, mute, 4-hour interruption, and same-sender daily limits used by individual Pulses.
- 2026-09-02: The retained public Spot dataset now imports every named geocoded public row available in the supplied workbook, excludes private residences and unnamed rows, and adds Adult shop, Music venue, and Sports venue categories without exposing the private source label.
- 2026-09-02: Active Spot markers keep the blue Spot treatment while showing their current check-in count; Ping green is no longer reused for Spots.
# 2026-09-02

- Mobile Notifications header now keeps Back, title, Settings, and Bug visible on its first row; bulk actions sit below instead of squeezing out the title.
- Spot pages now show the Pink Book tabs before Popular times on compact screens so the primary Spot interaction appears sooner.
- Pride flag badges now fill their circular badge frame while keeping identity-defining symbols visible.
- Existing saved Gaming hobbies now migrate to Video games without deleting other hobby selections.
# 2026-09-02

- Fixed the 1.6 profile-taxonomy migration using a nonexistent `profiles.roles` column, which stopped later migrations and broke authenticated map/profile loading.
- Kept Map Controls and Recently Active from covering mobile side panels, and condensed the Mile High Club rules so its address controls and map remain visible with Larger text.
- Zodiac saved in Edit Profile now appears on profiles and is available in Seeking Filters and Visibility Controls.
- Restored deployed top-bar, popup-shell, and Close-control geometry after unrelated 1.6 edits changed shared page chrome; Profile Intimacy now renders one Hair now section instead of two. Regression coverage: `src/app/components/AlphaBugButton.test.tsx`, `src/app/components/CruushActivity.test.tsx`, `src/app/components/MapHome.test.tsx`, and `src/app/components/ProfileView.test.tsx`.
- That sweep also reverted requested Cruushes layout. The centered stats and tab block and the small-screen tab padding that keeps all four labels readable are restored. Regression coverage: `src/app/components/CruushActivity.test.tsx`.
- Saved visibility exclusions for body hair, pubic hair, facial hair and zodiac were dropped when the encrypted rules were decrypted, so those filters silently stopped applying to discovery, Pulse and profile access. Regression coverage: `server/src/app.test.ts`.
- Spot check-in Feed posts read "Checked in at undefined" because the published-place lookup never selected the Spot name. Regression coverage: `server/src/app.test.ts`.
- Support requests in the policy category stopped being triaged as age-suspension appeals. Regression coverage: `server/src/age-appeal-detection.test.ts`.
- Migrations 103 and 104 re-added a facility-type constraint that rejects the adult shop, music venue and sports venue rows migration 134 inserts, so every replay against a populated database failed. Regression coverage: `server/src/migrate.test.ts`.
- Map control hover darkens the control again instead of washing it lighter. Regression coverage: `src/app/components/MapHome.test.tsx`.
- Spot pins stayed unclustered at neighbourhood zooms, so the imported public Spots drew dozens of overlapping diamonds. Clustering now holds to a closer zoom over a wider radius, and the 1.6 release email carries a matching capture.
- The Gay and Ace spectrum badges used a hand-drawn mark and a playing-card icon while their licensed community symbols sat unused in the repo. Both now render the licensed symbol.
- Tutorial steps showed borrowed icons that read as finished artwork. Each step now carries a gradient placeholder instead.
- The map paged every Spot in the radius, asking for 500 rows against an API that caps a page at 100, so one view cost over a hundred requests and drew thousands of markers. It now loads the nearest 300 and re-queries as the view moves, and it stops paging when a full page repeats Spots it already holds. Regression coverage: `src/app/components/MapHome.test.tsx`.
- The OpenStreetMap import buried the map under venues nobody cruises. Gyms are the retained workbook set only, sports venues are the landmark rooms, community spaces are the LGBT centres plus every YMCA, and music venues are the rooms that book alt, goth, DIY, queer, punk, metal, EDM, pop and disco bills. Published Spots fall from 10,876 to 5,747.
- Rooms booked for who is playing now sit under Music venue instead of Bar or Nightclub, and the workbook's Other bucket gives up its recognisable kinds as Store, Woods, Rest stop and Bridge, each with its own marker. `spot-category-gallery.html` renders all 27 categories from the real pin.
