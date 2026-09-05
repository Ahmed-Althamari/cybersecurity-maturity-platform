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

`apps/api` also reaches one more service, over REST rather than Prisma —
see its own diagram in "Data Analysis Service" below for the full
picture:

```
apps/api ──REST, internal Docker network only──▶ services/data-analysis (Python/FastAPI, :8000)
                                                     │
                                                     │ "ai" mode only — "local" mode never does this
                                                     ▼
                                                  Configured LLM provider chain
                                                  (LLM_PROVIDER_<n>_* env vars —
                                                   OpenRouter free → Groq free → Claude, or any subset)
```

There is no Redis or object storage in the running system today.
`packages/reporting`, `packages/security`, and `packages/ui` exist as
workspace packages but nothing currently imports them — they're unused
scaffolding, not wired into either app. `services/data-analysis` is the
one deliberate exception to "everything talks to Postgres through
apps/api": it's a separate, stateless Python microservice with no
database access of its own and no knowledge of tenancy/auth — it exists
purely to isolate PandasAI/AutoViz's Python dependency tree from the
Node API, is reachable only from `apps/api` on the internal
Docker-Compose network (never published on a host port, never called
directly by `apps/web`), and its own "ai" mode is the only path in the
whole system that sends data to an external network endpoint (the
configured LLM provider) — see "Data Analysis Service" below.

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
services/
  data-analysis/     Standalone Python/FastAPI microservice — not an
                      npm workspace, a different language runtime
                      entirely. See "Data Analysis Service" below.
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
  data-analysis/          A new, deliberately isolated module — just a
                          controller + service that proxies an
                          authenticated multipart upload to
                          services/data-analysis over HTTP and
                          translates its response status codes. Owns no
                          Prisma models, no business logic of its own,
                          not imported by (or importing) any other
                          feature module. See "Data Analysis Service"
                          below.
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
| `DataAnalysisController` | `/api/v1/data-analysis` | bearer token only — any authenticated role; no `@Roles` gate, same as Dashboard |

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
    index.tsx                  Landing
    dashboard.tsx               KPI cards, radar chart, gap bar chart,
                                heatmap, top-gaps table, maturity
                                distribution — reads all six
                                /dashboard/* endpoints
    assessments/index.tsx       Assessment list
    assessments/[id]/items.tsx  Assessment-taking flow — per-question
                                current/target maturity recording
    assessments/[id]/import.tsx Excel/CSV import wizard — upload,
                                LLM-assisted-or-auto column-mapping
                                review/edit step, import, results
    frameworks/index.tsx        Framework list
    frameworks/[id].tsx         Framework navigation tree
    risks/index.tsx             Risk register list
    risks/[id].tsx               Risk detail/edit
    risks/new.tsx                Risk creation form
    data-analysis/index.tsx     New, isolated: upload any spreadsheet,
                                pick "local" (AutoViz, zero LLM calls) or
                                "ai" (PandasAI) mode, view results — see
                                docs/architecture.md's "Data Analysis
                                Service" section
    auth/signin.tsx             Login form
    api/auth/[...nextauth].ts   NextAuth config — calls the real
                                POST /api/v1/auth/login server-side
  components/
    layout/                     AppHeader (shared nav across every
                                signed-in page), BackLink, EmptyState
    dashboard/                  KpiCard, MaturityRadarChart,
                                FunctionGapBarChart, FunctionDetailCards,
                                MaturityHeatmap, TopGapsTable,
                                MaturityDistributionChart
    assessments/, frameworks/, risks/   Per-feature components (e.g.
                                NavigationTree)
  lib/
    api.ts                      Typed client — NEXT_PUBLIC_API_URL + /api/v1
    maturity-scale.ts            Shared status colours, risk-level colours,
                                maturity banding (dataviz-skill-validated palette)
  e2e/                          Playwright specs — auth, dashboard,
                                risks, frameworks, import
  public/                        Exists (Phase 15 fix — didn't before), currently empty
```

Every core workflow now has a page: login, dashboard, framework
navigation, assessment-taking, the Excel/CSV import wizard (including
its LLM-assisted column-mapping review step), the risk register, and the
new isolated Data Analysis feature. What's still missing: an
organisation picker (pages read whichever org the logged-in user
belongs to) and a UI for the assessment item's extended metadata fields
(`rationale`/`evidence`/`owner*`) beyond current/target maturity —
tracked in `docs/IMPLEMENTATION_STATUS.md`'s Next Steps.

Test coverage: React Testing Library component tests
(`components/**/*.test.tsx`, `__tests__/pages/**`) and a persisted
Playwright E2E suite (`e2e/*.spec.ts`) both exist and run in CI — this
was a real gap in an earlier phase, since closed (see
`docs/IMPLEMENTATION_STATUS.md`'s "Frontend test coverage" writeups).

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

## Data Analysis Service (`services/data-analysis`)

A new, deliberately isolated feature — analyze an *arbitrary* spreadsheet
(not an assessment-shaped one) and get automatic charts/insights. Built
as its own slice specifically so it could ship without touching any
existing assessments/risks/frameworks/dashboard/import-wizard code: a
separate Python microservice, a thin NestJS proxy module, and a
standalone frontend page.

### Why a separate Python service

`apps/api` (NestJS/Node) has no reason to carry pandas/PandasAI/AutoViz/
matplotlib's dependency tree, so this lives in `services/data-analysis/`
— a FastAPI app, not an npm workspace, built and deployed as its own
Docker image (`services/data-analysis/Dockerfile`). It holds no Prisma
models and knows nothing about tenancy or auth; `apps/api`'s
`DataAnalysisController`/`DataAnalysisService` are the only thing that
call it, over the internal Docker-Compose network
(`http://data-analysis:8000`, never published on a host port), and are
the only place auth/tenancy for this feature is enforced.

```
apps/web (data-analysis page)
   │ authenticated multipart upload (file, mode, optional question)
   ▼
apps/api  DataAnalysisController → DataAnalysisService
   │ proxies the same multipart body over HTTP, translates status codes
   │ (503 stays 503; other 4xx → BadRequestException; else BadGatewayException)
   ▼
services/data-analysis  POST /analyze
   │
   ├─ mode="local" ──▶ AutoViz (analysis/local_mode.py) — zero LLM calls,
   │                    zero network calls of any kind. Runs entirely
   │                    in-process against the uploaded DataFrame,
   │                    returns a fixed set of chart images (base64 PNG).
   │
   └─ mode="ai" ──────▶ PandasAI (analysis/ai_mode.py) — sends the
                        dataframe's contents (as SQL query results, via
                        an in-process DuckDB layer PandasAI builds
                        automatically) to whichever LLM the configured
                        provider chain resolves to, and returns its
                        natural-language answer, a table, or a chart.
```

### Two modes, one explicit trade-off

- **`local` mode — the privacy-preserving option.** For tenants who
  don't want spreadsheet data leaving the platform at all. AutoViz runs
  against the in-memory DataFrame and only writes chart files when
  called with `verbose=2` (a real, non-obvious quirk of the installed
  `autoviz` package — `verbose=0/1` target a Jupyter notebook and save
  nothing). No LLM call is ever attempted in this mode, and no
  `LLM_PROVIDER_<n>_*` configuration is required for it to work.
- **`ai` mode — natural-language analysis, at the cost of the data
  leaving this process.** Backed by `analysis/llm_client.py`'s
  `FallbackLLM`, a Python re-implementation of the exact same
  `LLM_PROVIDER_<n>_API_KEY`/`_FORMAT`/`_BASE_URL`/`_MODEL` env-var
  scheme and slot defaults (1: OpenRouter free tier, 2: Groq free tier,
  3: Claude) that
  `apps/api/src/assessments/import-mapping/llm-client.ts` uses for the
  Excel import wizard's column-mapping assistant — the same credentials
  configure both features identically, tried in the same order, with
  the same "only advance to the next provider on a real failure"
  behaviour. If no slot is configured, `services/data-analysis` returns
  a `503` with a clear message rather than attempting a call, and
  `DataAnalysisService` surfaces that as-is to the frontend.

### API

`POST /analyze` (multipart: `file`, `mode` ∈ `{local, ai}`, optional
`question` for `ai` mode) → `{ mode, rowCount, columnCount, columns,
charts[], answer, table, error }`. `GET /health` for the container
healthcheck. See `services/data-analysis/main.py` for the exact
request/response handling and `services/data-analysis/tests/` (19
pytest tests — fallback-chain ordering, both analysis modes via
fake/stub LLMs, and the FastAPI endpoints) for the contract those
handle.

## Deployment

See `docs/DEPLOYMENT.md`. Summary: `infrastructure/Dockerfile.{api,web}`
+ `services/data-analysis/Dockerfile` + `docker-compose.yml` (Phase 15,
extended when the Data Analysis service was added) build four
production images/services — `postgres`, `api`, `web`, `data-analysis`
— via Turborepo's `turbo prune --docker` recipe for the two Node
images and a plain `pip install` build for the Python one; GitHub
Actions (`.github/workflows/`, Phase 16) runs lint/type-check/unit-
tests/build on every PR plus a real Postgres-backed e2e job, and
separately runs CodeQL, Gitleaks, Trivy (now scanning all three
application images), a weekly SBOM, and a nightly OWASP ZAP scan.
**The Docker images have never actually been built or run** — this
session's sandbox had no reachable Docker daemon, so Phase 15 (and the
later `data-analysis` addition) was validated as far as possible without
one (a real `turbo prune`, `docker compose config` parsing correctly,
the Next.js standalone output inspected file-by-file, the Python
service's actual dependency set installed and exercised for real in a
scratch venv) but not proven end-to-end inside the images themselves.
Treat that as open until someone runs `docker compose build && up` for
real.

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
