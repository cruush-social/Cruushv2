# cruush v2 — Security Review

**Scope:** `Cruushv2-main` (1,238 files; ~48k LOC Fastify/Postgres server, ~81k LOC React frontend, 161 SQL migrations)
**Method:** Static source review, data-flow tracing, authorization matrix construction across all 24 route modules. No live target, no network access — so **no dependency CVE scan and no dynamic testing were performed**.
**Date:** 12 September 2026

---

## Executive summary

This is a well-built codebase. The fundamentals that usually fail in a young product are correct here: no SQL injection anywhere in ~20k lines of hand-written SQL, sound session management, real CSRF defense-in-depth, uploads re-encoded through sharp rather than trusted, and a location-privacy model that defaults to ghost mode and fails closed. The moderation media grant system is genuinely excellent engineering.

The problems that remain are concentrated in three places:

1. **Privileged access is under-segmented.** A hardcoded personal Gmail address is a platform-wide superuser, the `moderator` role has nearly the same power as `admin`, and a static shared secret guards the CSAM tooling.
2. **One upload path bypasses the entire safety pipeline.** Suspension-appeal evidence is accepted unauthenticated, unsanitized, and unscreened, then delivered straight to a moderator's browser.
3. **Secrets leak into logs.** Password-reset and email-verification tokens are written to application logs by the request-logging hook.

Nothing here is a remote code execution or a mass data breach. But findings H1–H5 each represent a path from a single compromised credential — or a single misconfigured environment variable — to full platform control or to a serious trust-and-safety incident.

**Counts:** 5 High · 12 Medium · 16 Low · 3 Informational

---

## High severity

### H1 — Hardcoded owner superuser account

**Location:** `server/src/owner-access.ts:5`, `server/src/moderator-auth.ts:24`, `server/sql/050_owner_full_access_account.sql`

```ts
export const OWNER_FULL_ACCESS_EMAIL = "julienlenazny@gmail.com";
```

This address is granted implicit `admin` in `getModeratorUser` **with no `moderator_users` row required**, and bypasses account-status enforcement in `request-auth.ts`, `routes/auth.ts`, and the admin moderation routes.

**Impact.** A single personal Gmail account is a total-compromise path for the platform: the moderation queue, every user's private media, government-ID appeal evidence, and the CSAM incident tooling. The address is hardcoded in source and repeated across four SQL migrations, so an attacker reading the repo knows exactly which account to target. Personal Gmail accounts are a soft target (SIM swap, credential stuffing, recovery-flow attacks) compared to a managed identity.

**Mitigating factors.** Email change requires a token delivered to the new address, so the account cannot be claimed by an attacker. `authEmailSchema` lowercases all input, so the case-collision variant (`JULIENLENAZNY@gmail.com` registering as a distinct row that still matches the lowercased comparison) is blocked at the API layer.

**Remediation.**
- Replace the constant with a `moderator_users` row carrying `role = 'admin'`.
- Until then: enforce hardware-key 2FA on that account and monitor it.
- Note the DB unique index is on raw `email` (case-sensitive) while all comparison code lowercases — the app layer is the only thing preventing collisions. Add a `unique index on lower(email)` as defense in depth (`061_moderator_account_bans.sql:52` already creates a non-unique one).

---

### H2 — Header-based identity spoofing gated only on `NODE_ENV`

**Location:** `server/src/request-auth.ts:101`, `:137`, `:171`

All three authentication resolvers accept an arbitrary caller-supplied header as identity:

```ts
if (request.server.config.NODE_ENV === "test") {
  if (parsedHeaders.success) {
    return parsedHeaders.data["x-user-id"];
  }
}
```

**Impact.** If `NODE_ENV` is ever unset, misspelled, or set to `test` in a deployed environment, **any unauthenticated request can impersonate any user** by sending `x-user-id: <uuid>`. There is no secondary guard. The blast radius is total: read anyone's messages, change anyone's profile, delete anyone's account.

**Remediation.** Gate on a dedicated flag (e.g. `AUTH_TEST_HEADER_ENABLED`) that the production `superRefine` in `config.ts` explicitly rejects — the same pattern already used correctly for `BILLING_TEST_CHECKOUT_ENABLED` (`config.ts:744`). Better still, compile the branch out of production builds entirely.

---

### H3 — CSAM and trust tooling behind a single static header secret

**Location:** `server/src/routes/internal.ts:81`

```ts
function assertInternalAccess(app, headerValue) {
  const configuredSecret = app.config.INTERNAL_API_SECRET ?? "";
  // ... sha256 + timingSafeEqual
}
```

Endpoints behind this check, all on the **public API surface**:

| Endpoint | Exposes |
|---|---|
| `GET /api/internal/csam-incidents/:id` | CSAM incident detail |
| `GET /api/internal/csam-incidents/:id/report-packet` | Full NCMEC report packet |
| `POST /api/internal/csam-incidents/:id/mark-submitted` | Incident state mutation |
| `GET /api/internal/users/:userId/trust` | Per-user trust scoring |
| `GET /api/internal/profile-photo-reviews/:id/image` | Decrypted user photos |

**Impact.** The comparison itself is correct (SHA-256 digest + `timingSafeEqual`, no length leak). The problem is everything around it: a single long-lived bearer secret, no rotation mechanism, no IP restriction, no mTLS, and — critically — **no minimum length enforced in production**. `INTERNAL_API_SECRET` defaults to `""` and is only length-checked when `BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED` is true (`config.ts:435`). An empty secret fails closed (the `!configuredSecret` check), but a four-character secret passes validation and is brute-forceable within the 60 req/min rate limit given enough time and IPs.

**Remediation.**
- Add `INTERNAL_API_SECRET` length ≥ 32 to the unconditional production `superRefine` block.
- Move `/api/internal/*` onto a private network interface or add an IP allowlist at nginx.
- Define a rotation procedure.

---

### H4 — Unauthenticated upload path bypasses the entire media safety pipeline

**Location:** `server/src/routes/support.ts:128–280`

`POST /api/support-requests/suspension-appeal` accepts two image uploads (a government ID photo and a selfie). Compared to every other upload path in the application:

| Control | Profile / message / feed photos | Suspension appeal evidence |
|---|---|---|
| Authentication | `getActiveAccountUserId` (required) | `getOptionalAuthenticatedUserId` (**optional**) |
| MIME determination | Sniffed via `sharp().metadata()` | **Trusted from client multipart header** |
| Re-encode / EXIF strip | `sanitizeProfilePhoto` (sharp) | **None — raw bytes stored** |
| Pixel-bomb limit | `limitInputPixels: 40M` | **None** |
| Rekognition / Stream automod | Yes, fails closed | **None** |
| PhotoDNA screening | Yes when enabled | **None** |
| Rate limit | 10/min per user | 2/day per IP |

The raw buffer is encrypted (`encryptMediaBytes`) and stored, then served to a moderator at `GET /api/admin/moderation/support-requests/:requestId/appeal-evidence/:evidenceType` with `reply.type(evidence.mime_type)` — the client-declared type.

**Impact.** Two distinct problems:

1. **Trust & safety.** An unauthenticated attacker can push arbitrary imagery — including CSAM — directly into an encrypted store that a human moderator will open, entirely bypassing the moderation pipeline the rest of the application deliberately fails closed on. For a platform with CSAM reporting obligations (`030_csam_incident_reporting.sql`, `CSAM_REPORTING_ENABLED`), this is an inbound channel with no screening. The 2/day/IP limit is defeated with a proxy pool.
2. **Data hygiene.** Because there is no re-encode, EXIF is retained — the GPS coordinates embedded in a user's selfie or ID photo are stored verbatim. This is the opposite of what the rest of the codebase does, and it is precisely the metadata the ghost-mode system exists to protect.

**Remediation.**
- Require authentication, or at minimum require a valid suspended-account session token.
- Route the buffers through `processUploadedImage()` like every other upload — this alone fixes MIME sniffing, EXIF, and pixel bombs.
- Run appeal evidence through the same PhotoDNA/Rekognition screening as profile photos before it reaches a moderator's queue.
- Serve with `Content-Disposition: attachment` and the *detected* MIME type, not the declared one.

---

### H5 — Password-reset and email-verification tokens written to application logs

**Location:** `server/src/app.ts:96` (request-logging hook) + `server/src/routes/auth.ts:468`, `:474`, `:480`

```ts
app.addHook("onRequest", (request, _reply, done) => {
  if (request.url !== "/health") {
    request.log.info({ req: request }, "incoming request");
  }
  done();
});
```

Fastify's default `req` serializer logs `request.url`, which **includes the query string**. The auth module exposes three GET redirect routes that carry secrets in the query:

```
GET /reset-password?token=<password reset token>
GET /verify-email?token=<email verification token>
GET /confirm-email?token=<email change token>
```

**Impact.** Every password-reset link a user clicks writes a live, unexpired reset token to stdout, where it is collected by Coolify's log retention. Anyone with log-read access — an operator, a support contractor, a compromised logging pipeline, or an attacker with read-only container access — can take over any account whose owner recently clicked a reset link. Reset tokens have a real TTL and a `hashSessionToken` lookup, so possession is sufficient. Reverse-proxy access logs compound this.

The team is clearly aware of this class of bug: `routes/moderation-media.ts:32` sets `logLevel: "silent"` on the capability-token route for exactly this reason. It simply wasn't applied to the auth token routes.

**Remediation.**
- Set `logLevel: "silent"` on the three GET token routes, or
- Install a custom `serializers.req` that strips query strings globally (preferred — it also covers future routes).
- Confirm nginx `access_log` does not record query strings for these paths.
- Rotate/invalidate outstanding reset tokens and purge retained logs once fixed.

**Credit where due:** the *client-side* equivalent is handled correctly. `getSanitizedAnalyticsPath()` (`src/app/lib/analyticsPath.ts`) applies a query-parameter **allowlist** and normalizes dynamic path segments before anything reaches PostHog, so tokens landing in the browser URL are not forwarded to third parties. That is a control most teams miss.

---

## Medium severity

### M1 — Password verification runs before rate limiting
**`server/src/routes/auth.ts:818`** — `verifyPassword()` (scrypt: 32 MB, ~100 ms) executes on *every* login attempt; `applyRateLimits` is only consulted inside the failure branch afterwards. An attacker can saturate CPU with repeated POSTs even after the bucket is exhausted, since the expensive work happens before the 429 is thrown.
**Fix:** assert the IP bucket before the user lookup and hash.

### M2 — scrypt at Node defaults
**`server/src/auth.ts:27`** — `scrypt(password, salt, 64)` uses N=16384. OWASP's current floor for scrypt is N=2¹⁷. Salt handling, encoding, and `timingSafeEqual` comparison are all correct; only the cost parameter is low.
**Fix:** pass explicit `{ N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }`; rehash opportunistically on next successful login. Note this raises the cost of M1 — fix M1 first.

### M3 — `moderator` role has near-total power; no peer protection
**`server/src/routes/admin-moderation.ts`** — Of 20 admin endpoints, exactly one (`beta-city-requests`, line 1355) checks `role === "admin"`. Both roles can suspend any account, publish site-wide announcements, view any user's private media, and open government-ID appeal evidence. Self-suspension (`:1716`) and owner-suspension (`:1727`) are blocked, but **nothing prevents a moderator from suspending another moderator**. Economic actions (`POST /api/admin/rewards/grants/:grantId/reverse`) are likewise moderator-accessible.
**Fix:** gate ID-viewing, announcements, and reward reversal behind `admin`. Refuse status changes targeting any `moderator_users` row unless the actor is an admin.

### M4 — `isSchemaCompatibilityError` matches on error message substrings
**`server/src/routes/users.ts`, `server/src/development-admin.ts:56`, `server/src/routes/profiles.ts`**
```ts
message.includes("column") || message.includes("relation") ||
message.includes("operator does not exist") || message.includes("does not exist")
```
Any Postgres error whose text contains "does not exist" is swallowed and silently routed to a legacy fallback path — including the discovery path that decides which coordinates get returned. In `development-admin.ts` the error is dropped entirely.
**Fix:** match on SQLSTATE codes only (`42703`, `42P01`, `42883`); delete the message-substring branch.

### M5 — Unauthenticated, unthrottled write endpoint
**`server/src/routes/beta-access.ts:31`** — `POST /api/beta/city-requests` has no authentication, no captcha, and no rate limit. Unbounded row insertion (storage exhaustion) plus a channel for poisoning the marketing email list. The unique index on `(email, city)` limits exact duplicates only; an attacker varies either field.
**Fix:** add IP-keyed rate limiting and Turnstile verification.

### M6 — Captcha silently disabled by default
**`server/src/turnstile.ts:12`** — `verifyTurnstileToken` returns early when `TURNSTILE_SECRET_KEY` is empty, and **nothing in the production `superRefine` requires it**. If unset in production, signup and login are captcha-free. Additionally: the `fetch` has no timeout (a slow Cloudflare response hangs the request), and the `hostname` field in the siteverify response is not validated, so a token minted against the same sitekey on another origin is accepted.
**Fix:** require `TURNSTILE_SECRET_KEY` in production config; add `AbortSignal.timeout()`; validate `result.hostname`.

### M7 — `verifyClientSecurityCheck` is bypassed by omission
**`server/src/client-security-check.ts:14`** — returns early if the `clientCheck` field is absent. Any bot that simply omits the field skips the honeypot and timing checks entirely. The control provides no meaningful protection as written.
**Fix:** make the field required by the zod schema on signup/login.

### M8 — No rate limit or plausibility check on location updates
**`server/src/routes/profiles.ts:2118`** — `PUT /api/profiles/me/location` accepts arbitrary coordinates with no throttle and no speed/teleport validation. Unlimited free position samples is the precondition for trilateration and ghost-anchor averaging attacks. The anchor design (`location-privacy.ts:195`, tangential drift around an offset anchor) and `ghost-rotation-averaging.test.ts` show the attack was anticipated, but removing the rate of sampling removes the attacker's main cost.
**Fix:** rate-limit per user and reject implausible jumps (distance ÷ elapsed time above a threshold).

### M9 — SSRF allowlist is name-based and has an IPv6 bypass
**`server/src/input-schema.ts:59`** — `isUnsafePublicUrlHostname` inspects the hostname *string*, not the resolved address:
- An attacker-controlled domain with an `A` record pointing at `10.0.0.5` passes.
- The IPv6 branch only tests `fe80:` / `fc` / `fd` prefixes, so **`https://[::ffff:7f00:1]/`** (IPv4-mapped 127.0.0.1) is accepted.
- `100.64.0.0/10` (CGNAT, common in cloud service meshes) is not covered.

Reachable via push-subscription endpoints (`routes/notifications.ts:51`) and place `sourceUrl`. Blind SSRF only — no response body is returned to the attacker — so impact is internal network probing rather than exfiltration. Decimal/octal IP literals are handled correctly by WHATWG URL normalization.
**Fix:** resolve the hostname and validate every returned address, or pin push endpoints to known provider hosts (`*.push.services.mozilla.com`, `fcm.googleapis.com`, `*.notify.windows.com`).

### M10 — Containers run as root
**`Dockerfile`, `server/Dockerfile`** — neither image sets a `USER` directive.
**Fix:** add `USER node` to the server runner stage; run nginx as non-root (`nginxinc/nginx-unprivileged`).

### M11 — Control plane exposed over plaintext HTTP
**`docs/beta-launch-coolify-env-local-2026-07-31.sh`** — `COOLIFY_API_BASE_URL="http://87.99.130.8:8000/api/v1"`. The API token is not committed, but it is transmitted over that cleartext channel on every deploy, and the host IP plus project/environment/application UUIDs are in the repo.
**Fix:** put the Coolify control plane behind TLS and a VPN or IP allowlist; rotate the API token.

### M12 — Unbounded in-memory geocode cache
**`server/src/routes/privacy.ts:128`** — `travelAddressCache` is a `Map` with a 7-day TTL, **no size cap and no eviction sweep**. Each distinct query string (up to 200 chars) adds a permanent-for-a-week entry. At 20 queries/hour/user across the user base this grows monotonically until the process OOMs.
**Fix:** cap the map size with LRU eviction, or sweep expired entries on write (the rate limiter already uses a `SWEEP_INTERVAL` pattern that could be reused).

---

## Low severity

| # | Finding | Location |
|---|---|---|
| L1 | `deriveKey` v1 path is a single unsalted SHA-256, not HKDF — and **every** `*_KEY_VERSION` defaults to `"v1"`, so all production data uses the legacy derivation. Rotate to v2. | `crypto-keys.ts:4` |
| L2 | Encryption keys silently fall back to `SESSION_SECRET` when unset. Production config blocks this, but the fallback should throw rather than reuse. | `content-encryption.ts:31`, `two-factor.ts:53` |
| L3 | `parseCookies` calls `decodeURIComponent` unguarded — a malformed cookie (`cruush_session=%`) throws `URIError`, producing a 500 on every request from that client. | `auth.ts:118` |
| L4 | LIKE patterns are not escaped, so user-supplied `%` / `_` run unanchored scans across ~17 array columns per row. Performance, not injection. | `routes/users.ts:391` |
| L5 | `/health` executes a DB query on every unauthenticated request with no throttle. | `app.ts:207` |
| L6 | `shouldUseSecureCookies` trusts the `x-forwarded-proto` header outside production. | `auth.ts:60` |
| L7 | Password reset revokes sessions and reset tokens (good) but does not disable 2FA or send a change notice to the address on file. Email *change* does send a notice — apply the same pattern. | `routes/auth.ts:953` |
| L8 | `TRUST_PROXY_HOPS` defaults to `0`. Behind a proxy with the default, every IP-keyed rate limit collapses to the proxy's single IP — one attacker locks out all signups. Verify the deployed value. | `config.ts:120` |
| L9 | `clear-for-everyone` wipes history for an entire group and is available to **any member**, not just admins — the only destructive group action not gated on `assertGroupAdmin`. | `routes/messages.ts:1173` |
| L10 | TOCTOU: `assertGroupAdmin` and the subsequent `UPDATE` run as separate queries outside a transaction. Narrow window. The `DELETE /api/messages/:messageId` handler shows the correct pattern (authorization enforced inside the CTE). | `routes/messages.ts:993`, `:1123` |
| L11 | `SECURITY.md` vulnerability contact is the placeholder `security@yourdomain.com` — inbound disclosure has nowhere to go. The same file publishes AWS account ID `741180448899` and an IAM user name. | `SECURITY.md` |
| L12 | Moderation media grant tokens are bearer capabilities shared with a third party (Stream) and live in their logs for their retention period. The 90s TTL and single-use redemption limit this well; confirm Stream's retention policy. | `moderation-media-grants.ts` |
| L13 | The geocode proxy serializes **all** requests process-wide through a single promise chain with 1.1 s minimum spacing. A few accounts can make the endpoint take minutes; the design also breaks across multiple server instances. | `routes/privacy.ts:129` |
| L14 | Email uniqueness relies on the API layer lowercasing (`authEmailSchema`). The DB unique index is on raw `email`. Any future insert path bypassing the zod schema reintroduces case-collision risk — which matters because H1's comparison is case-insensitive. | `sql/001_init.sql:5` |
| L15 | Travel destination searches are forwarded to Nominatim (OpenStreetMap) with the user's raw query. For a cruising app, a user's intended destination is sensitive; worth disclosing in the privacy policy. | `routes/privacy.ts:158` |
| L16 | GitHub Actions are pinned to major tags (`actions/checkout@v4`) rather than commit SHAs. | `.github/workflows/regression-gates.yml` |

---

## Informational

- **No real payment processor is wired up.** `/api/billing/plans` hardcodes `processor: "fake"`, and `completeFakeCheckoutSession` is correctly gated behind `BILLING_TEST_CHECKOUT_ENABLED`, which production config rejects (`config.ts:744`). The guard is right; the consequence is that in production a user can create a checkout session that can never be completed. Product state, not a vulnerability.
- **No dependency CVE scan was possible** (no network). Installed versions look current — `fastify 5.8.5`, `pg 8.23.0`, `sharp 0.34.5`, `zod 4.4.3`, `esbuild 0.25.12`, `otplib 13.4.1`. The `pnpm.overrides` block pinning `nanoid`, `tar`, `ws`, `postcss`, `@babel/core` reads like deliberate CVE remediation. Run `pnpm audit` and `npm audit --prefix server` to close this gap.
- **Verify `purgeLegacyLocationColumns` ran in production.** It is a one-shot script (`backfill-encrypted-location-privacy.ts:113`). If it never executed, pre-migration-020 plaintext coordinates still sit in `profiles.lat` / `fuzzy_lat`, where the legacy discovery fallback could read them.

---

## What the codebase does well

Listing these because they represent real engineering investment and should not be regressed during remediation.

**No SQL injection.** Every dynamic fragment traced — `placeOrder()` (whitelist), `addProfileSearchFilter` (`$n` placeholders), `where.join()`, column-list interpolation — is either a fixed whitelist or parameterized. This holds across ~20k lines of hand-written SQL with no ORM.

**Session management.** 32 bytes from `randomBytes`, SHA-256 hashed at rest, looked up by hash, `HttpOnly` / `SameSite=Lax` / `Secure`, properly cleared, and revoked on password reset.

**CSRF defense-in-depth.** Strict CORS allowlist with `credentials: true` and no origin reflection, **plus** an explicit `Origin`/`Referer` check on every state-changing method (`app.ts:150`).

**Upload handling (the main pipeline).** MIME sniffed via sharp metadata rather than trusted; re-encoded through sharp, which strips EXIF and defeats polyglots; `limitInputPixels` caps decompression bombs; animated images rejected; declared type cross-checked against detected type with sensible aliasing.

**Moderation media grants** (`moderation-media-grants.ts`) — the strongest code in the repo. Single-use capability tokens, 256-bit, hashed at rest, 90-second TTL, redemption via atomic `UPDATE ... WHERE redeemed_at IS NULL RETURNING` (no TOCTOU), `logLevel: "silent"` so tokens never reach logs, and the asset is destroyed if decryption fails.

**Location privacy.** `buildDefaultVisibilityPolicy` defaults to `GHOST`. `buildFailClosedVisibilityPolicy` degrades to `STEALTH` when a policy cannot be decrypted — fail-closed on the privacy path. `formatDistanceLabel` returns `"Nearby"` unless both parties opted into precise labels. Display location tokens are AEAD-encrypted per-viewer with a browser-held derived key, so a token is useless to anyone but its intended recipient. Production location writes touch only encrypted envelopes.

**Profile visibility** is enforced on the direct-fetch path, not just discovery — `assertProfileRowVisibleToViewer` fails closed when the viewer subject cannot be loaded, and kink visibility is separately gated on mutual-crowd / mutual-cruush state.

**Messaging authorization.** All 24 endpoints enforce membership, either through `assertGroupAdmin` / `loadConversationForUser` or — better — inside the SQL itself, as in the `DELETE /api/messages/:messageId` CTE.

**Signed moderation URLs.** Canonical claim string, HMAC-SHA256, `timingSafeEqual`, TTL bounds, format validation before comparison.

**2FA.** Encrypted TOTP secrets, replay protection via `last_used_time_step`, hashed single-use recovery codes.

**Analytics hygiene.** Query-parameter allowlist and dynamic-path normalization before anything reaches GA or PostHog; autocapture, session recording, and pageview capture all disabled.

**CSP.** `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, hash-based inline scripts, and security headers correctly repeated in the `/assets/` location block (nginx `add_header` does not inherit).

**CI.** `pull_request` rather than `pull_request_target`, `permissions: contents: read`, no secrets in fork-triggered jobs, no `${{ github.event.* }}` interpolated into `run:`. `pnpm.onlyBuiltDependencies` restricting lifecycle scripts to two packages is real supply-chain hardening.

**Existing tooling.** `scripts/security-check.sh` already catches committed `.env` files, private key material, and `VITE_*SECRET` leakage into the frontend bundle.

---

## Suggested remediation order

**Week 1 — single-credential compromise paths**
1. H2 — move the `x-user-id` bypass behind a production-rejected flag *(one-line config change, catastrophic if it drifts)*
2. H5 — silence query strings in request logs; rotate outstanding reset tokens *(one-line fix, live exposure)*
3. H1 — replace the hardcoded owner constant with a `moderator_users` row; enforce hardware 2FA in the interim
4. L11 — fix the `SECURITY.md` contact *(one minute; it is the only inbound disclosure channel)*

**Week 2 — trust & safety**
5. H4 — authenticate, sanitize, and screen suspension-appeal uploads
6. H3 — enforce `INTERNAL_API_SECRET` length in production; network-restrict `/api/internal/*`
7. M3 — separate `admin` from `moderator`; block moderator-on-moderator suspension

**Week 3 — hardening**
8. M1 then M2 — rate-limit before hashing, then raise scrypt cost
9. M6, M7, M5 — restore the anti-automation controls
10. M4 — SQLSTATE-only error matching
11. M8, M9, M10, M11, M12

**Ongoing**
- Run `pnpm audit` / `npm audit --prefix server` in CI and fail the build on High.
- Add authorization regression tests for the role-separation matrix in M3 — the codebase already has strong test coverage in this area (`severe-access-bans.test.ts`, `ghost-mode-distance-leak.test.ts`, `moderation-fail-closed.smoke.test.ts`), so this fits existing practice.
