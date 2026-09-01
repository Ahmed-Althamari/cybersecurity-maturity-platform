# CMMP Implementation Status

Last Updated: 2026-09-01

## Overall Progress

**Phase**: 10 / 17
**Completion**: ~59%

## First End-to-End Verification Against a Live Database

Every phase through Phase 9 had only ever been verified with `tsc`, `nest
build`, and Jest against a mocked `PrismaService` — no session before this
one had a reachable Postgres. This session did: a local PostgreSQL 16
install was available in the sandbox (`service postgresql start`,
independent of Docker, whose daemon wasn't running here), so for the first
time the full pipeline ran for real: `prisma migrate dev` generated and
applied the actual first migration, `npm run seed` loaded the complete
106-subcategory NIST CSF 2.0 hierarchy, and the live NestJS API was
exercised end-to-end — login, `GET /frameworks`, `POST /assessments`
against the real framework (seeded exactly 106 `AssessmentItem`s), a
`PATCH .../items/:itemId` (correctly auto-transitioned DRAFT→IN_PROGRESS
and recomputed the score), `GET /assessments/:id/dashboard`, and a real
multipart CSV upload through `POST /assessments/:id/import` (confirmed the
formula-injection sanitizer neutralizes a live `=cmd|'/C calc'!A1` payload
in a free-text field, and that an unknown subcategory code and an invalid
enum value both come back as row-level errors rather than failing the
batch).

**This caught a real, previously-undetected bug**: `AuthModule`'s
`JwtModule.register({ secret: process.env.JWT_SECRET })` read the
environment variable at module-*decoration* time — while `app.module.ts`'s
own top-level imports (including `AuthModule` itself) were still being
resolved, before `ConfigModule.forRoot()` in that same imports array had
loaded `.env`. `JwtStrategy`, an `@Injectable()`, read the same variable
later at DI-*instantiation* time, after `.env` was actually loaded. Net
effect: login-issued tokens were signed with the hardcoded fallback secret
while protected routes verified against the real `.env` secret — every
authenticated request 401'd whenever a real `JWT_SECRET` was configured
(i.e. always, in any deployment following the security guidance to not
use the default). Fixed by switching `JwtModule.register()` to
`JwtModule.registerAsync()` with a `ConfigService`-injected factory, and
`JwtStrategy` to inject `ConfigService` instead of reading `process.env`
directly — both now resolve the secret at the same (post-`ConfigModule`)
point in the bootstrap sequence. No test had caught this because every
existing auth test constructs `AuthService`/`JwtService` directly, bypassing
Nest's module system entirely (correctly, for a unit test) — this class of
bug is only visible when the real DI container wires the real modules, i.e.
only in an end-to-end run. Local setup used, for reproducibility:

```bash
service postgresql start
sudo -u postgres psql -c "CREATE USER cmmp_user WITH PASSWORD 'cmmp_password' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE cmmp_db OWNER cmmp_user;"
# .env: DATABASE_URL/DIRECT_DATABASE_URL host changed from `postgres` (the
# docker-compose service name) to `localhost` (no Docker daemon here)
cd packages/database && DATABASE_URL=... npx prisma migrate dev --name init
npm run seed
cd apps/api && cp ../../.env .env && npx nest start
```

## Completed ✅

### Phase 1: Architecture & Repository Structure
- [x] Monorepo structure created (apps/, packages/, docs/, infrastructure/)
- [x] Root package.json with workspace configuration
- [x] TypeScript configuration (tsconfig.json)
- [x] ESLint configuration
- [x] Prettier configuration
- [x] Turbo build orchestration
- [x] Environment configuration (.env.example)
- [x] Git configuration (.gitignore)
- [x] Docker Compose development environment
- [x] Dockerfiles for API and Web apps
- [x] Database initialization script
- [x] README with setup instructions
- [x] LICENSE (MIT)
- [x] CONTRIBUTING.md
- [x] SECURITY.md
- [x] Architecture documentation
- [x] .github/CODEOWNERS
- [x] IMPLEMENTATION_STATUS.md tracker

### Phase 2: Database Schema Design
- [x] Prisma schema design (28 models: Tenant, Organisation, User, Role,
      Framework/Function/Category/Subcategory, Assessment*, Risk,
      RemediationInitiative, SecurityCapability, AuditEvent, ImportJob, etc.)
- [x] Entity definitions with tenant scoping on every major table
- [x] Relationships setup
- [x] Seed data script (`packages/database/prisma/seed.ts`) — NIST CSF sample
      hierarchy, demo tenant/org/users, sample assessment/risks/initiatives
- [x] Migrations structure — the first migration
      (`packages/database/prisma/migrations/20260901072626_init/`) was
      generated and applied against a real PostgreSQL 16 instance in this
      session (see "First End-to-End Verification" above) and is now
      checked into the repo

### Phase 3: Authentication & RBAC
- [x] JWT strategy (`passport-jwt`, `@nestjs/jwt`)
- [x] Login backed by real Prisma `User` lookup (no more hardcoded demo
      credentials in code)
- [x] Password hashing with `bcryptjs` (pure-JS, no native build step —
      chosen over `bcrypt` because this repo's `allowScripts` install-script
      allowlist intentionally blocks unreviewed native postinstall scripts)
- [x] Role definitions (`UserRole` enum in `@cmmp/shared`)
- [x] `RolesGuard` + `@Roles()` decorator for endpoint-level RBAC
- [x] `UsersService`/`UsersController` wired to Prisma with tenant-scoped
      queries (every read/write filters by `tenantId`)
- [x] Unit tests: login success/failure paths, tenant-isolation on
      `findOne`/`findAll`, password-hash-not-plaintext, duplicate-email
      rejection (`auth.service.spec.ts`, `users.service.spec.ts` — 9 tests)
- [x] NextAuth.js configuration on the Next.js frontend — done in Phase 10
      (see below): `CredentialsProvider` calls the real
      `POST /api/v1/auth/login`, the NestJS-issued JWT is carried inside
      the NextAuth session rather than NextAuth minting its own
- [ ] Token revocation / refresh-token rotation (current `refresh` endpoint
      re-signs a valid token; no blacklist or rotation yet)
- [x] End-to-end verification against a live database — done this session
      (see "First End-to-End Verification" above); also **found and fixed
      a real bug**: `JwtModule.register()` was reading `JWT_SECRET` before
      `ConfigModule` had loaded `.env`, so tokens were signed with the
      hardcoded fallback secret while routes verified against the real
      one — every authenticated request 401'd whenever a real `JWT_SECRET`
      was configured. Fixed via `JwtModule.registerAsync()` +
      `ConfigService`.

### Phase 4: Framework Engine
- [x] Framework type definitions (`packages/framework-engine/src/types.ts`) —
      Zod schemas + TS types for a framework-agnostic `FrameworkDefinition`
      (authoring/import shape) and a hydrated `FrameworkTree` (post-persistence
      shape with real IDs), per ADR-006
- [x] Framework loader (`loader.ts`) — `loadFrameworkTree()` hydrates a full
      Framework → Function → Category → Subcategory → Question hierarchy
      ordered by `displayOrder`, from a minimal structural `FrameworkQueryClient`
      interface rather than a hard dependency on `@prisma/client`, so the
      package stays persistence-agnostic and unit-testable with plain mocks
- [x] NIST CSF configuration structure — the generic `FrameworkDefinition`
      shape (function → category → subcategory → question) is what Phase 5's
      NIST CSF 2.0 seed data will be authored against; no NIST-specific code
      lives in the engine itself
- [x] Framework validation (`validator.ts`) — `validateFrameworkDefinition()` /
      `assertValidFrameworkDefinition()` combine Zod shape validation with
      structural checks (sibling code uniqueness at every level, case-insensitive)
- [x] Dynamic component generation (`component-descriptor.ts`) —
      `buildFrameworkComponentDescriptor()` reduces a `FrameworkTree` into a
      compact, framework-agnostic descriptor (function list with an assigned
      color and category/subcategory/question counts) the frontend can walk
      to render nav/radar/heatmap components without hard-coding NIST CSF's
      six functions
- [x] `FrameworkModule` wired into the NestJS API (`apps/api/src/framework/`):
      `GET /frameworks`, `GET /frameworks/:slug`, `GET /frameworks/:slug/components`,
      `POST /frameworks/validate` (dry-run), `POST /frameworks` (tenant-scoped
      create, `PLATFORM_ADMIN`/`ORGANISATION_ADMIN` only, nested Prisma create
      from a validated definition)
- [x] Unit tests: 16 tests in `packages/framework-engine` (validator, loader,
      component descriptor) + 10 tests in `apps/api` (`framework.service.spec.ts`
      — tenant isolation, not-found mapping, validation-without-persisting,
      unique-constraint → `ConflictException`)
- [x] Verified via `tsc --noEmit`, `nest build`, and Jest across both packages
      (all green), and end-to-end against a live database this session (see
      "First End-to-End Verification" above) — `GET /frameworks` and
      `POST /assessments` against the real seeded NIST CSF 2.0 framework
      both confirmed correct

### Phase 5: NIST CSF Framework Data
- [x] NIST CSF 2.0 complete hierarchy — all 6 Functions, 22 Categories, and
      106 Subcategory outcomes, authored as a framework-agnostic
      `FrameworkDefinition` (`packages/framework-engine/src/definitions/nist-csf-2.0.json`
      + typed wrapper `nist-csf-2-0.ts`)
- [x] Functions (GOVERN, IDENTIFY, PROTECT, DETECT, RESPOND, RECOVER)
- [x] Categories — all 22 official CSF 2.0 category codes (GV.OC, GV.RM,
      GV.RR, GV.PO, GV.OV, GV.SC, ID.AM, ID.RA, ID.IM, PR.AA, PR.AT, PR.DS,
      PR.PS, PR.IR, DE.CM, DE.AE, RS.MA, RS.AN, RS.CO, RS.MI, RC.RP, RC.CO)
- [x] Subcategories & Outcomes — every official outcome statement, with the
      correct (non-contiguous) numbering CSF 2.0 actually uses per category
      (e.g. `ID.AM` skips `-06`, `DE.CM` is `01,02,03,06,09`, `RS.CO` is
      `02,03` — matching NIST's published core, not a re-numbered sequence)
- [x] Assessment questions — one auto-generated question per subcategory
      (NIST CSF has no separate "question" concept), carrying the
      subcategory's official Implementation Examples as assessor guidance
- [x] Framework seed data — `prisma/seed.ts` now loads the full NIST CSF 2.0
      hierarchy through `persistFrameworkDefinition()` (the same shared
      helper `POST /frameworks` uses), replacing the previous 3-category
      hand-rolled sample
- [x] Shared `persistFrameworkDefinition()` extracted into
      `@cmmp/framework-engine` so the seed script and the API's
      `FrameworkService.create` use one implementation instead of two
      parallel ones
- [x] Tests: 8 new tests (24 total in `packages/framework-engine`) — official
      totals (6/22/106), NIST function-code order, subcategory-code
      namespacing, one question per subcategory, and a full-scale
      `persistFrameworkDefinition` run over all 106 subcategories

  **Data provenance & a caveat worth reading before relying on this for real
  compliance work**: the CSF 2.0 Core and Implementation Examples are public
  domain, sourced from NIST's own Cybersecurity and Privacy Reference Tool
  (CPRT). This sandbox could not reach `nist.gov`/`csrc.nist.gov` directly
  (network egress policy blocks those hosts), so the data was pulled from a
  third-party structured mirror of the CPRT export
  (`github.com/MarianoFacundoArch/nist-csf-evidence-gap-analysis-tool`,
  `data/csf-core.json`) rather than fetched from NIST directly. The
  resulting counts match NIST's published totals exactly (6/22/106, verified
  by test), which is a strong integrity signal, but nobody in this session
  diffed it byte-for-byte against NIST CSWP 29. Spot-check outcome wording
  against the official publication before treating this as an authoritative
  compliance mapping.

### Phase 6: Assessment Engine
- [x] Assessment model — used as-is from Phase 2's schema (`Assessment`,
      `AssessmentItem`, `AssessmentHistory`); no schema changes needed
- [x] Assessment creation (`POST /assessments`) — resolves a Framework by
      slug/version through `FrameworkService.getTree` (the Phase 4/5 loader),
      flattens every question across the tree, and bulk-creates one
      `AssessmentItem` per question, so an assessment's question set always
      matches what `GET /frameworks/:slug` shows for that framework/version
- [x] Assessment responses (`PATCH /assessments/:id/items/:itemId`) —
      per-item updates (maturity, risk, control status, rationale, evidence,
      owner, remediation due date); blocked once an assessment is
      SUBMITTED/APPROVED/ARCHIVED ("reopen it first")
- [x] Draft/submitted states — a small explicit state machine
      (`DRAFT → IN_PROGRESS → SUBMITTED → APPROVED`, `ARCHIVED` reachable
      from any non-terminal state, `SUBMITTED`/`APPROVED` reopenable back to
      `IN_PROGRESS` for rework) enforced in `AssessmentsService`; the first
      item edit on a DRAFT assessment auto-transitions it to IN_PROGRESS;
      `submit()` requires 100% completion first
- [x] Assessment history tracking — every status transition appends an
      `AssessmentHistory` row (`GET /assessments/:id/history`), versioned
      and timestamped
- [x] Role-gated mutations (`AUTHORS` create/edit/submit/reopen,
      `APPROVERS` approve, `ARCHIVERS` delete/archive) and tenant +
      organisation isolation (organisation ownership checked against the
      caller's tenant before an assessment can be created against it)
- [x] Tests: 16 new tests in `apps/api` (35 total) — tenant isolation,
      question-seeding from a framework tree, the editing guard, the
      auto-transition-on-first-edit behaviour, illegal-transition rejection,
      and the submit-requires-100%-completion rule

  **Scope note**: `completionPercentage` here is a workflow-progress
  heuristic (share of items whose `controlStatus` has moved off
  `NOT_STARTED`), not a maturity score — `Assessment.currentMaturity` /
  `targetMaturity` / `maturityGap` are deliberately left null for Phase 7
  (Scoring Engine) to own: item scoring, category/function aggregation,
  org-wide scoring, and gap analysis.

### Phase 7: Scoring Engine
- [x] Maturity level definitions (`packages/scoring-engine/src/maturity-scale.ts`)
      — a 1-5 numeric scale backing the platform's default "CMMP Standard
      0-5" maturity model (Initial=1 ... Optimised=5); `NOT_APPLICABLE` is
      excluded from scoring entirely rather than treated as a 0
- [x] Item scoring calculation (`scoreResponses()`) — weighted average of
      current/target maturity across a flat set of responses; a not-yet-
      assessed item (schema defaults: `currentMaturity=NOT_APPLICABLE`,
      `targetMaturity=DEFINED`) correctly contributes nothing to either
      average rather than leaking its default target score in
- [x] Category aggregation, Function aggregation, Organization-wide scoring
      (`aggregateHierarchy()`) — bottom-up weighted rollup, Subcategory →
      Category → Function → org-wide, where each level's contribution
      weight to its parent is its own applicable-response weight (so a
      thin or fully-N/A subcategory can't distort its category's score)
- [x] Gap analysis (`identifyGaps()`) — flattens a scored hierarchy into
      gap entries at any combination of function/category/subcategory
      level, sorted by gap descending, with a risk level assigned by gap
      magnitude (0-1 point gaps: not yet enforced, no strong opinion is
      baked in beyond the plain magnitude bands)
- [ ] Weighted scoring (future) — `AssessmentItem.weight` is already
      threaded through the whole engine (defaults to 1.0), but nothing yet
      sets it to anything other than the default; no UI/API surface to
      customize per-item weight exists yet
- [x] Wired into the Assessment Engine: `ScoringModule`/`ScoringService`
      (`apps/api/src/scoring/`) loads an assessment's items together with
      the Function/Category/Subcategory each belongs to (via the
      question's relations) and feeds them through the scoring engine.
      `AssessmentsService`'s per-item update now recomputes and persists
      `Assessment.currentMaturity`/`targetMaturity`/`maturityGap` (the
      fields Phase 6 deliberately left null) alongside `completionPercentage`
      in the same write. New `GET /assessments/:id/scores` endpoint returns
      the full hierarchical score plus a gap-analysis list
      (`?levels=function,category,subcategory&minGap=`)
- [x] Tests: 19 new tests in `packages/scoring-engine` (maturity-scale,
      aggregate, gap-analysis — including a regression test pinning the
      unassessed-item/default-target fix above) + 6 new tests in `apps/api`
      (`ScoringService`, plus `AssessmentsService` coverage of score
      persistence and tenant-scoped score retrieval) — 84 tests total across
      the branch

### Phase 8: Excel Import Engine
- [x] Excel/CSV parser (`packages/import-engine/src/parse.ts`) — `exceljs`
      for `.xlsx` (first worksheet; formula cells resolve to their last
      calculated result, not the formula text; rich text flattens to plain
      text), `papaparse` for `.csv`; both report a 1-based row number
      matching what a user would see with the file open, and parse
      failures surface as `SpreadsheetParseError` rather than an opaque
      library exception
- [ ] Column mapping UI — no frontend exists yet (Phase 10). The backend
      accepts an explicit `ColumnMapping` (target field → source column
      header) per import request; there's no auto-detection/suggestion of
      a mapping from a sheet's headers
- [x] Data validation (`map-and-validate.ts`) — per-row, per-field: enum
      values for maturity/risk/control-status (case- and separator-
      insensitive, e.g. "In Progress" matches `IN_PROGRESS`),
      `businessCriticality` as an integer 1-5, email format, date parsing;
      a row with any validation failure is `ERROR` (nothing applied), a
      row needing only formula sanitization is `WARNING` (still applied)
- [x] Formula injection prevention (`sanitize.ts`) — CWE-1236 / OWASP CSV
      injection: any free-text field (rationale, evidence, comments, owner
      name) starting with `=`, `+`, `-`, `@`, tab, or CR is neutralized by
      prefixing a `'` (the same "force text" convention Excel itself uses)
      rather than silently stripped, so the sanitized value stays visible
      and reversible; flagged as a row `WARNING`, not silent
- [x] Error reporting — every row (VALID, WARNING, and ERROR alike) becomes
      an `ImportRecord` (rowNumber, status, message, rawData, parsedData)
      for the audit trail; `ImportJob.errorReport` carries a JSON summary
      of just the error rows
- [x] Bulk import with transaction support — `POST /assessments/:id/import`
      (multipart upload, 5MB cap) resolves each row's subcategory code
      against *that assessment's own* pre-seeded `AssessmentItem`s (Phase
      6: import updates existing items, it never creates new ones), then
      applies every `AssessmentItem` update and every `ImportRecord` in one
      `$transaction` alongside the `ImportJob`; a code with no matching
      item in the assessment's framework becomes a row-level `ERROR`
      rather than failing the whole batch. `AssessmentsService.
      recalculateProgress` (made public for this) runs once afterward
      rather than once per row.
- [x] Tests: 24 new tests in `packages/import-engine` (sanitize, parse,
      map-and-validate) + 8 new tests in `apps/api` (`ImportService` —
      including a transaction-scoped partial-failure case and the
      formula-injection-still-applies-as-WARNING case) — 116 tests total
      across the branch

### Phase 9: Dashboard APIs
- [x] Executive dashboard endpoint — `GET /assessments/:id/dashboard` fans
      out to every section below in parallel and returns one
      `ExecutiveDashboard` payload (`packages/shared`), for a landing page
      that needs several widgets in a single request
- [x] Maturity overview endpoint — `GET .../dashboard/maturity-overview`
      (`MaturityOverview`): org-wide current/target/gap from
      `ScoringService`, `completionPercentage` from the `Assessment` row,
      `criticalGaps` (subcategory-level CRITICAL gap count), `highRiskFindings`
      (open CRITICAL/HIGH risks), `openRemediationActions`
      (PLANNED/IN_PROGRESS initiatives)
- [x] Function maturity endpoint — `GET .../dashboard/functions`
      (`FunctionMaturity[]`): one entry per NIST function in framework
      display order, with its own completion percentage (recomputed the
      same way Phase 6 defines completion — `controlStatus` off
      `NOT_STARTED`) and a `highRiskGaps` count attributed from
      subcategory-level gap analysis
- [x] Gap analysis endpoint — `GET .../dashboard/gaps` (`GapAnalysis[]`,
      `?minGap=`): function-level gaps enriched with code/name and an
      `affectedControls` count (subcategories under that function with a
      real gap > 0)
- [x] Risk summary endpoint — `GET .../dashboard/risks` (`RiskSummary`):
      risks traced through `Risk.assessmentItem → AssessmentItem.assessmentId`
      (risks not linked to any item on this assessment are out of scope —
      Risk is organisation-scoped in the schema, this view is
      assessment-scoped), grouped by level/status, top 10 by severity
- [x] Roadmap status endpoint — `GET .../dashboard/roadmap`
      (`RoadmapStatus`): `RemediationInitiative`s traced through the
      Risk↔Initiative many-to-many (initiatives linked to any risk that is
      itself linked to this assessment), grouped by status, next 10
      upcoming by `targetCompletionDate`
- [x] Added `RiskSummary`, `RoadmapStatus`, `ExecutiveDashboard` to
      `@cmmp/shared` alongside the `MaturityOverview`/`FunctionMaturity`/
      `GapAnalysis` types Phase 1 had already stubbed there — this phase
      is mostly composition of Phase 6/7 (`AssessmentsService`,
      `ScoringService`) plus new read-only Risk/RemediationInitiative
      queries, not new calculation logic
- [x] Tests: 7 new tests in `apps/api` (`DashboardService` — composition
      correctness, tenant/assessment scoping, gap-to-function attribution,
      upcoming-initiative sorting) — 123 tests total across the branch

### Phase 10: Dashboard UI
This is the first real frontend work in the project — before this, `apps/web`
was the default Next.js scaffold plus a stubbed NextAuth config with a
hardcoded demo-users array. Verified live in a real browser (Playwright/
Chromium against the running Next.js + NestJS + Postgres stack), not just
`tsc`/`next build` — screenshots taken at every step during development.
- [x] Landing/home dashboard — `pages/index.tsx` now redirects based on auth
      state (`/assessments` if signed in, `/auth/signin` otherwise); the
      previous placeholder dashboard content (hardcoded stat cards) is
      replaced by the real one below
- [x] **Also completed real Phase 3 frontend work that had been left open**:
      wired NextAuth's `CredentialsProvider.authorize()` to actually call
      `POST /api/v1/auth/login` (it was a hardcoded `demoUsers` array with a
      `// TODO: call actual authentication API` comment), threads the
      issued JWT + tenantId/organisationId/role through the NextAuth
      session (`types/next-auth.d.ts` module augmentation), and built a
      real `/auth/signin` page (the `pages: { signIn: '/auth/signin' }`
      config pointed at a page that didn't exist)
- [x] KPI cards (Maturity, Gap, Completion, etc.) — 7 cards: Overall/Target/
      Gap maturity, Completion%, Critical Gaps, High Risk Findings, Open
      Remediations, with tone coloring (gap severity, zero-is-good counts)
- [x] Radar chart (6 functions) — Recharts `RadarChart`, current vs. target
- [x] Maturity gap bar chart — Recharts `BarChart`, current vs. target per
      function
- [x] Function detail cards — one per NIST function with a progress bar,
      completion%, and a high-risk-gap badge when applicable
- [x] Top 10 gaps table — sorted by gap descending, with risk-level badges
- [x] Risk summary and remediation roadmap panels — not on the original
      Phase 10 checklist by name, but `GET /assessments/:id/dashboard`
      already returns this data (Phase 9), so it's real, live-verified UI,
      not placeholder
- [ ] Security maturity heatmap — not built this pass; `GET .../dashboard/gaps`
      only returns function-level entries today (the underlying
      `ScoringService`/gap-analysis engine already supports
      category/subcategory granularity — see Phase 7/9 — the dashboard
      endpoint just doesn't expose a `levels` query param yet)
- [ ] Maturity distribution — not built this pass
- [x] Minimal `components/ui/*` primitives (Card, Button, Badge) built from
      the shadcn-style pieces already in `package.json`
      (`class-variance-authority`, `clsx`, `tailwind-merge`,
      `@radix-ui/react-slot`) — no actual shadcn/ui components existed yet,
      only the CSS-variable theme in `globals.css`/`tailwind.config.js`
- [x] `@cmmp/shared`'s dashboard types (`ExecutiveDashboard`,
      `FunctionMaturity`, `GapAnalysis`, `RiskSummary`, `RoadmapStatus`)
      reused directly as the frontend's data contract — no type duplication
      between backend and frontend
- [x] Live-verified end-to-end in a real browser: sign in → assessment list
      (2 assessments, one from seed data with real risks/initiatives, one
      created live via `POST /assessments` against the full 106-item NIST
      CSF framework) → dashboard, all sections rendering correct live data;
      caught and fixed one real cosmetic bug (`globals.css`'s global
      `a { text-decoration: underline }` base style was bleeding into the
      assessment-card links)

## Known Issues 🐛

- Root `.eslintrc.json` references `eslint-plugin-security`,
  `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-import`,
  and `eslint-config-next`, none of which are installed anywhere in the repo
  (pre-existing since Phase 1 — `npm run lint` currently fails repo-wide,
  not something introduced in Phase 3). Needs its own fix: either install
  the missing plugins at the root, or split frontend/backend ESLint configs.
- `packages/database`'s local `prisma` devDependency resolves inconsistently
  under npm workspaces (`@prisma/client`'s `peerDependencies: { prisma: "*" }`
  can pull in a newer major version than the pinned `^5.22.0`, marked
  "invalid" by `npm ls`). Workaround in place: always run Prisma generate
  from the repo root (`npm run db:generate`), not via the workspace-local
  binary; `packages/database`'s own `build` script only runs `tsc`.

## Not Started ⭕

### Phase 11: Risk Register
- [ ] Risk model
- [ ] Risk creation API
- [ ] Risk detail page
- [ ] Risk-control mapping
- [ ] Risk prioritization
- [ ] Risk remediation tracking

### Phase 12: Remediation Roadmap
- [ ] Initiative model
- [ ] Auto-generation from gaps
- [ ] Prioritization algorithm
- [ ] Timeline views (3, 6, 12 month)
- [ ] Roadmap UI
- [ ] Status tracking

### Phase 13: Audit Logging
- [ ] Audit event model
- [ ] Logging middleware
- [ ] Immutable audit trail
- [ ] Audit log API
- [ ] Audit dashboard

### Phase 14: Tests
- [ ] Unit tests (Jest)
- [ ] Component tests (React Testing Library)
- [ ] API tests
- [ ] Integration tests
- [ ] E2E tests (Playwright)
- [ ] Tenant isolation tests
- [ ] Authorization tests
- [ ] Security tests

### Phase 15: Docker
- [ ] Docker image builds
- [ ] Docker Compose orchestration
- [ ] Health checks
- [ ] Volume management
- [ ] Network configuration
- [ ] Container security scanning

### Phase 16: CI/CD Security Pipeline
- [ ] GitHub Actions CI workflow (.github/workflows/ci.yml)
- [ ] SAST setup (CodeQL)
- [ ] Dependency scanning (Dependabot)
- [ ] Secret scanning (Gitleaks)
- [ ] DAST setup (OWASP ZAP)
- [ ] Container scanning (Trivy)
- [ ] SBOM generation
- [ ] Security gates configuration
- [ ] Deployment workflow

### Phase 17: Documentation
- [ ] Security architecture document
- [ ] Data model documentation
- [ ] API design document
- [ ] Scoring methodology
- [ ] Framework model documentation
- [ ] Excel import format guide
- [ ] Deployment guide
- [ ] DevSecOps pipeline documentation
- [ ] ADRs (Architecture Decision Records)
- [ ] Threat model & STRIDE analysis

## Blockers 🚫

None currently

## Architecture Decisions

### ADR-001: Monorepo Architecture ✅
- **Status**: Accepted
- **Rationale**: Shared packages for framework engine, scoring, security
- **Alternatives Considered**: Separate repos, different build systems
- **Consequences**: Single deployment pipeline, shared dependencies

### ADR-002: Next.js Frontend ✅
- **Status**: Accepted
- **Rationale**: Server-side rendering, API routes, performance, DX
- **Alternatives**: Vue, Svelte, Remix
- **Consequences**: Good SEO, faster initial load

### ADR-003: NestJS Backend ✅
- **Status**: Accepted
- **Rationale**: Enterprise architecture, dependency injection, TypeScript
- **Alternatives**: Express, FastAPI, Go
- **Consequences**: Opinionated structure, good for teams

### ADR-004: PostgreSQL Database ✅
- **Status**: Accepted
- **Rationale**: Mature, JSONB support, strong consistency
- **Alternatives**: MySQL, MongoDB, Firebase
- **Consequences**: Relational model, strong ACID compliance

### ADR-005: Prisma ORM ✅
- **Status**: Accepted
- **Rationale**: Type-safe, migrations, query builder
- **Alternatives**: TypeORM, Sequelize, Knex
- **Consequences**: Generated client, good developer experience

### ADR-006: Framework-Agnostic Engine ✅
- **Status**: Accepted
- **Rationale**: Support multiple frameworks without redesign
- **Alternatives**: Hard-code NIST CSF
- **Consequences**: More flexible, more complex initially

### ADR-007: Configurable Maturity Scoring ✅
- **Status**: Accepted
- **Rationale**: Support different maturity models
- **Alternatives**: Hard-code 1-5 scale
- **Consequences**: More flexible, more configuration

### ADR-008: Multi-Tenant Architecture ✅
- **Status**: Accepted
- **Rationale**: SaaS model, data isolation, scalability
- **Alternatives**: Single-tenant per customer
- **Consequences**: Security complexity, but better economics

### ADR-009: NextAuth.js Authentication ✅
- **Status**: Accepted
- **Rationale**: Flexible, OIDC support, good for Next.js
- **Alternatives**: Auth0, Cognito, custom JWT
- **Consequences**: Good dev experience, enterprise-ready

### ADR-010: GitHub DevSecOps Pipeline ✅
- **Status**: Accepted
- **Rationale**: Integrated security, good for compliance
- **Alternatives**: Jenkins, GitLab, CircleCI
- **Consequences**: Security first, GitHub native

## Dependencies

### Critical
- Node.js 18+
- PostgreSQL 15
- Docker & Docker Compose

### Development
- npm/pnpm 9+
- TypeScript 5.2+
- ESLint, Prettier

### Production (TBD)
- Container orchestration (Kubernetes - future)
- CDN (CloudFront - future)
- Secrets management (Vault/Secrets Manager - future)

## Technical Debt

None recorded yet

## Security Findings

- **[Fixed, this session] JWT signing/verification secret mismatch**
  (auth availability, not a bypass — the failure mode was every
  authenticated request 401ing, not unauthorized access): `AuthModule`'s
  `JwtModule.register({ secret: process.env.JWT_SECRET })` read the env
  var before `ConfigModule` had loaded `.env`, silently falling back to
  the hardcoded default secret for signing, while `JwtStrategy` verified
  against the real `.env` value read later at DI-instantiation time. Only
  surfaced by running the real app end-to-end (see "First End-to-End
  Verification" above) — no unit test exercises Nest's actual module
  bootstrap/DI ordering. Fixed via `JwtModule.registerAsync()` +
  `ConfigService`, in both `auth.module.ts` and `jwt.strategy.ts`.

## Next Steps

1. ~~Generate the first Prisma migration~~ — done this session (see "First
   End-to-End Verification" above); the migration is checked in
2. **Begin Phase 11**: Risk Register — a real Risk CRUD API + UI (today,
   risks only exist via seed data and the read-only dashboard rollup);
   risk-control mapping, prioritization, and remediation tracking
3. Round out the Phase 10 frontend: an assessment-taking flow (create an
   assessment, walk its 106 items, `PATCH` responses — today only the
   read-side dashboard has UI), a framework selection UI, and a
   column-mapping step for spreadsheet import (the backend takes an
   explicit `ColumnMapping` today with no auto-suggestion). Also: a
   category/subcategory-level `levels` query param on
   `GET .../dashboard/gaps` (the engine already supports it) to build the
   still-missing security maturity heatmap and maturity distribution
   views.
4. Spot-check the seeded NIST CSF 2.0 outcome text against the official
   NIST CSWP 29 publication (see the Phase 5 data-provenance note above) —
   this sandbox couldn't reach nist.gov directly to verify byte-for-byte
5. Fix the repo-wide ESLint plugin gap (see Known Issues)

## Contact & Questions

- See CONTRIBUTING.md for contribution guidelines
- See SECURITY.md for security reporting
- Check docs/ for detailed documentation
