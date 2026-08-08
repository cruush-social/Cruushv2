# cruush Architecture Whiteboard

This is a source-of-truth whiteboard for the current app shape. It reflects the Vite React client, the self-hosted Fastify API, and the Postgres-backed data model that replaced the older Supabase runtime path.

Rendered version of the main graph:

![cruush architecture whiteboard](./architecture-whiteboard-main.png)

Editable SVG source: [architecture-whiteboard-main.svg](./architecture-whiteboard-main.svg)

```mermaid
flowchart LR
  subgraph Browser["Browser"]
    UI["React app\nsrc/app/App.tsx"]
    Screens["Map, Feed, Profiles,\nMessages, cruush, Settings"]
    ApiClient["API wrappers\nsrc/app/lib/*Api.ts"]
    LocalState["Local browser state\nsession cache + preview URLs"]
    MapLibre["MapLibre UI\nOpenFreeMap/CARTO tiles"]
  end

  subgraph Frontend["Vite Frontend"]
    Vite["Vite dev server\nlocalhost:5173"]
    Proxy["/api + /health proxy\nvite.config.ts"]
    Assets["Figma asset resolver\nsrc/assets"]
  end

  subgraph Api["Fastify API"]
    Server["buildServer()\nserver/src/app.ts"]
    Cors["CORS allowlist\nCORS_ORIGIN"]
    Errors["API error formatter\nserver/src/errors.ts"]
    RateLimiter["Postgres rate limiter\nserver/src/rate-limit.ts"]
    AuthRoutes["Auth routes\nserver/src/routes/auth.ts"]
    ProfileRoutes["Profile routes\nserver/src/routes/profiles.ts"]
    UserRoutes["Discovery routes\nserver/src/routes/users.ts"]
    MessageRoutes["Conversation/message routes\nserver/src/routes/messages.ts"]
    PostRoutes["Feed post routes\nserver/src/routes/posts.ts"]
    CruushRoutes["cruush routes\nserver/src/routes/cruush.ts"]
    Schemas["Zod boundary schemas\nserver/src/*-schema.ts"]
    Mailer["Email delivery / preview\nserver/src/mailer.ts"]
    Turnstile["Turnstile verification\nserver/src/turnstile.ts"]
    Privacy["Sensitive profile encryption\nand visibility tokens"]
  end

  subgraph Database["Postgres"]
    Users["app_users"]
    Sessions["app_sessions"]
    Profiles["profiles"]
    Tokens["email_verification_tokens\npassword_reset_tokens\nprofile_sensitive_tokens\nrate_limit_buckets"]
    Content["posts\ncruushes\nconversations\nconversation_members\nmessages"]
    Catalog["kink_catalog\nprofile_kink_interests"]
  end

  UI --> Screens
  Screens --> ApiClient
  Screens --> MapLibre
  ApiClient --> Vite
  Vite --> Proxy
  Proxy --> Server
  Server --> Cors
  Server --> Errors
  Server --> RateLimiter
  Server --> AuthRoutes
  Server --> ProfileRoutes
  Server --> UserRoutes
  Server --> MessageRoutes
  Server --> PostRoutes
  Server --> CruushRoutes
  AuthRoutes --> Schemas
  ProfileRoutes --> Schemas
  UserRoutes --> Schemas
  MessageRoutes --> Schemas
  PostRoutes --> Schemas
  CruushRoutes --> Schemas
  AuthRoutes --> Mailer
  AuthRoutes --> Turnstile
  ProfileRoutes --> Privacy
  UserRoutes --> Privacy
  Server --> Database
  AuthRoutes --> Users
  AuthRoutes --> Sessions
  AuthRoutes --> Tokens
  ProfileRoutes --> Profiles
  ProfileRoutes --> Catalog
  ProfileRoutes --> Tokens
  UserRoutes --> Profiles
  UserRoutes --> Tokens
  MessageRoutes --> Content
  PostRoutes --> Content
  CruushRoutes --> Content
  RateLimiter --> Tokens
```

## Runtime Shape

| Layer | Current implementation |
| --- | --- |
| Client shell | `src/main.tsx` mounts `src/app/App.tsx`; app routing is handled with `react-router`. |
| Primary UI routes | `/map`, `/feed`, `/profile`, `/profile/edit`, `/filters`, `/safety`, `/messages`, `/cruush`, `/settings`, `/lucky`, `/requests`. |
| API client | `src/app/lib/apiClient.ts` sends JSON requests with `credentials: 'include'`; feature-specific wrappers live in `src/app/lib/*Api.ts`. |
| Dev proxy | `vite.config.ts` forwards `/api` and `/health` to `http://127.0.0.1:3001`. |
| API server | `server/src/app.ts` builds a Fastify app, registers CORS, error handling, DB, rate limiter, and route modules. |
| Storage | Postgres via `server/src/db.ts`; schema migrations live in `server/sql/*.sql`. |
| Local stack | `npm run dev:local` runs migrations, API on `localhost:3001`, frontend on `localhost:5173`, and Postgres on `localhost:5432`. |

## Main Product Flows

### Auth And Session

```mermaid
sequenceDiagram
  participant User
  participant React as React App
  participant API as Fastify Auth Routes
  participant DB as Postgres
  participant Mail as Mailer/Preview
  participant Captcha as Turnstile

  User->>React: Sign up or sign in
  React->>API: POST /api/auth/signup or /api/auth/login
  API->>Captcha: Verify captcha token when configured
  API->>DB: Create/read app_users and app_sessions
  API->>Mail: Send verification/reset email when needed
  API-->>React: Session payload + HttpOnly cruush_session cookie
  React->>API: GET /api/auth/me
  API->>DB: Resolve hashed session token
  API-->>React: User + profile + onboarding state
```

Key files:

- `server/src/routes/auth.ts`
- `server/src/auth.ts`
- `server/src/auth-schema.ts`
- `src/app/lib/authApi.ts`
- `src/app/lib/sessionUser.ts`

### Map Discovery

```mermaid
flowchart LR
  MapHome["MapHome / MapView"] --> Location["Browser geolocation\nuser initiated"]
  Location --> PrivacyClient["Client location privacy helpers"]
  PrivacyClient --> UsersApi["GET /api/users\nfilters + optional coords"]
  UsersApi --> UserRoutes["server/src/routes/users.ts"]
  UserRoutes --> Visibility["profile-visibility.ts\nsensitive token matching"]
  Visibility --> Profiles["profiles + profile_sensitive_tokens"]
  UserRoutes --> Response["DiscoveryUser[]"]
  Response --> MapLibre["MapLibre markers + profile popups"]
```

The map does not own real-time presence. Nearby users come from the discovery API, with client-side controls for location sharing and server-side visibility checks.

Key files:

- `src/app/components/MapHome.tsx`
- `src/app/components/MapLibreMap.tsx`
- `src/app/lib/usersApi.ts`
- `src/app/lib/locationPrivacy.ts`
- `server/src/routes/users.ts`
- `server/src/profile-visibility.ts`

### Profiles, Privacy, And Sensitive Data

```mermaid
flowchart TB
  Edit["ProfileEdit / ProfileOnboarding"] --> Payload["ProfilePayload"]
  Payload --> Api["PUT /api/profiles/me"]
  Api --> Validate["profilePayloadSchema"]
  Validate --> Split["Split public fields from sensitive fields"]
  Split --> Public["profiles columns"]
  Split --> Encrypted["AES-GCM encrypted sensitive payload"]
  Split --> BlindTokens["profile_sensitive_tokens\nnon-reversible query tokens"]
  Api --> Visibility["visibility rules encrypted/tokenized"]
  Visibility --> Read["GET /api/profiles/:userId"]
  Read --> Authz["viewer authorization"]
  Authz --> Redacted["redacted or decrypted response"]
```

Sensitive profile fields are encrypted at the application layer when they do not need direct database filtering. Fields that need match/filter behavior use keyed token hashes instead of plaintext.

Key files:

- `server/src/routes/profiles.ts`
- `server/src/profile-schema.ts`
- `server/src/profile-sensitive.ts`
- `server/src/profile-visibility.ts`
- `docs/sensitive-data-encryption-plan.md`
- `docs/rotating-encrypted-token-system-white-paper.md`

### Messaging, Feed, And cruush Activity

```mermaid
flowchart LR
  Client["React screens"] --> Messages["/api/conversations\n/api/messages"]
  Client --> Posts["/api/posts"]
  Client --> cruush["/api/cruush"]
  Messages --> MsgTables["conversations\nconversation_members\nmessages"]
  Posts --> PostTable["posts"]
  cruush --> CruushTable["cruushes"]
  MsgTables --> Client
  PostTable --> Client
  CruushTable --> Client
```

Current social surfaces are request/response API workflows over Postgres tables. There is no WebSocket or background job layer in the checked-in runtime.

Key files:

- `server/src/routes/messages.ts`
- `server/src/routes/posts.ts`
- `server/src/routes/cruush.ts`
- `src/app/lib/messagesApi.ts`
- `src/app/lib/postApi.ts`
- `src/app/lib/cruushApi.ts`

### Photo Upload And NSFW Moderation Target

```mermaid
flowchart LR
  Upload["Profile photo upload"] --> Api["Backend upload endpoint"]
  Api --> Temp["Private temp/original object"]
  Temp --> Detector["Open-source NSFW detector\nNudeNet target"]
  Detector --> Decision{"Moderation result"}
  Decision -->|low risk| Variants["Generate approved display variants"]
  Decision -->|explicit adult| Blur["Generate blurred NSFW variant\nmark explicit"]
  Decision -->|uncertain/prohibited| Review["Automated safety hold or rejection"]
  Variants --> Publish["Profile photos visible in app"]
  Blur --> Publish
  Review --> Reject["Reject/remove asset"]
```

Photo moderation is not implemented in the checked-in runtime yet. The target is backend-side detection during upload, before a photo URL is written into `profiles.photos`. NudeNet is the preferred open-source detector because it can identify explicit body-part regions, which supports blur/reject/review flows better than a single safe/unsafe classifier.

Moderation policy target:

- Run detection server-side only; do not trust frontend moderation.
- Store originals privately and publish only approved/resized/blurred variants.
- Keep per-photo moderation metadata separate from the profile text model.
- Blur explicit photos by default unless the viewer enables explicit content.
- Use an automated fail-closed band for uncertain detector scores.
- Treat detector, Stream, and PhotoDNA output as automod signals, not a legal/compliance guarantee.

Suggested score bands:

| Detector score | Default action |
| --- | --- |
| `< 0.45` | allow after normal upload checks |
| `0.45 - 0.85` | block upload or retry automod; do not publish |
| `>= 0.85` | reject or apply feature/account enforcement depending on policy class |

Future key files:

- `server/src/routes/media.ts`
- `server/src/media-moderation.ts`
- `server/sql/018_media_assets.sql`
- `server/sql/019_media_moderation_events.sql`

## Boundary Rules

- API inputs should be parsed at the route boundary with Zod schemas from `server/src/*-schema.ts`.
- Route handlers should call `request.requireUser`-style session checks before user-owned reads or writes.
- The API emits formatted error bodies through `server/src/errors.ts`; the client turns those into `ApiClientError`.
- Rate limiting is app-injected and Postgres-backed through `server/src/rate-limit.ts` and `server/sql/017_rate_limit_buckets.sql`.
- Public frontend env vars are not secret. Backend-only secrets live in server env: `SESSION_SECRET`, `TURNSTILE_SECRET_KEY`, `PROFILE_ENCRYPTION_KEY`, `PROFILE_TOKEN_KEY`, `RESEND_API_KEY`.
- Future media moderation should run behind backend-only model/runtime configuration; no moderation bypass or detector keys should ship to the frontend.

## Deployment Sketch

```mermaid
flowchart LR
  Browser["Browser"] --> Static["Static Vite build\nserved by web host / nginx"]
  Browser --> ApiHost["Fastify API host\nserver Dockerfile"]
  ApiHost --> Postgres["Postgres 16"]
  ApiHost --> Email["Resend or email preview"]
  ApiHost --> Turnstile["Cloudflare Turnstile"]
  Static -. local dev .-> ViteProxy["Vite proxy\n/api -> localhost:3001"]
```

The repo includes `Dockerfile`, `server/Dockerfile`, `nginx.conf`, and `docker-compose.selfhost.yml`. The current local/self-hosted target is intentionally small: static frontend, Fastify API, Postgres, optional mail/CAPTCHA integrations, and object storage later when photo upload moves off the current design/runtime path.
