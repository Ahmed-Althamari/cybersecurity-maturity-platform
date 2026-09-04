# CMMP System Architecture

This describes the system as actually implemented, not as originally
planned — verified against the real code, tested live, updated
alongside every phase in `docs/IMPLEMENTATION_STATUS.md`. Where
something in an earlier draft of this document (Redis, AWS ALB, a
`scoring/` NestJS module) never got built, it's been removed rather than
left as aspiration presented as fact. Where a whole area is real but
narrower than the original ambition (Docker exists but was never built
and run — see Phase 15's own caveat), that's called out inline.

## System Overview

CMMP is a multi-tenant SaaS platform for running cybersecurity maturity
assessments against a configurable framework (NIST CSF 2.0 today,
architecturally not hard-coded to it), tracking the resulting risks, and
generating a prioritised remediation roadmap.

```
┌────────────────────────────────────────────────────────────┐
│                        Users (browser)                       │
│   Platform/Org Admin · CISO · Security Architect · GRC       │
│   Manager · Assessor · Control/Remediation Owner · Auditor   │
│   Executive/Read-Only Viewer                                  │
└───────────────────────────┬────────────────────────────────┘
                             │ HTTPS
                             ▼
                  ┌────────────────────────┐
                  │  apps/web (Next.js)     │  :3000
                  │  pages router,          │
                  │  NextAuth.js Credentials │
                  └───────────┬─────────────┘
                              │ REST, JWT bearer
                              ▼
                  ┌────────────────────────┐
                  │  apps/api (NestJS)      │  :3001
                  │  /api/v1/*  + /health   │
                  └───────────┬─────────────┘
                              │ Prisma
                              ▼
                  ┌────────────────────────┐
                  │  PostgreSQL 16          │  :5432
                  │  (multi-tenant, one DB) │
                  └────────────────────────┘
```

There is no Redis, message queue, or object storage in the running
system today. `packages/reporting`, `packages/security`, and
`packages/ui` exist as workspace packages but nothing currently imports
them — they're unused scaffolding, not wired into either app.

## Monorepo Layout

npm workspaces + Turborepo (`turbo.json`). `turbo run build/test/type-check`
walks the dependency graph (`dependsOn: ["^build"]`) so a package's own
workspace dependencies are always built before it.

```
apps/
  api/     NestJS backend — the only thing that talks to Postgres
  web/     Next.js frontend — talks to apps/api over HTTP, never to the DB directly
packages/
  database/          Prisma schema, migrations, seed script, and the
                      framework-import glue shared between the seed
                      script and FrameworksService
  framework-engine/   Framework-agnostic loader/validator/navigation-tree
                      builder — the thing that makes "NIST CSF 2.0" a
                      loaded JSON fixture rather than hard-coded types
  scoring-engine/     Pure functions: maturity level <-> numeric score,
                      weighted-average rollup, gap analysis, trend —
                      no framework or database knowledge
  import-engine/      Excel/CSV parsing, column auto-mapping, formula/
                      CSV-injection sanitisation, row validation
  shared/             Cross-cutting enums (UserRole, MaturityLevel,
                      RiskLevel, ControlStatus) and their Zod schemas
  reporting/          Present but unused — no app imports it
  security/           Present but unused — no app imports it
  ui/                 Present but unused — no app imports it
```

**Why separate `scoring-engine` from the API service layer**: master
prompt §33 explicitly asked for scoring math not to live inside
NestJS services or React components. `AssessmentsService` and
`DashboardService` call into `@cmmp/scoring-engine`'s pure functions;
neither reimplements the arithmetic.

## Backend (`apps/api`)

NestJS, one module per resource, each following the same shape:
tenant/org scoping validated server-side (never trusted from a client
value that could reference another tenant's data), a service that owns
the actual logic, a controller that's mostly routing + role gates +
`@AuditLog` decorators, and Zod-free DTOs (this API uses `class-validator`
decorators, not Zod, for request-body validation — Zod is used in
`@cmmp/shared` for enum/type validation and in `@cmmp/import-engine`).

```
apps/api/src/
  main.ts                Global prefix (api/v1, health excluded),
                          ValidationPipe, CORS, security headers,
                          optional Swagger UI (see below)
  app.module.ts           Wires every feature module together
  prisma/                 PrismaService (global module)
  auth/                   Login, JWT strategy, RolesGuard, JwtAuthGuard
  health/                 GET /health — real DB check, unauthenticated
  users/                  User CRUD + role assignment
  frameworks/              Framework read + JSON import (loads via
                          @cmmp/framework-engine, persists via
                          @cmmp/database's shared import glue)
  assessments/            Assessment CRUD, item upsert, submit,
                          Excel/CSV import, scoring, gap analysis
  risks/                  Risk register — inherentRiskScore/riskLevel
                          always computed server-side from
                          likelihood x impact, never trusted from the client
  remediation-initiatives/ Initiative CRUD, risk linking,
                          generate-from-gaps, priority scoring
  dashboard/              Six read-only aggregation endpoints —
                          maturity, per-function, gaps, risk summary,
                          roadmap status, executive summary
  audit/                  Global AuditInterceptor + @AuditLog decorator;
                          turns any decorated controller method into an
                          immutable AuditEvent row
test/                    apps/api/test/*.e2e-spec.ts — real AppModule,
                          real Postgres, via supertest (see Phase 14)
```

### API surface

35 routes across 9 controllers as of Phase 17 (the exact, current list
is easiest to read live: run the API with `ENABLE_SWAGGER=true` and open
`/api/docs`, or fetch `/api/docs-json` for the raw OpenAPI document —
generated straight from the actual route decorators, so unlike a
hand-written list it can't drift). The shape, by controller:

| Controller | Base path | Auth |
|---|---|---|
| `HealthController` | `/health` (no `/api/v1` prefix) | none |
| `AuthController` | `/api/v1/auth` | `login` public; `logout`/`refresh`/`me` need a bearer token |
| `UsersController` | `/api/v1/users` | bearer token; write ops role-gated |
| `FrameworksController` | `/api/v1/frameworks` | bearer token; `import` role-gated |
| `AssessmentsController` | `/api/v1/assessments` | bearer token; writes role-gated |
| `RisksController` | `/api/v1/risks` | bearer token; writes role-gated |
| `RemediationInitiativesController` | `/api/v1/remediation-initiatives` | bearer token; writes role-gated |
| `DashboardController` | `/api/v1/dashboard` | bearer token only — any authenticated role can read |
| `AuditController` | `/api/v1/audit-events` | bearer token; read itself is role-gated |

### Role gating (as implemented, not as originally planned)

`RolesGuard` reads `@Roles(...)` metadata off the **handler method**, not
the controller class — a class-level `@Roles()` is silently a no-op (see
Phase 13's own bug writeup for how that was found). Every controller
below follows the handler-level pattern.

| Resource | Write roles (create/update) | Delete roles | Read |
|---|---|---|---|
| Assessment | PLATFORM_ADMIN, ORGANISATION_ADMIN, CISO, GRC_MANAGER, ASSESSOR | PLATFORM_ADMIN, ORGANISATION_ADMIN | any authenticated role |
| Risk | PLATFORM_ADMIN, ORGANISATION_ADMIN, CISO, GRC_MANAGER, SECURITY_ARCHITECT | PLATFORM_ADMIN, ORGANISATION_ADMIN | any authenticated role |
| RemediationInitiative | PLATFORM_ADMIN, ORGANISATION_ADMIN, CISO, GRC_MANAGER, SECURITY_ARCHITECT | PLATFORM_ADMIN, ORGANISATION_ADMIN | any authenticated role |
| Framework import | PLATFORM_ADMIN, ORGANISATION_ADMIN | — | any authenticated role |
| User | PLATFORM_ADMIN, ORGANISATION_ADMIN | PLATFORM_ADMIN only | any authenticated role (no role gate on `GET /users`) |
| Audit log | — (read-only resource) | — | PLATFORM_ADMIN, ORGANISATION_ADMIN, CISO, AUDITOR, GRC_MANAGER |
| Dashboard | — (read-only resource) | — | any authenticated role |

This is enforced server-side in every case and is what
`apps/api/test/authorization.e2e-spec.ts` and `tenant-isolation.e2e-spec.ts`
actually exercise against a live database, not just asserted here.

### Authentication

- `POST /api/v1/auth/login` verifies `email`/`password` (bcrypt) against
  `User.passwordHash`, then signs a JWT (`@nestjs/jwt`,
  `JwtModule.register`) carrying `sub`, `email`, `tenantId`,
  `organisationId`, `role` (first assigned role, or `READ_ONLY_VIEWER` if
  none), `roles` (the full list), and `jti` (a random id unique to this
  one token — see Token revocation below). 24h expiry. Rate-limited to
  5 attempts/minute/IP (`@nestjs/throttler`) — see
  `docs/security-architecture.md`.
- The API returns the token as `access_token` in the JSON body — there's
  no server-set cookie on the API side. `apps/web`'s NextAuth Credentials
  provider is what turns that into a session; the browser never talks to
  the JWT directly.
- `JwtAuthGuard` (Passport JWT strategy) verifies the token on every
  protected route; `RolesGuard` checks `roles` against a route's
  `@Roles(...)` metadata, as above.
- `JWT_SECRET` falls back to a hard-coded value
  (`'your-secret-key-change-in-production'`, `jwt-secret.ts`) if unset
  — but **only** outside `NODE_ENV=production`, where the app instead
  refuses to start. Fine for this sandbox's local testing; a real
  deployment must set `JWT_SECRET` and `NODE_ENV=production` together
  (see `docs/DEPLOYMENT.md`).

### Token revocation

`POST /auth/logout` isn't a no-op: it upserts a `RevokedToken` row keyed
by the current token's `jti`, and `JwtStrategy.validate()` checks that
table on every authenticated request, rejecting a revoked token with 401
even though it hasn't naturally expired. This is per-token, not a global
"sign out everywhere" — logging out of one device/tab never touches a
different session's token, since each login mints its own `jti`.
`POST /auth/refresh` mints a new token (its own fresh `jti`) **and**
revokes the token it was called with, via the same mechanism — so a
leaked pre-refresh token can't go on being used indefinitely just
because its holder refreshes regularly. `RevokedTokenCleanupService`
(`@nestjs/schedule`, hourly) deletes revoked rows once their own
`expiresAt` has passed, so the table doesn't grow without bound.

### Tenant isolation

Every tenant-scoped table carries `tenantId` directly (not inferred via
joins). Every service method that reads or writes one first scopes its
Prisma `where` clause to the caller's `tenantId` (taken from the JWT, never
a client-supplied value) — a request for another tenant's resource by ID
gets a 404, not a 403 (it doesn't exist *for this tenant*, which is also
slightly better information hygiene than confirming the ID is valid
elsewhere). `apps/api/test/tenant-isolation.e2e-spec.ts` verifies this
live: two real tenants, one creates a risk, the other gets 404/empty-list
on every read/write path against it.

### Audit logging

A global `AuditInterceptor` (`APP_INTERCEPTOR`) plus an
`@AuditLog(action, resource)` decorator turn any controller method into
an `AuditEvent` row after a successful response — no per-service
`AuditService.record()` calls scattered through business logic. Captures
actor (from the JWT, or the response body for the one pre-auth case,
login), resource id, a sanitised copy of the request body (`password`/
`token`/`secret`-shaped fields replaced with `[REDACTED]` before
anything is ever persisted), IP, user-agent, and a correlation id.
`AuditService` exposes `record`/`findAll`/`findOne` and deliberately no
`update`/`delete` — the trail is append-only by construction, not by
convention.

## Frontend (`apps/web`)

Next.js 14, **pages router** (not the app router), NextAuth.js
Credentials provider, Tailwind, Recharts for charts.

```
apps/web/
  pages/
    index.tsx              Landing
    dashboard.tsx           The one real dashboard page — KPI cards,
                            radar chart, gap bar chart, heatmap, top-gaps
                            table, maturity distribution
    auth/signin.tsx         Login form
    api/auth/[...nextauth].ts  NextAuth config — calls the real
                            POST /api/v1/auth/login server-side
  components/dashboard/     KpiCard, MaturityRadarChart,
                            FunctionGapBarChart, FunctionDetailCards,
                            MaturityHeatmap, TopGapsTable,
                            MaturityDistributionChart
  lib/
    api.ts                  Typed client — NEXT_PUBLIC_API_URL + /api/v1
    maturity-scale.ts        Shared status colours, risk-level colours,
                            maturity banding (dataviz-skill-validated palette)
  public/                    Exists (Phase 15 fix — didn't before), currently empty
```

**What exists**: login, one full dashboard page reading all six
`/dashboard/*` endpoints. **What doesn't**: a framework navigation view,
an assessment-taking flow (`/assessments/:id/items`), a risk register
page, the Excel import wizard's UI (upload/preview/column-mapping steps
— the API supports the underlying flow, nothing calls it from a page),
and an organisation picker (the dashboard reads whichever org the logged
-in demo user belongs to). All genuinely deferred, not silently dropped —
tracked in `docs/IMPLEMENTATION_STATUS.md`'s Next Steps every phase.

There are currently **zero automated frontend tests** — no React Testing
Library component tests, no persisted Playwright E2E spec files (the
`@playwright/test` dependency and a `test:e2e` script exist, scaffolded
since Phase 1, but nothing has ever populated them with a spec).

## Data Model

Real relationships, from `packages/database/prisma/schema.prisma` (not
the aspirational sketch this doc used to have — no separate
`AssessmentResponse`/`AssessmentHistory`/`Evidence`/`FrameworkVersion`
models exist; history is a field on `Assessment` itself and evidence is
a free-text field on `AssessmentItem`, not its own entity).

```
Tenant (1) ──── (N) Organisation
Organisation (1) ──── (N) User
User (1) ──── (N) UserRoleAssignment        (a user can hold several roles)
Organisation (1) ──── (N) Assessment
Assessment (1) ──── (N) AssessmentItem       (one per assessment question)
AssessmentItem (N) ──── (1) AssessmentQuestion ──── (1) Subcategory ──── (1) Category ──── (1) Function ──── (1) Framework
Organisation (1) ──── (N) Risk
Risk (N) ──── (0..1) AssessmentItem          (optional link back to the item it originated from)
Risk (N) ──── (N) RemediationInitiative      (many-to-many)
Organisation (1) ──── (N) RemediationInitiative
Recommendation (0..1) ──── AssessmentItem, (0..1) ──── Risk, (0..1) ──── RemediationInitiative
                                              (three independent optional FKs, not a strict
                                              child-of-initiative — a Recommendation can exist
                                              linked to any subset of the three, or none)
Tenant (1) ──── (N) AuditEvent
User (1) ──── (N) AuditEvent                 (onDelete: Restrict — a user
                                              can't be hard-deleted while
                                              audit rows reference them)
```

Soft delete (`deletedAt: DateTime?`) is used consistently across
tenant-scoped resources instead of hard `DELETE`; every service filters
`deletedAt: null` on reads.

## Framework Model

`@cmmp/framework-engine` defines the loadable shape
(`FrameworkDefinition` → `FunctionDefinition[]` → `CategoryDefinition[]`
→ `SubcategoryDefinition[]` → optional `QuestionDefinition[]`), separate
from `@cmmp/shared`'s flat, persistence-oriented types — the loader
validates and walks a *nested* tree, independent of framework identity.
Nothing in the engine, the loader, or the navigation-tree builder
branches on "is this NIST CSF" — a second framework is a second JSON
fixture through the same loader, not new code.

`packages/database/prisma/fixtures/nist-csf-2.0.json` is the one loaded
framework today: 6 functions, 22 categories, 106 subcategories. It was
reproduced from training-data knowledge of NIST CSWP 29, not transcribed
from the source document — flagged since Phase 5, still not diffed
against the official publication. Don't treat it as compliance-grade
without doing that diff first.

## Scoring Methodology

`@cmmp/scoring-engine`, pure functions, no side effects:

- **Level <-> score**: `MaturityLevel` is a 6-value enum
  (`NOT_APPLICABLE`, `INITIAL`, `DEVELOPING`, `DEFINED`, `MANAGED`,
  `OPTIMISED`) mapped to a 0-5 numeric scale (`NOT_APPLICABLE` = 0,
  `INITIAL` = 1, ..., `OPTIMISED` = 5) — not a bare 1-5 scale.
- **Rollup** (`scoreItems`): a **weighted average**, not a simple
  average. Each `AssessmentItem` carries a `weight` (default 1.0); an
  item whose current maturity is `NOT_APPLICABLE` is excluded from the
  average entirely (both current and target), rather than counted as a
  zero that would drag the score down. Rolls up subcategory → category
  → function → organisation the same way at every level.
- **Gap**: `target - current` at any node, always derived, never stored
  independently of the two scores it comes from.
- **Combining separately-scored rollups** (`combineScores`) — e.g. an
  organisation-wide score across several concurrently-active assessments
  — exists as a function but isn't wired into any endpoint yet; every
  `/dashboard/*` route today scopes to one assessment (the org's latest
  submitted one, or an explicit `assessmentId`).
- **Gap analysis** (`analyzeGaps`) flattens the scored tree, filters to
  nodes with a positive gap (configurable `minGap`, default excludes
  anything at or past target), sorts by gap descending, and optionally
  caps to a depth (function/category/subcategory) and a result count.

### Risk scoring

`RisksService`, not `scoring-engine` (risk severity isn't part of the
maturity-scoring domain): `inherentRiskScore = likelihood × impact`
(both 1-5, so a 1-25 range), banded into `RiskLevel` by
`riskLevelFromScore()` — a single, swappable, unit-tested function per
master prompt §20's "don't permanently hard-code this formula":
`>=20 CRITICAL`, `>=12 HIGH`, `>=6 MEDIUM`, `>=3 LOW`, else `MINIMAL`.
Recomputed only when `likelihood`/`impact` actually change on update;
`residualRiskScore` (post-control effectiveness) is a separate,
explicitly user-set field, never auto-derived.

### Remediation priority

`RemediationInitiativesService.computePriority()`, same "isolate the
formula" pattern: `raw = riskScore(1-5) × gap × businessCriticality(1-5)
× weight`, banded 1 (highest) to 5 (lowest): `>=60 → 1`, `>=30 → 2`,
`>=15 → 3`, `>=5 → 4`, else `5`. `POST /remediation-initiatives/generate`
creates one `PLANNED` initiative per open subcategory gap, computing
priority from the real backing `AssessmentItem`'s stored
`riskLevel`/`businessCriticality`/`weight` — never a placeholder default
— and skips any subcategory a non-terminal initiative already tracks
(`securityCapability` doubles as that dedup key).

## Excel/CSV Import

See `docs/EXCEL_IMPORT_GUIDE.md` for the user-facing column format and
validation rules. Architecturally: `@cmmp/import-engine` parses (xlsx via
`exceljs`, csv via a hand-rolled parser), auto-maps headers to 17
canonical columns by exact name or known alias, sanitises every cell
against formula/CSV injection (master prompt §40 — a cell starting with
`=`, `+`, `-`, `@`, or a control character gets prefixed with `'` so it
can never execute as a formula when reopened), validates and types each
row (collecting every issue rather than stopping at the first), flags
duplicate `Control_ID`s without masking a more severe `invalid` status,
and returns a `valid`/`warning`/`invalid` breakdown.
`AssessmentsService.importFile` processes both `valid` and `warning`
rows (only `invalid` rows are skipped) — a real bug from Phase 8 (warning
rows were silently never imported) that live end-to-end testing caught
and a unit test now guards against.

## Deployment

See `docs/DEPLOYMENT.md`. Summary: `infrastructure/Dockerfile.{api,web}`
+ `docker-compose.yml` (Phase 15) build production images via
Turborepo's `turbo prune --docker` recipe; GitHub Actions
(`.github/workflows/`, Phase 16) runs lint/type-check/unit-tests/build on
every PR plus a real Postgres-backed e2e job, and separately runs
CodeQL, Gitleaks, Trivy, a weekly SBOM, and a nightly OWASP ZAP scan.
**The Docker images have never actually been built or run** — this
session's sandbox had no reachable Docker daemon, so Phase 15 was
validated as far as possible without one (a real `turbo prune`, `docker
compose config` parsing correctly, the Next.js standalone output
inspected file-by-file) but not proven end-to-end. Treat that as open
until someone runs `docker compose build && up` for real.

## Security Architecture & Threat Model

See `docs/security-architecture.md` for the full picture (STRIDE
analysis included). Summary of what's real today: server-side tenant
scoping on every query, RBAC enforced by `RolesGuard` reading
handler-level metadata, bcrypt password hashing, JWT bearer auth,
immutable audit logging, formula/CSV-injection sanitisation on
spreadsheet import, security response headers
(`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`), CORS
restricted to a configured origin, and rate limiting (`@nestjs/throttler`
— an app-wide default plus a tight 5/min/IP limit on login specifically).
What's *not* real yet despite being mentioned in earlier drafts of this
doc or in `SECURITY.md`: no encryption-at-rest configuration
beyond whatever the Postgres host provides, no WAF/ALB (there's no cloud
deployment at all yet), no secrets manager integration (env vars only).
