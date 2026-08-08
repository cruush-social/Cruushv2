# cruush v1.1 urgent bug-fix and safety release whitepaper

**Document status:** implementation plan and release runbook  
**Product target:** cruush v1.1  
**Document version:** 1.1  
**Date:** 2026-08-05  
**Repository:** `/Volumes/corrupt/Cruushv2-1`  
**Urgent objective:** release verified bug fixes and safety corrections while keeping the confirmed Kube magnifying-lens work in a separately governed visual lane  
**Page model:** 50 explicit page sections separated by `\\newpage` markers  

**Visual reference revision:** the deferred liquid-glass lane is now based on the
Kube article's magnifying-glass implementation, not an improvised filter or the
earlier CodePen-style treatment. See [Liquid Glass in the Browser: Refraction
with CSS and SVG](https://kube.io/blog/liquid-glass-css-svg/).

**Visual safety revision:** a lens that is tan, unchanged, smeared, minifying,
or merely covered by blur is a failed result. Those outcomes are release
blockers and must not be tuned around with another overlay or described as
"close enough."

**Product boundary:** v1.1 is an incremental release over the recorded v1.1
baseline. It is not a v2 migration, redesign, or new product model. Existing
v1.1 routes, contracts, privacy behavior, and release invariants remain the
default. Any source or branch that implies a different product version must be
stopped and reconciled against the recorded baseline before work continues.

> This document is intentionally operational. It distinguishes source state, test state, remote Git state, deployment state, and live behavior. None of those claims substitute for another.

## Table of contents

1. Executive decision
2. Current repository truth
3. Release objective and audience
4. Non-negotiable rules
5. Scope boundary
6. Source-control strategy
7. Baseline and evidence protocol
8. Release candidate assembly
9. Authentication and verification
10. Signup and email delivery
11. Photo-upload availability
12. Moderation state machine
13. Provider precedence
14. Rekognition configuration
15. Moderation storage safety
16. Explicit classification contract
17. DL Mode contract
18. HeartPhoto contract
19. Map masking
20. Image surface inventory
21. Profile and feed surfaces
22. Messaging surfaces
23. Unknown and loading states
24. Legacy media and backfill
25. Message-photo correctness
26. View-once privacy
27. Disappearing messages
28. Database and migration policy
29. API contract testing
30. Frontend testing
31. Server testing
32. Real Postgres testing
33. Provider and IAM testing
34. Staging recovery
35. Staging deployment
36. Staging authenticated smoke
37. Production preflight
38. Production deployment
39. Runtime verification
40. Monitoring
41. Rollback
42. Incident response
43. Risk register
44. Deferred UI release
45. Liquid-glass release lane
46. Sign-off gates
47. Command reference
48. Environment and secret handling
49. Evidence and reporting
50. Final release checklist and handoff

\newpage

## Page 01 - Executive decision

The cruush v1.1 release is a clean safety and bug-fix candidate, not a deployment of the current Claude working branch. The candidate must start from the verified v1.1 production baseline or refreshed `origin/main`, then add only changes that restore broken behavior, prevent unsafe publication, prevent privacy leakage, or provide the tests and operational controls required to prove those changes.

The current mixed branch contains moderation, privacy, onboarding, messaging, map, landing-page, and visual work. Deploying it wholesale would make it impossible to tell whether a production result came from a bug fix or an unrelated UI change. It would also make rollback ambiguous. The release therefore uses a separate worktree, a separate release branch, a reviewed file list, and a hard exclusion rule for visual work.

The release includes authentication and verification corrections, photo-upload gates, moderation fail-closed behavior, Rekognition fallback behavior, explicit classification propagation, DL Mode URL suppression, and confirmed privacy-sensitive messaging bugs. It excludes liquid-glass work, landing-page work, teaser work, map visual polish, cruush+ presentation, onboarding presentation, and messaging redesign. The Kube magnifying lens is documented here so the later visual release has a precise, auditable starting point; documenting it does not authorize shipping it in this candidate.

The target sequence is staging first, then production. Staging health is a hard prerequisite. A production deployment cannot be justified by local tests alone. The v1.1 candidate must remain backward-compatible with the deployed v1.1 contract during migration and rollout; a technically passing v2-shaped replacement is not an acceptable candidate.

\newpage

## Page 02 - Current repository truth

The repository must be treated as a branching system with multiple independent worktrees. The current local branch and the remote main branch are not interchangeable. Before release assembly, the owner must record the current SHA of every relevant branch and the path of every relevant worktree.

The known local state includes a mixed branch named `feature/moderation-dashboard-full-access`, a beta-polish worktree, and a landing-page liquid-glass worktree. The current branch has untracked planning and operational files. Those files are user-owned work and must not be destroyed, staged, or silently folded into the urgent candidate.

The remote main branch already contains several earlier fixes, including verification rate-limit work, upload recovery, moderation fallback, fail-closed moderation, DL Mode coverage, and test isolation. This means the urgent task is first an evidence and delta problem. The agent must determine what is already in main, what is deployed, what is missing, and what is only present in another branch.

The release report must state uncertainty explicitly. If Coolify does not expose a deployed Git SHA, report that the runtime SHA is unavailable and use asset hashes, API metadata, deployment records, and behavior checks as separate evidence.

\newpage

## Page 03 - Release objective and audience

This document is for the engineer or agent who will assemble, test, deploy, monitor, and if necessary roll back the urgent release. It is also for the product owner who needs to know exactly what is shipping and what is deliberately waiting.

The objective is not to make the repository look clean. The objective is to make the release behavior safe, testable, observable, and reversible. A candidate that contains fewer changes but has stronger evidence is preferable to a broad candidate that is difficult to validate.

This revision also gives the deferred visual lane a concrete implementation
contract. The magnifying lens is a design and engineering reference only until
it has its own branch, prototype, visual proof, browser fallback, accessibility
review, and rollback plan.

The primary audience includes the repository owner, the release operator, the backend maintainer, the frontend maintainer, the moderation and privacy reviewer, and the incident responder. Each audience must be able to find the evidence relevant to its responsibility without reconstructing the entire history.

For v1.1, the owner decisions recorded in this document are the working
contract. They do not need to be re-requested at each step: use the Kube lens
reference; reject tan, unchanged, smeared, or minifying output; preserve the
bottom safe-area padding, full-width legal links, and notchless videos; keep
the visual lane separate from safety work; and do not use the deployed build as
the aesthetic source of truth.

The document uses four completion words precisely. **Implemented** means the selected source contains the change. **Tested** means a named test completed successfully. **Staging-proven** means the deployed staging path exercised it. **Production-proven** means the live production path exercised it after deployment. A change must not be called production-proven merely because it is implemented or tested.

\newpage

## Page 04 - Non-negotiable rules

The release has these mandatory rules:

- Never deploy a mixed Claude branch.
- Never reset, clean, overwrite, or delete user-owned work without explicit authorization.
- Use one agent per worktree.
- Start from an exact, recorded baseline.
- Do not treat `origin/main` as proof of production deployment.
- Do not treat a passing test as proof of live behavior.
- Do not treat a live API response as proof of source revision.
- Do not print secrets, cookies, API keys, AWS credentials, or private media URLs.
- Do not publish an image when all moderation providers fail.
- Do not interpret missing explicit classification as safe.
- Do not construct an explicit image URL before deciding that the image may render.
- Do not use a gradient overlay that leaves the explicit image underneath.
- Do not run a broad migration without real database tests and rollback compatibility.
- Do not deploy production while staging is unhealthy.
- Do not add UI polish to the urgent release to make a safety fix look better.
- Do not reinterpret this as a v2 migration or silently change the v1.1
  product, route, API, or data contract.
- Do not ask the owner to repeat a decision already recorded in this document;
  stop only when the current source contradicts it or a genuinely new choice
  is required.
- Do not use the deployed build as the visual reference for a v1.1 branch
  change; preview the exact branch and compare it with the approved reference.

Any exception requires a written decision in the release record. Silence is not approval. If the operator cannot prove that an exception is safe, the exception is rejected and the release pauses.

\newpage

## Page 05 - Scope boundary

The urgent lane includes behavior that affects safety, privacy, authentication, upload availability, moderation, verification, or data correctness. A frontend file may be included if it prevents an unsafe render or restores a broken user action. CSS-only changes, visual rebrands, animation changes, and layout adjustments are excluded.

Included work covers signup recovery after mail failure, verification throttling, provider fallback, provider outage handling, adult-human profile-photo gates, explicit classification propagation, DL Mode masking, map URL suppression, message-photo response correctness, view-once privacy, and confirmed disappearing-message defects.

Excluded work covers all production liquid-glass styling, the magnifying-glass experiment, landing-page spacing, logo and butterfly rendering, teaser videos, map color and label polish, cruush+ presentation, onboarding presentation, message pinning, favorites presentation, profile action redesign, and moderator dashboard presentation. The Kube lens is a separately governed visual candidate, not an urgent-release dependency.

The release must not silently expand to include permanent bans, arbitrary-account lookup, map-presence controls, a v2 product model, or a new visual system simply because related files are nearby. Those changes may be valuable, but they belong in separately reviewed releases with their own acceptance criteria.

\newpage

## Page 06 - Source-control strategy

Create a new clean worktree from the selected cruush v1.1 baseline. The branch name should communicate the release purpose, for example `codex/v1-1-urgent-bugfix-safety-release`. The exact name must be recorded before the worktree is created.

Do not use the current mixed branch as a source by removing files until the diff appears small. That approach is unsafe because a visual change may be coupled to a behavior change, and a revert can leave an incomplete dependency. Instead, start clean and apply only the intended behavioral patch.

Use patch identity and file-level comparison to identify fixes already present on `origin/main`. Do not cherry-pick a commit merely because its subject appears relevant. Several branches contain duplicate or rebased versions of similar changes. A duplicate cherry-pick can reintroduce old behavior, overwrite later fixes, or create a false impression that the release contains more than it does.

The release worktree must have no untracked files before tests begin. Planning documents can be copied into the release only after their contents are reviewed and only if they are required for release operation. Local secret files, generated environment files, and session-specific configuration remain outside the candidate.

\newpage

## Page 07 - Baseline and evidence protocol

The release operator must capture four baselines.

**Source baseline:** the exact cruush v1.1 commit from which the candidate starts. Record `git rev-parse`, branch name, remote state, product-version evidence, and relevant parent commits.

**Test baseline:** the commands, runtime versions, worker limits, test counts, and exit codes from the baseline before changes.

**Deployment baseline:** the Coolify application identity, configured branch, deployed cruush v1.1 revision if available, migration state, and frontend asset hash.

**Runtime baseline:** API health, `/api/meta`, CORS, frontend root response, authentication availability, photo-upload flags, moderation provider metadata, and staging health.

The report must distinguish a missing value from a negative value. If the runtime does not expose a version, write “not exposed,” not “unknown implementation.” If staging returns `503`, write “staging unavailable,” not “staging failed the candidate.” A failed environment and a failed candidate are different diagnoses.

Every evidence item receives a timestamp, command or URL, result, and interpretation. Secrets are removed before the evidence is saved. Screenshots must not contain cookies, tokens, private user data, or credentials.

\newpage

## Page 08 - Release candidate assembly

The assembly process has five passes.

**Pass one, inventory:** list the known bugs and safety gaps from the current source, current tests, live metadata, and planning documents. Mark each as reproduced, statically confirmed, not reproduced, stale, or blocked.

**Pass two, ancestry:** determine whether the fix is already reachable from the selected baseline. If it is, do not reapply it. Add only missing tests or missing runtime configuration.

**Pass three, isolation:** apply missing fixes in the clean worktree. When a commit contains UI and behavior together, split the patch by behavior and review every retained file.

**Pass four, verification:** run focused tests after each subsystem, then run the complete required suite.

**Pass five, scope inspection:** review `git diff --stat`, `git diff --name-status`, and the full diff. Search for visual files, unrelated feature names, secret patterns, accidental generated artifacts, and changes outside the approved matrix.

The candidate is rejected if the implementation depends on a deferred branch that is not included, if the candidate requires a migration that is not registered, or if a test passes only because a stale worktree was accidentally collected.

\newpage

## Page 09 - Authentication and verification model

Email verification has two security objectives that must not conflict. It must resist token guessing, and it must not allow one user or one reverse-proxy address to lock out unrelated users.

The per-token limiter is charged only after the verification token lookup fails. A valid token therefore does not consume the failure budget. Failed attempts are keyed using a safe token-derived identifier rather than the raw token. The shared address limiter remains a backstop with a higher ceiling because production may observe the reverse proxy address when trusted-proxy configuration is absent.

The route must distinguish invalid, expired, reused, and already-verified states according to the existing API contract. It must not leak whether an unrelated email address exists. The token itself must not be included in logs, analytics, error reports, or browser-visible diagnostic output.

Tests must prove that many unrelated valid users can verify behind the same observed address, that repeated guesses against one token are throttled, and that successful verification remains successful after the failure budget for another token is exhausted.

\newpage

## Page 10 - Signup and email delivery

Signup has a critical ordering edge case: the user row may be committed before the verification email is successfully delivered. A mail-provider failure must not make the account impossible to verify or re-create.

The required behavior is:

1. Validate the signup request.
2. Enforce beta, captcha, client-security, and account constraints.
3. Create the account and verification token according to the existing transaction contract.
4. Attempt verification-email delivery.
5. Return an explicit delivery status.
6. If delivery fails after account creation, preserve a recoverable account state and expose the existing resend path.

Passwords must not be logged or placed in URLs. If the client temporarily retains a password to support resend, that lifetime must be limited to the existing flow and must not be persisted in durable storage.

Tests cover successful delivery, delivery failure, retry, duplicate signup, expired token, resend throttling, and login before verification. The production smoke must verify the visible recovery behavior rather than only asserting an HTTP status.

\newpage

## Page 11 - Photo-upload availability

Photo-upload availability is a pre-upload gate. When it is closed, the API should reject before storing or moderating the file. When it is open, the configured safety path must be capable of making a safe decision.

The gate must be evaluated independently for profile photos and message photos while retaining the current product policy. It must not require a Stream stack when Rekognition is the approved standalone fallback. It must not open merely because an unrelated alpha flag exists. An alpha bypass must require both the enabled flag and a future end time, and production must not depend on it.

The gate must be tested in local, test, staging, production, active-alpha, expired-alpha, Stream-enabled, Stream-disabled, Rekognition-enabled, and Rekognition-disabled configurations. The result of `/api/meta` must match the actual route behavior. A metadata claim that uploads are enabled is not enough if an authenticated upload still returns a gate error.

The release report must record the gate state without exposing credentials or provider secrets.

\newpage

## Page 12 - Moderation state machine

Every uploaded image passes through explicit states. The release must document and test the transitions.

```text
received
  -> validated
  -> quarantined
  -> primary classification
  -> fallback classification if required
  -> policy decision
  -> approved or rejected
  -> public reference only after approval
```

An image must never move directly from `received` to public approval because a provider returned an empty response. An empty response is not a safe classification. A thrown provider error is not a safe classification. A timeout is not a safe classification.

A definitive provider rejection remains rejected. A provider-unavailable result may invoke the fallback. A fallback result must retain provider provenance so operations can determine why it ran. If all providers fail, the image remains unpublished and the user receives a recoverable error.

The moderation record must distinguish allowed, rejected, queued, and provider-unavailable outcomes. Any cleanup failure after rejection must be observable without exposing the image bytes.

\newpage

## Page 13 - Provider precedence

Provider precedence prevents a secondary service from accidentally weakening policy.

The primary provider is authoritative when it returns a complete, usable decision. Rekognition is a fallback when the primary provider is unavailable, unconfigured, throws, times out, or otherwise cannot classify. Rekognition does not override a primary rejection.

The fallback result must identify:

- primary provider name;
- primary status;
- primary error category;
- fallback provider name;
- fallback status;
- normalized labels;
- request IDs in sanitized form;
- final policy decision.

The user-facing response must remain simple. It should not expose internal provider names, AWS errors, IAM details, or raw moderation labels. Operations need detailed sanitized logs; users need a safe recovery instruction.

Tests must cover provider combinations rather than only individual providers. The matrix includes primary allow, primary reject, primary unavailable plus fallback allow, primary timeout plus fallback reject, both unavailable, malformed fallback response, and fallback permission denied.

\newpage

## Page 14 - Rekognition configuration

The urgent release retains the current documented Rekognition defaults unless a separate policy decision changes them. The current configuration model includes an enable flag, region, human confidence threshold, animal confidence threshold, face confidence threshold, minimum age, and timeout.

The AWS identity must have only the required actions. The release must verify the actions used by the implementation, including label detection, face detection, and moderation-label detection. A missing IAM action is treated as provider failure and must lead to the safe fallback or fail-closed path.

The staging and production identities, buckets, and environment configuration must remain separated. The operational sync helper may report safe metadata and write non-secret flags, but it must never print or commit secret values. Copying production credentials into local files is not required for the release and should not be performed unless a separate controlled smoke explicitly needs it.

The document must record cost and latency implications. Message-photo classification may multiply provider calls, so the release must capture the expected call count and timeout behavior before enabling it broadly.

\newpage

## Page 15 - Moderation storage safety

Storage behavior is part of moderation correctness. A moderation failure must not leave an approved-looking row, a public URL, or a profile reference pointing at unapproved content.

For a rejected or unavailable result:

- no public media URL is returned;
- no approved classification is written;
- no profile-photo array is updated as if the image were live;
- no message attachment is linked as approved;
- quarantine ciphertext is deleted or remains private according to the existing cleanup contract;
- cleanup failures create an operational signal;
- retrying the upload does not duplicate the published object;
- a client refresh cannot reveal a previously rejected asset.

The release must test failures at each step: provider result, database update, object-storage write, object-storage delete, and response serialization. A database transaction cannot roll back an external object-store write automatically, so the cleanup path must be explicit. The report must state what is guaranteed atomically and what is repaired asynchronously.

\newpage

## Page 16 - Explicit classification contract

The client and server need one contract for explicit status.

```text
true       positively classified explicit
false      positively classified non-explicit
null       classification unavailable
undefined  classification unavailable
```

For safety-critical rendering, missing metadata is not a safe value. API response mappers should preserve the distinction between explicit, non-explicit, and unavailable when the consumer needs it. Client components must not use a boolean coercion that turns unavailable into false.

The server must return the flag from every endpoint that exposes a user-supplied image. If a compatibility query cannot return the flag, its result is unknown and the client masks it. An endpoint that omits the flag is not “safe by default” merely because the current client happens to render a gradient somewhere else.

Tests must inspect both response objects and rendered output. The API test proves the flag is present or explicitly unknown. The component test proves unknown status is masked and that the image URL is absent.

\newpage

## Page 17 - DL Mode contract

DL Mode remains a client-local preference in this release. The server does not know whether an individual viewer has DL Mode enabled, so the client must enforce its rendering contract consistently.

Required behavior:

- absent preference means enabled;
- stored false means disabled;
- stored true means enabled;
- toggling updates the current surface;
- toggling broadcasts to mounted surfaces;
- explicit plus enabled masks;
- non-explicit plus enabled renders;
- unknown plus enabled masks;
- masked output contains no explicit URL;
- turning DL Mode off does not bypass policy restrictions or missing metadata.

The settings copy must not claim broader or narrower coverage than the verified implementation. Copy changes are deferred unless the current copy makes a safety claim that is materially false. If copy is changed in the urgent release, it must be a minimum safety clarification, not a visual rewrite.

\newpage

## Page 18 - HeartPhoto contract

`HeartPhoto` is a shared safety boundary. Its mask decision must be explicit at every call site. The `masked` prop must not default to false because a missing prop is otherwise an unreviewed unmask.

The component must decide whether the photo renders before calling `resolveMediaUrl`. A masked photo must not enter an SVG `<image>`, an HTML `<img>`, a CSS background, a preload, or a data attribute that exposes the URL.

The fallback must be deterministic, accessible, and independent of the hidden photo. It may use the existing profile-gradient treatment. It must not accidentally derive a network URL from a hidden photo while calculating dimensions, gradients, alt text, or click behavior.

Changing the prop to required is intentional. The resulting type errors provide the coverage checklist. Each call site must identify its explicit-status source, or explicitly choose the fail-closed unknown path. Tests must cover explicit, non-explicit, unknown, no photo, current user, and DL Mode changes while mounted.

\newpage

## Page 19 - Map masking

Map markers must not fetch an explicit photo and then paint a gradient over it. That leaves the bytes in the browser and violates the privacy objective.

The marker path must calculate `shouldRenderPhoto` before resolving the URL. `hasPhoto` must mean that a source photo exists. A separate renderability value must represent whether the photo may be inserted into the SVG.

Masked markers retain the deterministic profile gradient where the existing product contract provides one. This preserves identity differentiation without exposing the image. Current-user, NPC, mutual-cruush, clustered, spiderfied, selected, hovered, and popup states must all use the same masking decision.

MapHome must not null the photo in one layer while MapView independently decides whether a photo exists. The decision should be centralized at the final image-rendering boundary. The mutual-map endpoint must return the explicit flag, and its client adapter must not drop that field.

Tests must assert both DOM absence of the URL and absence of the network-resolution call when DL Mode is active.

\newpage

## Page 20 - Complete image-surface inventory

The urgent audit tracks these surfaces:

1. discovery map pins;
2. mutual-cruush map pins;
3. map profile popup;
4. local-feed author avatars;
5. cruise carousel;
6. recently-active tray;
7. profile view;
8. profile editor;
9. received cruush activity;
10. sent cruush activity;
11. mutual cruush activity;
12. message picker;
13. conversation-list avatars;
14. chat-header avatar;
15. message sender avatars;
16. message-photo attachments;
17. member pickers;
18. blocked-user list;
19. privacy-audit viewers;
20. moderator review;
21. event attendees;
22. favorites gallery;
23. quick-access gallery;
24. legacy discovery fallback;
25. duplicate heart-pin implementation;
26. onboarding preview.

Each row in the release evidence table must state the endpoint, flag source, masking owner, test, and staging smoke. A surface is not complete until the response path and render path agree. A gradient screenshot alone is insufficient.

\newpage

## Page 21 - Profile and feed surfaces

Profile view, profile cards, profile editor, local feed, cruise carousel, and recently-active surfaces must all use the same explicit-status semantics.

The profile editor is a particularly important edge case. It may hold an image before the response includes complete metadata. During save, loading, and response replacement, the fallback must not mark a photo safe simply because the metadata array is absent. The safe behavior is to mask until a positive non-explicit result is available.

Feed authors require the explicit status for their primary photo. The server query must select the media classification using the same media identity and surface constraints as profile endpoints. It must not assume that the first string in a profile array is safe merely because it exists.

Tests must cover an explicit feed author, an unknown feed author, a non-explicit feed author, a profile-save response without metadata, a profile-load transition, and a user with no photo. The tests must search the full rendered output for the known URL.

\newpage

## Page 22 - Messaging surfaces

Messaging surfaces include conversation lists, chat headers, sender avatars, member pickers, cruush activity, blocked users, favorites, quick-access images, and message attachments.

These surfaces cannot be fixed only with a client toggle if the server never supplies explicit metadata. The API must return a safe flag or explicit unknown state. Client mappers must preserve it rather than dropping it during adaptation.

For message attachments, the attachment object must contain the correct URL, media type, view-once state, viewed state, and explicit state immediately after send. The first render must not rely on a later refresh to repair a missing URL or incorrect explicit boolean.

The urgent release does not redesign the composer. It only repairs behavior that affects privacy or data correctness. Existing visual structure remains intact. A later UI release can change the composer layout after these contracts are protected by tests.

\newpage

## Page 23 - Unknown and loading states

Loading is a safety state, not a temporary permission to render. When a profile or attachment loads in stages, the component must not display a photo merely because a URL arrived before its classification metadata.

Required behavior during loading:

- show a safe fallback;
- avoid constructing the URL if the component controls construction;
- do not infer non-explicit from an empty metadata array;
- do not preserve a stale safe decision after the identity changes;
- cancel or ignore stale asynchronous responses;
- do not allow a previous user’s explicit status to apply to a new user.

Tests must include rapid navigation between two profiles, delayed metadata, failed metadata fetch, response replacement, unmount during fetch, and a photo URL that exists before classification. The accepted state transition is masked until the status is known. Once positively non-explicit, the component may render according to DL Mode and surface policy.

\newpage

## Page 24 - Legacy media and backfill

Legacy media requires an explicit decision because historical rows may not represent a trustworthy classification. A row marked `non_explicit` is not necessarily equivalent to a row that was actually classified by the current provider.

Before changing any database default or claiming complete DL Mode coverage, determine:

- which migration created historical classification values;
- whether old rows were structurally labeled safe;
- whether creation timestamps identify the affected set;
- whether reclassification is affordable;
- whether Rekognition can process the backlog safely;
- how failed jobs resume;
- whether a human override is needed.

The safe backfill design is batched, resumable, observable, and separate from schema migration. Failed or unknown rows remain masked. No backfill may run inline during application startup. No job may print image bytes or provider credentials. The release report must distinguish newly classified media from legacy media awaiting reclassification.

\newpage

## Page 25 - Message-photo correctness

The message-photo response must be correct in the same request that creates the message. A data-modifying CTE may update a media row but a later read in the same statement can observe the pre-update snapshot. If that occurs, the response may contain a null URL or the wrong explicit state even though the database update succeeded.

The repair must use values from `UPDATE ... RETURNING` or perform a post-update read inside the same transaction. It must apply to direct uploads and favorite-image sends. A fallback mapper must not hide a server-side response defect.

Tests cover a normal image, explicit image, favorite image, view-once image, caption, concurrent send, failed moderation, retry, and immediate client insertion. The database row, returned JSON, client state, and rendered URL must agree. The test must fail if the first response requires a manual refresh to become correct.

\newpage

## Page 26 - View-once privacy

View-once behavior is a privacy contract, not merely a composer option. The selection must apply only to the next photo attachment, and the state must be cleared after that send. Text-only sends must not inherit the setting.

Opening a view-once attachment must be authorized, atomic, and idempotent. The first successful open may return bytes. A second open must not return the same bytes. A failed open must not consume the view. Deletion, expiration, blocking, conversation closure, and permission changes must be respected.

DL Mode creates a special edge case. If explicit content is masked, the system must not consume a view while showing only a gradient. The chosen contract must be explicit: either opening is blocked with an explanation, or the server does not count a masked open. The urgent release must choose one behavior and test it end to end. The default recommendation is to block the open while DL Mode is active and the attachment is explicit.

\newpage

## Page 27 - Disappearing messages

Disappearing messages require separate verification of write behavior, read behavior, and cleanup behavior. A timer setting may be saved correctly while expiry is only enforced on read, so the user-visible result and storage result must not be conflated.

Test direct messages and groups. Test authorized admins and unauthorized members. Test closed groups. Test every supported timer value and invalid values. Test changing the timer while messages already exist. The release must state whether the new timer affects only future messages or restamps existing messages.

While a chat remains open, the client must not keep displaying an item after its expiry time without reevaluating it. If deletion is not immediate, the UI must not claim that storage deletion is immediate. Server-side cleanup requires an approved scheduler and a separate operational contract; it must not be improvised inside a frontend patch.

Clear-for-everyone must be tested as a separate authorization and visibility action, including attachments and already-loaded client state.

\newpage

## Page 28 - Database and migration policy

Schema changes are allowed only when required by a selected bug or safety correction. Each migration must be additive where practical, registered in the migration runner, and tested in order.

The migration checklist is:

- confirm the next free number in the clean worktree;
- inspect neighboring migrations;
- use `if not exists` only where it preserves correctness;
- add constraints deliberately;
- test existing rows;
- test empty databases;
- test rerun behavior;
- test startup after migration;
- test old application compatibility if rollback retains the schema;
- document data cleanup and ownership;
- do not run bulk reclassification inside the migration.

No destructive migration is permitted in the urgent release. If an additive schema change is not backward compatible with the currently deployed application, deployment order must be changed or the migration deferred. A migration that technically runs but leaves the old application unable to start is not safe.

\newpage

## Page 29 - API contract testing

Every changed endpoint must have an explicit request, response, authorization, and failure contract.

For authentication endpoints, test status, error code, response data, cookies, and side effects. For upload endpoints, test whether a media row, public URL, classification, moderation record, and user-facing response exist after each outcome. For profile and list endpoints, test the explicit flag and unknown behavior. For message endpoints, test attachment fields immediately after creation.

Contract tests must verify that field names survive every mapping layer. A value can be present in SQL but lost in a TypeScript row type, server mapper, API helper, adapter, or component prop. The test should fail at the first missing boundary.

Unauthorized requests must remain unauthorized. A safety fix must not accidentally broaden access to private media, moderation data, blocked users, or account-enforcement history. Error responses must not reveal provider internals or whether a private user exists.

\newpage

## Page 30 - Frontend testing

Frontend tests must test behavior rather than decorative output. For masked images, assert that the known URL is absent from the entire rendered tree, not merely that a gradient exists.

The frontend matrix includes:

- DL Mode default on;
- persisted off;
- toggle propagation;
- explicit image masking;
- non-explicit rendering;
- unknown masking;
- loading masking;
- profile editor save response;
- feed author masking;
- conversation list masking;
- message sender masking;
- map marker masking;
- popup masking;
- favorite and quick-access masking;
- view-once privacy behavior;
- URL cleanup after unmount.

Tests must avoid substring path ambiguity caused by duplicated worktrees. The root suite must exclude server, agent worktrees, generated output, and AppleDouble sidecars. Worker counts must remain bounded to prevent memory exhaustion from jsdom, React, and map libraries.

\newpage

## Page 31 - Server testing

Server tests must cover the policy boundary and the route boundary separately. Unit tests can prove normalization and decision mapping. Route tests prove authorization, persistence, and response behavior. Integration tests prove real SQL and transaction behavior.

Provider tests must use deterministic fake clients at the AWS boundary. The fake must simulate allow, reject, timeout, throw, malformed response, and permission failure. It must not bypass the application’s provider selection logic.

Moderation tests must assert both the final decision and the stored evidence. A test that sees a `503` but leaves an approved media row is a failure. A test that sees a rejection but leaves a public URL is a failure. A test that sees an allow after provider failure without a verified fallback result is a failure.

Tests must state whether the database is mocked. Any test touching SQL syntax, CTE behavior, migration order, or data-modifying snapshots must use a real Postgres path.

\newpage

## Page 32 - Real Postgres testing

The current repository has many route tests that stub `app.db.query`. Those tests remain useful for control flow, but they cannot parse SQL or reproduce CTE snapshot behavior. The urgent release requires a real database test layer for changed SQL.

At minimum, run real Postgres tests for:

- verification-token lookup and update;
- media approval and classification;
- message-photo attachment response;
- favorite-image message response;
- disappearing timer;
- group update;
- clear-for-everyone;
- explicit metadata joins;
- every new migration.

The real database fixture must be isolated, disposable, and seeded with only test data. Tests must clean up or destroy the database after execution. Production or staging URLs are never used as test database URLs. A test must fail loudly if the database is unavailable rather than silently falling back to a mock.

\newpage

## Page 33 - Provider and IAM testing

Provider testing has two layers. The first layer fakes the network boundary and proves application behavior. The second layer uses controlled staging credentials to prove the real IAM policy and provider request shape.

The live test must be skipped in ordinary CI when credentials are absent, but a release operator must run it before enabling production. It must verify every AWS action used by the code and identify a missing permission without printing the credential or raw provider response.

The live test must use consented, non-sensitive fixtures and must not upload private production user media. The result must record action names, status, latency category, and safe error category. It must not record image bytes, access keys, secret keys, signed URLs, or complete raw response payloads.

Provider costs, timeout behavior, and rate limits must be reviewed before a full production smoke. If a real provider call cannot be safely completed, the release must state that the provider boundary remains unproven and must not claim production safety activation.

\newpage

## Page 34 - Staging recovery

Staging currently returns `503`, so staging recovery is a prerequisite rather than an optional postscript.

The recovery order is read-only diagnosis first: confirm the staging API resource, frontend resource, domains, DNS, health path, health host, exposed port, base directory, database reachability, object-storage configuration, and migration duration. Confirm that staging and production use separate data stores and that CORS includes the staging frontend.

If the API container is healthy but the public route returns `503`, inspect ingress, proxy, health-check host, certificate, and routing. If the container does not start, inspect migration failure and configuration validation. If the frontend is healthy but the API is not, do not hide the failure with a frontend deployment.

The recovery result must include the exact observed status, root cause, corrective action, and post-fix health proof. Production remains blocked until staging returns stable health and the API metadata endpoint responds.

\newpage

## Page 35 - Staging deployment

The staging deployment order is API first, frontend second.

The API runs migrations before it listens, so its health-check budget must be long enough for a cold start and migration execution. After API deployment, verify `/health`, `/api/meta`, CORS, and migration completion. Only then deploy the frontend.

The frontend smoke must sample the URL repeatedly with cache bypass and confirm one asset build. Alternating asset hashes indicate split brain or stale containers and block the release. Service-worker behavior must be checked because a stale shell can make correct source changes appear absent.

The release operator must dry-run the deployment workflow before any mutation. The operator must review all environment changes, especially broad launch configuration unrelated to the urgent release. Only non-secret flag values may appear in the report. If the existing deployment script changes unrelated runtime settings, use a reviewed deployment path that performs only the required actions.

\newpage

## Page 36 - Staging authenticated smoke

Authenticated staging smoke uses a disposable, real account created through the normal visible flow. It must not use seeded fake production data for bank-facing or safety claims.

The smoke sequence is:

1. open the staging frontend;
2. sign up or log in;
3. verify the email through the expected staging route;
4. load profile and settings;
5. upload a safe adult-human photo;
6. verify that the returned asset serves correctly;
7. exercise an explicit or controlled classification fixture;
8. verify non-human rejection;
9. enable DL Mode;
10. verify map, feed, profile, list, and message masking;
11. exercise message-photo and privacy behavior where included;
12. inspect safe logs and metadata.

Every step records request result, user-visible result, and cleanup. A failure is classified as frontend, API, provider, database, storage, environment, or test-fixture failure before any code change is proposed.

\newpage

## Page 37 - Production preflight

Production preflight records the live state before deployment. Capture the current remote main SHA, deployed revision if exposed, frontend asset hash, API health, API metadata, CORS, photo-upload flags, moderation metadata, migration status, Coolify application identity, and health-check configuration.

Confirm the production API resource uses the server base directory, API port, API health path, and IPv4 health host where required. Confirm the frontend uses the root base directory and frontend port. Confirm health checks are enabled and their retry budget can outlast migrations.

Confirm that the candidate passed staging from the same SHA. Confirm no unreviewed environment changes are pending. Confirm the rollback SHA and provider-flag rollback are recorded. Confirm the database backup or recovery posture before applying a new migration.

If the deployed SHA cannot be identified, the preflight report must say so. That does not permit an unrecorded deployment. It increases the importance of asset hashes, runtime metadata, and repeated behavior probes.

\newpage

## Page 38 - Production deployment

Production deployment is a controlled publication of the exact staging-verified candidate.

The preferred sequence is API first, migration completion, API smoke, frontend second, frontend asset consistency, authenticated smoke, and monitoring start. If the deployment platform requires branch publication to `main`, the candidate SHA must be pushed only after the final clean-worktree and diff review.

The deployment operator must not use `--skip-checks` for the urgent release. A dry run must precede the live action. The operator must confirm the target domains and application IDs before triggering deployment. If the release script applies unrelated launch runtime values, those mutations must be reviewed or bypassed through a narrower approved deployment path.

No production UI smoke may be interpreted as proof of moderation behavior. No API metadata response may be interpreted as proof of frontend masking. Each claim receives its own evidence.

\newpage

## Page 39 - Runtime verification

Runtime verification begins immediately after deployment.

API checks include `/health`, `/api/meta`, CORS, unauthenticated error contracts, and authenticated verification/upload flows. Frontend checks include repeated root requests, stable asset hash, no stale service-worker shell, sign-in, profile, feed, messages, and settings.

Safety checks include a controlled safe upload, a controlled explicit classification path, a provider-failure path where safe, and DL Mode masking. The operator must verify that a masked image has no explicit URL in the rendered DOM and no unexpected image request in the browser network log.

The verification report must record the exact URL, timestamp, observed status, asset hash, API metadata subset, account context category, and result. Do not record private account identifiers or image URLs. If a smoke account is used, document the cleanup action and confirm it did not affect real users.

\newpage

## Page 40 - Monitoring

Monitoring begins before the production deploy and continues through the post-release window.

Availability signals include API health, frontend HTTP status, 5xx rate, deployment health, migration duration, and split-brain asset hashes. Authentication signals include signup failures, verification success, verification `429`, resend failure, and mail delivery failure.

Safety signals include provider-unavailable count, Rekognition fallback count, Rekognition timeout count, upload rejection count, explicit classification count, non-human rejection count, and failed quarantine cleanup. Privacy signals include unexpected image URL construction, attachment access failure, view-once failures, and expired-message visibility.

Logs must be sanitized. Metrics should use reason codes and aggregate counts rather than raw content. The first monitoring window is active observation for 15 minutes, followed by hourly review through the first launch day. Any unexplained safety regression pauses UI work and triggers incident review.

\newpage

## Page 41 - Rollback

Rollback is separated into application rollback, provider rollback, and database recovery.

Application rollback restores the last known healthy revision and verifies API health, frontend asset consistency, authentication, and the upload gate. Provider rollback disables only the Rekognition flag if the provider causes latency, IAM, cost, or classification problems. It must not re-enable fail-open publishing. If no safe provider remains, uploads may become unavailable until safety is restored.

Database rollback does not mean improvising a destructive down migration. Additive schema remains in place if the previous application can tolerate it. If it cannot, stop deployment and use a forward-compatible repair or a coordinated restore. Never delete media or classification records to conceal a release failure.

After rollback, record the failing SHA, last healthy SHA, observed symptoms, containment time, user impact, data impact, and verification evidence. A rollback is not complete until the old behavior is tested for the affected path.

\newpage

## Page 42 - Incident response

Trigger incident response for any explicit image published after all providers fail, any explicit URL rendered under DL Mode, any global verification lockout, any secret exposure, any staging/production data crossover, any mixed frontend build, or any production migration failure.

The response sequence is:

1. stop further deployment;
2. preserve safe evidence;
3. identify affected revision and environment;
4. contain the unsafe path;
5. decide rollback or flag disablement;
6. verify containment;
7. assess affected users and records;
8. repair forward only after evidence is preserved;
9. document cause, contributing factors, and prevention.

Do not speculate about user impact. Use database counts, request logs, sanitized metrics, and deployment records. Do not paste secrets or private media into the incident channel. If a privacy incident is suspected, preserve access logs and involve the appropriate owner before destructive cleanup.

\newpage

## Page 43 - Risk register

The release risk register includes:

**Mixed history:** duplicate or diverged commits may hide what is actually new. Mitigation: clean baseline, patch identity, full diff.

**Stale planning diagnosis:** a previous document may reference deleted files. Mitigation: reproduce against current source.

**Staging unavailable:** production validation cannot proceed. Mitigation: restore staging first.

**Provider permission gap:** local mocks pass but AWS fails. Mitigation: live IAM action test.

**Legacy classification:** old rows may be mislabeled safe. Mitigation: conservative masking, bounded backfill, no inflated coverage claim.

**URL leak:** overlay masking leaves bytes fetched. Mitigation: renderability before URL resolution, network assertions.

**Schema incompatibility:** migration passes but old app cannot start. Mitigation: backward-compatible additive changes and rollback test.

**Memory exhaustion:** duplicated worktrees are collected by Vitest. Mitigation: excludes and bounded pools.

**Service-worker staleness:** users see old frontend. Mitigation: repeated asset-hash smoke and recovery path.

**Unrelated environment mutation:** deployment script changes launch settings. Mitigation: dry run, safe diff review, narrower deploy path.

**Version drift:** the worktree, API, database, or preview is actually v2-shaped
while the request is for v1.1. Mitigation: record product-version evidence at
baseline, compare routes and API contracts, and stop rather than reconciling by
guesswork.

**v1.1 backward-compatibility break:** a migration or response change works for
the new bundle but breaks the currently deployed v1.1 bundle. Mitigation: use
additive schema changes, old/new contract tests, and rollout order that keeps
both versions safe during the transition.

**Feature-flag drift:** a visual or safety flag defaults differently between
local, staging, and production. Mitigation: record safe flag state, test absent
and explicit values, and never enable a metered or safety-sensitive path by
accident.

**Decision loss:** an already-set visual constraint is treated as an open
question and replaced by a new approximation. Mitigation: this document is the
decision register; preserve the bottom padding, legal-link width, notchless
video, Kube reference, and hard visual rejection criteria unless the owner
explicitly changes them.

\newpage

## Page 44 - Deferred UI release

The UI lane starts only after the urgent candidate is production-proven and stable. It must begin from the urgent release SHA, not from the old mixed Claude branch. Every UI change gets a separate worktree and a visual acceptance record.

Deferred groups include beta polish, Kube-based liquid-glass landing work, teaser and logo rendering, map visual polish, cruush+ presentation, onboarding presentation, messaging layout, profile-action redesign, and icon work.

The UI release must preserve the urgent invariants. A new glass surface cannot render an explicit image without an explicit-status decision. A new map marker cannot call `resolveMediaUrl` before masking. A new message gallery cannot bypass view-once or expiry authorization. A new CSS overlay cannot be used as proof that privacy is enforced.

The landing-page layout contract also remains fixed while the lens is evaluated:
the approved bottom safe-area padding is preserved, and the footer legal-links
run remains `width: 100%; max-width: 100%`. The lens work must not remove the
bottom padding, narrow the legal links, or restore an earlier link-width variant
as a side effect of changing the visual effect. Those are separate layout asks.

Visual verification must include mobile, desktop, loading, error, captcha, short-window, hover, selected, and authenticated states. The later release must report component/build proof separately from authenticated live proof.

\newpage

## Page 45 - Kube magnifying-glass release lane

Liquid-glass work is deferred because it changes shared visual behavior and
carries a high regression surface. This revision replaces the earlier generic
glass direction with the confirmed Kube magnifying-glass reference. The source
article is [Liquid Glass in the Browser: Refraction with CSS and
SVG](https://kube.io/blog/liquid-glass-css-svg/). The article describes a
Chrome-focused proof of concept, not a drop-in cruush production dependency.

### Reference filter graph

The magnifying lens is not a single blur and is not a translucent gradient.
Its reference graph is:

1. Load a magnifying displacement map with `feImage`.
2. Apply it to `SourceGraphic` with `feDisplacementMap`, using the red channel
   for X and green for Y. This is the stronger centre zoom field.
3. Apply a small Gaussian blur to the magnified result.
4. Load a separate rounded-bezel displacement map and displace the blurred
   result again. This produces the refractive rim rather than a uniform nudge.
5. Apply the reference saturation treatment.
6. Load a separate specular map, composite it with the displaced image, fade
   its alpha by the chosen opacity, and blend it over the refracted result.

The inspected Kube bundle identifies the reference assets as a magnifying map,
a bezel displacement map, and a specular map. The magnifying demo uses a
210-by-150 filter surface and a maximum-displacement constant of approximately
122.81 pixels. Those values are reference evidence, not approved cruush
production constants. The assets must be audited and packaged locally before
any release; the application must not depend on hotlinked Kube URLs.

### Behaviour and sizing contract

The lens must sit over content with real structure: the landing-page video,
high-contrast lines, or another approved texture. A flat black or flat colour
surface cannot demonstrate refraction because there is no edge to bend. The
prototype must include an A/B state with `backdrop-filter` disabled so a
visible break at the lens rim can be attributed to displacement rather than a
shadow, border, opacity, or blur.

Filter image dimensions must match the rendered lens dimensions. The maps must
not be silently stretched into a different aspect ratio. If the lens is
responsive, the implementation must either regenerate the maps for the actual
pixel size or define a small set of supported sizes and prove each one. Shape
or size changes that require map regeneration are expensive; animating the
filter scale is acceptable for a transition, but it does not remove the need
to rebuild a map after a geometry change.

The initial prototype must preserve the article's exposed magnifying-glass
control model: specular opacity, specular saturation, refraction level, blur,
and magnification strength. The article's displayed magnifying-glass values
are a visual baseline only. Any cruush-specific value must be recorded as a
deliberate tuning decision with before/after screenshots, not introduced as an
unannounced improvement.

### Browser and fallback contract

The reference `backdrop-filter: url(#...)` path is Chromium-only. Safari and
Firefox cannot be called equivalent merely because the CSS declaration exists.
The non-Chromium path must be an explicit fallback, such as a layered blur or
static visual treatment, and the release must say that it is a fallback rather
than claiming full refraction parity. A normal `filter` applied to a duplicated
foreground image is a different architecture and must not be substituted
without a decision about synchronizing the backdrop.

### Landing-page boundaries

The lens does not authorize changes to auth behavior, captcha, bottom safe-area
padding, footer legal-link width, or the approved notchless teaser-video assets.
The video remains the video; the lens is an overlay that samples it. No WebGL
replacement, procedural butterfly, alternate video with a notch, link-width
revert, or bottom-padding removal may be bundled into this lane.

### Hard visual rejection criteria

The following are failure states, not polish issues:

- **Tan or warm cast:** a neutral white, grey, or cool source becomes visibly
  beige, yellow, brown, or otherwise warmer inside the lens than the same source
  outside it. Do not hide this with a cooler overlay. First isolate the
  specular map, saturation step, source layer, and any existing background
  gradient; the corrected render must remain neutral without a compensating
  tint.
- **Filter not rendering:** the computed style contains a `url(#...)`, but the
  filter-on screenshot is pixel-equivalent to filter-off at a high-contrast
  edge, or only the border/shadow changes. This fails even if the CSS, unit
  tests, and build succeed.
- **Smear instead of lens:** straight lines are translated uniformly, blurred
  into fog, or stretched across the whole surface instead of bending at the
  bezel and enlarging through the centre. A gentle displacement ramp, a
  stretched map, or excess blur is a failure.
- **Wrong zoom direction:** spacing under the centre becomes smaller or the
  content is minified. The centre must magnify; the bezel must refract around
  it. A reversed map sign or channel mapping is a failure.
- **Map-size mismatch:** the filter images do not match the rendered lens
  dimensions, are stretched by CSS/SVG, or are reused after a geometry change
  without regeneration. This fails before visual tuning continues.
- **Fallback misrepresented:** Safari or Firefox is reported as having the
  Chromium refraction when it only has blur or a static treatment. The fallback
  must be labelled and reviewed separately.
- **Layout regression:** the lens changes the approved bottom safe-area
  padding, narrows the full-width legal-link run, clips the notchless video, or
  causes overlap in short-height, error, captcha, or safe-area states.

The acceptance record must contain filter-off and filter-on captures of the
same frame, a neutral colour check, a high-contrast straight-edge check, and a
centre-spacing check. If any rejection criterion is present, the visual lane
stops. No additional effect, opacity, gradient, or shadow may be added merely
to make the failed capture appear acceptable.

### Verification gates for the visual lane

The later glass release must begin with one isolated surface and must capture:

- a real Chromium render over the video or a structured test texture;
- a filter-off/filter-on A/B screenshot at the rim;
- a neutral white/grey/cool colour comparison proving there is no tan or warm
  cast introduced by the lens;
- a high-contrast straight-edge comparison proving the filter actually bends
  the backdrop rather than only changing opacity, blur, border, or shadow;
- a centre-spacing comparison proving magnification and rejecting minification
  or uniform translation;
- computed filter and filter-region evidence;
- map dimensions and rendered-lens dimensions;
- desktop and mobile screenshots, including the approved bottom padding;
- short-height, error, captcha, reduced-motion, and safe-area states;
- keyboard and screen-reader behaviour for any draggable or interactive lens;
- a performance measurement for map rebuilds and pointer movement;
- a non-Chromium fallback screenshot; and
- a rollback commit or feature flag that removes the lens without touching the
  safety release.

Computed CSS, a unit test, a successful build, or a screenshot that only shows
the border/shadow is not visual proof. Any tan cast, unchanged backdrop,
smearing, wrong zoom direction, map-size mismatch, false browser claim, or
layout regression rejects the lane. The failed capture must be retained with
the diagnosis so the next attempt does not repeat it.
The magnifying-glass experiment must not enter the urgent candidate and must
not change moderation, image URL, or privacy behavior implicitly.

\newpage

## Page 46 - Sign-off gates

The urgent release has seven gates, followed by a separate visual-lane gate that
does not reopen or weaken the urgent release.

**Gate A, source:** clean worktree, exact baseline, approved diff, no secrets, no UI contamination.

**Gate B, unit:** focused authentication, moderation, explicit classification, DL Mode, and privacy tests pass.

**Gate C, integration:** real Postgres and provider-boundary tests pass.

**Gate D, build:** server build, frontend build, security scan, and diff check pass.

**Gate E, staging:** staging health, migrations, API metadata, stable assets, authenticated smoke, and safe media behavior pass.

**Gate F, production:** exact candidate deploys, health remains stable, asset hash is consistent, and authenticated smoke passes.

**Gate G, post-release:** monitoring is active, no safety regression appears, and the sign-off record is complete.

**Visual-lane gate, deferred:** only after Gate G is complete, the Kube lens
has its own branch, isolated prototype, real-browser A/B proof, responsive map
evidence, fallback evidence, accessibility review, performance result, and
rollback path. The gate fails on any tan cast, non-rendering filter, smear,
minifying centre, map-size mismatch, false fallback claim, or landing-page
layout regression. Passing this gate does not imply that the lens is deployed.

Any failed gate blocks the next gate. A later passing gate cannot erase an earlier failed gate. The release owner must record the failure, action, result, and decision rather than silently rerunning until green.

\newpage

## Page 47 - Command reference

Commands are run from the clean release worktree only.

```bash
git status --short --branch
git fetch origin
git rev-parse --verify origin/main
git log --oneline --decorate -20
git diff --name-status origin/main...HEAD
git diff --check
```

Verification commands:

```bash
pnpm --dir server test
pnpm --dir server run build
pnpm test
pnpm run build
pnpm run security:check
```

Live checks must use safe output filters. Never print environment values blindly. Never use a shell command that expands a secret into a transcript. Never use destructive Git commands to clean the worktree. Deployment commands must be executed only after the staging gate and dry-run review are complete.

The release log must include command, timestamp, exit status, and interpretation. A command that is interrupted or hangs is recorded as incomplete, not successful.

\newpage

## Page 48 - Environment and secret handling

Classify every environment variable as public-safe, operational non-secret, or secret.

Public-safe values may include frontend-safe URLs and feature states intended for `/api/meta`. Operational non-secret values include provider enable flags, regions, thresholds, timeouts, deployment stages, and resource identifiers when safe to disclose. Secrets include API tokens, AWS keys, session tokens, passwords, signing keys, database URLs containing credentials, and private object-store credentials.

The release document must record variable names and intended roles without recording secret values. The operator must use the repository’s approved secret-handling workflow. Do not call prohibited secret retrieval APIs. Do not copy production credentials into chat, commits, screenshots, or broad local files.

When reporting provider configuration, state only whether a required value is present, absent, invalid, or unverified. When reporting Coolify state, redact authorization headers and token-like values. When reporting media behavior, use fixture identifiers or aggregate counts, never private URLs or raw bytes.

\newpage

## Page 49 - Evidence and reporting

The release report has separate sections for:

- source evidence;
- test evidence;
- build evidence;
- migration evidence;
- staging evidence;
- production deployment evidence;
- runtime behavior evidence;
- monitoring evidence;
- rollback evidence if used.

Each item includes timestamp, environment, command or URL, safe result, and interpretation. The report must state what was not verified. It must distinguish a mock provider test from a live AWS test, a component test from an authenticated browser smoke, and a public API metadata response from a user-level privacy check.

The report must include the final candidate SHA, the deployed API revision if available, the frontend asset hash, migration identifiers, safe provider flag state, and monitoring start time. It must not include complete emails, cookies, image URLs, signed URLs, tokens, or credentials.

The final handoff is concise even though this whitepaper is long. It identifies what shipped, what did not ship, what is live, what remains uncertain, what to monitor, and which UI lane comes next.

\newpage

## Page 50 - Final release checklist and handoff

The release is complete only when all applicable boxes are checked.

### Source

- [ ] clean release worktree;
- [ ] exact baseline recorded;
- [ ] approved diff reviewed;
- [ ] no mixed Claude branch;
- [ ] no UI-only files;
- [ ] no secrets or generated artifacts;
- [ ] no unrelated migrations.

### Safety and privacy

- [ ] provider outage fails closed;
- [ ] definitive rejection remains rejection;
- [ ] Rekognition fallback verified;
- [ ] alpha bypass inactive in production;
- [ ] explicit metadata propagates;
- [ ] unknown status masks;
- [ ] masked surfaces do not construct URLs;
- [ ] map paths are safe;
- [ ] message attachment behavior is correct;
- [ ] legacy classification limits are documented.

### Validation and deployment

- [ ] focused tests pass;
- [ ] real Postgres tests pass;
- [ ] builds pass;
- [ ] staging health is stable;
- [ ] authenticated staging smoke passes;
- [ ] exact candidate reaches production;
- [ ] runtime smoke passes;
- [ ] monitoring is active;
- [ ] rollback SHA and provider rollback are recorded.

### Deferred visual-lane gate

- [ ] filter-off/filter-on captures show actual backdrop displacement;
- [ ] neutral and cool source colours remain neutral, with no tan or warm cast;
- [ ] bezel edges bend and the centre magnifies rather than smearing or
      minifying;
- [ ] displacement, bezel, and specular maps match the rendered lens size;
- [ ] no compensating tint, blur, gradient, or shadow was added to disguise a
      failed filter;
- [ ] Chromium-only behaviour and non-Chromium fallback are labelled honestly;
- [ ] bottom safe-area padding and `width: 100%; max-width: 100%` legal links
      are unchanged;
- [ ] notchless video remains intact and no overlap appears in failing states;
- [ ] failed captures, if any, are retained with diagnosis before another run;
- [ ] visual sign-off is separate from urgent safety-release sign-off.

The handoff must state: shipped behavior, deferred UI, remaining risks, current live evidence, monitoring owner, rollback owner, and the next separately scoped UI task. No claim may be stronger than its evidence.
