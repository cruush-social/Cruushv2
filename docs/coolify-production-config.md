# Coolify production configuration

Authoritative record of the Coolify resource settings production depends on. These
live in Coolify's database, not in this repo, so nothing here is enforced by a
deploy — `scripts/release-main-coolify.mjs` checks them before every release and
fails loudly on drift. Update both this file and `assertBuildConfig` together.

## Host

The dashboard is `http://87.99.152.196:8000`. `cruush.app`, `www.cruush.app`,
`api.cruush.app`, and `staging.cruush.app` all resolve to `87.99.152.196`.

Older handoff documents name `87.99.130.8`. That host is retired and unreachable;
credentials issued by it no longer authenticate. Prefer this file.

## Applications

| Resource | UUID | Domains |
| --- | --- | --- |
| `cruush-frontend` | `osvowruef99ps8pgoa3w5ysp` | `cruush.app`, `www.cruush.app` |
| `cruush-api` | `rhacv5wg4rigv1mj6lx08wtc` | `api.cruush.app`, `moderation-media.cruush.app` |
| `cruush-waitlist` | `z8skgnlaav2pcfnlz9tl247y` | sslip.io hostname only |

## Build configuration

Two Dockerfiles exist and they are not interchangeable. The repo-root `Dockerfile`
builds the Vite bundle and serves it from nginx on port 80. `server/Dockerfile`
builds the Fastify API and listens on port 3001.

| Setting | `cruush-frontend` | `cruush-api` |
| --- | --- | --- |
| Base directory | `/` | `/server` |
| Ports exposes | `80` | `3001` |
| Build pack | `dockerfile` | `dockerfile` |
| Git branch | `main` | `main` |

Setting `cruush-api` to base directory `/` builds the **frontend** image and
deploys it as the API. The container starts cleanly and looks healthy in `docker ps`,
but nothing listens on 3001, so every request Traefik routes to it returns 502.
This happened in production and cost roughly a day of half-failing API traffic.

## Health checks

Both applications must have health checks enabled. Without one, Coolify cannot tell
when a new container is ready, never retires the old one, and leaves orphaned
containers still attached to Traefik's routing. Two containers then answer for the
same domain and round-robin between different builds — the frontend symptom is a
blank page, because the HTML from one container references hashed assets that only
exist on the other.

| Setting | `cruush-frontend` | `cruush-api` |
| --- | --- | --- |
| Path | `/` | `/health` |
| Host | `localhost` | `127.0.0.1` |
| Port | `80` | `3001` |
| Interval | 10s | 15s |
| Retries | 3 | 40 |
| Start period | 5s | 60s |

The API's health check host must be `127.0.0.1`, not `localhost`. Coolify's probe
is `curl ... || wget ...`, and `node:22-alpine` ships neither curl nor an IPv6
listener: the API binds `0.0.0.0:3001` only, while the container's `/etc/hosts`
maps `localhost` to both `127.0.0.1` and `::1`. busybox `wget` tries `::1` first
and the probe fails with `wget: can't connect to remote host: Connection refused`
even though the API is serving correctly. No retry budget can rescue this — the
probe is aimed at an address nothing listens on.

The frontend is not affected. The `nginx:1.27-alpine` entrypoint runs
`10-listen-on-ipv6-by-default.sh`, which adds `listen [::]:80`, so `localhost`
resolves either way.

To tell the two failure modes apart, run the probe by hand against a live container:

```bash
docker exec <container> wget -qO- http://127.0.0.1:3001/health   # works
docker exec <container> wget -qO- http://localhost:3001/health   # refused
```

The API's retry budget is separately large because its entrypoint is
`npm run migrate && npm run start`, so it does not bind port 3001 until every
migration in `server/sql` finishes — over two minutes on a cold database.
`retries x interval` must exceed that. Raise retries, not interval.

## Detecting a split brain

If more than one container answers for a domain, a single request has a good chance
of looking fine. Sample repeatedly instead:

```bash
for i in 1 2 3 4 5 6; do curl -s "https://cruush.app/?p=$i" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'; done
```

All lines must match. For the API, all statuses must be 200:

```bash
for i in $(seq 1 12); do curl -s -o /dev/null -w '%{http_code} ' https://api.cruush.app/health; done
```

Coolify's Stop and Redeploy buttons do not remove orphaned containers, because
Coolify has no record of them — check the `coolify.applicationId` label against the
application's real id. Removing one requires `docker rm -f` on the host.

## Turnstile

The frontend's `VITE_TURNSTILE_SITE_KEY` is a build-time variable, so changing it
requires a rebuild, not a restart. It must match the site key of the Cloudflare
Turnstile widget whose secret is set as the API's `TURNSTILE_SECRET_KEY`. A site key
that does not exist fails with client error `400020` and the app shows
"Security check is unavailable. Contact support." Because the API rejects any
authentication request without a captcha token whenever `TURNSTILE_SECRET_KEY` is
set, a wrong site key blocks all sign-ins.

Verify the pair rather than assuming, since both keys share a long prefix:

```bash
curl -s -X POST -d "secret=$TURNSTILE_SECRET_KEY" -d "response=dummy" \
  https://challenges.cloudflare.com/turnstile/v0/siteverify
```

`invalid-input-response` means the secret is valid. `invalid-input-secret` means it
is not.
