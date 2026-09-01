# CMMP Implementation Status

Last Updated: 2026-09-01

## Overall Progress

**Phase**: 16 / 17 (plus a frontend gap-closure pass ahead of Phase 17 -- see "Frontend Gap Closure" below)
**Completion**: ~96%

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

### Phase 11: Risk Register
- [x] Risk model — used as-is from Phase 2's schema (`Risk`,
      `RemediationInitiative`, their implicit many-to-many); no schema
      changes needed
- [x] Risk creation API — `POST /risks` (`apps/api/src/risks/`), tenant +
      organisation scoped. `inherentRiskScore = likelihood x impact` is
      always computed server-side (not trusted from the client); `riskLevel`
      is auto-suggested from that score via `suggestRiskLevel()` when the
      caller doesn't supply one, but an explicit `riskLevel` always wins
- [x] Risk detail page — `GET /risks/:id` (API) + `pages/risks/[id].tsx`
      (UI): full detail, inline owner/status editing, linked-initiative
      management
- [x] Risk-control mapping — `Risk.assessmentItemId` links a risk to the
      specific control (`AssessmentItem`) it was identified against,
      verified to belong to the caller's own tenant before linking; the
      detail page surfaces the linked control's subcategory code and
      question text
- [x] Risk prioritization — `GET /risks?sortBy=score` (default) orders by
      `inherentRiskScore` descending; also filterable by
      `organisationId`/`riskLevel`/`status`/`assessmentItemId`
- [x] Risk remediation tracking — `POST`/`DELETE /risks/:id/initiatives/:initiativeId`
      connect/disconnect a `RemediationInitiative` via the schema's
      existing many-to-many; the detail page lists linked initiatives with
      unlink buttons and a link-by-ID form (no initiative-picker UI yet —
      noted below)
- [x] Frontend: `pages/risks/index.tsx` (sortable list with risk-level
      badges), `pages/risks/new.tsx` (create form with a live risk-score
      preview), `pages/risks/[id].tsx` (detail/edit/initiative-linking);
      linked from the assessments list and dashboard headers
- [x] Tests: 21 new tests in `apps/api` (`RisksService` — score computation,
      auto-suggested vs. explicit risk level, tenant isolation on every
      operation including cross-tenant initiative-linking rejection,
      score-recompute-on-update) — 77 tests total in `apps/api`
- [x] Live-verified in a real browser: created a risk (likelihood 5 x
      impact 4 correctly auto-leveled CRITICAL), edited owner/status and
      confirmed persistence across a page reload, linked and unlinked a
      real seeded remediation initiative, confirmed prioritized sort order
      against the 3 seed risks

  **Not built this pass**: an initiative *picker* (today the UI takes a
  raw initiative ID — there's no initiative list/search endpoint or page
  yet, since Phase 12 owns the Remediation Roadmap); a dedicated way to
  create a `Risk` directly from an `AssessmentItem` in the assessment UI
  (today `assessmentItemId` is only settable via the API, not the risk
  creation form).

### Phase 12: Remediation Roadmap
- [x] Initiative model — used as-is from Phase 2's schema
      (`RemediationInitiative`); no schema changes needed
- [x] Auto-generation from gaps — `POST /assessments/:id/roadmap/generate`
      (`apps/api/src/initiatives/roadmap.controller.ts`) calls
      `ScoringService.computeGapAnalysis` (Phase 7) at function-level and
      creates one draft initiative per gap at or above a threshold
      (`?minGap=`, default 0.5); current/target maturity come from the
      gap's scores via `scoring-engine`'s own `scoreToMaturityLevel`, so
      the roadmap never invents a maturity label independently of the
      scoring engine's scale
- [x] Prioritization algorithm — a gap's `riskLevel` (already computed by
      the Phase 7 gap-analysis engine from gap magnitude) maps to both a
      1-5 `priority` (1 = most urgent, matching the schema's existing seed
      data convention) and a target-completion timeline (CRITICAL/HIGH -> 
      90 days, MEDIUM -> 180 days, LOW/MINIMAL -> 365 days); complexity is
      a separate small heuristic on the gap's own magnitude (bigger gap =
      assumed more complex), not derived from priority
- [x] Timeline views (3, 6, 12 month) — `GET /initiatives/timeline` buckets
      every non-completed initiative by how far out its
      `targetCompletionDate` is (`next3Months`/`next6Months`/
      `next12Months`/`beyondOrUnscheduled`, the last bucket also catching
      completed and undated initiatives)
- [x] Roadmap UI — `pages/roadmap/index.tsx`: a 4-column timeline board
      with priority badges, capability labels, due dates, and an inline
      status dropdown per card; a "Generate Roadmap from Gaps" button on
      the assessment dashboard (`pages/assessments/[id].tsx`) drives the
      auto-generation endpoint for that assessment
- [x] Status tracking — `PATCH /initiatives/:id` accepts any of the
      schema's five statuses (`PLANNED`/`IN_PROGRESS`/`COMPLETED`/
      `BLOCKED`/`ON_HOLD`); unlike `AssessmentsService`'s workflow, there's
      deliberately no rigid transition graph here — remediation status is
      a plain field practitioners set directly, not an audited lifecycle
- [x] Risk linking symmetric with Phase 11: `POST`/`DELETE
      /initiatives/:id/risks/:riskId` connect/disconnect the same
      Risk↔RemediationInitiative many-to-many `RisksService.linkInitiative`
      already uses, just from the initiative side
- [x] Tests: 9 new tests in `apps/api` (`InitiativesService` — tenant
      isolation, risk linking, timeline bucketing across all four bands,
      and generate-from-gaps' priority/complexity/maturity/date derivation
      including the minGap exclusion) — 86 tests total in `apps/api`
- [x] Live-verified in a real browser: clicked "Generate Roadmap from
      Gaps" on the real seeded assessment (created 1 new initiative from
      its one remaining function-level gap), confirmed all 4 initiatives
      (3 from seed data, 1 auto-generated) appear correctly bucketed by
      due date on the roadmap page, changed a status via the inline
      dropdown and confirmed it persisted

  **Not built this pass**: an initiative picker for the risk detail page
  (noted in Phase 11) is now unblocked by `GET /initiatives`, but the UI
  wiring wasn't added; a `SecurityCapability`-aware categorization (today
  `securityCapability` is just the function's display name, not a link to
  the separate `SecurityCapability` model).

### Phase 13: Audit Logging
- [x] Audit event model — used as-is from the existing schema
      (`AuditEvent` + `AuditAction` enum were already defined but unused);
      added the corresponding `AuditAction`/`AuditEvent`/`AuditEventSummary`
      types to `@cmmp/shared`
- [x] Logging middleware — a global `AuditInterceptor`
      (`apps/api/src/audit/audit.interceptor.ts`), wired once via
      `APP_INTERCEPTOR` in `AuditModule` rather than sprinkled through every
      service. It only fires for authenticated HTTP requests, maps
      `POST`/`PUT`/`PATCH`/`DELETE` to `CREATE`/`UPDATE`/`UPDATE`/`DELETE`,
      skips read-only `GET`s and the `AuthController` (which logs its own
      LOGIN/LOGOUT with more specific context), and prefers the route's
      `:id` param over the response body's `id` for `resourceId`. Auth's
      `login()`/`logout()` in `AuthService` call `AuditService.log()`
      directly (not via the interceptor) so they can carry an accurate
      `description` and IP/user-agent even though `AuthController`
      responses are excluded from the generic interceptor path.
- [x] Immutable audit trail — enforced at the application-code level:
      `AuditService` only exposes `log()` (create) and read methods
      (`findAll()`, `getSummary()`); there is no update or delete path
      anywhere in the code, and nothing else in the API imports
      `prisma.auditEvent` directly. `log()` truncates oversized
      `newValue` payloads (5,000-char cap, ending in `…(truncated)`) and,
      critically, never throws — a failed audit write is logged via
      `Logger.error` and swallowed so it can never break the request it's
      auditing.
- [x] Audit log API — `GET /audit-events` (filterable by `userId`,
      `action`, `resource`, `resourceId`, `correlationId`, a `from`/`to`
      date range, and paginated with `page`/`pageSize`, capped at 200 per
      page) and `GET /audit-events/summary` (`sinceDays`, default 30;
      returns `totalEvents`, a zero-filled `byAction` count for every
      `AuditAction`, `byResource` counts, and the 20 most recent events).
      Both endpoints are tenant-scoped and restricted to
      `PLATFORM_ADMIN`/`ORGANISATION_ADMIN`/`AUDITOR`/`CISO` via the
      existing `JwtAuthGuard`/`RolesGuard`/`@Roles` combination.
- [x] Audit dashboard — `pages/audit/index.tsx`: KPI-style cards for total
      events plus a card per non-zero action count, and a Recent Events
      table (when/action/resource/resource ID/description) with a color
      badge per action reusing the existing risk-level `Badge` variants;
      a friendly message on a 403 instead of a raw error; a nav link added
      from the assessments header.
- [x] Fixed a bootstrap-ordering break: adding `AuditService` as a new
      required constructor dependency of `AuthService` broke
      `auth.service.spec.ts` (a hand-constructed instance, not a Nest
      testing module) — `tsc --noEmit` didn't catch it because
      `apps/api/tsconfig.json` excludes `*.spec.ts`; only running the full
      Jest suite surfaced it. Fixed by adding a mocked `AuditService` to
      the spec and asserting the new LOGIN/LOGOUT audit calls.
- [x] Tests: 13 new tests in `apps/api` (7 for `AuditService` — field
      writing, oversized-value truncation, never-throws-on-write-failure,
      tenant-scoped pagination with the 200-item cap, zero-filled summary;
      6 for `AuditInterceptor`, exercised via hand-built fake
      `ExecutionContext`/`CallHandler` objects rather than a full Nest
      testing module — CREATE-on-POST, route-param-id precedence over
      body id, GET is not logged, unauthenticated requests are not logged,
      the `AuthController` is excluded, DELETE mapping) plus 2 updated
      `AuthService` tests (LOGIN on login, LOGOUT on logout) — 99 tests
      total in `apps/api`
- [x] Live-verified in a real browser: logged in as the seeded CISO user
      (produced a real `LOGIN` audit event with the correct email in its
      description), then submitted the "New Risk" form (produced a `CREATE`
      audit event against `Risks` with the created risk's real ID as
      `resourceId`); the audit dashboard's KPI counts and Recent Events
      table updated correctly for both. Also ran a clean production
      `next build` including the new `/audit` route.

  **Not built this pass**: an UPDATE-action live-verification pass (the
  interceptor's PATCH→UPDATE mapping is covered by a unit test, but wasn't
  separately confirmed live in this session's browser pass — only CREATE
  and LOGIN were); a UI for the `GET /audit-events` filtered/paginated list
  endpoint (today the dashboard only surfaces the last 20 events via
  `getSummary()`); correlating audit events across services for a given
  `correlationId` in the UI.

### Phase 14: Tests
- [x] Unit tests (Jest) — already substantial from every prior phase;
      107 tests in `apps/api` after this phase's additions (was 99)
- [x] Component tests (React Testing Library) — new `apps/web` test
      infrastructure (`jest.config.js` via `next/jest`, `jest.setup.js`,
      a `types/jest.d.ts` triple-slash reference so `tsc` recognizes
      `@testing-library/jest-dom`'s matchers): 16 tests covering the
      `Button`/`Badge`/`RiskLevelBadge` UI primitives and a full
      `AuditPage` test (mocked `next-auth/react` + `@/lib/api`) covering
      the unauthenticated redirect, the loaded-summary render, and the
      403-friendly-message path. **Found and fixed a real build break**
      while wiring this up: a page-level test file placed under
      `pages/audit/index.test.tsx` was picked up by Next.js as an actual
      *route* and broke `next build` (`ReferenceError: jest is not
      defined` during page-data collection) -- moved page-level tests to
      a top-level `apps/web/__tests__/` directory instead.
- [x] API tests — covered by the existing per-feature Jest suites
      (scoring, framework, assessments, risks, initiatives, import,
      dashboard, auth, audit) plus this phase's `RolesGuard` and
      `AuditController` wiring specs.
- [x] Integration tests — a new `apps/api/test/tenant-security.integration-spec.ts`
      boots the **real** `AppModule` (every module, guard, and
      interceptor, nothing mocked) against the live local Postgres
      database over real HTTP (`app.listen(0)` + the built-in `fetch`),
      creating and tearing down a second real tenant/org/user/risk to
      exercise cross-tenant behaviour. Kept out of the default `npm test`
      via a separate `jest.integration.config.js` and `npm run
      test:integration` script (`--runInBand --forceExit`) so the fast,
      DB-free unit suite CI will eventually run stays fast; this one
      needs a reachable `DATABASE_URL` and the seeded demo tenant.
- [x] E2E tests (Playwright) — a real, committed `playwright.config.ts`
      (`webServer` starts both the API and web dev servers if they
      aren't already running) and `e2e/audit-log.spec.ts`, covering
      login → LOGIN event, create-risk → CREATE event, and the
      non-privileged-role friendly-403 path, all against the actual
      running stack.
- [x] Tenant isolation tests — already present per-feature since Phase 6
      (every service's Jest suite asserts tenant-scoped queries); this
      phase adds a dedicated cross-cutting regression via the new
      integration suite (a second tenant's risk never appears in tenant
      A's listing, and a direct-by-id fetch across tenants 404s rather
      than leaking the record).
- [x] Authorization tests — new `roles.guard.spec.ts` (6 tests) plus the
      integration suite's role-based 200/403 assertions.
- [x] Security tests — the integration suite also asserts: a wrong
      password is rejected, a request with no bearer token 401s, a
      *tampered* JWT signature 401s (not just a missing one), an
      unrecognized DTO field is rejected outright by
      `forbidNonWhitelisted` (mass-assignment protection), and a
      cross-tenant `organisationId` on `POST /risks` 404s instead of
      creating the record.
- [x] **Found and fixed two real bugs via this phase's test-writing**,
      continuing this session's pattern of catching defects specifically
      *because* a test was being written, not by inspection alone:
      1. **RBAC bypass in `AuditController`** (introduced in Phase 13):
         `@Roles(...AUDIT_READERS)` was applied at the *class* decorator
         level, but `RolesGuard.canActivate()` reads metadata off
         `context.getHandler()` (the method), never `context.getClass()`
         -- every other controller in the codebase applies `@Roles()`
         per-method, which is what `RolesGuard` actually reads. The
         practical effect: `Reflect.getMetadata` returned `undefined` for
         every audit-events route, so `RolesGuard`'s
         no-metadata-means-public early return let *any* authenticated
         user (including `READ_ONLY_VIEWER`) read the full audit log.
         First surfaced by the Playwright suite (a viewer account saw the
         real event table instead of a 403), then reproduced and pinned
         down by the integration suite; fixed by moving
         `@UseGuards(RolesGuard)`/`@Roles(...)` onto each handler method,
         with a regression test (`audit.controller.spec.ts`) asserting
         the metadata is attached directly to `findAll`/`getSummary`.
      2. **`RolesGuard` only ever checked a user's *first* assigned
         role**: the schema (`UserRoleAssignment`) has always supported
         multiple role assignments per user, and `AuthService` computes
         `role: roles[0]` as a convenience field alongside the full
         `roles: string[]` array, but `RolesGuard` checked only the
         singular `user.role` -- so a user holding, say, `CISO` as their
         *second* role assignment would be incorrectly denied a
         `@Roles(CISO)` endpoint. Fixed to check the full `roles[]` array
         (falling back to the singular field if absent), with 6 new
         regression tests including the exact multi-role scenario.
- [x] Live-verified: the full Playwright suite and the Jest integration
      suite both pass cleanly against the real stack after both fixes.

  **Not built this pass**: component tests for the other `apps/web` pages
  (assessments list, risk register, roadmap) beyond `AuditPage`; the E2E
  suite covers only the audit-logging flows added most recently, not a
  full regression pass over every earlier-phase page; a CI workflow to
  actually run any of this (that's Phase 16).

### Phase 15: Docker
- [x] Docker image builds — rewrote both `infrastructure/Dockerfile.api`
      and `infrastructure/Dockerfile.web` from scratch: the versions
      already in the repo (scaffolded in Phase 1, never touched since)
      used `pnpm`, but this is an npm-workspaces monorepo (`package-lock.json`,
      no `pnpm-lock.yaml`) — every `pnpm install` in them would have failed
      immediately. Both are now multi-stage, npm-based, and build from the
      **repository root** as context (required for a monorepo, since a
      workspace's `dist/` depends on its sibling packages' `dist/`):
      - `Dockerfile.api`: `npm ci` → `npm run db:generate` (the generated
        Prisma Client is a hard prerequisite for `@cmmp/database`'s own
        `tsc` build, which just re-exports `@prisma/client` — a workspace
        build with no live database needed) → `npm run build` (root
        `turbo run build`, which resolves the whole dependency graph via
        `turbo.json`'s `"dependsOn": ["^build"]"`) → a runtime stage that
        copies the hoisted root `node_modules` (workspace packages are
        symlinks into their own `dist/`, so each depended-on package's
        `dist/` + `package.json` has to be copied individually) plus
        `apps/api/dist`, running as a non-root user.
      - `Dockerfile.web`: same build steps, but the runtime stage copies
        Next.js's `standalone` output instead (added `output: "standalone"`
        to `next.config.js`), which traces only the `node_modules` each
        page actually needs — no monorepo `node_modules` copying required
        for this image.
      - Added a root `.dockerignore` (none existed) excluding
        `node_modules`, build output, and `.env*` — without it `COPY . .`
        would have baked real `.env` secrets into an image layer.
- [x] Docker Compose orchestration — `docker-compose.yml` now runs the
      **built images** (previously it bind-mounted the whole repo over
      `command: npm run dev`, which never actually exercised the
      Dockerfiles it built); `api`'s command chains
      `prisma migrate deploy && node apps/api/dist/main.js` so a fresh
      `docker compose up` against an empty Postgres volume is
      self-sufficient.
- [x] Health checks — added a real, unauthenticated `GET /health` endpoint
      (`apps/api/src/health/`, excluded from the global `api/v1` prefix in
      `main.ts` via `setGlobalPrefix('api/v1', { exclude: ['health'] })`)
      that checks actual database connectivity (`SELECT 1` via Prisma) and
      returns 503 if it fails, rather than a static 200 -- both
      Dockerfiles' `HEALTHCHECK` directives target it (api) or an
      unauthenticated page (web's `/auth/signin`); `docker-compose.yml`'s
      `web` service now waits on `api`'s health via
      `depends_on: condition: service_healthy` instead of just `api`
      having started.
- [x] Volume management — `pgdata` named volume for Postgres persistence
      (already present, unchanged).
- [x] Network configuration — a single bridge network shared by all three
      services (already present, unchanged).
- [x] Container security scanning — addressed the part of this that's
      actually this phase's job: both runtime images run as a dedicated
      non-root user (`addgroup -S cmmp && adduser -S cmmp -G cmmp` +
      `USER cmmp`), use a pinned minimal base image
      (`node:20-alpine`, matching `postgres:15-alpine`), and never bake a
      secret into a layer (`.dockerignore` excludes `.env*`; every secret
      is supplied at `docker compose up` time via env vars). Automated
      scanning (Trivy) against the built images is explicitly Phase 16's
      own checklist item and is deferred there, not skipped.
- [x] **Found and fixed four real bugs specific to this phase**, again
      caught by actually reasoning through the deployment topology rather
      than just writing Dockerfiles that "look right":
      1. **`infrastructure/init-db.sql`** (Phase-1 scaffolding, referenced
         by the old `docker-compose.yml` as a Postgres init script) manually
         created Postgres enum types (`maturity_level`, `risk_level`,
         `control_status`, `audit_action`) that are *exactly* the same
         types Prisma's own checked-in migration (`20260901072626_init`)
         creates via `CREATE TYPE`. On a fresh Postgres volume, Postgres
         runs `init-db.sql` automatically on first boot, then
         `prisma migrate deploy` would fail with `type "..." already
         exists`, permanently crash-looping the `api` container. Since
         nothing in the schema actually uses the extensions it also
         enabled (`uuid-ossp`/`pgcrypto`/`citext` -- confirmed via a
         schema-wide search for `dbgenerated`/`@db.`/`citext`, all absent;
         Prisma generates UUIDs client-side), the file was pure conflicting
         legacy cruft. Removed it and its `docker-compose.yml` volume
         mount entirely -- Prisma's migrations are the single source of
         truth for schema now.
      2. **NextAuth's credentials callback would never reach the API
         inside Docker Compose.** `pages/api/auth/[...nextauth].ts` runs
         its `authorize()` callback *server-side*, inside the `web`
         container, and it was using `NEXT_PUBLIC_API_URL` --
         `http://localhost:3001`. That address is correct for the
         *browser* (which reaches `api` through its published host port),
         but from inside the `web` container `localhost:3001` is the `web`
         container itself, which has no API on that port -- every login
         would have failed in a real Compose deployment despite working
         fine in this project's native (non-Docker) dev workflow, where
         both processes share one host. Fixed by introducing a
         server-side-only `INTERNAL_API_URL` (falls back to
         `NEXT_PUBLIC_API_URL` when unset, so nothing changes outside
         Docker) and setting it to the Compose service DNS name
         (`http://api:3001`) for the `web` service.
      3. **`package-lock.json` had never been committed, in any phase.**
         Root `.gitignore` had it listed right alongside `yarn.lock` and
         `pnpm-lock.yaml` since Phase 1 (`git ls-files` confirms zero
         commits have ever included it). `npm ci` -- what every Dockerfile
         above uses, and what any real CI would use -- refuses to run
         without an existing lockfile; every one of this phase's `RUN npm
         ci` steps would fail on a fresh clone with real registry access,
         regardless of anything else being correct. Fixed by removing it
         from `.gitignore` and committing the real, already-in-sync
         lockfile (`npm ci --dry-run` confirms it resolves cleanly against
         the current `package.json` files). This also means every prior
         phase's install was never actually reproducible from a fresh
         clone -- worth knowing regardless of Docker.
      4. (Smaller, caught the same way) `apps/web/public/` didn't exist at
         all, so `Dockerfile.web`'s `COPY --from=builder .../public ...`
         would have failed outright; added the directory with a real
         `robots.txt` (disallowing all crawling, appropriate for an
         internal security-assessment tool) rather than a placeholder
         file. Also fixed `package.json`'s `docker:build`/`docker:up`/
         `docker:down` scripts and the two matching README commands,
         which invoked the standalone `docker-compose` binary -- not
         installed in this environment (or any current Docker install;
         it's been replaced by the `docker compose` plugin, confirmed via
         `which docker-compose` failing here). One more found the same
         way: `.gitignore` also excluded `.dockerignore` itself -- the
         very file meant to keep `.env` secrets out of image layers would
         never have been committed either; fixed in the same pass as the
         lockfile above.
- [x] Live-verified everything that doesn't require an actual image build:
      - The new `/health` endpoint, against a real running instance
        (`{"status":"ok","database":"connected",...}`, and confirmed 404
        under the `/api/v1` prefix as intended).
      - **Both Dockerfiles' exact runtime file layout**, without Docker:
        manually replicated each `COPY --from=builder` line's source set
        into a scratch directory (e.g. for the API: the real
        `node_modules` plus only `apps/api/dist` +
        `packages/{database,framework-engine,import-engine,scoring-engine,shared}/dist`
        + their `package.json`s -- nothing else), then ran
        `node apps/api/dist/main.js` / `node apps/web/server.js` directly
        from that reduced layout. Both booted cleanly against the real
        local Postgres and served real traffic (the API logged every
        route mapping and connected to the database; `/health` returned
        200; the web server returned 200s for `/`, `/auth/signin`, and
        `/robots.txt`) -- strong evidence the workspace-symlink resolution
        and Next.js standalone-copy logic in both Dockerfiles is correct,
        short of an actual `docker build`.
      - `docker compose config` (structural/interpolation validation --
        confirms the YAML is well-formed and every `${VAR}` substitution,
        `depends_on`, and volume/network reference resolves) after every
        edit.

  **Not built/verified this pass**: an actual `docker build` or
  `docker compose up`. This sandbox's Docker daemon was not running by
  default, and *starting* it (`dockerd`) worked -- contrary to what an
  earlier phase's summary assumed -- but every image pull attempt
  (`docker pull node:20-alpine`, `docker build --check`) fails at the very
  first `FROM` line: the manifest resolves, but the actual layer blob comes
  from `production.cloudfront.docker.com`, which this session's egress
  policy returns `403 Forbidden` for (confirmed via
  `/root/.ccr/__agentproxy/status`'s `recentRelayFailures` -- a policy
  denial, not a transient failure, so per this environment's guidance it
  was not retried or routed around). `npm prune --omit=dev` in
  `Dockerfile.api`'s runtime stage was deliberately left out rather than
  risk it stripping the generated Prisma Client's undeclared
  `node_modules/.prisma` path -- verifying that tradeoff safely needs a
  real build this sandbox can't do. Whoever next has real Docker Hub
  access should run `docker compose build && docker compose up` end-to-end
  before relying on this phase's work in production.

### Phase 16: CI/CD Security Pipeline
- [x] GitHub Actions CI workflow (`.github/workflows/ci.yml`) — six jobs:
      `lint-and-typecheck`, `unit-tests`, `build` (all DB-free, run on every
      push/PR), `integration-tests` and `e2e-tests` (each with a real
      `postgres:15-alpine` service container, running migrations + the demo
      seed before the suite), and a `security-gate` job that `needs:` all
      five and fails if any of them did, giving branch protection one
      single required check to point at instead of five.
- [x] SAST setup (CodeQL) — `.github/workflows/codeql.yml`, the
      `javascript-typescript` extractor with the `security-and-quality`
      query pack, on push/PR/a weekly schedule (so a new query added to the
      pack gets run against unchanged code too, not just PR diffs).
- [x] Dependency scanning (Dependabot) — `.github/dependabot.yml`: one npm
      entry at the repo root (correct for an npm-workspaces monorepo with a
      single lockfile -- not one entry per workspace), grouped
      weekly by production/development dependency type, plus
      github-actions and docker (`/infrastructure`) ecosystems.
- [x] Secret scanning (Gitleaks) — `.github/workflows/gitleaks.yml`,
      `gitleaks/gitleaks-action@v2` over full history (`fetch-depth: 0`) on
      push/PR.
- [x] DAST setup (OWASP ZAP) — `.github/workflows/dast.yml`: brings up the
      real `docker compose` stack, waits for the web app to answer, then
      runs a ZAP **baseline** (passive-only -- spiders the app, checks
      headers/cookies; never submits forms or attempts exploitation, so
      it's safe against a real instance in CI) scan via
      `zaproxy/action-baseline`, uploading the HTML report as an artifact.
- [x] Container scanning (Trivy) — `.github/workflows/container-scan.yml`:
      builds both images (matrix over api/web) with
      `docker/build-push-action` (`load: true`, no push), scans each with
      Trivy for CRITICAL/HIGH findings, and uploads the SARIF to the
      Security tab.
- [x] SBOM generation — the same workflow generates an SPDX SBOM per built
      image (`anchore/sbom-action`) plus a separate CycloneDX SBOM of the
      full npm dependency tree (`@cyclonedx/cyclonedx-npm`, covering every
      workspace's declared dependencies, not just what ships in a
      container) — three SBOM artifacts total, each uploaded with a
      90-day retention.
- [x] Security gates configuration — `ci.yml`'s `security-gate` job as
      described above; Trivy and ZAP are deliberately wired in
      **report-only** mode for now (`exit-code: "0"`, `fail_action: false`)
      rather than hard-failing the build, since this is those tools' first
      run against this codebase and nothing has been triaged yet -- an
      immediate hard gate would likely just block on pre-existing,
      unreviewed findings (e.g. missing security headers ZAP would flag)
      rather than catching a real regression. Flipping both to enforcing
      mode is a one-line change once a human has done that first triage
      pass. GitHub's actual branch-protection "required status checks"
      setting is a repository Settings action no committed workflow file
      can configure -- a repo admin still needs to mark `Security Gate`,
      `Gitleaks`, and CodeQL's `Analyze (javascript-typescript)` as
      required in Settings -> Branches.
- [x] Deployment workflow — `.github/workflows/deploy.yml`: re-runs the
      same lint/type-check/test/build gates as CI (never trusts a green
      `main` stayed green between merge and this workflow's own trigger),
      then builds and pushes both images to GHCR
      (`ghcr.io/<repo>/{api,web}`) tagged by commit SHA/branch/semver tag,
      then a `deploy` job gated behind a GitHub Environment named
      `production` (so a repo admin can require manual approval and hold
      real secrets there) that's currently a documented placeholder --
      this project has no live hosting target chosen yet, so there's
      nothing real to deploy *to*. Whoever picks one (ECS/Cloud Run/Fly/a
      VM running `docker compose`) fills in that one step.
- [x] **Found and fixed real, repo-wide CI-blocking bugs while making sure
      every one of these workflows could actually pass**, continuing this
      session's practice of finding defects specifically by trying to make
      something work end-to-end rather than by inspection:
      1. **`npm run lint` had never once succeeded, in any phase** (flagged
         as a "Known Issue" since Phase 3, never revisited). The root
         `.eslintrc.json` referenced `eslint-config-next`,
         `eslint-plugin-security`, `eslint-plugin-react`,
         `eslint-plugin-react-hooks`, and `eslint-plugin-import`, none of
         which were installed anywhere in the repo. Installing them
         surfaced two further config bugs: `eslint-plugin-security`
         resolves to 3.x by default, whose shareable config uses a
         flat-config-only `name` field that ESLint 8's legacy `.eslintrc`
         schema rejects outright (pinned to `^1.7.1`, the long-stable
         legacy-compatible major); and `import/order`'s options used a
         property, `alphabeticalOrder`, that was never a real option for
         that rule (the correct one is `alphabetize: { order: "asc" }`).
         Fixed both, then ran `eslint --fix`/`next lint --fix` to clear
         ~230 mechanical import-order violations across both apps, fixed 2
         genuine `no-unused-vars` errors (one a legitimate
         rest-destructuring pattern needing `ignoreRestSiblings: true`, one
         a stale unused import), and downgraded
         `@typescript-eslint/no-explicit-any` from `error` to `warn` --
         ~82 pre-existing `@CurrentUser() user: any`-style usages across
         `apps/api`'s controllers are real technical debt worth typing
         properly eventually, but hand-fixing all of them was out of scope
         for "get CI working" and risked being a large, mechanical
         refactor with its own regression risk. `npm run lint` now passes
         cleanly, repo-wide, for the first time in this project's history.
         (Deliberately scoped to `eslint --fix`/`next lint --fix` only --
         not the repo-wide `npm run format`, which would have reformatted
         every file in the repository including all 15 prior phases' prose
         documentation for a Phase 16 commit that has no business touching
         any of it.)
      2. **`npm run type-check` failed the same way, for a different
         reason**: `packages/ui`, `packages/reporting`, and
         `packages/security` are empty scaffolds (a `package.json` each,
         no `src/`, no `tsconfig.json` of their own) left over from Phase
         1. Running `tsc --noEmit` with no local config walks up to the
         *root* `tsconfig.json`, which has no `include` array -- so it
         defaults to including every `.ts`/`.tsx` file in the entire repo.
         Each empty package's `type-check` script was therefore
         accidentally re-type-checking all of `apps/web` and `apps/api`
         from an unrelated directory, surfacing dozens of real (but
         irrelevant to these packages) errors and failing the whole
         monorepo's `type-check` task. Fixed by giving each its own scoped
         `tsconfig.json` (matching every real package's pattern:
         `rootDir`/`include` limited to its own `src/`) plus a minimal
         placeholder `src/index.ts` documenting that the package is
         scaffolded, not implemented.
      3. `packages/security`'s `test` script (`jest`, no test files) also
         broke `npm test` repo-wide -- Jest exits 1 by default when it
         finds zero tests. Fixed with `--passWithNoTests`.
      4. **Caught before ever committing it**: `ci.yml`'s
         `integration-tests` job ran migrations but not the demo seed --
         the integration suite (Phase 14) logs in as seeded users
         (`ciso@example.local`, `viewer@example.local`), so on a genuinely
         fresh CI runner every login in that suite would fail. Found by
         actually simulating a fresh runner locally (drop the local
         Postgres database, recreate it, migrate, *then* try the suite
         without seeding first -- confirmed the failure, added
         `npm run db:seed`, reran against the same fresh sequence to
         confirm it now passes).
- [x] Live-verified everything runnable without a real GitHub Actions
      runner or Docker Hub access (same constraint as Phase 15): every
      individual shell command `ci.yml`/`deploy.yml` invoke
      (`npm ci`, `npm run db:generate`, `lint`, `type-check`, `test`,
      `build`, `db:migrate`, `db:seed`, `test:integration --workspace=@cmmp/api`,
      `playwright install --with-deps chromium` + `playwright test`) run
      manually, matching the workflow's exact environment variables, most
      importantly against a **freshly dropped-and-recreated** local
      Postgres database (not the long-lived, already-seeded one from
      earlier phases) to genuinely simulate a first-ever CI run rather
      than assume state that happened to already be there. All green,
      including a full Playwright pass against that fresh instance. Every
      workflow file's YAML was also parsed with `yaml.safe_load` to catch
      structural errors. `@cyclonedx/cyclonedx-npm` was run standalone to
      confirm it actually produces a valid CycloneDX document (1,078
      components) before trusting it in `container-scan.yml`.

  **Not built/verified this pass**: an actual GitHub Actions run of any of
  these six workflow files (this sandbox has no GitHub Actions runner to
  invoke), or a real `docker build` for `container-scan.yml`/`dast.yml`/
  `deploy.yml`'s image-building steps (same Docker Hub CDN block as Phase
  15). Whoever has real CI access should watch the first run of each
  workflow closely, expect to tune Trivy/ZAP's severity thresholds and
  `fail_action`/`exit-code` once there's been a first triage pass, and
  should pick and fill in an actual deployment target in `deploy.yml`'s
  final job. `.github/CODEOWNERS` (pre-existing, untouched) still
  references placeholder GitHub teams (`@security-team`, `@devops-team`,
  etc.) that don't exist in this personal-account repo -- GitHub silently
  ignores CODEOWNERS entries for teams/users it can't resolve, so this
  isn't actively broken, just inert until real reviewers are assigned.

### Frontend Gap Closure (before Phase 17)
Before starting Phase 17 (Documentation), closed out the specific frontend
gaps this document had been carrying since Phase 9-12's "Not built this
pass" notes -- at the user's request, prioritized over documentation since
undocumented gaps in *behavior* matter more than gaps in *docs*.

- [x] **Assessment-taking flow** -- the biggest of the five: until now,
      `POST /assessments` (Phase 6) had no UI at all, so an assessment
      could only ever be created via `curl`/Prisma Studio, and its 106
      items had no way to be answered short of the spreadsheet importer.
      New `pages/assessments/new.tsx` (name/description/date + a
      framework picker sourced from `GET /frameworks`) and
      `pages/assessments/[id]/take.tsx` (every item as its own card --
      current/target maturity, control status, rationale, evidence --
      each independently PATCH-able via `PATCH /assessments/:id/items/:itemId`,
      a keyword filter across all 106 questions in place of a framework-
      hierarchy grouping this pass didn't build, a live progress bar, and
      a Submit-for-Approval button gated on 100% completion). The
      dashboard page gained status-aware workflow buttons (Start/Continue/
      View Responses, plus Approve/Reopen for a submitted assessment) by
      fetching the assessment's own status alongside the executive
      dashboard summary.
- [x] **Framework selection UI** -- folded into the create-assessment
      form above rather than built as a separate page, since selecting a
      framework only ever matters at assessment-creation time; the
      picker shows every active framework's name, version, and
      description from `GET /frameworks`.
- [x] **Column-mapping import UI** -- `POST /assessments/:id/import` (Phase
      8) always required a caller to already know the mapping, with
      nothing in the UI to derive one from an actual file. Added a new
      `POST /assessments/:id/import/preview` endpoint (reuses
      `parseSpreadsheet` from `@cmmp/import-engine` -- read-only, nothing
      persisted) returning the source headers, a few sample rows, and the
      exact target-field list `importAssessmentResponses` accepts (so the
      mapping UI can never drift from what the real import endpoint takes).
      New `pages/assessments/[id]/import.tsx`: pick a file -> preview
      columns -> a mapping form (auto-matches same-named headers, human
      adjusts the rest) -> import, then shows applied/warning/error counts
      with per-row error messages.
- [x] **Initiative picker on the risk detail page** -- previously a raw
      text input for pasting a remediation initiative's UUID by hand (the
      backend `GET /initiatives`/`POST /risks/:id/initiatives/:initiativeId`
      already existed, just never wired to a picker). Replaced with a
      `<select>` populated from `GET /initiatives`, filtered to exclude
      initiatives already linked to this risk.
- [x] **Security maturity heatmap + maturity distribution** -- the
      `levels` query param this document had flagged as "the engine
      already supports it, just not exposed here" for two sessions
      running. Rather than extend the existing `/dashboard/gaps` endpoint
      (hardcoded to function-level for the current top-gaps table, and
      risky to change given other callers), added a new
      `GET /assessments/:id/dashboard/heatmap` endpoint and
      `getMaturityHeatmap()` service method: reuses `identifyGaps` (via
      `computeGapAnalysis({ levels: ['function','category','subcategory'] })`)
      for per-node risk classification rather than re-deriving thresholds,
      and a new `loadHierarchyMetadata` query resolves code/name for every
      function/category/subcategory this assessment touches in one round
      trip. New `MaturityHeatmap`/`MaturityHeatmapFunction`/
      `MaturityHeatmapCategory`/`MaturityHeatmapSubcategory` types added to
      `@cmmp/shared` (matching how `ExecutiveDashboard`/`GapAnalysis` are
      already shared between both apps). Frontend: a new
      `MaturityHeatmap` component (function rows of category cells,
      colored by risk level, `title` tooltip with the full current/target/gap)
      and `MaturityDistributionChart` (a bar chart of subcategory count per
      maturity level, always showing all six levels even at zero so the
      chart never looks like buckets are missing), both added to the
      assessment dashboard page.
- [x] Tests: 3 new backend tests for `getMaturityHeatmap` (nesting +
      per-node risk-level lookup, falling back to the raw id when
      metadata is missing, and the distribution count -- 115 tests total
      in `apps/api`, up from 109) and 3 new backend tests for the import
      preview endpoint (headers/sample-rows/target-fields shape, that it
      touches nothing but the assessment lookup, and that a parse failure
      surfaces as 400).
- [x] Live-verified all five, end-to-end, against the real local stack (not
      just type-checked): created a real assessment through the new UI,
      confirmed all 106 items were seeded and the picked framework was
      NIST CSF 2.0; answered one item and confirmed the DRAFT -> IN_PROGRESS
      transition and completion-percentage recalculation happened live;
      imported a 3-row CSV (2 valid, 1 deliberately referencing a
      nonexistent subcategory code) through the mapping UI and confirmed
      auto-mapping pre-selected the same-named columns and the result
      panel showed 2 applied / 0 warnings / 1 error with the correct
      per-row message; loaded the seeded demo assessment's dashboard and
      confirmed the heatmap and distribution chart rendered real,
      correctly-colored data alongside the existing charts.

  **Not built this pass**: the take-assessment page uses a flat,
  filterable list rather than reconstructing the function/category/
  subcategory hierarchy for grouping (the assessment API doesn't return a
  framework slug/id on the assessment itself, only per-item
  `subcategoryId`, so hierarchy-aware grouping there would need either a
  second framework-tree fetch and ID cross-referencing, or a new backend
  field -- left as a follow-up); the heatmap's category cells don't drill
  into their own subcategories inline (available from the same endpoint,
  just not surfaced in this pass's UI); no column-mapping "remember my
  last mapping" convenience for repeat imports against the same framework.

## Known Issues 🐛

- ~~Root `.eslintrc.json` references missing ESLint plugins~~ — fixed in
  Phase 16 (see that section for the full story: missing plugins installed,
  `eslint-plugin-security` pinned to a legacy-config-compatible major,
  `import/order`'s invalid option name corrected, ~230 mechanical
  import-order violations auto-fixed). `@typescript-eslint/no-explicit-any`
  is deliberately `warn` rather than `error` — ~82 pre-existing
  `@CurrentUser() user: any`-style usages across `apps/api`'s controllers
  are real debt that should eventually get a proper `AuthenticatedUser`
  type threaded through, but doing that now would be a large, risky,
  purely mechanical refactor unrelated to what Phase 16 actually needed.
- `packages/database`'s local `prisma` devDependency resolves inconsistently
  under npm workspaces (`@prisma/client`'s `peerDependencies: { prisma: "*" }`
  can pull in a newer major version than the pinned `^5.22.0`, marked
  "invalid" by `npm ls`). Workaround in place: always run Prisma generate
  from the repo root (`npm run db:generate`), not via the workspace-local
  binary; `packages/database`'s own `build` script only runs `tsc`.

## Not Started ⭕

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
2. ~~Begin Phase 13: Audit Logging~~ — done this session (see Phase 13
   above); a global interceptor now audits every create/update/delete
   across all resources, plus login/logout, with a dashboard view
3. ~~Begin Phase 14: Tests~~ — done this session (see Phase 14 above);
   added React Testing Library component tests, a committed Playwright
   E2E suite, a live-DB integration/security/tenant-isolation suite, and
   dedicated authorization tests -- which caught and fixed a real RBAC
   bypass in the audit endpoints and a multi-role authorization gap in
   `RolesGuard`
4. ~~Begin Phase 15: Docker~~ — done this session (see Phase 15 above);
   rewrote both Dockerfiles for this repo's actual npm-workspaces monorepo
   (the checked-in versions used `pnpm` and would never have built), fixed
   `docker-compose.yml` to run the built images instead of bind-mounting
   over them, added a real `/health` endpoint, and found/fixed a schema
   migration conflict plus a Docker-network URL bug that would have broken
   the very first real deployment. **Still needed**: an actual
   `docker compose build && up` run against real Docker Hub access --
   this sandbox's egress policy blocks the registry's blob CDN, so
   everything here was verified as thoroughly as possible short of that
   (see Phase 15's "Not built/verified this pass" note)
5. ~~Begin Phase 16: CI/CD Security Pipeline~~ — done this session (see
   Phase 16 above); six GitHub Actions workflows (CI, CodeQL, Dependabot,
   Gitleaks, ZAP DAST, Trivy+SBOM) plus a deploy workflow, and along the
   way fixed `npm run lint`/`npm run type-check` so they actually pass
   repo-wide for the first time ever -- both were silently broken since
   Phase 1/3 and would have made this phase's own CI workflow red from
   its very first run
6. ~~Round out earlier frontend gaps~~ — done this session (see "Frontend
   Gap Closure" above): an assessment-taking flow, framework selection,
   column-mapping import UI, an initiative picker on the risk detail
   page, and a security maturity heatmap + maturity distribution view,
   all live-verified against the real stack.
7. **Begin Phase 17**: Documentation — a security architecture document, a
   threat model, an API reference, a user guide, a deployment guide (which
   can finally point at real, tested Dockerfiles/compose from Phase 15),
   and a contributing guide
8. Spot-check the seeded NIST CSF 2.0 outcome text against the official
   NIST CSWP 29 publication (see the Phase 5 data-provenance note above) —
   this sandbox couldn't reach nist.gov directly to verify byte-for-byte
9. Actually run `docker compose build && docker compose up` end-to-end,
   and watch the first real run of every Phase 16 workflow, once real
   Docker Hub / GitHub Actions access is available -- everything about
   both phases was verified as thoroughly as this sandbox allowed, but
   never against a real image build or a real Actions runner
10. Once Trivy/ZAP have had a first real triage pass (see Phase 16),
    flip both from report-only to enforcing (`exit-code: "1"` /
    `fail_action: true`), and have a repo admin mark `Security Gate`,
    `Gitleaks`, and CodeQL's analyze job as required status checks in
    Settings -> Branches -- no committed workflow file can do that part
11. Give the take-assessment page real function/category/subcategory
    grouping instead of a flat filterable list (see this pass's "Not
    built" note) and let a heatmap category cell drill into its own
    subcategories inline.

## Contact & Questions

- See CONTRIBUTING.md for contribution guidelines
- See SECURITY.md for security reporting
- Check docs/ for detailed documentation
