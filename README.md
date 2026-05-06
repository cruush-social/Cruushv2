
  # cruushv1

  This is a code bundle for cruushv1. The original project is available at https://www.figma.com/design/bcpAsIBi712XzaX0bcoA5k/cruushv1.

  ## Running the code

  `npm run build` installs and builds the frontend.

  `npm run dev` starts the frontend only.

  `npm run dev:local` starts the local frontend, local API, and local database migrations together.

  ## Local development

  Local development is separate from staging. The local stack is:

  - frontend on `http://localhost:5173`
  - API on `http://localhost:3001`
  - Postgres on `localhost:5432`

  ### 1. Start local Postgres

  The repo already includes a local Postgres service:

  ```bash
  docker compose -f docker-compose.selfhost.yml up -d postgres
  ```

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

  - `DATABASE_URL=postgres://postgres:postgres@localhost:5432/cruush`
  - `PORT=3001`
  - `HOST=0.0.0.0`
  - `CORS_ORIGIN=http://localhost:5173`
  - `APP_URL=http://localhost:5173`
  - `VITE_API_BASE_URL=http://localhost:3001`

  ### 3. Optional override files

  If you want to override the defaults, create:

  - `.env.local` for frontend values
  - `server/.env.local` for backend values

  Example local backend override:

  ```bash
  PORT=3001
  HOST=0.0.0.0
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/cruush
  CORS_ORIGIN=http://localhost:5173
  SESSION_SECRET=change-me-in-local-dev
  APP_URL=http://localhost:5173
  ```

  ### 4. Run migrations and start the local stack

  ```bash
  npm run dev:local
  ```

  That command:

  - runs the server migrations
  - starts the local API
  - starts the frontend

  ### 5. If you want auth emails to return to staging

  Set this in `server/.env.local`:

  ```bash
  APP_URL=https://staging.cruush.app
  ```

  That changes the callback target only. It does not change the staging deployment itself.

  ### 6. Useful manual commands

  ```bash
  npm run dev
  npm --prefix server run dev
  npm --prefix server run migrate:dev
  ```
  
