## Canonical logo and installed app assets, September 12, 2026

The notched cruush logo is rejected for every app use, including installed home-screen launch/loading and mobile icons. Use the actual approved `src/app/assets/brand/cruush-logo.svg` (SHA-256 `928d31f785515d958b2efb9778b1d5082e6e677df49e6426cf4be0942fbcace1`) as the source for raster exports. Remove rejected source/raster files from the repository and replace their references. Preserve icon dimensions, backgrounds, safe-area padding, loading behavior and unrelated artwork. This records the asset rule, not production or physical-device verification. Source: session `01a09549-890d-7f11-9c12-4ac016446942`, Julien's September 12 repeated notched-logo removal requests, home-screen loading clarification and mobile-icon correction.

# cruush design decisions

- October 9 release sale: Julien requested “we made banners for a 50% sale already, lets do this in this release for all users”, then chose “Automatic 50% off, no coupon stacking, until I end it”. Apply the server-owned sale to cruush+ for every account; preserve Pulse pricing and already-quoted orders. Reuse the approved dark-red sale banner below the Checkout header, without a countdown or an experiment gate. Do not restore the rejected sitewide top banner.

- October 9 regression-review reference: Julien confirmed “4177”, then clarified “but i prefer the new mobile header size”. Use the recovered 4177 source as the review reference while preserving the newer 24px mobile app-header title size (30px with Larger text) and unchanged desktop titles.

- October 9 browser page scale: Julien reported “regression: app zoomed out with finger gestures” and clarified “the app iteslf within a web browser”. Browser page pinch scaling stays at the initial scale; MapLibre's own pinch zoom, ordinary scrolling and the existing Larger text preference remain available. Browser accessibility overrides and physical-device behavior require separate verification.

- October 9 payment accordion inset: Julien reported “Ui bug” and clarified “Text against accordion edges”. Both pre-order and active-order How to send this payment content use the existing `px-3` inset matching their trigger. Preserve the guide's font sizes, wording, bottom padding, outer geometry and payment behavior.

- October 9 Feed composer correction: Julien said, “also i never asked for this stikcy part of the feed composer? the bright gradient should be used for the post button. you changed the gradients.” The composer action section scrolls normally with the composer, without sticky positioning. Post uses the existing bright `--cruush-gradient`, superseding the earlier dark Post gradient direction. Preserve Photo styling, action order, control geometry, copy, hover effects, and disabled behavior.

- October 9 Club chat header correction: Julien said, “i asked before for no club member listing up top please refer to all ques of alll v2”. Club chat headers show no member listing or member-count subtitle. Preserve ordinary Group and DM headers, Club directory/detail counts, and member management in Club settings.

- October 9 shared-card Vibes: Julien reported “vibe capsules not overflowing into 2 lines”, referring back to “make the card wrap whole vibe pills onto a second line”. The shared person card uses its existing whole-pill wrapping mode by default across Cruushes, Messages, and recipient pickers. Preserve pill presentation and the card's identity/action composition; allow the natural extra rows without a row cap.

- October 9 missed queue labels: Julien requested “Put "Optional" in grey for Club description in club composer add to que” and “message button on profiles and cards ... make it lower case message too”. The Club description retains its existing grey label and adds `Optional`; idle profile/card message actions use `message`, including the desktop profile popup. Preserve all other wording, styling, and behavior.

- October 9 desktop MHC queue reconciliation: Julien requested “no metadata on hover just the pop up” and “on click they should go to teh MHC club page”. The desktop profile popup uses the same existing MHC explanation tooltip and Club navigation as the other profile surfaces. Preserve its current white artwork, dimensions, and placement.

- October 9 Feed post typography: Julien said, “please make the feed post font size like 2pts smaller its too big . it should be one pt larger than the metadata on teh cards”, and reiterated, “refer to my more recent que asks to override prior ones”. Feed body text follows its actual metadata token plus 1px at each breakpoint, including Larger text mode. Keep metadata and every other card property unchanged. The earlier assumed 13px/15px body sizes did not account for the current metadata scale.

- October 9 payment-guide typography: Julien said, “make the how to send this payemtn accordian be the same text sizes as the compare plans one”, then “make the how to send this payment its own accordian with the usual accordian style but the small font sizes add to que”. The existing standalone How to send accordion uses the Compare plans `text-sm` size for its trigger, guide heading, steps, and help link, before and after an order is opened. Preserve the instructions, accordion geometry, and payment behavior.

- October 9 Feed composer graphics repair: Julien reported, “i also see a graphics bug with the feed composer post and picture buttons”. Preserve the latest queued Photo-left-of-Post order, matching dark gradients, hover sheen, white disabled Post foreground, and existing behavior. Keep their action group wide enough to show both controls; only on very narrow screens with Larger text, the existing Basic photo explanation flows below the two buttons so neither button is clipped.

- October 9 member bans: Julien said, "btw when i ban a member delete their feed posts too". Banning a member also removes that member's Feed posts through the existing Feed deletion semantics. Preserve moderation evidence, other members' posts, and unrelated account/chat behavior. This records the requested future ban behavior, not authorization for a retroactive bulk cleanup.

- October 9 birth year: Julien said, "also remove ability to change your birth year". Once established, members cannot edit their birth year through profile controls or member API requests. Preserve initial signup/required age verification and age-display privacy controls; do not rewrite existing birth years.

- October 9 Crowds: Julien said, "btw crowds are optional", then "so make the crowd step optional on onboarding". Members may leave Crowds empty during onboarding and profile editing. Crowd selection is not a profile-completion or membership-state/welcome-email eligibility requirement. Preserve the optional Crowds features and the existing meaning of a voluntarily selected Crowd.

- October 9 latest location-retention correction: Julien said, "so no saved location, just a saved state from last known location", then asked, "well the app leaves you on teh app after you leave the app so it does store locaiotn right? it needs that for map pressence to work?" The new Purgatory/Sinner state feature stores only encrypted membership state derived from the latest accepted location, not an immutable first-location coordinate snapshot. Preserve the existing encrypted last-location envelope needed for live-map presence. Town labels use that existing fresh physical GPS envelope without retaining a separate coordinate, town, or location history. This supersedes the earlier first-entry retention plan; MHC pins never determine physical membership or current-town labels.

- October 9 membership-state encryption: Julien requested, "also encrypt the purgatory /sinner state". Persisted Purgatory/Sinner membership state is encrypted at rest; service-area transitions remain server-owned and physical-location-based. This does not change the approved public status artwork, coarse labels, MHC access exception, or ordinary chat availability.

  Clarification: "make it so the app detects your location and saves the purg/sinner state as an encrypted state", then "if it changes -> email sent". Each accepted device-location update atomically saves the encrypted physical classification; a real transition queues the corresponding email once. Same-state repeats and unavailable location data do not create duplicate or guessed transitions.

- October 9 Purgatory Pulses: Julien requested, "also turn off pulses for Purgatory member on groups or clubs etc". Purgatory members must not have Pulse access in groups or Clubs. Clarification: "Yes, keep the MHC exception". An active MHC location inside the service area restores normal Pulse eligibility. Ordinary chats and other group/Club controls remain unchanged.

- October 9 Purgatory heart-pin overlay: Julien approved, "i approve this design for use as the svg over heart pins for Purgatory members". Use the approved left crimson/oxblood horn and smooth tilted white-to-yellow halo as an SVG overlay on Purgatory members' existing heart pins, not as a standalone glyph. Preserve the approved artwork and latest raised-halo placement. The heart's geometry, photo area, size and relationship-color border remain unchanged. This records design approval, not completed implementation or deployment.

- October 9 Purgatory viewer location copy: Julien requested "a apprx label for new york users seen by purgatory members" and approved "Among sinners" with "fuck yeah Among sinners is perfect" in the coordinated Feed/OOS task. For Purgatory viewers looking at in-area NYC members, Approximate is `Among sinners` and Precise is `New York, NY`. Actual Purgatory towns unresolved from the first encrypted entry fix remain `Far far away`. Apply only to existing profile/Feed/message location labels, with no access or global membership-name change.

- October 9 Purgatory town labels: Julien clarified "I meant like, Holmdel,NJ. for example" and "yea like their real town and state / country". Precise coarse labels identify the actual town/municipality and state (US) or country, not the nearest major city. Preserve the earlier server-side encrypted first-entry location requirement, approximate Far far away choice, and prohibition on precise coordinates or pin access for Purgatory viewers. Unresolved places must not invent a city label.

- October 9 OOS profile pins: Julien said, "okay for this deploy, OOS users can't ever use the pin on profiles to see users location" and "it would just be dark gradient for them , regardless of cruush status due tothem being OOS". Clarification: "OOS members using the MHC to acces the service area can access the buttons , but not OOS members". Every profile-location pin is inactive and uses the existing dark gradient while the viewer remains outside the effective service area, regardless of cruush relationship. An active in-area MHC location restores the normal pin permissions; it never overrides the target's privacy. Unknown viewer eligibility does not enable the pin on a direct profile entry. Preserve all other profile controls.

- October 9 Feed filter: Julien said, “we need a feed filter AGAINST MHC members too.” Feed offers an exclusion of posts by active Mile High Club members alongside its existing Mile High Club members-only option. These opposite choices are mutually exclusive; the exclusion does not change global Visibility Controls or map Seeking.

- October 9 Feed timing: Julien said, “for feed settings, the posted within shoudl be like 7d, 8d etc etc i asked for this for expiry remember? the redirecting to check out is only for basic users!” Posted within includes 7d through 30d and Never, and cruush+ members can change their post expiry directly; basic members' expiry attempt leads to Checkout.

- October 9 shared cruush+ tab: Julien said, “change checkout to cruush+ BTW” and “in teh fancy font.” The first tab on the shared cruush+/Rewards control displays `cruush+` in the existing cruush wordmark font, while its payment route and behavior stay unchanged.

- October 8 DM permissions: Julien: "and if i uncruush someone who has their messages set to cruushes only, i shouldnt be able to send them a dm - the dms themselves can open but the input where id type my messages says \"cruushes only\"". Opening a nonblocked DM does not grant send permission. After mutuality is revoked, enforce the recipient's message audience on the server and disable the composer with the placeholder `cruushes only`. Preserve block boundaries and unrelated presentation.
- October 8 bug-report privacy: Bug-report controls do not appear on token-link pages, and bug-report page URLs exclude query strings. Email linkage is clearly disclosed and requires explicit opt-in. Bug reports retain only coarse browser, OS, and app-version diagnostics, never device model or a full user-agent. Report text and diagnostics remain internal; GitHub receives only a sanitized summary plus the internal report ID. Email access is restricted and report-linked email data has a defined deletion/retention period. Source: Julien, October 8, 2026.

- October 8 mobile landing typography: “i told you to make the mobile landing page text size. bigger”, followed by “even a bit bigger on mobile please”. The normal unauthenticated mobile landing page uses the former mobile Larger Text sizes plus the approved additional small increase for its tagline, inputs, actions, contacts, and policy text. The accessibility Larger Text mode remains a separate 25% increase. Preserve landing copy, composition, control geometry, and desktop typography.

- October 8 shared cruush+ surfaces: “i like the accordian of the cruush+ rewards on the rewards page more than the one on the check out page, can you make that compotent shared between them?”, clarified with “rewards accordian you mean the cruush+ benefits one on the rewards page yes?” Rewards and Checkout render the same `What cruush+ unlocks` benefits accordion component. The separate `How to send this payment` section keeps its existing checkout accordion treatment before and after order creation. Both tabs use the same `cruush+ & Rewards` header, with the wordmark font on `cruush+` only and the normal page-header font on `& Rewards`. Their shared tab track stays in the same position and size, and the active grey fill fits evenly inside its outline. For generic app-wallet checkouts, the launch action reads `Open app`, and the created-order instructions state that the wallet needs enough crypto to cover its own network fee. Preserve payment rails, prices, amounts, addresses, status, timing, and all unrelated controls. Sources: Julien, October 8, 2026, including “make the header be cruush+ and rewards between them too , so the header doesnt change titles between tabs, use the cruush+ font for this - cruush & Rewards .” and the later correction “so you see the tab menu here, make the grey fill fit, and it still changes position / size between the pages. remove the cruush+ font from '& Rewards'.”

- October 7 cruush+ entry point: “cruush+ ahould load on check out.” The main cruush+ button opens the cruush+ Checkout page, not Rewards. Rewards remains available through the shared Checkout/Rewards tabs. Pricing, plans, payment state, and Pulse checkout remain unchanged.

- October 7 Spot body typography: “Increase text size for this”, “Bigger”, and “Im talking about body not hesding.” In the shown Pink Book body, explanatory/input/source text uses the 18px type step, while form labels, option chips, expiration text, and visibility controls use the 16px type step. The Bar page header and body headings remain unchanged, as do surrounding presentation and check-in behavior.

- October 7 Club creation access correction: “actually like anyone create a club.” Any member may create a Club. Club creation does not require cruush+ and does not redirect to checkout. Existing trust restrictions, moderation, membership limits, visibility rules, and all other Club behavior remain unchanged. This supersedes the October 2 Club creation entitlement decision and the October 7 note that retained its server-side cruush+ requirement.

- October 7 checkout presentation correction: “I thought we came up with a good looking checkout? This is a regression.” Checkout plan and payment-method controls retain the previously approved rounded bordered card treatment, and an active payment remains in its contained rounded bordered panel. Preserve current payment behavior, data, navigation, header, and two-column payment-method arrangement.

- October 7 New Club navigation correction: “I told hi that behavior is a BUG TO FIX.” Selecting `Create Club` from the existing large Messages `+` menu opens the existing New Club composer. It does not redirect to checkout. The existing server-side cruush+ requirement for completing Club creation remains unchanged.

- October 7 shared tab bars: “Ths tabs of the checkout arent the same bro make ais stop that shit.” The cruush+ Checkout and Rewards pages share one tab bar (`CruushPlusSectionTabs`), and it sat at a different height, inset and width on each page because the two pages had different headers and content frames. Pages that share a tab bar use the same header component (`AppPageHeader`) and the same content frame, so the tab bar is in the same place and the same size on every one of them. Do not hand-build a header or frame for a page that joins an existing tab bar; copy the frame of the page it is tabbed with. Members with a dated cruush+ term see a countdown of their remaining time at the top of the cruush+ checkout (“Put a count down up top checkout for cruush+ users”).

- October 7 Club menu button style: “you make these menus iwth old style pink buttons, make them gradients like the new style and change stuff to make you stop applying the old styel,” clarified with “i meant in the club shit.” Primary and selected buttons in Club menus use the existing `--cruush-gradient`. The old solid or translucent pink button fill is not used for Club menu buttons. Preserve each Club menu's established geometry, copy, icons, controls, behavior, and non-button styling. This does not restyle non-Club surfaces.

- October 7 current style: “make the design and style docs you refer to make you to suing the old style and refer to new style,” then “new style as in feed post style and cruushes style.” Also “no fuckihg pink buttons,” “we dont use white buttons anywhere,” and “look the rest of the app doesnt use that style.” The Feed post card and the Cruushes page are the style reference for every new or restyled screen. A filled action button uses `--cruush-gradient`, never flat pink (`bg-primary`) and never white. Pages built on the earlier settings look (plain `Card` blocks, the square ghost back arrow, pop-ups with an X and a centred title) are the old style and are not a reference. Details are in `docs/design-master.md` under “Current style: Feed posts and Cruushes”. Change email is now a page at `/settings/email` in this style instead of a pop-up.
- October 6 map camera persistence: “make map zoom go to last used zoom as opposed to zooming out on every load,” followed by “make it load to the last used zoom, the first time shoudl be on the user pin zoom, the center pin button should be on the aactual user not their decoy oto btw.” The map restores the last user-viewed camera when returning to it. With no saved camera, it opens on the actual user pin at the established user-pin zoom. The center-pin button always targets the actual user, never the Ghost decoy. Ghost radius/leash rendering does not move the camera; existing gestures, controls, markers, clustering, and other map behavior remain unchanged.

- October 5 release email style: “use the more recent glass email template,” “you didnt use the glass style,” and “remove the privacy capsule from email.” The v1.9 email uses the newest existing glass template and omits the standalone privacy capsule.

- October 5 owner-only Club creation: “make the create club button appear above the option to add mutuals, no other members needed for creation tho.” The Club composer places `Create Club` above the optional initial-cruush picker, and a creator may publish a Club with no other initial members.

- October 5 Club chat identity: “No preview pic for clubs up top just name” and “No club capsule or tag ones please.” Linked Club chat headers show the Club name without a preview image or `CLUB` pill, and the chat surface does not repeat Club tag pills. The member count, header actions, description, messages, notification controls, composer, and bottom navigation remain in place.

- October 1 Clubs direction: “Clubs should be searchable by tags lets just do that for now.” The first Clubs slice began with tag persistence and authenticated tag-based directory search. Julien then authorized the Messages Clubs tab, Club detail, direct-message sharing, and pending join requests below. On October 2, “there's a clubs tab but nothing there, no way to make a club or browse them” corrected the incomplete tab: it must browse published Clubs without requiring a tag first and provide Club creation.

- October 2 Club navigation and previews: “the feel ogthe clubs houild be more like a group even as an admin, i should just go into the club not an admin page even as admin, but there is the admin setting menu.” Joined Clubs open their linked Club chat for every member role, including owner/admin. Club metadata editing and join-request review live in that chat's existing Conversation settings. `My Clubs` previews show the latest posted message when one exists; owner/admin previews also show new join-request counts.

- October 2 Club directory views: “there hsoul dbe one tab for clubs imi n and browse clubs around me witih the clubs tagbtoo.” The existing top-level Clubs tab contains separate `My Clubs` and `Browse Clubs` views. Tag search remains in Browse Clubs. Actual nearby-distance filtering is not defined until Clubs store a location and a radius is chosen.

- October 2 Club copy: “no \"mutuals\" always \"cruushes\".” User-facing Club copy says `cruushes`, never `mutuals` or `mutual cruushes`. Relationship checks may remain internal implementation details.

- October 2 Club moderation: “make sure all content in these clubs is also mdoerated.” Club title, short description, tags, text messages, and message media use the existing moderation boundaries before persistence or delivery; rejected Club content is not posted.

- October 2 Club creation entitlement: “mkaing a club should be a premium feature it think yes?” / “let's do that.” Creating a Club requires current cruush+ access. Browsing, joining, sharing, and participating in an existing Club do not require cruush+ unless another existing account or safety restriction applies.

- October 2 Club creation entry point: “remove that button completely, lets jus tmake it an option under the big + button.” Browse Clubs has no standalone Create Club or upgrade button. `Create Club` lives in the existing large Messages `+` menu beside the direct-chat and Group options. The October 7 navigation correction supersedes the former redirect at this entry point.

- October 2 Club visibility direction: “you can choose to make your club have its own visibility controls too.” Club creation and owner/admin settings will include Club-specific visibility controls. Exact modes and discovery/join semantics remain pending Julien's answer; the current public-at-two-members behavior remains unchanged until then.

- October 2 Club edit control: “btwn i hate the old edit page icon with the cirlce stop using that.” Club administration uses the existing Conversation settings gear/menu, never the old separate circular edit-page icon. This does not replace or restyle the established Conversation settings gear.

- October 2 Club search expansion: “also let me search by whats in their name sand descriptions?” The Club search field matches Club names, short descriptions, and tags. Name and description matching is case-insensitive contained text; tag matching retains normalized tag behavior.

- October 2 Club browse ordering: “you should sort browse clubs by most recently active around me.” Browse Clubs sorts by the newest posted-message activity, with Club creation time as the fallback for Clubs without messages. Geographic proximity remains pending a Club-location and radius decision; the app must not imply distance filtering before both exist.

- October 2 nearby Club discovery: “as well as show ones that are made near me and recently active?” Browse Clubs keeps recent activity ordering and limits nonmember discovery to Club creators within the app's existing 50-mile browse radius when the viewer has a current encrypted location. The calculation stays server-side and returns no creator identity, coordinates, or distance. Joined Clubs remain in `My Clubs` regardless of location; when current location is unavailable, the published activity-sorted directory remains available.

- October 2 universal tag-entry direction: “okay btw for tags, make this universal, lets have you enter tags like instgamra so you type #tag and enter and taht creates a separate tag,” clarified as “every tag editor please.” Every app tag-entry editor uses the same reusable control: type `#tag`, press Enter, and receive a separate removable tag. Tags remain normalized without the leading `#` in storage and render with `#`. Tag search fields and read-only tag displays are not editors.

- October 2 Club member counts: “i should be able to see how many members are in a club too.” Club previews and public Club detail show the aggregate member count. Public member identity remains private; this does not authorize a public roster.

- October 2 Club roles: “promteo and demote dont seem to work - let me do mods and admins,” followed by “yes” to the proposed boundary. A Club moderator can approve/deny join requests and moderate/remove Club messages. A Club admin can also edit Club metadata and manage Club roles. The owner remains the sole owner. Linked chat and Club membership roles must remain synchronized.

- October 2 Club placement: “btw club chats should not apporve in groups,” interpreted in context as “Club chats should not appear in Groups.” Linked Club conversations appear under `Clubs` > `My Clubs`, not in the top-level Groups filter. Ordinary private Groups remain unchanged.

- October 2 Club inbox placement: “club chats should not appear in the ALL tqab.” Linked Club conversations and their pinned previews do not appear in the top-level `All` tab. They remain available from `Clubs` > `My Clubs`, direct Club chat links, and the existing Unread scope. Ordinary direct and private Group conversations remain in All.

- October 2 message-tab unread indicators: “get a little red circle in the corner over each tab if you have unread in each of those tabs.” The All, Unread, Groups, and Clubs tabs show a small red corner dot when their own current scope contains unread messages. The future Groups-to-Parties rename remains deferred.

- October 2 deferred Messages navigation: “Instead of a groups tab, it's gona be a parties tab. group messages will just be in messages. but this is for later lets focu son clubs rn.” In a later Parties slice, the current top-level `Groups` tab becomes `Parties`; ordinary group conversations remain available in the general Messages list. This is recorded direction only and does not authorize Parties or Messages navigation implementation during the current Clubs slice.

- October 1 Club publication threshold: “Yea require one other member.” A Club requires its owner plus one other confirmed mutual cruush before publication, for two confirmed members total. The October 2 Club creator enforces this before making the Club directory-visible.

- October 1 Club sharing direction: “there should be a way to share the club with other members as well,” corrected to “the lcub rather,” “selected members,” “mutual cruushes,” and “md card” (DM card). A member can select one or more mutual cruushes, send each of them the Club as a structured direct-message card, and each recipient can open it and submit one pending join request. On October 2, Club owners/admins gained a pending-request review list; approval activates Club and linked-conversation membership, while denial removes the pending request.

- October 1 Club description: “i guess admin can do a short description of the club too.” Club owners/admins can maintain a short Club description. October 2 adds: “make sur emoderation applies ot the descirption as well as the tags.” Club title, short description, and tags are moderated before creation and owner/admin edits; rejected metadata is not persisted.

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
- The map saves the master “Show Spots on the map” choice so whether Spots appear survives a map remount or reload. When no saved account choice exists, Spots remain visible by default and a stale browser-only hidden value cannot override that default; individual Spot category settings and all unrelated map controls remain unchanged. Sources: issue #419, Julien, September 29, 2026: “Map dont saving settings i.e. spots appearing or not”; Julien, October 7, 2026: “Spots on by default”.
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
- Unlocked person cards on the Cruushes page and the Choose someone to message, Group-message member, and Create-Club member menus use one shared `CruushesProfileCard` component. It is the compact heart-row Cruushes-page card, not the full profile-detail `ProfileCard`; each surface may supply its existing actions or whole-card selection behavior without rebuilding the card. Source: Julien, October 7, 2026: “I meant the cruushes page ones”, “Itsb not the same”, and “Just make one component they share”.
- App page headers use `AppPageHeader`, whose canonical geometry is the Cruushes page header: `max-w-2xl` content width, `text-2xl sm:text-3xl` title, circular icon buttons, the Cruushes spacing/surface, and the same aligned action/bug/close row. Cruushes, Messages, and Feed render this component directly rather than parallel header markup. Source: Julien, October 7, 2026: “I SAID BASE UIT ON CRUUSHES PAGE MAKE IT THAT WIDTH AND TEXT ABD VBUTTON ETDC SIZER”.
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

Pride flag artwork fills the badge inside the usual badge border. The badge keeps its normal size and its normal border, the same border every other badge has, in the same colour as the member's heart. The flag runs under the full border so there is no gap, ring or underlay between artwork and border. Sources: Julien, September 20, 2026: "I want the pride flags to fill the usual border for the badges, without changing the badge size or changing the badge border." Julien, October 6, 2026: "also at some point you changed the size for the pride flag badges and their badge border width to be different from the rest of them again" This supersedes the September 10 rule below, which removed the border for flags.

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

Recently Active stays rendered when map popups are open; opening a profile, launch-event, or Spot popup must not remove the bar. Preserve its existing size, position, contents, scrolling, actions, spacing, and the popup behavior. Source: Julien, October 7, 2026: “recently active bar disappears when pop ups are up for no reason”.

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

## Mobile signup birthdate entry, October 8, 2026

The signup birthdate field and any required legacy age-confirmation field open the numeric keyboard on mobile and accept `MM/DD/YYYY`; desktop keeps the native date picker. A birthdate validated during current signup completes age verification, so it is not requested again. Server-side age rules are unchanged. Mobile signup form body text follows the existing 16px mobile text floor. Sources: Julien, “Cant enter birthdate on mobile”, clarified with “On sign up” and “No keyboard pops up for BD on mobile”, followed by “Then make mobile text bigger”; October 8 follow-up: “I already put my birth date on sign up? Keyboard doesnt rise up.”

## Smaller profile-overlay vibe tags, October 8, 2026

Profile photo-overlay vibe tags use the smaller capsule sizing while preserving their wording, uppercase treatment, gradient, radius, order, and wrapping position. Source: Julien, “resize vibe tags smaller.”

## Profile photo chrome, October 8, 2026

The loaded profile uses the old photo-overlay controls without a black page-header bar. Source: Julien, “I preferred the old profile style withoit the black header.”

## Spot marker hover zoom, October 8, 2026

Individual Spot markers zoom on hover using the same scale and timing as person-pin units. Their resting geometry, artwork, title preview, check-in count, position, click behavior, and clustering remain unchanged. Source: Julien, “Spots should zoom on hover like units.”

## Profile Vibe size, Carousel close control, and uncruush wording, October 8, 2026

Full-profile photo-overlay Vibe capsules use the Cruise Carousel capsule sizing (`text-[11px] px-2 py-0.5`). The Cruise Carousel result card has no photo-overlay X; members leave through the page back control or continue with its existing actions. A mutual-revoke action is labeled `uncruush`, never `remove mutual`. Source: Julien, “Make vibe capsules this sixe on profiles, remove carosel x button, should bd uncruush instead of remove mutual.”

## Feed photo-upload placement, October 8, 2026

The Feed composer photo-upload control is a cruush-gradient button directly below the tags area. Source: Julien, “Put feed photo uploads as a gradient button just under tags.”

## Default and accessible text scale, October 8, 2026

The app's normal text scale uses the former Larger text sizes. The accessibility Larger text option remains a distinct mode and increases that new default by another 25%. Profile photo-overlay pronouns, location, and last-active text follow the shared scale. Source: Julien, “Make this text on profiles bigger, in genersl make larger text the defsult app sizes, make tbe accessible option even bigger.”

## Spot hover-title clearance, October 8, 2026

An individual Spot's hover/focus title floats fully above its zoomed diamond and never overlaps the diamond. Source: Julien, “Spot title should float above diamond not overlap on hoover.”

## Map cluster count typography, October 8, 2026

Spot-cluster and people-cluster counts use the same text size. Their distinct diamond and circular marker treatments remain unchanged. Source: Julien, “People have larger font for cluster - equalize them spots and people clusters.”

## Profile Basics identity grid, October 8, 2026

Gender Identity, Presentation, Sexuality, and Zodiac appear as a two-column by two-row grid in the profile Basics tab. Their existing card and capsule treatments remain unchanged. Source: Julien, “Put these in a 2 x 2 grid?”
## Basic activity history and Feed loading, October 2, 2026

Julien: “changes to basic: Basic members see only the newest incoming cruush and newest profile view. Older items stay locked; clearing one does not expose the backlog.” Basic activity access is anchored to the newest historical item in each of those two categories. Clearing that item does not promote or unlock an older active item; a genuinely newer item may become the next unlocked item. cruush+ access is unchanged.

Julien: “Feed should let me load more feed posts upon scrolling, up to 100 for now, the more i scroll, the more load.” Feed appends additional pages through its existing bottom-scroll behavior and stops when 100 posts are loaded in the client.

## Data-sale promise, October 2, 2026

Julien: “we will never sell your data.” Show this exact promise in the existing signup-agreement capsule immediately before account submission and in the Privacy Policy. The Privacy Policy visibly states when it was last updated.

## Legal data-use promise, October 2, 2026

Julien: “we will never sell user data nor use it to train ai.” State this exact promise in the Terms of Service and Privacy Policy. Each updated legal page visibly states when it was last updated.

## Message-recipient distance labels, October 2, 2026

Julien: “we dont want it to like show distance labels tho you know.” New-message and new-group recipient cards do not display distance labels. Their existing Distance sort continues to use privacy-safe distance data internally.

## 2026-10-02 — Group and Club notification controls

Julien: “also we need this for group chats too: notifications by @me or any notifications, allo wme to disable notificaitons for a tieme too per group/club, let me enter the club by clickin gthe card itself too”

- Every Group and Club has per-member notification controls for all messages, `@me` only, and temporary mute.
- Clicking the Club card surface opens the Club; nested card controls retain their own actions.
## 2026-10-02 — Browse Clubs sorting

Julien: “make some clubs for me to test just seed them, under browse clbs, let me sort by recently active and ones near me?”

- Browse Clubs can be sorted by recent activity or proximity to the member.
## 2026-10-02 — Conversation settings are pages

Julien: “also make dm setting pages their own pages not pop ups over the dms - do this tretment to all dms groups clubs etc and make the use the standardized header style and menu style - dont invite a new style - i lik eth current menu style just make it its own page for dms with the header compotneetn we share”

- DM, Group, and Club settings use dedicated pages with the shared app header.
- The existing conversation settings menu styling is preserved on those pages.

## 2026-10-02 — Club search placement

The shared Messages header search stays the same across every Messages tab and searches conversations or Clubs the member is already in. `Browse Clubs` has its own `Search Clubs by name, description, or tag` field directly above its sort control, and that field searches Clubs the member has not joined. Source: Julien, October 2, 2026: “the search up top, that should be for stuff were already in: for the clubs, let me clusb im not in in a separate search bar above the sorting optoins.”

## 2026-10-02 — Club enrollment encryption

Club enrollment encryption covers both the member-to-Club membership relationship itself and any private join-request/application answer. The backend may decrypt only after authorization; database storage must not expose either the social-graph edge or the application answer as plaintext. Source: Julien, October 2, 2026: “btw club enrollment should also be an encrypted field,” clarified with “both.”

## 2026-10-02 — Club join-request visibility

Only the Club owner, admins, and moderators can see join requests or join-request counts. Ordinary members and nonmembers cannot. Source: Julien, October 2, 2026: “only admins/mods can see requests to join.”

## 2026-10-02 — Group and Club membership caps

Group chats allow at most 100 total members, including the creator. Clubs allow at most 1,000 total members, including the creator. The limits apply both when the space is created and when members are added or Club join requests are approved. Source: Julien, October 2, 2026: “group chats? 100 members, clubs? up to 1000+ lets make a 1000 cap to start”.

## 2026-10-02 — Club sharing targets

A Club can be shared as an in-app Club card to a selected private DM or Group chat. Sharing does not bypass the Club's visibility or join-request admission controls and does not include private Club-chat content. Source: Julien, October 2, 2026: “add way for user to share club to another dm private or group or otherwise”.

## 2026-10-05 — CLUBS20 checkout coupon and Club Side Quests

Julien: “lets add a coupon code for this new update lets do 20% off”, “and also lets add a checkout code thing for thecheckout”, “clubs20”, and “lets add sidequests for clubs too”.

- Checkout accepts the campaign code `CLUBS20` for 20% off cruush+ and Pulse purchases. It can be used once per account after a paid order, with no expiration or global redemption cap.
- The Club Side Quests are `Join a Club` and `Send your first Club message`. Each awards 1 Pulse through the existing Side Quest claim system.

## First-entry install and push prompt layout, October 8, 2026

Julien: “you keep making pop ups that appear off screen, ew dont want that, and you tend to add like 100px+ of padding for no reason to them” and “we need pop ups when you first enter the app to enable push notifications and to install cruush”. The first-entry install and push prompts must remain fully inside the actual visible viewport and safe areas. They use compact internal spacing, with no arbitrary 100px+ padding or empty reserved band, and they never stack on top of each other. This records the requested behavior and layout limits; exact copy, sequence, and repeat policy remain subject to the approved implementation plan.

## Service-worker release bump on every deploy, October 8, 2026

Julien: “bump the service worker with deploys always why not?” Every cruush production deploy increments the synchronized service-worker release marker in `public/sw.js`, `public/service-worker-recovery.js`, `src/main.tsx`, `index.html`, and `src/serviceWorkerUpdate.test.ts` so installed clients are explicitly moved to the deployed release.

## Out of Sight visibility control, October 9, 2026

Julien: “we need an option in VC to hide from OOS (out of sight) members compeltely”. Clarification: “Out of Sight”; “Hide profile/activity; keep existing chats”. Add an opt-in Visibility Controls restriction that hides the member's profile and activity from OOS viewers. Preserve existing chats and history. OOS is the existing service-area-derived member state; an active MHC pin inside the service area retains the preceding explicitly allowed in-area access. The restriction must be enforced by the server, not only by client filtering, and remains off for members who have not selected it.

## Purgatory member-facing name, October 9, 2026

Julien: “I'm renaming OOS members to Purgatory members, make sure the app reflects this. OOS for internal”. Use Purgatory members in member-facing app and email wording. Keep OOS for internal identifiers, fields, routes, implementation notes and developer-only controls. This supersedes Out of Sight as the public name without changing the service-area rules, active MHC exception, or existing-chat preservation.

## Purgatory profile membership glyph, October 9, 2026

Julien selected the split crimson/white-to-yellow heart with its horn and raised halo: “this one, this glyph should be same size as the MHC one as it appears on profiles, and when you hover over it like the MHC one, it explains this is Purgatoroy member and what that means.” He added “make the pop up be the same style as the mhc one” and “it would beon tap on mobile”. Preserve the selected artwork in `purgatory-member-approved.png`; match each profile surface's existing MHC glyph size and shared tooltip treatment. The explanation opens on desktop hover or keyboard focus and on mobile tap. Show membership from the server-owned `outOfSight` classification, independently of the MHC badge, without changing privacy or map-pin artwork.

## Purgatory entry email, October 9, 2026

Julien in the email task: “let's make another email that gets sent everytime a member becomes a puragtory member. it will be sent the moment the app notices thema re in purgatory”, followed by “make it funny” and “wire it love it”. Send the approved Purgatory email once per detected entry, not once per request and not only once at signup. Re-entry after returning inside the service area creates a new event. Keep OOS internal identifiers, encrypted device-location handling, verified completed-profile eligibility and idempotent delivery; no real email is sent as part of implementation tests.

## Sinner's Map lore and welcome, October 9, 2026

Julien in the email task: “look at the other agents, wire and write Sinners welcome email”, “the lore of cruush is taht cruush is an occult item, the CoD signs your soul to be placed on the map of sinners btw”, “so write a sinner's welcome email”, “it will also trigger if they come back to the service area”, and “Sinner's Map”. Use the exact lore name Sinner's Map. Welcome on initial Code of Conduct acceptance and on genuine physical returns from Purgatory to the service area. Repeated location observations and delivery retries must not create duplicate welcomes; a later genuine return is a new event. This does not replace Purgatory entry mail, change map-access/privacy rules, or authorize implementation-time sends.

Latest approved lore correction from the same task: “cruush is a techno-occult item.” The final welcome copy lists Feed, Clubs, Crowds, Cruise Carousel after Julien's corrections “change messages to Crowds” and “and Cruise Carousel as opposed to Profiles”, followed by “i approve”. Preserve the exact reviewed transactional copy; Julien owns the separate marketing-release email.
- October 9, 2026 mobile title correction: Julien said, “The titles on this mobile release are too big”, with Notifications and direct-chat screenshots. Restore the earlier 1.5rem mobile app-header title size (24px normally, 30px with Larger text). This supersedes the broad default-text enlargement for mobile header titles only; preserve desktop title sizes, body/metadata typography, controls, and header geometry.

## Confessions and Covens naming, October 9, 2026

Julien: “rename feed to Confessions across app surfaces including emails and posts etc keep the url as feed, change clubs to covens across the app the same way, allow someone to make a coven just free to join withotu approval as an option on creation”. Use Confessions and Covens in member-facing copy, including posts, navigation, emails, empty states, errors, sharing, and accessibility labels. Keep `/feed`, `/clubs`, API routes, storage identifiers, migrations, and internal compatibility names unchanged. Coven creation may opt into free joining without approval; approval-required joining remains available and is the default unless the creator selects the new option. Preserve existing privacy, moderation, membership caps, and encrypted enrollment behavior.

Correction, October 9, 2026: Julien specified “Covens” and “Confessional”. Use Confessional, not Confessions, for member-facing Feed copy. Use Carousel, not Cruise Carousel, for member-facing Carousel copy. Preserve the internal Feed, Club, and Cruise Carousel identifiers and routes.

## Feed Purgatory controls, October 9, 2026

Julien: “need a feed filter to show and hide from Purgatory members too.” Clarification: “Both”, covering posts authored by Purgatory members and visibility of one's own Feed posts to Purgatory viewers. Placement: “the purgatory show my posts to should be in feed settings”. Keep author include/exclude controls in Feed Filter and the opt-in own-post restriction in Feed settings. Existing audiences, blocks, profile visibility and effective in-area MHC exception remain enforced. Author membership uses the existing server-owned Purgatory classification independently of MHC. These controls do not change visibility outside Feed.


## Purgatory heart clearance from Vibes, October 9, 2026

Julien: “purgatory members heart pins need to be slightly lower so the halo doesnt touch their vibe capsules”. Lower the shared person-card heart column only for confirmed Purgatory members with Vibes, enough to separate its existing halo from the capsules. Preserve ordinary hearts, Purgatory hearts without Vibes, capsule positions and artwork, heart/halo/horn/photo size and shape, side-badge geometry and relative attachment, card layout, colors, interactions and privacy. This does not change Map markers or profile/gallery heart artwork. The initial6px relative vertical offset still requires rendered clearance verification.


## Notification list scrolling, October 9, 2026

Julien: “regression on notifcaitons page: only the notications should scroll, not the header.” The Notifications page keeps its existing header stationary and scrolls only its content list inside the available app page area above bottom navigation. Preserve header size, styling, controls and behavior, notification presentation and existing spacing. This is local to NotificationCenter, with no shared-header or app-wide scroll change.


## Messages unread color and trash placement, October 9, 2026

Julien in the coordinated release task: “i never asked for these additional pink message notification bubbles, for one, pick one color, i pick the pink, and 2, notice where it overlapps with the trash can? put the trash can on the bototm right corner instead”, clarified as “messages”. Use the existing primary pink for the four Messages unread tab indicators and move the normal conversation card trash control to its existing bottom-right footer slot. Preserve unread counts, pinned cards and action controls while the specific additional bubble to remove is unidentified. Do not change shared-card consumers or the Messages layout beyond the requested trash placement and indicator color.


## Locked Carousel frame, October 9, 2026

Julien: “I asked this be in the frame”, reaffirming the earlier “Can you make the cruush+ unlocks this appear within the carousel frame ?”, “i just want the cruush+ landing one to fit in the pink border and not get cropped off”, and “i dont want the frame of the carosel to chang eon landing for basic members”. Keep the existing basic-member frame unchanged. Fit only the cruush+ landing tile inside its visible frame without cropping and place the existing unlock label within it. Preserve the real-profile reel, all other tiles, heading, upgrade control, selected result and animation behavior.

## Carousel Larger text scrolling, October 9, 2026

Julien: “Approval” to allowing the Carousel page to scroll on short screens with Larger text so its card stays readable. The locked page may scroll instead of compressing its existing composition. Preserve the frame, typography, controls, normal-text layout and desktop panel.

## Sale banner removed, October 9, 2026

Julien: “Remove ugly red banner up top”. Remove the red sale banner below the checkout header. This supersedes its earlier placement approval; automatic 50% cruush+ pricing, no coupon stacking and owner-ended sale remain unchanged.

## Carousel full-page entry, October 9, 2026

Julien: “Carousel should be full screen only”, followed by “Or at elast never overlap with top”. Use the existing full-page Carousel route on desktop as on mobile, keeping it separate from map top controls. Preserve the existing page composition.

## Purgatory first-entry prompt, October 9, 2026

Julien: “we need a pop up for purgatory memberss too that appears after the first 2”. Show a Purgatory-only popup after the install and push prompts, using the existing serialized prompt flow. Wording and button action are pending Julien’s answer.

## Android push reminder at login, October 9, 2026

Julien: “if its off, keep asking them to turn it on upon log in”; “seams like we gotta do this for all android users”. For all Android users, show the existing notification prompt again at login while push is off. Dismissal lasts for that browser login; enabling remains an explicit user action. Preserve existing prompt presentation and other platforms.

## Global sale banner placement, October 9, 2026

Julien: “but the banner on top of the entire website or basic users, fill the width”; “remove it from below the top bar”. Place the existing sale banner above the app top bar across the full website width for basic users, replacing below-bar placement. Preserve existing approved sale wording/artwork and automatic50% pricing.

Julien also specified “i want the banner to be ABOVE the app content at the very top” and “make the text up top on the banner flicker and glow randomly”. Banner starts at viewport top, app starts below it; animate only the existing first-line text with irregular flicker/glow, preserving its composition.

- October 10 sale correction: Julien said “no i wanted a weekend sale”. This supersedes the earlier owner-ended and per-user24-hour sale timing. Use a shared weekend deadline with a truthful countdown; exact endtime is awaiting confirmation. Preserve automatic50%off and no couponstacking.

- October 10 confirmed weekend deadline: “Yes, Sunday at 11:59 p.m.” to SundayOctober11,2026NewYork. Sharedexpiry2026-10-12T03:59:00.000Z; countdown and newcheckoutdiscount use the same deadline.

- October10bannerreconciliation: “and Purgatory sale copy” refers to01a1232f approved “Purgatory Sacrifical Offering” / “50% off” and redcheckoutprice-pickerrow style. Reuse that exactcontent with countdownabovelefttitle/rightdiscount. Currentthreadaboveapp/fullwidthplacement supersedes oldbelowbaroverlay. Purgatory namescampaign, no membereligibilityrestriction.

- October10latestbanner: exactdiscountcopy “50% off this weekend”; “make the color match the same magenta used in check out” replaces redsurface withactualselectedcheckoutprice row border-primary/bg-primary/10. Otherbannerpropertiespreserved.

- October 10 final flicker scope: Julien said “btw this banner up top. is only for basic users, i want the flicker on all the banner text”. Preserve Basic-only banner eligibility; apply the existing random flicker and glow to the countdown, title, and discount text, with static glow under reduced motion. This supersedes title-only animation.

- October 10 glow strength: Julien said “make the banner flickering glow stronger and happen more often”. Strengthen the existing text effect and shorten its random pause; preserve the banner composition, eligibility, and reduced-motion treatment.

- October10exactVisibilityControlslabel: “Hide me from Purgatory members”. Existingbehaviorunchanged. Feedphotopreviewheartbordersmatchposterhearttheme, includingblueforcurrentuser; compactPurgatorytooltipreusesexistingMHCtooltipstyle.

## October 10, 2026 — clarified regression fixes

Julien: “Keep Ghost pin only” when Leash is off. Hide the inactive leash radius and line, retaining the Ghost pin and privacy behavior.

Julien: “Remove accordion; keep controls” for Check-in. Remove only the redundant accordion wrapper and keep its controls available.

Julien: “just explain what it is” for the Purgatory popup, which appears after the install and push prompts. Reuse the existing feature explanation and dismissal pattern.

Julien, October10: “Purgatory stuff isnt on profiles using MHC btw, the labels for mhc should reflect their mhc location.” Active Mile High Club overrides Purgatory profile treatment and uses the effective MHC pin for location/distance labels, subject to existing privacy rules.

Julien, October10: “Be sure sale banner and sale stuff disappears after the time finishes.” All sale-specific presentation and new-order discounts expire at the shared deadline; normal non-sale checkout remains.


## October 10, 2026 — signed-in pin clearance and Purgatory mobile fit

Julien: “don't let any user's pin overlap with signed in user's pin somehow add to que”; “spiderfy must not overlap with signed in user's pin either add to que”. Other user pins, including spiderfied pins, must visually clear the signed-in user's pin without changing their actual locations. Implementation remains queued.

Julien: “Put cruush+ button top bar and bug fix bar in the same positions and ratio of sizes as for sinner members, make the stuff in the center card fit to screen on mobile.” Reuse the normal Sinner header positions and relative sizes for the Purgatory map header. Fit the existing center-card composition above Recently Active and bottom navigation on mobile, preserving its content and controls.

## Existing Coven join policy, October 10, 2026

Julien: “i dont see the option i asked for the coven to have a setting where i can allow people to join without approval.” Existing Coven settings must also expose the creation-time approval choice. Preserve approval by default and existing management permissions, visibility and membership caps.

## Mobile checkout QR code, October 10, 2026

Julien: “On mobile make qr code an optional accordion for checkout”. Mobile checkout keeps the QR code collapsed in an optional QR code accordion; desktop retains the visible QR image.

## Rewards affiliate QR code, October 10, 2026

Julien: “Make reward members a qr code also in a similar optional accordian for their affiliate link”. Rewards includes a collapsed optional QR code accordion for the existing member referral link, matching checkout accordion styling.

## Long profile option labels, October 10, 2026

Julien: “Smaller text for longer titles”. For the overflowing Edit Profile Hanky tile labels, reduce long-label text rather than increasing tile height; preserve icons and the existing grid.

## Owner pin clearance close zoom, October 10, 2026

Julien: “look th epin overlap i meant upon close zoom”. Owner-pin clearance applies to close zoom, including expanded spiderfied pins; wide-map positions retain their normal placement.

## Affiliate reminder and Side Quests, October 10, 2026

Julien: “send a daily reminder upon log in about the affiliate program, remove side quests from the app”. Show a daily in-app login reminder for the affiliate program and remove Side Quests UI; preserve earned rewards and the affiliate program.

### October 10, 2026 — inactive button treatment
Julien: “In consistent buttons, i prefer the bright dim one tho for inactive buttons vs the darker one tho”. Preserve the brighter dimmed gradient reference in profile action-row screenshots4897/4896; exact inclusion of enabled-but-quiet uncruush is pending clarification. This does not authorize unrelated global button restyling.

October 10 clarification: “Unavailable”. Brighter dimmed gradient applies only to unavailable profile action buttons. Clickable quiet uncruush stays unchanged.

### October 10, 2026 — Feed distance
Julien: “for the feed filter, put the distance up to global , global is default”. Feed distance supports Global with Global as initial/reset default. Other visibility, audience and privacy rules remain enforced.

### October 10, 2026 — Confessional naming and scrolling
Julien: “feed should allow for infinite scrolling, btw feed is internal only its confessional in app”. User-facing name is Confessional; Feed remains internal terminology. Scroll pagination must continue while matching posts remain, without a100-postclientceiling.

- October 10 filter notices: Julien requested “make the basic includes up to... banners in filters resize text to fit on 2 lines on mobile”. Resize only mobile text in Seeking/Confessional and Visibility Basic allowance notices; preserve existing wording, controls, spacing, colors and desktop presentation.

- October 10 Spot clusters: Julien chose “Keep clusters fixed until zoom” after being told new map areas would wait for a zoom to load. Same-zoom dragging retains the Spot query anchor; zoom reanchors. Filters, account/location changes and authoritative removals retain their existing semantics.

## October 10, 2026 — expanded unavailable actions and foreground notifications

Julien: “can you make that dim bright gradient the go to for unavailable buttons across the app? it's used in the unavilable center pin on profiles. i want that applied to the buttons on the profile cards across the app too for unavailable options - so in feed, send to, dms, and anywhere else those buttons appear, as well as the uncruush button on profiles themselves, and the feed composer options, and message composer options, again only to either uncruush or unavailable options”. This supersedes the earlier exclusion of enabled uncruush. Use the existing full cruush gradient dimmed to the approved unavailable reference; preserve other enabled actions, busy-only states, permissions and handlers.

Julien: “add to que notification banners are centered and span width of window better”. Foreground notification banners use the available window width with equal existing16px horizontal gutters, preserving their internal composition, copy, colors, timing and dismissal.

Julien: “can you make the mhc glyph on profiles the same height as purgatorey glyph on profiles? on click of purgatory hover pop up, take them to a new guide about purgatory that we write now explaining the feature and the difference between SInners and Purgatory members”. Match profile glyph heights; Purgatory tooltip explanation links to the guide without changing its two-line presentation.

## October 10, 2026 — gallery previews and queued UI refinements
Julien: “i don't want the plane on the gallery previews on profiles for mhc members just the color”. MHC profile gallery previews retain their color without plane artwork; other MHC glyphs remain unchanged.
Julien: “make the dm/group/coven send message button the bright gradient when available, put less padding between lower fade and the message composer, add same amount of padding of vibe capsules and purgatory halo on cards across the app ... uncruush button should sheen on hover”. Preserve keyboard/nav clearance, standardize the requested card clearance, and reuse existing sheen for uncruush.
Julien: “make the check in picker have all those options plus the crowd options for cruush+ members in a similar picker to the feed composer one”. Use the real Confessional picker treatment and preserve audience enforcement.
Julien: “update cruush+ unlocks accordian keep it one column, cruush+ benefits have changed”. Update factual benefits without changing entitlement rules; keep one column.

Julien, October 10: “make the stuff under order time in the protected order capsule ... under an accordian ... keep showing the countdown order time and title when its closed (default) ... mention cash app bitcoin minimum ... remove the steps 4. and 5. from how to.” Only the protected-order explanation collapses; amount, address and payment controls retain their visibility. Cash App shows its existing minimum; the two original sending-app-minimum instruction steps are removed. No payment-window or pricing policy change.
Julien, October 10: “Make second paragraph same text color as rest of the text”. The second paragraph of Why cruush takes crypto matches surrounding body text color; copy and link treatment remain unchanged.

October 10 clarification: Julien answered “with selected, reduce fade and gap”. New restricted Check-in Pink Book messages use the selected audience. Reduce the chat bottom fade extent and composer-to-navigation gap together, retaining keyboard/navigation clearance and other styling.

## Single-line vibe capsules and banned-content visibility — October 10, 2026

- Julien: “as opposed to overhang on 2 lines, can we make vibe tags shrink to fit on one line?” Shared card vibe rows scale their existing composition to fit one line; preserve full labels, order, colors and capsule proportions.
- Julien: “remove banned user's content from app upon ban, i see a banned user stilli n the app”. Normal member-facing reads exclude banned accounts and their content, and mounted views refresh after a ban. Keep internal moderation evidence and existing privacy rules; this does not authorize deleting records or changing suspended-account policy.


## Confessional default posted window — October 10, 2026

Julien: “show mostly recently posted feed posts in the past 30days by default and update changelog/settings ver number”. Confessional defaults to posts created within the past 30 days, newest first. Preserve explicitly saved time-window choices and existing audience/privacy filters. This changes the default browsing window, not post expiration.

- October 10, 2026 Popup Mode headers: Julien requested “make pop ups have mobile headers” and clarified “All popups in Popup Mode”. Reuse the existing mobile header presentation for all Popup Mode surfaces, preserving their content and unrelated presentation.

## Purgatory Map navigation — October 10, 2026

Julien: “let purgatory members have the map icon in their bottom bar but they will see their cusotm landing page that we forgot to link in the bottom bar”. Keep Map available for these members and route it to the existing service-area-aware landing; membership restrictions remain unchanged.

## Purgatory service-area wording — October 10, 2026

Julien: “they are currently outside of the Sinner's Map service area. not cruush's service area . add to que.” Describe Purgatory membership as outside the Sinner’s Map service area, not outside cruush’s service area. The shared member explanation and accessible label use this wording.

## Purgatory glyph outline — October 10, 2026

Julien: “No border around the glyph please i never asked for that”. The Purgatory glyph trigger has no visible focus outline; preserve the approved artwork, dimensions and tooltip interactions.

- October 10 profile input capsules: Julien requested “they should fit up to 2 capsules per profile inut like presentation should allow me to fit boi and butch if there is space for them as opposed to each item having its own line”. Selected Edit Profile capsules use at most two per row, wrapping when needed, with existing capsule styling and selection behavior preserved.

- October 10 glossy backgrounds: Julien approved “remove the old overlay”, referring to the logo-scrub layer on glossy onboarding and Purgatory. Preserve the remaining shading and layout and the default recording overlay on other surfaces.

## Popup Mode route coverage, October 11, 2026

Julien: “basicaly every page should load in pops ups in luding co ven chats on the right pop up”. While Popup Mode is enabled, pages should use popups, including Coven chats in the existing right popup. Preserve the normal fullscreen mode and existing popup presentation. The accompanying screenshot padding report is queued separately pending its exact target.

- October 11 Purgatory offering banner: “make the banner transculeent up top teh sale”, clarified with “yesi mean the purga offering banner”. Make only the existing sale banner background more translucent; preserve its other presentation and behavior.

- October 11, 2026 message entry: Julien: “also messages should load on the most recently sent one”. Open direct, group and club conversations at the newest loaded message across full-page, popup and dock presentations. Retain the latest position while initial content settles; stop automatic retention when the reader scrolls through older messages. Preserve existing message ordering, composer layout and history access.

- October 11 profile relationship status: Julien reported “Bugs dude the overlap?? make it hang.” with the “single, not looking” pill spilling into Looking For. Allow that field’s pill text to wrap within its existing card; preserve the grid, font, padding and decoration.

- October 11, 2026 release naming: Julien: “call this release 2.2”. The current release is 2.2; the Settings version label matches the existing v2.2 changelog.


## October 11, 2026 promotion and Side Quests
Julien: “disabled purchases”, “so remove promotion”, “bring back sidequests”. Disable new cruush+ purchases and the current promotion; restore the existing Side Quests UI on Rewards. Existing orders and Pulse purchases remain available. This supersedes the October 10 Side Quests UI removal.

## 2026-10-11: Profile action button gradient reference

Julien: “Why inconsistent? The butch one is correct for button color gradients across profiles add to que”. Use the provided butch top etc screenshot (4981.jpg) as the profile-action gradient reference. This authorizes gradient treatment only; preserve button geometry, icons, labels and enabled/disabled permissions.

## Ghost triangulation hardening, October 11, 2026

Julien: “lets make it safer,” then “Smaller jumps, preserve the minimum offset.” Ghost movement must not encode the direction from the hidden anchor to the real location. Smaller jumps are approved to preserve the existing half-radius minimum offset, selected maximum radius, privacy cell size, land-only placement, rotation timing and animation. Distance-based public decisions must not disclose exact Ghost coordinates or weaken the member's existing visibility exclusions. Existing precise-location grants and their defaults remain unchanged.

## 2026-10-11: View-once photo overlay
Julien: “i think the view once photos should be like snapchat style right? they pop up?” and “agree” to “tap to open a full-screen photo overlay, then close it to return to chat. After closing, it shows Viewed and cannot reopen.” Recipient view-once photos open in a full-screen overlay; closing removes the temporary image. Keep expiry, DL/NSFW and one-time-access rules intact.
