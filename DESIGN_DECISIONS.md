## Canonical logo and installed app assets, September 12, 2026

The notched cruush logo is rejected for every app use, including installed home-screen launch/loading and mobile icons. Use the actual approved `src/app/assets/brand/cruush-logo.svg` (SHA-256 `928d31f785515d958b2efb9778b1d5082e6e677df49e6426cf4be0942fbcace1`) as the source for raster exports. Remove rejected source/raster files from the repository and replace their references. Preserve icon dimensions, backgrounds, safe-area padding, loading behavior and unrelated artwork. This records the asset rule, not production or physical-device verification. Source: session `01a09549-890d-7f11-9c12-4ac016446942`, Julien's September 12 repeated notched-logo removal requests, home-screen loading clarification and mobile-icon correction.

# cruush design decisions

- September 25 app chrome: “I prefer close buttons on app on the left hand” and “I thought we made a compontent for headers? They're inconsistent.” App page headers use the shared one-line header component, and Close is the leftmost header/dialog/sheet control. Preserve each screen's existing title, actions, Bug slot and behavior while migrating it. Source: GitHub issues #305 and #312, reported September 25, 2026.

- September 26 mobile follow-up: “I told you no taglines in header.” Headers contain the page or panel title and their controls, not a tagline beneath the title. Source: GitHub issue #318.

- Ghost Mode description: “you aren't visible, only the decoy is.” Ghost Mode hides the member's real pin from others and shows the moving decoy pin. This is a copy correction only; existing privacy behavior stays unchanged. Source: GitHub issue #320, September 26, 2026.

- New-member Pulse intro: after the existing first-login intro queue is finished, wait 30 seconds and show the Pulse control and gesture once. Source: GitHub issue #321, September 26, 2026.

- The signed-in owner’s real map pin and owner-only Ghost decoy always remain individual markers at their existing coordinates, at every zoom. Never replace either with a numbered people cluster or include either in its count. Owner artwork and tap targets remain above nearby cluster counts without automatic position offsets. Other members retain existing clustering, same-building spiderfy and Ghost expiry. This corrects the owner inclusion introduced by the September 10 spiderfy repair. Source: task `01a08e63-fb72-7070-886b-c162d77b31d9`, user message at transcript line 9, September 10, 2026.

- September 10 Spot curation: substantially reduce remaining Sniffies user pins, including random micro-locations, stair/bathroom sublocations, office-building cruising pins, retail bathrooms and retail parking lots, and duplicate or misspelled versions of the same venue. Verify real venues against OpenStreetMap; retain dungeons and adult venues, identifiable parks, gyms, public parking facilities, hotels and actual bus/train/shuttle stations, comparable real venues and distinct chain branches. Explicit retail-parking removal supersedes earlier broad parking-lot preservation. For venue/venue-bathroom pairs retain the actual venue. Preserve all non-Sniffies records and member data; use recoverable archival. Continue collecting cruush member submissions privately for review, and do not merge a different nearby venue solely by proximity. Sources: task `01a08c91-a340-7b92-95aa-f137c8bf7b16`, user lines1110,1128,1138,1140,1326,1352.

- Mobile Visibility Controls tabs must not float over scrolling fields or reveal field text behind the tab strip. Reproduce the reported Basics scroll state before changing its responsible scrolling layer; preserve tab order, sizes and privacy controls. Source: September9,2026,03:37 screenshot, task01a08281. This is separate from the map profile popup tab requirement.

- Spot descriptions must not retain imported Sniffies descriptions or user-submitted personal solicitations. Remove those descriptions through the requested queue item, preserving venue records and unrelated member content. The reported example is “10620 building down low fun”; do not treat its description as venue information. Source: task01a08281-ec99-7630-b7a1-fbbcb8575d5e user15264, September9,2026. (2026-09-09)
- The later September9 instruction expands Spot cleanup to recoverable archiving of obviously user-submitted, low-quality Sniffies imports, using misspelled/bad titles and duplicate evidence to identify candidates. “Train trackd” is a supplied example. Confirm provenance and exact targets; preserve legitimate distinct venues and all underlying member data. The earlier31-record duplicate batch is not completion of this broader cleanup.
- “Roof Top Jerking” is another explicitly rejected imported Spot. Sexual solicitation titles like this qualify for removal of the Spot itself, not merely a description rewrite. Preserve a recoverable record and unrelated venue/member data. Source: September 9, 03:53 mobile screenshot in the active task.

- Feed input accordion: use the existing cruush+ benefits accordion's shared top control and toggle pattern. Do not add a full-size Close text button or a bottom handle. Closing preserves the draft and staged input. Preserve unrelated Feed controls and copy; do not import benefit-card styling. Sources: task 01a08281-ec99-7630-b7a1-fbbcb8575d5e, user messages 13963 and 13975; exact reference selected in task 01a083a6-a456-7850-8780-49fa5b354e3c, genuine user message 3772, September 9, 2026 at 06:35:00.045Z. This supersedes the earlier alternatives. (2026-09-09)

- Hunter uses the rounded-outline snake Julien selected with "i like proposed snake" on September 8, 2026. Copy the two complete paths from the approved `/tmp/cruush-ra-dl-proof.m6qcI2/snake-preview.tsx` candidate, shown in `snake-style-preview.png`; preserve the existing 24x24 viewBox, rounded stroke defaults, mouse, other glyphs, badge frames, colors, placements and role mapping.

- Desktop map profile popups show Intimacy field cards one per row, matching mobile. Preserve the existing field order, card styling, chip arrangement, scrolling tabs and footer actions. This does not change standalone profile or edit layouts. (2026-09-08)

- Onboarding requires name, gender identity, sexuality and crowd. Julien's latest explicit list supersedes the earlier instruction to require all information steps and the intermediate Sexuality-and-Signal answer. Signal, pronouns, Vibes, Bio, Role/Position, photo upload, badge selection and 2FA remain optional. Invite codes and the trans checkbox are not forced; conduct agreement and account/age safeguards remain unchanged. Remove Looking for from the onboarding sequence only, preserving profile/edit fields and saved answers. The admin replay must use this same flow without account writes. (2026-09-08)
- The admin onboarding test (Settings > Test onboarding) always matches the user-facing onboarding. It renders through the same App onboarding screen a new member gets, outside the signed-in app shell: no bottom navigation and no app popups around it, and the Code of Conduct oath included as for any new account. The only difference is the original admin-only Test onboarding bar above the rites, laid out like the other signed-in menus: Close sits left of the docked bug button and no floating Accessibility button appears (Close returns to Settings). Julien chose "Old X, top bar" and "Same way do the other menus" on September 18, 2026. Preview photo notices use the member wording ("Use real text"); fake 2FA recovery codes remain because preview cannot write. The replay covers the rites only, not email or age verification ("Rites only"). Finishing lands on the map or Rewards exactly as a new member does. Preview mode exists only to avoid account writes. Future onboarding changes go into the shared screen so both stay identical. Source: Julien, September 18, 2026, session `182e496d-5077-42f1-bdc7-f6b3296befe6`: "Make sure admin onboaridng test page always matches user facing one".
- Onboarding Crowd copy describes crowds as shared social spaces like gay or dyke bars, not identity labels, and points to Map Controls > Visibility. Selecting crowds does not enable Crowd Mode or change visibility settings. (2026-09-08)

- Censored photos across the app use the supplied DL icon in white at 75% opacity. Non-heart covers keep the exact text `DL MODE ON` beneath it. Heart previews, including map hearts, omit that visible line and center the icon horizontally and vertically in the heart while preserving its size. This supersedes the earlier all-surfaces text requirement and the intermediate instruction to retain the old icon position; DL toggles and ordinary missing-photo fallbacks are unchanged. (September 8, 2026)

- Feed photo previews are 64px hearts, matching the approved sample page. One photo uses one heart. Two or three photos use separate equal-size hearts in one horizontal row with visible gaps. They never weld, overlap, cluster, or grow to the 80px map-heart size.
- Color-blind mode is an Accessibility toggle. Navigation-size and map-pin-size controls are not part of 1.6.
- Feed search searches Feed post tags only. It does not search member names, profiles, or post text.
- Feed reactions and replies are not part of 1.6. Do not build either.
- GitHub issue #135 is not a 1.6 release item. Do not invent or change checkbox visuals for it.
- The Spot board is called the Pink Book. Its section sits below source attribution. Check-in includes an optional Pink Book post. An active check-in is required to read other members' posts, but authors can always view and delete their own posts after checkout.
- The map saves the master “Show Spots on the map” choice so whether Spots appear survives a map remount or reload. When no saved choice exists, Spots remain visible by default; individual Spot category settings and all unrelated map controls remain unchanged. Source: issue #419, Julien, September 29, 2026: “Map dont saving settings i.e. spots appearing or not”.
- Badge categories must be explicit on mobile, never discoverable only by horizontal scrolling. Preserve every deliberately selected custom, Hanky, role, position, and Pride badge glyph. Saved side badges sit beneath the heart photo on Feed, Messages, and Cruushes.
- Profile Tags are a separate field directly below Bio. They are moderated with the rest of the profile, display directly below About, and match the shared Seeking and Visibility text search with or without a leading `#`.
- Basic members can save up to 3 profile tags. cruush+ members can save up to 10. Basic Feed posts are text-only; cruush+ Feed posts can attach up to 3 photo hearts.
- Circular numbered map clusters are people-only and open only those profiles. Spot clusters stay separate, use the blue diamond Spot style, and open only those Spots.
- Profile protection answers always keep their field labels so repeated values such as "yes" remain understandable.
- Every benefit card on the cruush+ page uses the bright product gradient.
- A person's saved badge borders always use the exact same resolved color as their heart border. While MHC is active, both use the approved sky color `#77B9DA` across the app. Travel distance text, including `Far far away`, never overlaps identity actions.
- On cruush activity cards, identity plus last-active and distance stay centered beside the heart and Badges, with compact actions at right. Messages keeps its message-preview spacing. Marketing mock previews use gradient hearts instead of profile photos or photo placeholders.
- Mile High Club is a full page on mobile. On desktop it may replace Settings inside the existing map popup because desktop Settings itself is embedded there; it must not open a second popup.
- On mobile Spot detail, Here now and rating summaries stay compact so Pink Book and Who's Here appear in the initial screen.
- The tutorial is removed from the app, September 18, 2026: no interactive map tutorial after joining, no Tutorial entry or page in Settings, and no first Feed post prompt after joining. The "Complete the tutorial" Side Quest is no longer listed on Rewards; past completions and claims remain stored. The dormant `MapControlsTutorial` component stays in the codebase unmounted. Reason given: new members saw too many popups on first join. Source: Julien, session `182e496d-5077-42f1-bdc7-f6b3296befe6`, "remove tutorial from cruush app both insettings as well as on onboarding ... peopel saytoo many pop ups when you first join so lets just get rid of it", plus his answers "Remove it too" (first Feed post prompt), "Hide the quest" and "Keep dormant". This supersedes the earlier tutorial-coverage rule. The local dev onboarding preview requires no account and never writes onboarding data.


## Historical crypto checkout decisions, September 12, 2026

Source: Julien's current session `01a095c7-d9c8-7d51-980b-24acbc0daf99` requests a longer payment window on the latest processor handoff branch, confirms 24 hours and fresh orders after method changes, and clarifies that copies means in-app text plus the blog.

- New payment windows default to 24 hours; preserve previously issued deadlines.
- Changing payment method cancels an unpaid order and resets checkout; starting the replacement checkout creates a fresh order, address and timer. Preserve received/confirming-payment handling.
- Venmo uses the existing PYUSD/Ethereum rail. Keep PayPal/PYUSD Arbitrum, Cash App/USDC Arbitrum, and compatible wallets/USDC Base.
- Preserve Cash App stablecoin availability for eligible users, including New Jersey and Pennsylvania. New York and other jurisdictions without Cash App stablecoins require another Cash App path. Bitcoin integration is requested and remains pending in this checkpoint.
- Bitcoin orders must lock their BTC amount at creation, including mandatory estimated collection cost; later market movement must not change an issued quote. Implementation and funding setup remain pending.
- Customers pay the mandatory collection fee. Research actual Cash App, PayPal and Venmo sending-fee quotes before claiming one guaranteed upfront funding amount. An estimate of a public-chain fee is not a quote from a custodial app.
- Blog voice is casual, positive founder prose. Crypto was always planned; circumstances accelerated it. Fixed-term crypto purchases do not auto-renew. Name Feeld as a shared-provider reference without naming the moderation provider in public copy. Include profiles/messages screened for trafficking, CSAM, hateful symbols and abuse; avoid unsupported market-wide superiority claims.

- Sending-fee quote research and integration scope is Cash App, Venmo and PayPal only. No MoonPay or new customer apps/accounts. Other wallets must explicitly state that sending fees are not included and the customer determines and covers them in their chosen wallet. Checkout must distinguish the included processing/collection fee from the app’s sending fee; never label an unquoted fee as zero or included. Source: Julien’s September 12 continuation in the same session.

- Latest September 12 clarification: Bitcoin must be offered for Cash App, PayPal and Venmo, while preserving their stablecoin options. Estimated total costs are acceptable; embedded purchasing, a partner integration and an exact provider quote are not prerequisites to that estimation work. Keep the exact amount cruush receives separate from the estimated customer balance needed. A particular flat allowance and the Bitcoin confirmation threshold remain undecided; no numeric policy has been approved.

## Current processor decisions, September 12, 2026

Source: Julien's session `01a095c7-d9c8-7d51-980b-24acbc0daf99`, including “okay so lets do 6”, “first do the code work ... then ill set up the bitcoin”, “dont do blog”, and the final two-amount instructions. These supersede the pending/undecided checkpoints above.

- Deliver the real Bitcoin, stablecoin, settlement and automatic-forwarding implementation for local testing, security review and production. Owner Bitcoin/private setup follows code completion. No mock or canary-only substitute.
- Native Bitcoin serves Cash App, PayPal and Venmo and requires six canonical confirmations. Display observed confirmation progress; do not derive it from elapsed time. Lock the BTC amount at order issuance.
- Preserve the 24-hour arrival window and fresh order/address/timer after changing method. Confirmation may finish after the arrival deadline.
- Automatically forward paid receiving-address funds to ELLIPAL through the separate signing service. No manual per-order collection. Website holds public keys only; the service never uses ELLIPAL recovery words.
- The exact recipient amount includes product price and cruush's quoted automatic-collection cost. Show a different suggested available balance that adds a generous named-app sending allowance. Unused allowance stays in the customer's app. This supersedes the earlier request to collect the surplus.
- The implemented estimate uses a $5 floor, or $10 for Venmo/Ethereum, 10% of product price rounded upward to dollars, and three times the observed collection cost, whichever is largest. It is a balance estimate, not a provider quote or guaranteed maximum. See `docs/crypto-checkout-fees.md` for every item and option.
- Generic wallets have no sender-fee estimate; users determine and cover that fee in their wallet. No MoonPay or new customer signup flow.
- Apply the shared processor to `/store` and `/store/pulse`. Add Pulse checkout links from the cruush+ information page and cruush+ checkout, and a cruush+ checkout link from Pulse. Preserve unrelated controls and styles. No group-Pulse work.
- Fixed-term subscriptions never auto-renew; Pulse credits are a one-time purchase. Blog work is deferred by Julien; preserve its draft.
- The tutorial covers cruush+, Mile High Club, current Spots/Pink Book, Basic and Feed+ posting, and full Pulse behavior. Completing the full tutorial is a Side Quest; skipping it is not completion. The local dev onboarding preview requires no account and never writes onboarding data.
- Basic includes one Pulse per rolling 24 hours. cruush+ includes five per rolling 24 hours. Neither tier has a cooldown between Pulses. Earned bonus credits extend the allowance; buying extra Pulses is a later release, not 1.6. Existing Pulse duration, radius, mutual-only alerts, privacy checks, and same-sender 24-hour alert suppression remain unchanged.
- Cruushes, Messages, and Feed keep back, title, settings where present, and the bug button in one mobile header row. cruush counts and tabs remain centered, and mobile page scrolling never shows a vertical bar.
- Every screen header is one line, everywhere: back button, title, any header actions such as settings, and the bug button share a single row. Nothing header-related ever wraps to or is placed on a second line. Screens register a bug-button slot so the reporter docks into that same row instead of floating over it. (2026-09-04)
- Side Quests do not interrupt. There is no Side Quest prompt on the map, and no notification standing in for one. Members find claimable quests on the Rewards page when they go looking. The sweep in `server/src/side-quest-notifications.ts` is kept but not started, so turning nudges back on is one line in `server/src/index.ts`. (2026-09-07)

## Ghost animation preservation, September 8, 2026

September 9 clarification: judge the approved 30–80% drift against the previous displayed decoy of other members, not the owner's decoy or a pre-land-filter sample alone. A tiny coastal fallback is allowed only when a target-sized land-only jump is geometrically unavailable. Preserve the approved animation and icon; demonstrate the actual visible displacement before reporting this recurring issue fixed.

Ghost placement approval, September 8: Julien selected a middle option rather than unrestricted random offsets centered on the true location. Randomize over a broader area around a stable hidden anchor, targeting jumps of 30–80% of the selected radius while remaining on land and within that radius. Preserve the existing privacy cell and approved animation. Julien approved a shorter land-only jump when the minimum jump is geometrically impossible near the coast. Never use water or expand the selected radius as a fallback.

Julien reaffirmed that other members' Ghost pins retain the approved animation: both side-badge borders flash with the heart, and relocation updates the pin in place without requiring a page refresh. The visible disappearance, Ghost effect, and reappearance at the new position must remain; retaining the underlying marker is not permission to remove the visible replacement. A badge implementation change must preserve its connection to the existing flash color. His latest instruction explicitly restores the animation code from the approved `bff0498` treatment while keeping the new Ghost Mode exit icon. Preserve current badge shapes and adjacent geometry. This supersedes preserving the more recent, changed animation implementation.

- HIV Status in the profile Health tab has its own capsule, matching the other health fields. Preserve its label, value, visibility and field order. This supersedes the historical issue #231 capsule-removal interpretation. Sources: task `01a08c91-a340-7b92-95aa-f137c8bf7b16`, user lines 9 and 228, September 10, 2026.

## Zodiac badge artwork, September 10, 2026

Use the corresponding twelve sign icons from monkik’s Astrology - Solid collection: https://thenounproject.com/browse/collection-icon/astrology-solid-104001/. Julien specified white artwork and explicitly required the appropriate icon for each Zodiac sign (task 01a08d63-deff-7082-8ac8-8327605f3900, transcript user messages at lines 240 and 252). Preserve the current circle, border thickness, content scale, sign IDs, and mask rendering. The interactive test picker is local at `/Volumes/good/output/cruush-badge-icons-20260910/zodiac-badge-picker.html`. Publication was not requested.

Julien approved this exact test-picker version with “looks good” at transcript line 376 (2026-09-10T22:45:07.432Z). The immutable preview, images, source hashes, and twelve asset hashes are recorded in `/Volumes/good/output/cruush-badge-icons-20260910/zodiac-approval.json`. This approval covers the shown Zodiac artwork and white treatment; it does not approve publication or other badge replacements.

## Little badge artwork, September 10, 2026

Little uses the exact pacifier icon 483101 by Those Icons from https://www.flaticon.com/free-icon/pacifier_483101, rendered in white. Julien requested “use a pacifer for little not baby”, then supplied this asset and specified “in white” (task 01a08d63-deff-7082-8ac8-8327605f3900, transcript user lines 410, 449 and 451). Use the same PacifierGlyph in the picker and shared saved-role resolver. Preserve the Little label and ID, all role behavior, the current badge circle, border thickness, inset and neighboring artwork. This is the sole newly requested role-icon exception to the earlier gallery exclusion; it does not change any age safeguards or authorize other labels. The approved Zodiac set remains unchanged. Publication was not requested.

## Bimbo and Brat badge artwork, September 10, 2026

Bimbo uses the exact Girl icon 11431890 by Leremy from https://www.flaticon.com/free-icon/girl_11431890, with a white body and explicitly black bikini. Use the same BimboGlyph for the Bimbo archetype and the taxonomy-migrated Bimbofication kink so picker, profile, saved and map badges share this artwork. The original PNG remains unchanged; its transparent bikini regions receive a black underlay to preserve the requested color on picker backgrounds. Brat uses the exact Heart icon 3638961 by Smashicons from https://www.flaticon.com/free-icon/heart_3638961 in white, shared by the picker and role resolver. Source: task 01a08d63-deff-7082-8ac8-8327605f3900, genuine user message at transcript line 867, September 10, 2026, 23:29:20.734Z.

Preserve all labels, saved IDs, behavior, badge frames, border colors, inset and other artwork, including Brat tamer and Drag. This selection supersedes the unselected Brat proposal in the local Noun Project comparison. Other comparison choices remain pending. Publication was not requested.

## Cuckolding-related badge artwork, September 10, 2026

Use the exact Cheating icon 27256 by Luis Prado from https://thenounproject.com/icon/cheating-27256/ in white for Cuckolding, Cuckholding, Cuck, Cuckquean, Bull, Hotwife, Hothusband and Side piece. The same CheatingGlyph serves current profile badges and the legacy Cuckolding picker/saved badge. User source: task 01a08d63-deff-7082-8ac8-8327605f3900, transcript line 1141. Preserve spelling, labels, IDs, badge geometry and unrelated meanings such as Mistress or Swinger. No publication is requested.

## Pride flag badges keep the usual border, September 20, 2026

Pride flag artwork fills the badge inside the usual badge border. The badge keeps its normal size and its normal border, the same border every other badge has, in the same colour as the member's heart. The flag runs under the border's inner edge so there is no gap, ring or underlay between artwork and border. Source: Julien, September 20, 2026: "I want the pride flags to fill the usual border for the badges, without changing the badge size or changing the badge border." This supersedes the September 10 rule below, which removed the border for flags.

## Flag badge fill, September 10, 2026

Flags fill the existing badge circle edge to edge, just like the Hanky code fill, with no black border, ring, underlay, stroke, or gap on any badge surface. Preserve the exact badge footprint and remove the frame stroke for flags only. User source: task 01a08d63-deff-7082-8ac8-8327605f3900, transcript lines 1321, 1323, 4127, 6009, and the latest September 11 correction after more than ten repetitions. This explicit instruction supersedes the older rule to shrink flag artwork within the circle or retain a flag border. Preserve flag colors, artwork, all non-flag icons, Hanky rendering, placements, hover labels and behavior.

## Gloves badge artwork, September 11, 2026

The `gloves` profile and saved badge use the exact Noun Project `rubber-gloves-4891935` source by Amethyst Studio, rendered in white. Preserve the existing badge geometry, border color, size and placement. Source: https://thenounproject.com/icon/rubber-gloves-4891935/. Publication was not requested.

## Individually assigned badge artwork, September 11, 2026

Implement only exact assets Julien assigned through direct prompts. Doll uses Flaticon `beautiful-16458752`. Fuck machine uses Flaticon `machine-4648539`. Masturbator uses Flaticon `stroker-16012048`. Mutual masturbation uses Flaticon `nipple-9463796`. Strap-ons, pegging and harness toys use Flaticon `toy-16011932`. Small penis humiliation uses Noun Project `penis-3883876`. Camera play, filming, photos and streaming use Noun Project `dating-app-3817923`. Latex uses Noun Project `fetish-mask-3574195`. Tribbing uses scissors. All render white except Bimbo's separately approved black bikini. Preserve labels, IDs, badge frames and unrelated artwork. Do not install picker candidates, filled interpretations or bold-silhouette variants that Julien has not selected.

Any requested adaptation of supplied icon artwork preserves the source icon's original line weight, proportions, pose language, and negative-space style. Change only the named figure or action detail. Julien withdrew the Spit roast strap-on adaptation after rejecting its generated variants, so Spit roast uses the selected original Noun Project `threesome-759966` unchanged. Exhibitionism likewise uses the already selected original Noun Project `strip-tease-970491` unchanged. Exclude every generated variant of either source from implementation and commits.

## Side badge geometry, September 11, 2026

Hanky choices use the same icon size and badge border geometry as ordinary choices. Map-pin side badges use the same 35px size as profile-card side badges. (Superseded for map pins on September 19, 2026: see "Map-pin side badge size" below.) Every non-flag icon stays fully inside the border with visible clearance and never overlaps the border; the shared 60% glyph inset enforces this. Pride flags remain the sole edge-to-edge badge fill and follow the no-border rule above. Preserve badge placement, hover labels, heart size and all non-badge pin geometry.

## Restricted feature controls and recovery notices, September 12, 2026

When the current trust or feature policy restricts an operation, grey and disable its existing input or action and show a persistent, brief notice on that feature surface. Preserve existing controls, layout, navigation and Bug access. Do not redesign the Messages page or other affected pages. Reading conversations, managing their existing settings, viewing/removing saved images and checking in without an optional Pink Book post keep their actual independent eligibility rules.

Approved wording: “Messaging is temporarily restricted because of your trust score. Access is expected to return in {days} days, provided you follow the Code of Conduct.” Use the relevant feature name for the affected operation. Use “1 day” or “later today” where accurate. A restriction unrelated to a low trust score must not claim that cause. Calculate the expected date from the existing eligibility policy, eligible event dates, caps and other active restrictions; do not promise a universal14-day unlock or invent a date for an indefinite restriction. Mentioning trust score is approved, but exposing raw points or private moderation evidence is not.

Sources: linked task01a094aa user3124 approves the exact countdown draft; user3126 requests screenshots; the later narrow-scope correction explicitly preserves existing elements except greying/disabling and the persistent countdown statement. The current task01a09549 explicitly continues that linked queue. The separate trust-explanation page/post remains a pending destination/copy decision.


## Anonymous nearby notification navigation, September 12, 2026

Opening “Someone within your radar” frames a general area with a 1-mile radius. The triggering member's viewer-authorized displayed pin lies inside that area and never defines its center. Do not name, select, highlight or otherwise identify the triggering member. Reuse current map discovery eligibility, Ghost coordinates and per-viewer precise-location permissions; the notification does not grant visibility. Public notification metadata and navigation contain no source profile ID. Preserve other notification behavior and the existing map presentation.

Source: task01a08cc1 user24265; task01a09549 September12 clarification: “it should open to the general area but not ceenter on the person liek i asked”.

## Owner-restricted NSFW photo covers, September 12, 2026

When an owner's explicit-photo sharing policy excludes the viewer, show the existing translucent white DL icon and replace the non-heart cover's “DL MODE ON” line with exactly “MUTUAL CRUUSHES ONLY” or “MUTUAL CROWDS ONLY”, according to the actual server-enforced restriction. A viewer's DL setting or show-only exception cannot bypass that owner policy. Preserve the icon, photo geometry, non-explicit photos and independent authorization rules. Whether the previously icon-only heart covers also gain this text is pending the owner's clarification; no extra heart text is approved yet. Source: task01a09549, September12 latest “if you encounter a picture” request.


## Shared black glass, September 12, 2026

The black-glass consistency request applies only to Map Controls, the map top bar and bottom navigation bar. Match the existing top bar background (background color at 25 percent opacity, 12px blur) only within those named controls. Preserve their geometry and approved hover states. Signals, badges, Ghost internals, other panels, headers, capsules, inputs and dimming backdrops are excluded. A separate explicit approval makes the inner Settings page transparent only when embedded in a popup; fullscreen Settings stays unchanged. Source: task 01a09549, September 12, “mapcontrols, top and bottom bar, thats it” and the popup-only Settings approval. The earlier app-wide interpretation was unauthorized and is superseded.


## No padding additions app-wide without an explicit request, September 13, 2026

Never add padding or spacing anywhere in the app as a side effect of other work. This repeats and generalizes the earlier Recently Active/bottom-nav lock: that gap must stay exactly as tight as documented (calc(5.75rem + safe-area-inset-bottom) at every width, BottomNav at 0.75rem plus safe-area; commit 0327eaf on September 13, 2026 unified the desktop gap from 6.25rem to 5.75rem, confirmed by Julien on September 19, 2026) at every breakpoint, and the same standard applies to every other surface in the app, not just that one. If a change touches layout near existing padding, verify the surrounding spacing is unchanged before calling the work done. Source: Julien, September13, repeated report of an AI widening the Recently Active/bottom-nav gap again: "I never want you to add padding â¦ you keep adding padding around the app in general."

Dialogs, sheets, menus and cards stay content-sized in height unless Julien explicitly requests a full-screen surface. Never add oversized padding, minimum height or blank spacer regions to make a surface look roomier or to work around a collision. Use the existing spacing tokens and only the minimum spacing needed for readable content, safe areas and touch targets. Fix overlap by correcting the control or header geometry, not by padding the whole container. The Pulse sheet and alpha bug-report menu are named examples of this rule, not exceptions. Source: Julien, September 26, 2026: “Pls make a rule so you stop stupid padding like you did for pulse and bug dfiz”.
## Spot reduction and discovery, September 12, 2026

Source: Julien, task `01a094d4-5fda-7853-85e5-ca7f5634e4bb`, September 12, 2026. One address or parent venue, stadium, park, ferry, or station is allowed only one Spot, regardless of different names for internal features. Nearby independent venues such as two bars remain distinct; proximity alone is not duplication. Review the entire NYC-centered 100-mile radius manually using rendered map screenshots. Manually zoom into every Spot, including singletons, until street/venue context is visible. Regional overviews count only as navigation, never detailed review. Name similarity, spreadsheets, and automated candidates cannot substitute for that inspection. Archive duplicates recoverably and preserve member data. This supersedes the September 10 source-specific preservation where it would keep duplicates or excluded categories.

Remove all cafes and the Cafe category for now. Remove retail stores such as Home Depot and their related sublocations; preserve adult stores and combine them with adult venues into one category. Include bus stations and transit options, separating bus stops and combining subway and regional rail stations. The Spots menu supports independent category toggles and sorting by Distance, Recently active, and Star rating. Julien explicitly removed travel time later in this same task. Preserve unrelated map controls and styling.

The review uses a new local server and new ego lite space. A local development user may inspect the full radius without MHC; that viewing exception must stay local and uncommitted, with no production entitlement/privacy changes. Screenshots stay outside the repository and are never committed.

September 12 later refinement, same task: Julien explicitly adds "no parking lots too". Remove parking-lot Spots, including public lots previously retained. This supersedes older parking-lot preservation.

Same-task parking clarification: "Yes, remove lots and garages" and "if that s a category, remove teh category, we can readdthese later, but jsut archiev it for now". Archive all parking facilities and remove Parking from selectable categories. Reintroduction of anything archived in this cleanup requires support from aggregated user data ("i only want to readd stuff that aggregated user data supports", clarified "in terms of what were archiving"). Preserve recoverability; do not automatically restore archived records or add analytics beyond this task.

Same-task later refinement: "campuses good, staircases in random building no remove staircase as category if it is one". Keep campuses as parent venues with one Spot each. Archive staircase Spots and remove Staircase from selectable categories; random-building stair sublocations are excluded.


September 12 latest transit clarification, same task: the combined rail category is named exactly "Train stations", covering subway, NJ Transit rail and Pennsylvania rail stations. This supersedes "Rail & subway". Import every bus stop and every train station within the full NYC-centered 100-mile radius; categorizing only existing Spots is insufficient. Preserve one Spot per actual parent station/stop, not separate platforms, entrances or internal features. Source: Julien's consecutive "Rather train stations category" and "every single bus stop in the 100 mile radius ... same thing for the train stations" messages.


Same-task bus-stop detail requirements: the Spot title and map hover use the actual operator stop name. Immediately below the name, show which bus routes serve the stop. For stops with an operator-supported SMS arrival service, provide a mobile action opening a prefilled text composer with the verified stop code and destination number, and visible instructions stating that code and number for arrivals. Never send the message automatically. Verify operator data rather than assuming every transit agency uses the same SMS service. Source: Julien's September 12 consecutive bus SMS and route-description requests.


Same-task train detail requirement: subway and train-station hover/title uses the actual station name. The individual Spot detail immediately lists all serving train/subway lines and links to that station's schedule using official operator documentation. Source: Julien's September 12 train-station hover, routes and schedule-link request.


Latest same-task clarification: reuse existing Spot IDs/pages when a bus stop or train station already exists. SMS is exclusively for New York City bus stops; buses outside NYC use official schedule links instead. This supersedes the earlier generic operator-SMS wording. Source: Julien's September 12 existing-page and outside-NYC bus messages.

Train detail clarification, same task: list only the train/line names serving the station, never each line's full stop list. The Spot title remains the station name.


September 12 latest transit detail refinements, same task: serving bus/train lines may include their actual final destination or headsign as shown by the operator, but never an entire route itinerary. Bus stops identify their actual direction, including Uptown/Downtown where applicable; do not infer those labels from GTFS direction_id 0/1 alone. Each train-station page lists every verified entrance and its street/corner/side, all under the same parent Spot. Source: Julien's consecutive final-destination, every-entrance and "up or downtown version" instructions. These refine the earlier line-designations-only wording.


Latest bus-direction clarification, Julien September 12: same-name stops on opposite sides remain distinct and use the operator's own direction/destination wording. Do not impose Uptown/Downtown where the operator uses other wording. Source: "they may not use the language up or downtown ... use what they used to describe themselves". Actual station/stop name remains the title; serving routes and official direction/headsign distinguish the stop.


Latest transit presentation rule, Julien September 12: "what is communicated on the spots page for train stations and bus stops ... stuff that you would see on a bus stop sign or a sign to enter a train station". Use concise, source-backed signage information: actual stop/station name, serving route/line, operator's own direction or final destination, and station entrance location/side. No full itineraries or additional descriptive prose. Previously requested official schedule links and NYC-only SMS arrivals remain in scope.

September 12 Spots default, same task: Bus stops are off by default in the Spots menu and corresponding map filters. Members can enable them with the existing category toggle. Preserve other category defaults. Source: Julien, "by default dont have bus stations turned on in the spots menu btw".

September 12 explicit confirmation, Julien: "each category in the spots menu can be turned on and off in terms of the spot sbeing displayed , you can also still turn the spots off completely". Each category toggle controls whether that category’s Spots display. The existing Show Spots on the map master toggle still hides all Spot categories without replacing or removing individual category choices.


September 12 official-source requirement, Julien: "literally just google for it if you cant find it immediately", "there is no reason to look outside the official websites", and "i dont want anything linked but official pages" for bus and train Spots. Search missing schedules with operator-domain restrictions. Every displayed transit link must be an official transit authority/operator page or its officially linked schedule document; no third-party maps, aggregators, news or unrelated business pages. This applies to existing transit pages and prepared imports. Source: task `01a094d4-5fda-7853-85e5-ca7f5634e4bb`.

September 12-13 Spots reduction for launch: dropped the sports_venue and gym categories entirely (recoverable), dropped generic other/transit infrastructure records (airports, ferries, casinos, hotels not otherwise curated), removed non-Sniffies-sourced (open_data) bar and nightclub records and national chain restaurants, restored real EDM/techno/house/DIY/live-music/jazz venues and explicit women/dyke bars by name, and merged confirmed one-venue duplicates found by coordinate proximity (same address, same campus/park nesting, or same brand at near-identical coordinates) across the full 100-mile dataset. The map now renders only Spots within the current viewport instead of the full fetched radius. Source: task `01a094d4-5fda-7853-85e5-ca7f5634e4bb`, migration `server/sql/185_reduce_spots_for_women_audience_launch.sql`.

## Secret-free operational logging, September 12, 2026

Never record passwords, authentication tokens, session cookies, authorization headers, API keys or token-bearing URLs in application, proxy, error, preview or operational logs. Log only necessary route, method, status and timing metadata. Strip query values and omit raw request/response bodies and headers; provider errors and development previews must not echo secret values. Test these paths with synthetic tokens when verification is permitted. Julien explicitly requested stopping token logging, deleting accessible leaked copies, invalidating exposed tokens, and updating the loaded contract (task `01a09564-f771-7b91-b1db-319f81d01954`).

## Map pin hover shows no extra text, September 18, 2026

Hovering or holding a map pin never shows the red/pink latest-post preview capsule and never sets a native browser `title` tooltip ("Tap to open profile; hover for details" and its variants). The existing Signal preview, accessible names, heart artwork, badges and DL masking stay unchanged. Julien asked for this removal on September 11 ("did you add red text over pin hover and alt text over pin hover i didnt ask for", task `01a08cc1`, transcript line 7630; queued at line 7980). The removal was prepared twice but never shipped because a local UI-authorization hook rejected the wording. He repeated the request on September 18, 2026 (session `3653ce18`).

## Feature names and product stage, September 18-19, 2026

Julien picked one name per feature (session `3653ce18`, September 18 and 19, 2026). Use these in all user-facing text:
- Pulse, never Ping.
- "cruushes" (or "Cruushes" at the start of a sentence or as an option label), never "mutuals". Buttons that said "Mutuals only" say "cruushes only" in lowercase. The approved photo cover text "MUTUAL CRUUSHES ONLY" is unchanged.
- Pink Book, never "Spot board" or "the board".
- Ghost Mode, always capitalized.
- Cruise Carousel, title case.
- cruush+ is the gate name for Feed extras. The cruush+ benefit card keeps its title "Feed+".
- The message settings screen is "Message permissions".
- The saved-photo feature is "Quick access gallery".
- The product stage is "NYC open beta". Waitlist data and waitlist codes still exist, so the privacy policy and Rewards keep their waitlist mentions.

Glow: the landing Sign In and Sign up buttons, Spot clusters and individual Spot pins have no outer glow. The login input focus glow stays. (Julien approved these on September 18, 2026.)

## Map filter menus in full-screen framing, September 18, 2026

In full-screen framing (mobile, and desktop set to full-screen), the Seeking Filter, Visibility Controls and Spots menus fill the whole screen and are allowed to cover the map top bar and the bottom navigation while open. This is an explicit exception to the no-overlap rule for these three menus only. Other dialogs and sheets keep their existing bottom-navigation clearance. Desktop popup framing is not covered by this decision. Source: Julien, session `3a2c6143-f31c-4d40-b349-3fe7faab569d`, September 18, 2026: "The 3 filter menus are allowed to cover top bsr and bottom nav in full screen/modile".

## Map-pin side badge size, September 19, 2026

Map-pin side badges return to their prior size: 85 percent of the 35px profile-card side badge (MAP_SIDE_BADGE_SIZE_PX = SIDE_BADGE_SIZE_PX * 0.85, about 29.75px), as they were from September 1 until the September 11 change to 35px. Profile-card, Feed, Messages, Cruushes and badge-editor side badges keep 35px. This supersedes the September 11 rule that map-pin side badges match the 35px profile-card size and the September 12 same-size-across-surfaces wording for map pins only. Source: Julien, session bb234b23-d737-4f10-969e-de4810ea8842, "resize map badges to prior badge size".

## Order history, September 12, 2026

Members access their crypto order history from Settings. Include cruush+ and Pulse purchases, the order's payment and activation state, and its network confirmation progress after the payment deadline. Expiry must not hide an existing order. Each account sees only its own orders. Preserve existing checkout rules, payment deadlines and all unrelated Settings controls. Source: task `01a095c7-d9c8-7d51-980b-24acbc0daf99`, user “uesrs need a order hisotry page” and “id just put it in settings”, following the request to see confirmation progress after expiry. Processor changes stay on `security/crypto-processor-review-20260908`; no main merge or deployment is authorized.

## Precise location for mutual cruushes stays on by default, September 19, 2026

The default visibility policy keeps `preciseToMutualCruushes` true, so a member's precise live location is available to their mutual cruushes unless that member turns it off. The toggle is the existing "Toggle precise location for cruushes" control in cruush match settings, and turning it off writes `preciseLocationVisibility: 'none'`, which the server honours immediately. This default reaches every member, because `loadVisibilityPolicy` persists the default policy for anyone who has none yet. A mutual cruush still needs an active relationship token and an unrevoked grant, and blocks remain a hard boundary.

The default was changed from false to true in commit `13f4bcd` (September 8, 2026), which carried the unrelated subject "fix: make mobile tutorial controls dismiss reliably" and recorded no decision anywhere. It was raised again on September 19, 2026 because nine server tests in `server/src/app.test.ts` still encoded the old default. Julien confirmed the current behaviour is correct: "Yes on is fine for cruushes precise location". Those tests now assert `canRevealPreciseLocation: true` for a mutual cruush with an active token, and account for the precise-location revocation lookup that the grant performs. This supersedes the earlier "default precise location sharing to off" wording in `docs/cruush-match-visibility-relationship-system-implementation.md` and the "mutual precise sharing works only when explicitly granted" line in `docs/ghost-mode-v1-core-implementation.md`, both of which predate the change. Source: Julien, session bb234b23-d737-4f10-969e-de4810ea8842, September 19, 2026.

## No badge selection in onboarding, September 21, 2026

Julien: "No badge selection in onboarding", confirmed with "Yes remove badge selection" (task `01a0c25e-2b46-7c32-9872-961a9d7daa33`). Remove the custom badge-selection rite from the shared member onboarding and its previews. Preserve the Role/Position rite, its existing default badge behavior, saved badge choices, the badge editor outside onboarding, and every other rite and safeguard. Existing drafts on the removed rite continue to 2FA; later drafts retain their corresponding rite. This supersedes the earlier optional badge-selection onboarding decision.

## Onboarding rite headings, September 26, 2026

The red rite name is the only heading above each onboarding step and uses the larger heading treatment. Do not place a title, tagline, helper sentence, optional label, or other descriptive copy directly beneath it. Field-specific labels and instructions remain inside the step content where needed. Source: Julien, “no taglines under red text head and larger red text head.”
### 2026-09-26 — Engagement prompts are “Site reminders”

Julien: “Program cruush to send periodic notifications for engagement throughout the week, make this a setting idk what to call them tho? Maybe site reminders?” and “Make app encoruage periodically to share affliate link make these under site reminders.”

- Weekly engagement and affiliate-share prompts use the member-facing setting label “Site reminders.”
- Site reminders are bounded and deduplicated, and remain subject to push permission and do-not-disturb behavior.
- Site reminders may encourage nearby Feed reading, Feed posting and Pulse usage on separate weekdays, in addition to affiliate sharing and the existing weekend prompt. They remain limited to one deduplicated reminder per scheduled day.

## Mobile text floor, September 26, 2026

On mobile, text that would otherwise render smaller than the 16px alpha-report text uses 16px as its minimum readable size. This does not resize headings or icons, does not change desktop typography, and does not replace the optional larger-text setting. Source: Julien, “Pls just make fonts that are smaller than the one i wrote this in, big as this size.”

## Basic activity history and Feed loading, October 2, 2026

Julien: “changes to basic: Basic members see only the newest incoming cruush and newest profile view. Older items stay locked; clearing one does not expose the backlog.” Basic activity access is anchored to the newest historical item in each of those two categories. Clearing that item does not promote or unlock an older active item; a genuinely newer item may become the next unlocked item. cruush+ access is unchanged.

Julien: “Feed should let me load more feed posts upon scrolling, up to 100 for now, the more i scroll, the more load.” Feed appends additional pages through its existing bottom-scroll behavior and stops when 100 posts are loaded in the client.

## Data-sale promise, October 2, 2026

Julien: “we will never sell your data.” Show this exact promise in the existing signup-agreement capsule immediately before account submission and in the Privacy Policy. The Privacy Policy visibly states when it was last updated.

## Legal data-use promise, October 2, 2026

Julien: “we will never sell user data nor use it to train ai.” State this exact promise in the Terms of Service and Privacy Policy. Each updated legal page visibly states when it was last updated.

## Message-recipient distance labels, October 2, 2026

Julien: “we dont want it to like show distance labels tho you know.” New-message and new-group recipient cards do not display distance labels. Their existing Distance sort continues to use privacy-safe distance data internally.
