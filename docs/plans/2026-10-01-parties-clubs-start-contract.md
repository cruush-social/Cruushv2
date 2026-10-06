# Clubs start contract

Julien: “Lets do clubs first”

## Goal

Make Clubs searchable by tags for authenticated cruush members, then let a member share a Club as a structured DM card to selected mutual cruushes so each recipient can request to join.

Correction authorized October 2: the Clubs tab must also browse all published Clubs and create a Club. Creation requires a title, short description, tags, and at least one selected mutual cruush. The creator and selected mutual cruushes become confirmed Club members, satisfying the owner-plus-one publication threshold. The associated Club conversation is created with the Club so members can open it from Club detail.

Owners/admins can edit the Club title, short description, and tags. They can review pending join requests; approval adds the applicant to the Club and its conversation, while denial removes the pending request. Club title, short description, and tags are synchronously moderated before creation or editing; rejected metadata is not persisted.

October 2 correction: Clubs a member has joined behave like Groups. `My Clubs` previews open the linked Club chat for every role, show the latest posted message when present, and show pending-request counts to owners/admins. Club administration lives in that chat's existing Conversation settings, not on a separate owner/admin Club page. The Clubs surface also has a separate `Browse Clubs` view. Its search matches Club names, short descriptions, and tags, and results sort by newest posted-message activity with Club creation time as the no-message fallback. Club-facing copy says `cruushes`, never `mutuals`.

Nearby correction: Browse Clubs uses the app's existing 50-mile discovery radius when the viewer has a current encrypted location. Only server-side eligibility is exposed; creator identity, coordinates, and distance are not returned. Joined Clubs remain visible regardless of location, and activity-sorted discovery remains available when current location is unavailable.

Club creation is a cruush+ feature. The server enforces the entitlement and the UI uses the current billing status and existing upgrade destination. Browsing, joining, sharing, and participating remain available without cruush+ subject to existing account and safety rules.

All Club content is moderated through existing boundaries: metadata before create/update; text before message persistence; and message media before delivery. Rejected Club content is not posted.

## Scope

Completed backend slice: persist Club directory records and their tags, then provide an authenticated Club-directory API that filters searchable records by exact normalized tags. Multiple requested tags use the existing directory-filter convention: a Club matching any requested tag is returned.

Authorized UI and sharing slice: add a `Clubs` tab to the existing Messages tab row; reuse the existing Messages/Groups presentation; use the existing search field for Club name, short-description, and tag matches; open a Club detail page; share that Club through the existing in-app share dialog to one or more selected cruushes; render the Club as a structured DM card; and let the recipient submit one pending join request. The current labels are `Clubs`, `My Clubs`, `Browse Clubs`, `Search Clubs`, `Share Club`, `Send Club`, `Search cruushes`, `Request to join`, and `Request sent`.

Not in this slice: Parties, changes to existing Groups behavior, map or Feed changes, payments, Club cover media, advanced governance, ownership transfer, public member rosters, unrelated UI, commits, pushes, merges, or deployment.

Publication rule: “Yea require one other member.” Club creation now enforces the owner plus at least one selected mutual cruush, for two confirmed members total before the Club becomes directory-visible.

Club administration: “i guess admin can do a short description of the club too.” The short `summary` field is displayed and editable by the owner/admin alongside moderated title and tags.

Club roles: owners and admins can assign `admin`, `moderator`, or `member` while keeping the owner role unique. Moderators can approve or deny join requests and remove Club messages; only owners/admins can edit Club metadata or manage roles. Linked Club and conversation roles change together.

Club placement: Club conversations remain available from `Clubs` > `My Clubs` and direct links, but are excluded from the top-level `Groups` view, including its pinned previews.

Authorized Club flow: send the Club, corrected by “the lcub rather,” to “selected members” who are “mutual cruushes,” delivered as the corrected “md card” (DM card). A member selects one or more mutual cruushes, sends the Club in-app, and each recipient opens it and requests to join.

## Allowed file changes

- One new Club migration under `server/sql/`, using the next free migration number in the implementation worktree.
- `server/src/migrate.ts`, only to register that migration.
- New `server/src/club-schema.ts`.
- New `server/src/routes/clubs.ts`.
- New `server/src/clubs-routes.test.ts`.
- `server/src/app.ts`, only to register the new Club routes.
- New `src/app/lib/clubsApi.ts` and `src/app/lib/clubsApi.test.ts`.
- `src/app/lib/messagesApi.ts` and `src/app/lib/messagesApi.test.ts`, only to add the Club share marker.
- New `src/app/components/ClubDirectoryPanel.tsx` and its focused test.
- New `src/app/components/ClubDetail.tsx` and its focused test.
- `src/app/components/InAppShareDialog.tsx` and its test, only for multi-select mutual Club recipients; existing Spot/Profile sharing must remain unchanged.
- `src/app/components/PrivateGroupChat.tsx` and its test, only to render and open the structured Club card.
- `src/app/components/DirectMessages.tsx` and its test, only to add the Clubs tab and substitute Club tag search/results while that tab is active.
- `src/app/App.tsx` and `src/app/App.test.tsx`, only to register and verify the Club detail route.
- This contract and `DESIGN_DECISIONS.md` only when recording a new decision from Julien.
- `docs/worktrees.md`, only to register the isolated Clubs worktree.
- One additive Club membership/conversation migration under `server/sql/`, registered in `server/src/migrate.ts`.
- `server/src/routes/clubs.ts`, `server/src/club-schema.ts`, and `server/src/clubs-routes.test.ts` for browse, create, owner/admin metadata editing, moderated metadata, join-request review, membership activation, and linked conversation access.
- `server/src/match-relationships.ts` is read-only; `server/src/routes/clubs.ts` may call its existing entitlement helper to require cruush+ for Club creation.
- `server/src/routes/messages.ts` and its existing focused route tests only to expose the associated Club id on authorized Club conversations and to prove Club text/media remain on the existing moderated message paths.
- `src/app/lib/clubsApi.ts` and its focused tests for those Club operations.
- `src/app/lib/messagesApi.ts` and its focused tests only to carry the authorized Club id on a Club conversation.
- `src/app/components/DirectMessages.tsx` and its focused test for the visible Browse Clubs and Create Club entry points and the Club composer, reusing the current Group composer presentation.
- `src/app/components/ClubDirectoryPanel.tsx` and its focused test for `My Clubs` / `Browse Clubs`, tag search, joined-Club message previews, admin request counts, direct chat opening, and cruush+ creation access.
- `src/app/components/ClubDetail.tsx` and its focused test only for nonmember detail/share/request-to-join and redirecting current members into the linked Club chat.
- `src/app/components/PrivateGroupChat.tsx` and its focused test for Club metadata and join-request controls inside the existing Conversation settings.
- New `src/app/components/TagInput.tsx` and its focused test for the shared `#tag` plus Enter chip-entry behavior. Julien clarified “every tag editor please,” so all inventoried app tag-entry editors and their focused tests are authorized to adopt only this shared control; search fields and read-only displays stay unchanged.
- Club directory/detail API and UI files may expose and display only aggregate Club member counts, never a public member roster.
- One additive Club-role migration under `server/sql/`, registered in `server/src/migrate.ts`, may add `moderator` to linked Club and conversation membership roles. Message/Club routes, APIs, and focused tests may add synchronized moderator/admin role assignment, moderator request review, and moderator deletion of Club messages only.
- `src/app/components/InAppShareDialog.tsx` and its focused test only to replace Club-facing `mutual` wording with `cruushes`.
- `src/app/components/DirectMessages.tsx` may read existing billing status to gate opening the Club creator and pass the current conversation list into Club previews.

No other files are authorized. Existing event, map, Feed, shared styles, and design-system files are read-only for this slice. Search results and Club cards contain directory metadata and tags only, never conversation identifiers, member rosters, applicant data, or message content. Conversation identifiers are returned only to current Club members. Applicant identity is returned only to Club owners/admins reviewing that Club's requests.
