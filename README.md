
  # cruushv1

  This is a code bundle for cruushv1. The original project is available at https://www.figma.com/design/bcpAsIBi712XzaX0bcoA5k/cruushv1.

  ## Running the code

  `npm run build` installs and builds the frontend.

  `npm run dev` starts the frontend only.

  `npm run dev:local` starts the local frontend, local API, and local database migrations together.

  ## Local development

  Local development is separate from staging. The local stack is:

  - frontend on `https://localhost:5173` by default, or `http://localhost:5173` when `VITE_DEV_HTTPS=0`
  - API on `http://localhost:3001`
  - Postgres on `localhost:5433`

  ### 1. Start local Postgres

  If you have Docker installed, you can use the bundled Postgres service:

  ```bash
  docker compose -f docker-compose.selfhost.yml up -d postgres
  ```

  If you do not have Docker, use Homebrew instead:

  ```bash
  brew install postgresql@16
  brew services start postgresql@16
  createdb cruush
  ```

  If `createdb cruush` fails because the `postgres` role does not exist, use the role created by your local Postgres install and update `DATABASE_URL` in `server/.env.local` to match.

  ### 2. Review local env defaults

  The local launcher reads these files in order:

  - `server/.env.example`
  - `server/.env`
  - `server/.env.local`
  - `.env.example`
  - `.env`
  - `.env.local`

  You only need to create override files when you want to change the defaults.

  Default local values are:

  - `DATABASE_URL=postgres://postgres:postgres@localhost:5433/cruush`
  - `PORT=3001`
  - `HOST=127.0.0.1`
  - `CORS_ORIGIN=http://localhost:5173,https://localhost:5173,http://127.0.0.1:5173,https://127.0.0.1:5173`
  - `APP_URL=https://localhost:5173`
  - `VITE_API_BASE_URL=` (blank; the Vite `/api` proxy reaches `http://localhost:3001`)

  ### 3. Optional override files

  If you want to override the defaults, create:

  - `.env.local` for frontend values
  - `server/.env.local` for backend values

  Example local backend override:

  ```bash
  PORT=3001
  HOST=127.0.0.1
  DATABASE_URL=postgres://postgres:postgres@localhost:5433/cruush
  CORS_ORIGIN=http://localhost:5173,https://localhost:5173,http://127.0.0.1:5173,https://127.0.0.1:5173
  SESSION_SECRET=change-me-in-local-dev
  APP_URL=https://localhost:5173
  ```

  ### 4. Run migrations and start the local stack

  ```bash
  npm run dev:local
  ```

  That command:

  - runs the server migrations
  - starts the local API
  - starts the frontend

  ### 5. Optional: seed local development profiles

  To add test profiles for the local map/feed experience, first enable the development admin in `server/.env.local`:

  ```bash
  DEVELOPMENT_ADMIN_ENABLED=true
  DEVELOPMENT_ADMIN_PASSWORD=admin-password
  ```

  Then run:

  ```bash
  npm --prefix server run seed:dev-profiles
  ```

  Or run the local stack with migrations and profile seeding in one command:

  ```bash
  npm run dev:local:seeded
  ```

  The seed command refuses to run in production. It creates or updates the local development admin at `admin@cruush.local`, seeds test profiles, and creates cruush activity toward that admin account. Use the password from `DEVELOPMENT_ADMIN_PASSWORD` to sign in locally.

  ### 6. Optional: seed NYC reviewer accounts

  To create dedicated NYC-located reviewer accounts for a non-NYC codeveloper or bank reviewer, set:

  ```bash
  REVIEWER_TEST_ACCOUNTS_ENABLED=true
  REVIEWER_TEST_ACCOUNT_PASSWORD=<share-this-out-of-band>
  PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD=paymentpaytest
  ```

  Then run:

  ```bash
  npm --prefix server run seed:reviewer-accounts
  ```

  The command creates or updates `codeveloper-nyc@cruush.local`, `bank-reviewer-nyc@cruush.local`, and `payment@cruush.local` with verified email status and saved NYC profile locations. The payment reviewer account uses `PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD` so the bank checkout login can be shared without sharing the internal codeveloper password. It refuses a plain production host; if `NODE_ENV=production`, `APP_URL` must be a staging/test/local host.

  ### 7. If you want auth emails to return to staging

  Set this in `server/.env.local`:

  ```bash
  APP_URL=https://staging.cruush.app
  ```

  That changes the callback target only. It does not change the staging deployment itself.

  ### 8. Staging deployment CORS

  The staging API must allow the exact browser origin that serves the app. Set the backend deployment env to include:

  ```bash
  CORS_ORIGIN=https://staging.cruush.app
  APP_URL=https://staging.cruush.app
  ```

  If production and staging share the same API deployment, include both origins in the comma-separated allowlist:

  ```bash
  CORS_ORIGIN=https://www.cruush.app,https://staging.cruush.app
  ```

  ### 9. Useful manual commands

  ```bash
  npm run dev
  npm --prefix server run dev
  npm --prefix server run migrate:dev
  npm --prefix server run seed:dev-profiles
  npm --prefix server run seed:reviewer-accounts
  npm run dev:local:seeded
  ```

  If you are using the Homebrew Postgres path, make sure `DATABASE_URL` points at your local database before running `npm run dev:local`.

  ## Map foundation

  The MVP map is available at `/map` after sign-in/onboarding. Run it locally with:

  ```bash
  npm run dev:local
  ```

  Map tiles default to a custom dark MapLibre vector style backed by OpenFreeMap. Map labels use the app's loaded Cormorant Garamond CSS font through MapLibre local glyph rendering, because the public OpenMapTiles glyph server does not provide real Cormorant Garamond PBFs. The style uses a high-contrast grey/black palette so NYC roads and street names stay readable without changing the Cruush map UI. You can override the map source in `.env.local`:

  ```bash
  VITE_MAP_STYLE_URL=
  VITE_MAP_VECTOR_TILEJSON_URL=https://tiles.openfreemap.org/planet
  VITE_MAP_GLYPHS_URL=
  VITE_MAP_TILE_URL=https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png
  VITE_MAP_ATTRIBUTION=&copy; CARTO &copy; OpenStreetMap contributors
  ```

  `VITE_MAP_STYLE_URL` takes priority when set, and it bypasses the in-app Cruush vector style, including Cormorant Garamond labels. `VITE_MAP_GLYPHS_URL` is optional and should only point at a self-hosted glyph endpoint that actually includes Cormorant Garamond stacks. `VITE_MAP_TILE_URL` switches the map back to a raster tile fallback and also bypasses the in-app Cormorant vector style. Do not put paid or secret map API keys in frontend env vars. Nearby markers come from the existing discovery API; the map screen does not create real-time presence, matching, messaging, or premium filters. Browser geolocation is requested only after tapping "Use my location," and exact coordinates are kept out of the UI. The current implementation snaps coordinates to an approximate area before map display and discovery refreshes.
  
