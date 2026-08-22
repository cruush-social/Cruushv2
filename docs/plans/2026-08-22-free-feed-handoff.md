# Free feed branch handoff, 22 August 2026

Branch `feat/free-feed-board`, worktree `/Volumes/good/Cruushv2-free-feed-20260822`.
Rebased onto `origin/main` `3ef2b15`. Two commits on top. Working tree clean.
Nothing pushed. `feat/free-feed-board` is not on the remote. No deployment was run.

---

## What Julien wants

**Feed and posting**

- The local feed is free to post. No cruush+ gate on posting at all.
- Crowd targeting moves behind cruush+.
- The feed pin visibility setting moves behind cruush+.
- cruush+ members can attach up to **three photos** to a feed post. Free members get fewer; the free number was never stated, assume one until he says.
- Replies on feed posts.
- Reactions on feed posts, triggered on hover, drawn as custom cruush icons in white. He wants to pick or approve the icon set.
- Photos show as small previews in the card and expand full screen on tap. Nothing that eats a screen of feed for one post.
- Photo previews are **heart shaped**, not squares.

**Content policy**

- Nudity allowed everywhere, feed included.
- Nobody is ever forced to show their face. Body part photos are fine, on profile photos too.
- Object photos are fine on the feed: toys, gear, anything not a person.
- Animals, violence, and hate still reject.

**Feed post layout**

- Vibe tags belong **under the profile heart** in the post, not in a wrap under the body copy. Upstream `e86ae30` moved them; he wants them back under the heart.
- The profile heart on a feed post should be **bigger**.

**Desktop**

- Feed, messages, and matches should be full pages on desktop by default. Resizing a panel over the map to read a message is the wrong default.
- Floating panels stay as an **optional** mode for big screens, resizable and movable, or able to fill the whole window.
- Resize grips on **both** the top right and the bottom right.
- Panels must be translucent enough to see the map through them.
- No wasted space at the top of a panel. Some padding, but flush.
- The close X belongs on the same row as the panel's own action buttons, for example the new chat button in messages.
- Overlapping panels must stay clickable.

**Icons**

- The mutual and cruush icon is `ui-icons/cruush-*.png`, the heart with a second heart inside it. Use it for cruush functions.
- The winged heart, `humanity-profile-selected-winged-heart*`, is **for the feed and nothing else**. It is deprecated everywhere else.

---

## What Julien does not want

- **No invented colors.** Only what is in `src/styles/theme.css`. A teal or green placeholder that is not in the palette gets rejected on sight.
- **No invented fonts.** cruush is Spectral, with UnifrakturMaguntia for the logo. There is no monospace anywhere in the product. Courier, IBM Plex Mono, and `ui-monospace` are all wrong.
- **No crowd tags where vibe tags belong.** The tags on a feed post are the author's vibes, not their crowds. Crowds are a targeting control in the composer.
- **No heart in a color that is not the author's.** Heart fill and border always come from `HEART_PIN_THEMES`: self blue, mutual purple, everyone else pink. A purple user never gets a red border.
- **No mockups composed from tokens.** Build from the real component at the tip of `origin/main`, or from a screenshot of the running app. Anything assembled from scratch reads as random and wastes the round trip.
- **No Stream Feeds SDK.** Investigated and recommended against, see the bottom of this file.
- **No big in-card photo blocks.** Full bleed images and peek carousels were all rejected for eating feed space.
- **Do not leave a weaker version of something he rejected.** Remove it.

---

## What is done on this branch

**Feed is free to post.** `server/src/routes/posts.ts` swapped `requireCruushPlus` for `getCruushEntitlement`, so `POST /api/posts` no longer returns 402. The entitlement is still read because `ownerFullAccess` comes from it. `src/app/components/LocalFeed.tsx` lost `canPost`, the billing state, the billing loader, the plus-changed listener, and the upsell card. Trust score, suspension, `feature_restrictions`, and text moderation are all untouched.

**Nudity allowed everywhere.** `server/src/policy-mapper.ts`, the `adult_nudity` / `adult_explicit` branch no longer rejects outside profile photos and private messages. The helper `adultExplicitProfilePhotosAllowed` is deleted rather than weakened.

**Faceless photos allowed.** `server/src/profile-photo-human-detection.ts`, `HUMAN_LABELS` grew from three words to a full body part vocabulary, so a torso or a close crop is no longer rejected as not-a-human.

**Objects on the feed, animals still rejected.** `profile_photo_not_adult_human` now allows on the `feed` surface only. The detector emits a separate `animal` label so animals cannot ride in on that allowance.

Minor detection was not touched. `minor_present`, `minor_age_ambiguous`, `underage_sexual`, and the child face gate are separate branches.

**Desktop dock panels.** Second resize grip on the top right alongside the bottom right. Per panel z-index with `onPointerDownCapture` raising the pressed panel, so an overlapped panel is clickable. `bg-black/80` to `bg-black/45` and a heavier blur. `EDGE_GAP` 24px to 10px so a panel nearly fills the window. Side panel header padding `pt-9` to `pt-2`. Upstream's centred grab strip was kept over the version on this branch.

**Reopening a closed side panel.** `src/app/components/MapHome.tsx`. The panel opens from router history state `openSidePanel`, which was never cleared, so reopening from the same page produced an identical dependency and the effect never re-ran. The effect now consumes the request with a `replace` navigation.

**Edit Profile icon.** `src/app/components/Settings.tsx` masks `cruush-white.png`, the heart-in-heart, instead of the winged heart.

---

## Verification

Green after the rebase:

- `vitest src/app/components/LocalFeed.test.tsx src/app/components/MapHome.test.tsx src/app/components/Settings.test.tsx` — 102 passed
- `server: vitest src/policy-mapper.test.ts src/profile-photo-human-detection.test.ts` — 53 passed
- `vite build` — succeeded

Known failing, pre-existing on `origin/main`, confirmed by stashing the whole diff and re-running:

- `server: app.test.ts > returns the authenticated profile on GET /api/profiles/me`
- `server: app.test.ts > upserts the authenticated profile on PUT /api/profiles/me`

Both differ only by a `custom_condoms` profile field, 50 keys against an expected 49.

**Nothing on this branch has been rendered in a running app.** `npm run dev:local:seeded` exits with "Cannot connect to local Postgres at localhost:5433/cruush" and Docker is not running on this machine. Free posting, the panel fixes, and the moderation policy have never been exercised against a live server. Tests and a build are the only evidence.

---

## Not started

- Crowd targeting behind cruush+. Gate on `payload.crowdTargets.length > 0` in `POST /api/posts`.
- Feed pin setting behind cruush+. Gate `locationPinVisibility` in `PUT /api/feed/settings`. Free members stay on the current `mutuals` default.
- Photo posts: upload, storage, the three photo cap for cruush+, heart shaped previews, the expanded viewer, DL Mode masking of the previews.
- Reactions and replies.
- Vibe tags back under the profile heart, and a bigger profile heart on feed posts.
- Desktop full page mode and the window style setting.
- `BottomNav.tsx` lines 9 and 10 still use the winged heart for the Profile tab, which contradicts "the winged icon is for the feed and nothing else". The replacement was never named, so it was left rather than guessed.
- `Changelog.tsx` line 59 still describes the winged heart as the Profile icon.
- Invariant **G2** in the standing rules doc under `docs/` still says NSFW is allowed only in the favorites gallery and messages. The code now allows it everywhere. Doc and code disagree until the doc is amended.

---

## Stream

Stream is already a dependency, but only as the moderation provider: `moderation-provider.ts`, `check-stream-profile-photo-safety.ts`, `@stream-io/node-sdk` in `server/package.json`.

Their Feeds product is priced separately from Moderation; a moderation plan does not include it. Their quickstart wants a `curl | bash` CLI install and a `getstream init` that binds the project to a Stream app. That was not run.

The recommendation was to build reactions and replies natively. The feed encrypts post bodies with `encryptTextContent`, targets crowds through hashed `profile_sensitive_tokens`, ranks by geo distance against fuzzed coordinates and live location envelopes, gates on trust score inside the insert, and expires posts natively. None of that ports to a follow graph model. Reactions and replies are two tables and about four endpoints on the existing schema.
