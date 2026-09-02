# Deployment Guide

Covers running CMMP locally via Docker Compose (the fully-implemented,
partially sandbox-verified path — see the caveat below) and publishing
images via the `deploy.yml` GitHub Actions workflow. For the CI/security
workflows themselves, see `docs/devsecops-pipeline.md`.

## Prerequisites

- Docker Engine + the `docker compose` plugin (not the standalone
  `docker-compose` binary — this repo's `package.json` scripts and README
  were fixed during Phase 15 to use the plugin form).
- Node.js 20+ / npm 9+ only if running natively (outside Docker) for
  development.

## Environment variables

Copy `.env.example` to `.env` and set real values before anything but pure
local development. The variables that actually matter today (everything
else in `.env.example` — SMTP, AWS/S3, Sentry, `OPENAI_API_KEY` — is
aspirational scaffolding for future features and is not read by any code
path yet; see `docs/security-architecture.md` for the rate-limiting
variables specifically, which are the same kind of gap):

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API, Prisma | Postgres connection string. Inside Compose, host is the `postgres` service name; for a native/non-Docker run, `localhost`. |
| `DIRECT_DATABASE_URL` | Prisma migrations | Same value in this project's setup; kept separate because Prisma distinguishes pooled vs. direct connections. |
| `JWT_SECRET` | API (`AuthModule`) | **Must** be set to a real secret ≥32 chars in any real deployment — the fallback (`'your-secret-key-change-in-production'` / the Compose default) is a known, publicly-visible value in this repo's history. See `docs/security-architecture.md`. |
| `NEXTAUTH_SECRET` | Web (NextAuth) | Same requirement as `JWT_SECRET` — a different secret, don't reuse. |
| `NEXTAUTH_URL` | Web (NextAuth) | The browser-facing URL of the web app itself. |
| `NEXT_PUBLIC_API_URL` | Web (browser-side) | The API URL as reachable **from the user's browser** — a published host port, not a Docker-internal address. |
| `INTERNAL_API_URL` | Web (server-side only) | The API URL as reachable **from inside the `web` container** — the Compose service DNS name (`http://api:3001`). Falls back to `NEXT_PUBLIC_API_URL` when unset, so a native (non-Docker) dev run needs nothing extra. This split exists because NextAuth's `authorize()` callback runs server-side inside the `web` container, where `localhost` means the container itself, not the host — a real bug this repo shipped and fixed once already (see Phase 15's "found and fixed" notes in `IMPLEMENTATION_STATUS.md`). |
| `CORS_ORIGIN` | API | Must match the web app's actual origin, or the browser will reject cross-origin API responses. |
| `PORT` | API | Defaults to `3001` if unset. |
| `ANTHROPIC_API_KEY` | API (`AiMappingService`, via `SettingsService`) | Optional — powers the AI-assisted import column-mapping suggestion (`docs/excel-import-guide.md`). Unset means that one feature silently no-ops (falls back to exact-header-name auto-mapping); nothing else depends on it. A value saved by a `PLATFORM_ADMIN` through `/admin/settings` (database, encrypted) takes priority over this env var when both are set. |
| `SETTINGS_ENCRYPTION_KEY` | API (`SettingsService`) | Optional, but required before the `/admin/settings` UI can actually save anything — a 32-byte value (base64 or hex) that encrypts any secret saved there at rest. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Losing/rotating it makes a previously-saved value undecryptable (treated as "not configured," not an error — see `docs/security-architecture.md`). |

## Running locally with Docker Compose

```bash
cp .env.example .env   # then edit JWT_SECRET / NEXTAUTH_SECRET at minimum
docker compose up --build
```

This brings up three services (`docker-compose.yml`):

1. **`postgres`** (`postgres:15-alpine`) — a named volume `pgdata` for
   persistence; a `pg_isready` healthcheck gates everything downstream.
2. **`api`** — waits on `postgres`'s healthcheck, then runs
   `npx prisma migrate deploy && node apps/api/dist/main.js` — migrations
   apply automatically on every start (a no-op once the schema is
   current), so a fresh volume is self-sufficient with no manual migrate
   step.
3. **`web`** — waits on `api`'s own healthcheck (`condition:
   service_healthy`, not just "started"), then serves the Next.js
   `standalone` build.

Ports published to the host: `5432` (Postgres), `3001` (API), `3000` (web).
Once healthy, sign in at `http://localhost:3000/auth/signin` — see the
README for demo credentials seeded by `prisma/seed.ts`.

### ⚠️ Verification status of this path

This exact Compose stack has been verified as thoroughly as the sandbox
this project was built in allows, but **not with a real `docker build` or
`docker compose up`** — that sandbox's network egress policy blocks the
Docker Hub blob CDN (`production.cloudfront.docker.com`) that
`FROM node:20-alpine` needs to pull. What *was* verified without Docker:

- Both Dockerfiles' exact multi-stage `COPY` sets were manually replicated
  into a scratch directory and run directly with plain `node`
  (`node apps/api/dist/main.js` / `node apps/web/server.js`) against the
  real local Postgres — confirming the workspace-symlink resolution and
  Next.js standalone-copy logic is correct.
- `docker compose config` (structural/interpolation validation) passes
  after every edit.
- The real `/health` endpoint, tested directly.

**Before relying on this in production**: run
`docker compose build && docker compose up` end-to-end at least once
somewhere with real registry access, and watch it boot from a genuinely
empty `pgdata` volume.

## Image builds (for a real registry / orchestrator)

Both `infrastructure/Dockerfile.api` and `infrastructure/Dockerfile.web`
are multi-stage, **npm-based** (not `pnpm` — an earlier scaffold used
`pnpm` against an npm-workspaces repo and would never have built), and
**must be built with the repository root as context** — a workspace's
`dist/` output depends on its sibling packages' `dist/` output, which a
narrower build context wouldn't see:

```bash
docker build -f infrastructure/Dockerfile.api -t cmmp-api .
docker build -f infrastructure/Dockerfile.web -t cmmp-web .
```

- **`Dockerfile.api`**: builder stage runs `npm ci` → `npm run
  db:generate` (the generated Prisma Client is a build-time dependency of
  `@cmmp/database`, needing no live database) → `npm run build` (root
  `turbo run build`, resolving the whole workspace graph via
  `turbo.json`'s `dependsOn: ["^build"]`). The runtime stage copies the
  hoisted root `node_modules` plus `apps/api/dist` and every depended-on
  package's `dist/` + `package.json` individually (workspace packages are
  symlinks, not a self-contained tree) — deliberately **not**
  `npm prune --omit=dev`, since the generated Prisma Client under
  `node_modules/.prisma` isn't a declared dependency in
  `package-lock.json` and pruning has a known failure mode of deleting
  exactly that kind of undeclared, generated path. Runs as a non-root
  `cmmp` user.
- **`Dockerfile.web`**: same build steps, but the runtime stage copies
  Next.js's `standalone` output (`output: "standalone"` in
  `next.config.js`) instead — it traces only the `node_modules` each page
  actually needs, so no monorepo-wide `node_modules` copying is required
  for this image.
- A root `.dockerignore` excludes `node_modules`, build output, and
  `.env*` — without it, `COPY . .` in the builder stage would bake real
  `.env` secrets into an image layer (this was a genuine gap found and
  fixed during Phase 15: `.dockerignore` itself had been accidentally
  `.gitignore`d since Phase 1 and had never been committed).

## Publishing images (GitHub Actions → GHCR)

`.github/workflows/deploy.yml` runs on every push to `main` and on
`v*.*.*` tags:

1. **`verify`** — re-runs `lint`/`type-check`/`test`/`build` from scratch.
   Deliberately doesn't trust that `main` was still green by the time this
   workflow's own trigger fired.
2. **`build-and-push`** — matrix over `api`/`web`, builds with
   `docker/build-push-action`, pushes to
   `ghcr.io/<owner>/<repo>/{api,web}`, tagged by commit SHA
   (`type=sha,format=long`), branch name, and semver tag when applicable.
3. **`deploy`** — gated behind a GitHub **Environment** named `production`
   (Settings → Environments), so a repo admin can require manual approval
   and hold real secrets (`DATABASE_URL`, `JWT_SECRET`, etc.) there instead
   of this workflow running unattended the instant it merges. The step
   itself is currently a **documented placeholder** — this project has no
   live hosting target chosen yet (no ECS/Cloud Run/Fly/K8s cluster
   provisioned). Whoever picks one fills in this one step with the real
   deploy command; everything upstream of it (verified build → pushed,
   tagged images in GHCR) is real and working.

## What's not yet real

- **No live hosting target.** `deploy.yml`'s final step is a placeholder
  echo, not a real deployment. Images land in GHCR and stop there.
- **No container orchestration.** `docs/architecture.md`'s references to
  Kubernetes/pods, an AWS ALB/WAF, and Redis-backed sessions are Phase-1
  aspirational notes for a future infrastructure target — none of it
  exists today. The real deployment unit is `docker compose` on a single
  host, full stop.
- **No secrets manager integration.** Every secret today is a plain
  environment variable, supplied at `docker compose up` time or as a
  GitHub Environment secret. AWS Secrets Manager / Vault integration is a
  future item, not implemented.
