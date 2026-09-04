# Deployment Guide

## Status Up Front

**The Docker images described here have never actually been built or
run.** Phase 15 (this session, see `docs/IMPLEMENTATION_STATUS.md`)
rewrote `infrastructure/Dockerfile.{api,web}` and `docker-compose.yml`
from scratch — the versions that existed before ran `pnpm install`
against a `pnpm-lock.yaml` that doesn't exist anywhere in this
npm-workspaces repo, so they were broken beyond just "unverified." The
rewrite was validated as far as possible without a Docker daemon (this
session's sandbox had none): a real `turbo prune` run against this exact
repo, `docker compose config` parsing and interpolating correctly, the
Next.js `standalone` build output inspected file-by-file. "Parses
correctly" and "boots and serves traffic" are different claims — run
`docker compose build && docker compose up` for real before trusting
this in any deployment, and fix whatever that first real build surfaces.
The first real test these Dockerfiles will get is whichever of
`.github/workflows/container-security.yml` (Trivy, builds both images)
or `dast.yml` (ZAP, runs `docker compose up`) fires next on a GitHub
Actions runner, which does have a working daemon.

## Prerequisites

- Docker + Docker Compose v2 (`docker compose`, not the standalone
  `docker-compose` binary — this repo's `package.json` scripts assume
  the v2 plugin)
- A `.env` file at the repo root (copy `.env.example` and fill in real
  values — see Configuration below)

## Local Development (no Docker)

This is what every phase in this session actually ran against, and the
only path that's been verified live, repeatedly:

```bash
npm ci
npm run db:generate
service postgresql start   # or your own local Postgres
cd packages/database && npx prisma migrate deploy && cd ../..
npm run db:seed            # optional — demo tenant, users, a scored assessment
npm run build
cd apps/api && node dist/main.js &   # :3001
cd apps/web && npm run build && npm start &  # :3000
```

Demo credentials after seeding (local development only —
`docs/IMPLEMENTATION_STATUS.md` has the full list): `admin@example.local`,
`ciso@example.local`, `assessor@example.local`, `viewer@example.local`,
all with password `DemoPassword123!` (override via `DEMO_USER_PASSWORD`).

## Docker Compose

```bash
cp .env.example .env   # then edit JWT_SECRET / NEXTAUTH_SECRET to real values
npm run docker:build   # docker compose build
npm run docker:up      # docker compose up -d
```

Three services: `postgres` (16-alpine, named volume `pgdata`), `api`
(:3001), `web` (:3000). `docker-compose.yml` reads `JWT_SECRET` and
`NEXTAUTH_SECRET` from the root `.env` with **no fallback** —
`${VAR:?...}` syntax means compose refuses to start rather than silently
using a shared default value baked into version control (the previous
version of this file hardcoded a dev secret directly in the YAML; fixed
in Phase 15).

Migrations are **not** run automatically by `docker compose up` — the
images ship the compiled app, not a migration step in the startup
command. Run them explicitly after the stack is up:

```bash
docker compose exec api npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

(The `api` image includes the full `prisma` CLI as a devDependency —
this session's Dockerfiles deliberately don't strip devDependencies from
the final image, trading some image size for the ability to run
migrations/seed from the same image without a separate tooling image.)

### Two Different API URLs

`docker-compose.yml` sets two different values for what looks like the
same thing, on purpose — this was a real bug in the previous version of
this file (Phase 15 found it: NextAuth's server-side login call would
have defaulted to `localhost`, which inside the `web` container's own
network namespace never reaches the `api` container, so login would have
failed 100% of the time under Docker Compose):

- `API_URL=http://api:3001` — used server-side, inside the `web`
  container (NextAuth's own login proxy,
  `apps/web/pages/api/auth/[...nextauth].ts`). Must be the Docker
  network's internal service name.
- `NEXT_PUBLIC_API_URL=http://localhost:3001` — used client-side, in the
  browser (`apps/web/lib/api.ts`). Must be the host's published port,
  since the browser can't resolve Docker service names.

## Health Checks

`GET /health` (note: **not** under the `/api/v1` prefix — deliberately
excluded in `main.ts` so it stays reachable at a stable path regardless
of API versioning) — unauthenticated, checks real database connectivity
via `SELECT 1`, returns `{"status":"ok","database":"up"}` or a 503.
Both Dockerfiles' `HEALTHCHECK` instructions call this (the `api` image)
or `/` (the `web` image, which has no dedicated health route).
`docker-compose.yml`'s `depends_on: condition: service_healthy` chains
off these.

## Configuration

Every variable the running system actually reads (not the full
`.env.example`, which includes several still-declared-but-unused ones —
SMTP, AWS — see `docs/security-architecture.md`'s Security Gaps
section):

| Variable | Consumed by | Required? |
|---|---|---|
| `DATABASE_URL` | `packages/database` (Prisma) | Yes |
| `JWT_SECRET` | `apps/api/src/auth/auth.module.ts` | Falls back to a hard-coded value if unset — **set this explicitly in any real deployment**, the fallback is visible in the public source tree |
| `CORS_ORIGIN` | `apps/api/src/main.ts` | Defaults to `http://localhost:3000` |
| `PORT` | `apps/api/src/main.ts` | Defaults to `3001` |
| `RATE_LIMIT_WINDOW_MS` | `apps/api/src/app.module.ts` (`ThrottlerModule`) | Defaults to `900000` (15 min) — the app-wide rate-limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `apps/api/src/app.module.ts` (`ThrottlerModule`) | Defaults to `100` — requests/IP allowed per window app-wide. Login has its own tighter, non-configurable 5/min/IP limit regardless of this value (`auth.controller.ts`) |
| `ENABLE_SWAGGER` | `apps/api/src/main.ts` | Off unless exactly `"true"` — mounts `/api/docs` (Swagger UI) and `/api/docs-json` (raw OpenAPI). Off by default deliberately; see `docs/security-architecture.md` |
| `NEXTAUTH_URL` | `apps/web` (NextAuth.js) | Yes |
| `NEXTAUTH_SECRET` | `apps/web` (NextAuth.js) | Yes |
| `API_URL` | `apps/web/pages/api/auth/[...nextauth].ts` | Server-side only — see Two Different API URLs above |
| `NEXT_PUBLIC_API_URL` | `apps/web/lib/api.ts` | Client-side only — see above |
| `DEMO_USER_PASSWORD` | `packages/database/prisma/seed.ts` | Optional override for the seeded demo users' shared password |

`ENABLE_RATE_LIMITING` (also in `.env.example`) is **not** read as an
on/off toggle — rate limiting is unconditionally enabled, a deliberate
choice for a security product (opt-out is the wrong default here).

## Database Migrations

Prisma migrations are committed (`packages/database/prisma/migrations/`)
— `npx prisma migrate deploy` applies them without prompting, the right
command for CI/production (as opposed to `migrate dev`, which is
interactive and meant for local schema iteration only).

## CI/CD

`.github/workflows/`:

- **`ci.yml`** — on every PR to `main`/`develop` and every push to
  `main`: `lint`, `type-check`, `test` (mocked unit tests, `turbo run
  test`), `build`, and (added in Phase 16) `e2e` — a real
  `postgres:16-alpine` service container running
  `apps/api/test/*.e2e-spec.ts`.
- **`security.yml`** — CodeQL (SAST), Gitleaks (secret scanning),
  `npm audit --audit-level=high`, a weekly CycloneDX SBOM. Runs on PRs
  to `main`/`develop`, pushes to `main`, and weekly on schedule.
- **`container-security.yml`** — builds both Dockerfiles for real (a
  GitHub Actions runner has a working Docker daemon, unlike this
  session's sandbox) and scans with Trivy. Runs on push to `main` when
  Docker/app files change, plus weekly.
- **`dast.yml`** — OWASP ZAP baseline scan against a `docker compose up`
  stack. Schedule/manual-dispatch only, deliberately not wired to every
  PR (a ZAP scan is too slow/noisy to gate every merge).
- **`dependabot.yml`** — weekly PRs for npm (workspace-aware),
  github-actions, and docker ecosystem updates.

GitHub Advanced Security features (code-scanning upload to the Security
tab, `dependency-review-action`) aren't available on this private repo
without a paid add-on — both `security.yml` jobs that would use them
instead archive SARIF as a downloadable artifact.

## What's Genuinely Not Built Yet

- A deployment workflow (`.github/workflows/deploy.yml` or similar) —
  there's no target environment (staging/production host, registry
  credentials, secrets store) to deploy to yet. Building one against
  nothing to deploy to would be speculative infrastructure with no way
  to verify it works.
- TLS termination — nothing in this repo configures HTTPS anywhere; that
  belongs at a reverse proxy / load balancer in front of whatever hosts
  these containers.
- Any cloud-specific configuration (AWS/GCP/Azure) — the earlier draft
  of `docs/architecture.md` mentioned an ALB/WAF/VPC setup that was
  never actually built; removed from that document in Phase 17 rather
  than left as unverified aspiration.
