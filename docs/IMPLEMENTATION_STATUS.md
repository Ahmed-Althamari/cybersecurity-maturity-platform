# CMMP Implementation Status

Last Updated: 2026-09-01

## Overall Progress

**Phase**: 17 / 17 (all originally-scoped phases complete, plus a frontend
gap-closure pass done ahead of Phase 17 -- see "Frontend Gap Closure" below)
**Completion**: ~98% (the remaining ~2% is the honestly-documented gaps
called out throughout Phase 17's docs -- see `docs/security-architecture.md`'s
"Known gaps" and `docs/threat-model.md`'s summary in particular -- plus the
real Docker/GitHub Actions runs neither Phase 15, 16, nor this phase could
perform in this sandbox)

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

### Phase 17: Documentation
- [x] Security architecture document -- `docs/security-architecture.md`:
      authentication (JWT issuance/verification, the real
      `JwtModule.registerAsync()` bug and fix), authorization (the 11-role
      RBAC matrix, both real bugs Phase 14 found and fixed in `RolesGuard`/
      `AuditController`), tenant isolation mechanics, input validation and
      injection prevention, audit-log immutability guarantees, HTTP-level
      hardening, secrets handling, and an explicit "Known gaps" section
      (no rate limiting despite `.env.example` implying otherwise, no
      token revocation, no CSP/HSTS, `EXECUTIVE_VIEWER` not actually
      distinct from `READ_ONLY_VIEWER`) written honestly rather than
      glossed over.
- [x] Data model documentation -- `docs/data-model.md`: every one of the
      28 Prisma models grouped by concern, a Mermaid ERD, and -- important
      for anyone reading the schema cold -- an explicit list of models
      that exist but are **not wired to any service** today
      (`Role`, `Evidence`, `Recommendation`, `MaturityModel`/
      `MaturityModelLevel`, `SecurityCapability`/`Technology`,
      `Benchmark`, `DashboardConfiguration`), so nobody mistakes schema
      scaffolding for a working feature.
- [x] API design document -- `docs/api-reference.md`: every real endpoint
      across all 11 controllers, grep-verified against the actual
      `@Get`/`@Post`/`@Patch`/`@Delete`/`@Roles` decorators rather than
      transcribed from memory, including the exact role-group constants
      (`AUTHORS`/`APPROVERS`/`ARCHIVERS`/`DELETERS`/`AUDIT_READERS`) each
      controller defines.
- [x] Scoring methodology -- `docs/scoring-methodology.md`: the 1-5
      maturity scale and why `NOT_APPLICABLE` is excluded rather than
      zeroed, the weighted subcategory-to-organisation rollup with a
      worked numeric example, the gap-magnitude risk-classification
      thresholds, how this differs from the Risk Register's
      likelihood-x-impact model, the honest state of ADR-007's weighting
      (mechanically ready, no producer yet), and exactly how roadmap
      generation derives priority/timeline/complexity from a gap.
- [x] Framework model documentation -- `docs/framework-model.md`: the
      Definition-vs-Tree two-shape design, the validation pipeline (Zod
      shape + sibling-uniqueness structural checks), the shared
      `persistFrameworkDefinition()` helper, the dynamic component
      descriptor, NIST CSF 2.0's specific authored structure and its data
      provenance caveat, and exactly what adding a second framework
      requires (a data-authoring exercise, not a code change) plus the one
      place multi-framework support isn't fully wired end-to-end yet
      (`Assessment` has no direct framework slug/id).
- [x] Excel import format guide -- `docs/excel-import-guide.md`: supported
      formats and their real cell-type quirks (formula cells resolve to
      last-calculated-result, rich text flattens, hyperlinks use display
      text), the preview-then-import two-step flow, the full column-mapping
      contract, every field's exact validation rule, the formula-injection
      sanitization mechanism (CWE-1236) with the real attack payload this
      project tested against, the three row outcomes
      (`VALID`/`WARNING`/`ERROR`), and the single-transaction apply
      behavior.
- [x] Deployment guide -- `docs/deployment-guide.md`: every real
      environment variable and what actually reads it, the Compose
      topology and startup ordering, exactly what was verified about the
      Docker images without a real `docker build` (this sandbox's Docker
      Hub CDN block, carried over from Phase 15), the `deploy.yml` GHCR
      publish flow, and an explicit "what's not yet real" section (no live
      hosting target, no orchestration, no secrets manager -- correcting
      `docs/architecture.md`'s aspirational Kubernetes/AWS ALB/Redis
      references).
- [x] DevSecOps pipeline documentation -- `docs/devsecops-pipeline.md`:
      what each of the six workflows plus Dependabot actually does today
      (grep-verified against the real YAML, not summarized from memory),
      the deliberate Trivy/ZAP report-only posture and exactly what flips
      it to enforcing, what branch-protection setup no committed workflow
      file can do on its own, and what has and hasn't actually been run
      for real (no GitHub Actions runner or Docker Hub access in this
      sandbox, same constraint as Phases 15-16).
- [x] ADRs (Architecture Decision Records) -- `docs/adr/` (README index +
      ADR-0001 through ADR-0010, one file each), expanding the one-line
      entries this document already carried into full Context/Decision/
      Alternatives/Consequences records grounded in the real
      implementation -- including, where relevant, an honest "Current
      state" section for a decision only partially realized (ADR-0007's
      configurable scoring: the weighting math works, nothing sets a
      non-default weight yet; the `MaturityModel` tables are modeled but
      unused).
- [x] Threat model & STRIDE analysis -- `docs/threat-model.md`: assets and
      trust boundaries specific to this system, then a STRIDE table per
      category with concrete threats against this codebase's actual flows,
      the real mitigation in place (or the honest absence of one) for
      each, and a ranked "highest-priority items" summary closing with the
      single highest-value fix identified across this whole documentation
      pass: `POST /auth/login` has zero rate-limiting today despite
      `.env.example` defining variables that imply otherwise.
- [x] Added a pointer note atop `docs/architecture.md` (the Phase-1
      design sketch) directing readers to the new, code-grounded documents
      above wherever the two disagree, rather than silently leaving two
      contradictory sources of truth in the repo.
- [x] Grounded every document above in the actual source rather than
      memory or the earlier phase write-ups: read the full
      `packages/database/prisma/schema.prisma`, grep'd every controller's
      route/role decorators, read `@cmmp/scoring-engine`'s and
      `@cmmp/import-engine`'s actual implementation files, and read all
      six real workflow YAML files plus `docker-compose.yml`/both
      Dockerfiles/`.env.example` before writing a line -- this surfaced
      several previously-undocumented facts along the way (confirmed by
      grep, not assumption): no rate-limiting code exists despite
      `.env.example` implying it does; `EXECUTIVE_VIEWER` is never
      referenced by any guard and today behaves identically to
      `READ_ONLY_VIEWER`; and `Role`/`Evidence`/`Recommendation`/
      `SecurityCapability`/`Benchmark`/`DashboardConfiguration` are modeled
      but entirely unused by any service.

### Post-Phase-17: Multi-Sheet Import, AI-Assisted Mapping, Formula Visibility
At the user's request after Phase 17: the importer only ever read an
xlsx's first worksheet, had no way to help a user map columns that don't
share our exact field names, and silently resolved formula cells to their
calculated value with no way to see the formula itself. Also asked for
"an AI agent for Excel" and for "better calculation and chart types" --
resolved (with the user's explicit sign-off after presenting the tradeoffs)
as: smarter column-mapping via Claude rather than a conversational agent;
generating our own charts from imported data rather than hand-parsing a
workbook's embedded chart XML (`exceljs` doesn't expose chart objects at
all -- replicating them would have been a multi-day sink for the same
practical value a fresh, correctly-styled chart already gets for free).

- [x] **Multi-sheet import** -- `@cmmp/import-engine`'s `parseAllSheets()`
      parses every worksheet tab in one pass (a CSV is treated as a single
      implicit sheet, unchanged); `parseSpreadsheet(buffer, format,
      sheetName?)` picks one back out, falling back to the first sheet
      when `sheetName` is omitted or doesn't match -- so every pre-existing
      caller that never passed a sheet name is unaffected.
      `POST /assessments/:id/import/preview` now returns one entry per
      real Excel tab (`{ sheetName, headers, rowCount, sampleRows,
      sampleFormulas }`) from a single upload; `POST
      /assessments/:id/import` takes an optional `sheetName` to say which
      tab to actually apply. The import page renders a tab picker
      whenever a workbook has more than one sheet; each tab still imports
      independently (no "merge all tabs" mode -- different tabs often
      have different layouts, and merging them blindly risked silently
      misapplying one tab's mapping to another's data).
- [x] **Formula visibility** -- `parse.ts` now also captures each formula
      cell's literal formula text (`cellFormulaText()`), surfaced
      alongside the already-resolved value in the preview response
      (`sampleFormulas`, parallel to `sampleRows`). The import page shows
      a banner when a sampled cell used a formula, so a user isn't
      surprised an imported number came from a calculation.
- [x] **AI-assisted column-mapping suggestion** -- new
      `AiMappingService` (`apps/api/src/import/ai-mapping.service.ts`)
      calls Claude (`claude-opus-5`, a forced tool call for a strict JSON
      mapping shape) with a sheet's real headers and a few real sample
      rows, for any target field the frontend's exact-header-name
      auto-mapping left unmapped. New `POST
      /assessments/:id/import/suggest-mapping` endpoint (JSON body, no
      file re-upload -- the frontend already has the headers/sample rows
      from the preview call). Deliberately a pure enhancement, never a
      dependency: no `ANTHROPIC_API_KEY` configured, a network failure, or
      a malformed response all just leave the field unmapped for a human
      to pick, rather than erroring the import flow. **Every suggested
      header is verified against the sheet's real header list before
      being trusted** -- a hallucinated column name is silently dropped,
      never allowed to reach `ColumnMapping`, since that's the one thing
      the model's output must never be trusted for outright. The import
      page tags an AI-derived mapping with a small "AI suggested" badge
      that clears the moment a user changes the selection.
- [x] **Post-import generated chart** -- the import-results screen now
      renders the existing `MaturityDistributionChart` dashboard
      component (no new chart component needed), computed client-side
      from the rows actually applied by the import that just ran.
- [x] Tests: 5 new backend tests for multi-sheet parsing in
      `packages/import-engine` (all-sheets enumeration, named-sheet
      selection, fallback-to-first-sheet in two situations, formula-text
      surfacing, CSV-as-single-sheet) -- 31 tests total, up from 25; 7 new
      backend tests in `apps/api` for `ImportService` (multi-sheet
      preview, sheetName-scoped import, the ImportJob audit-trail sheet
      tag, `suggestMapping` delegation and its never-throws fallback) plus
      a new `ai-mapping.service.spec.ts` (6 tests: no-API-key short
      circuit, empty-headers short circuit, a valid suggestion, the
      hallucinated-header guard, the unknown-target-field guard, and the
      network-failure fallback, via `jest.mock('@anthropic-ai/sdk')`) --
      127 tests total in `apps/api`, up from 120.
- [x] Live-verified end-to-end in a real browser against the real stack:
      built a real two-tab xlsx fixture (a formula cell on one tab, a tab
      with intentionally mismatched header names on the other), created a
      fresh assessment, uploaded it through the real import page --
      confirmed both tabs listed with correct row counts, the formula
      banner appeared on the tab with a formula cell, exact-match
      auto-mapping filled in same-named fields, and (with no
      `ANTHROPIC_API_KEY` configured in this sandbox) the mismatched-name
      tab gracefully left its fields unmapped with zero "AI suggested"
      tags and no console errors -- confirming the no-API-key fallback
      path actually works, since a real Claude API call couldn't be
      exercised in this sandbox. Ran the actual import (sheetName-scoped)
      and confirmed both real NIST CSF subcategory rows applied
      correctly, and that the generated maturity-distribution chart
      rendered the correct 1/1 split between the two maturity levels
      imported.

  **Not built this pass**: a real end-to-end run of the AI-mapping
  suggestion against a live Claude API call (no `ANTHROPIC_API_KEY` is
  configured in this sandbox -- the graceful-fallback path was verified
  instead, which is the one path that matters when the feature is
  disabled -- **update: a real network round-trip to the live Anthropic
  API was exercised in the very next pass, see below**); an "import all
  tabs at once" mode; remembering a column mapping between import
  sessions; parsing or recreating a workbook's own embedded charts (see
  the rationale above for why a generated chart was chosen instead).

### Post-Phase-17: Runtime-Configurable Encrypted Settings (Anthropic API Key)
User follow-up questions after the multi-sheet/AI-mapping pass: "is there
UI for the configuration where the user can add the API key" (no --
`ANTHROPIC_API_KEY` was env-var-only) and whether a secondary AI provider
was available. Resolved (per the user's explicit choice, after presenting
the tradeoffs) as: build a `PLATFORM_ADMIN`-only settings page to manage
the Anthropic key live, encrypted at rest, write-only from the UI's
perspective -- a secondary provider/model fallback was scoped out as a
separate, not-yet-requested piece of work.

- [x] **`@cmmp/security`'s first real implementation** -- this package was
      an empty Phase-1 scaffold (`export {};`) until now. Added
      `encrypt()`/`decrypt()`/`generateEncryptionKey()`
      (`src/encryption/aes-gcm.ts`): AES-256-GCM, a fresh random IV per
      encryption (never reused under the same key), a single `.`-joined
      base64 payload (`iv.authTag.ciphertext`) safe to store in one string
      column, and both a wrong key and a tampered ciphertext failing
      closed via GCM's own authentication tag check (no separate integrity
      check needed). 10 new tests.
- [x] **`PlatformSetting` model** (`docs/data-model.md`) -- a plain
      key/value table (migration `20260902062451_add_platform_settings`,
      generated and applied against the real local Postgres, per this
      project's established practice), holding AES-256-GCM ciphertext,
      never plaintext. No `updatedById` column -- the existing
      `AuditEvent` interceptor already captures who changed a setting and
      when, for free, on every mutating request.
- [x] **`SettingsService`/`SettingsController`** (`apps/api/src/settings/`)
      -- `GET`/`PUT`/`DELETE /settings/integrations(/anthropic-api-key)`,
      `PLATFORM_ADMIN` only, `@Roles()` applied per-method from the start
      (the Phase-13 AuditController lesson, not re-learned the hard way).
      Every response is `IntegrationSettingsStatus` (booleans/enums) --
      the key itself is never serialized into any HTTP response, on a
      read or immediately after the write that just set it. A database-
      stored value takes priority over the `ANTHROPIC_API_KEY` environment
      variable when both are set; a decrypt failure (e.g. a rotated
      `SETTINGS_ENCRYPTION_KEY`) is treated as "not configured" (falls
      back to the env var) rather than thrown, matching this whole
      feature's existing fail-soft philosophy.
- [x] **`AiMappingService` now resolves its key fresh on every call**
      (via `SettingsService`) instead of caching a client built once at
      construction time -- a key saved through the settings UI takes
      effect on the very next import, with no API restart.
- [x] **Settings page** (`apps/web/pages/admin/settings.tsx`) -- a status
      badge (`Configured (saved here)` / `Configured (server environment
      variable)` / `Not configured`), a password-type input that's never
      pre-filled and is cleared immediately after a successful save, and
      a "Clear Stored Key" button shown only when a database value
      actually exists to clear. A friendly permission message (matching
      the Audit page's existing pattern) on a 403, both from a direct
      URL visit and from the nav link only rendering for
      `PLATFORM_ADMIN` (`session.user.roles.includes('PLATFORM_ADMIN')`)
      in the first place.
- [x] Tests: 10 new tests in `packages/security` (round trip, random-IV
      non-determinism, hex-vs-base64 key acceptance, empty-string
      round trip, wrong-key-length rejection, wrong-decryption-key
      failure, tampered-ciphertext failure, malformed-payload failure);
      16 new tests in `apps/api` (`settings.service.spec.ts`: status
      reporting per source, the full encrypt-then-decrypt round trip
      through real `@cmmp/security` code -- not mocked -- trimming,
      too-short rejection, missing/malformed-encryption-key errors, the
      decrypt-failure-falls-back-to-env-var path, clear;
      `settings.controller.spec.ts`: the same per-handler `@Roles()`
      metadata regression test `AuditController`'s spec established) --
      **143 tests total in `apps/api`, up from 127**.
- [x] Live-verified end-to-end in a real browser against the real stack:
      confirmed a non-`PLATFORM_ADMIN` (CISO) sees no Settings nav link
      and gets a friendly permission message on a direct visit to
      `/admin/settings`; confirmed a `PLATFORM_ADMIN` sees the link,
      starts at "Not configured," saves a key (status flips to
      "Configured (saved here)," input clears immediately), and --
      critically -- **that the key is still never returned even after a
      full page reload** (proving the write-only contract holds against a
      fresh load, not just the same in-memory React state); cleared the
      key back to "Not configured." Then, going one step further than the
      previous pass could: saved a real (but intentionally invalid) key
      through the live settings UI and triggered a real import column-
      mapping-suggestion call -- the API log shows a genuine round trip to
      Anthropic's real servers (`401 {"type":"authentication_error",
      "message":"API key is invalid."}`), proving the full chain -- decrypt
      the database-stored key, construct a real `Anthropic` client, make a
      real network call -- actually works end-to-end, not just up to the
      point a mock would have stopped.

### Post-Phase-17: Rate Limiting on `/auth/login`
Working through the ranked gap list from `docs/threat-model.md`'s summary,
one item at a time (user's explicit direction), starting with the
single highest-priority finding: `/auth/login` had zero brute-force
protection despite `.env.example` defining rate-limit variables that
implied otherwise.

- [x] **`@nestjs/throttler` added, scoped to `POST /auth/login` only** --
      `AuthModule` registers `ThrottlerModule.forRootAsync` with its own
      dedicated `AUTH_RATE_LIMIT_WINDOW_MS`/`AUTH_RATE_LIMIT_MAX_ATTEMPTS`
      env vars (defaults 60000ms / 20 attempts); `AuthController.login`
      is the only handler with `@UseGuards(ThrottlerGuard)`. Deliberately
      **not** registered as a global `APP_GUARD` -- every other route
      already requires a valid JWT to reach at all, so a global sweep
      would have added risk (breaking legitimate multi-request UI flows
      or the existing test suites) without protecting anything a global
      guard would newly cover.
- [x] **Deliberately separate from the still-unused
      `ENABLE_RATE_LIMITING`/`RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX_REQUESTS`**
      -- those describe a generic, API-wide request budget (a materially
      larger, separate feature that remains unbuilt), not a login-specific
      brute-force guard; reusing them would have silently conflated two
      different operator-tunable things under one name.
- [x] Every request against `/auth/login` counts toward the same per-IP
      budget regardless of outcome -- a correct password submitted after
      the budget is spent still gets `429`, which is the correct behavior
      for a brute-force guard (an attacker who eventually guesses right is
      still capped).
- [x] Tests: 1 new unit test (`auth.controller.spec.ts` -- a
      `@UseGuards(ThrottlerGuard)`-on-`login` regression test, mirroring
      the metadata-presence pattern `AuditController`'s and
      `SettingsController`'s specs already established) -- 144 tests total
      in `apps/api`, up from 143. Plus a new **integration** spec
      (`test/auth-rate-limit.integration-spec.ts`, boots the real
      `AppModule` over real HTTP, matching `tenant-security.integration-spec.ts`'s
      existing pattern): 6 rapid requests with a wrong password assert the
      first 5 return `401` and the 6th returns `429` (using a small,
      deterministic 5-attempt budget set via `process.env` before the
      module compiles, independent of the real deployment default); a
      second test bursts an unrelated route (`/frameworks`) in the same
      window and confirms it keeps returning its normal `401`
      (unauthenticated) rather than `429`, proving the guard's scope
      didn't leak. Confirmed the pre-existing `tenant-security.integration-spec.ts`
      (which itself calls `/auth/login` ~9 times in one run) still passes
      unmodified against the real 20/60s default -- comfortably under
      budget, no interference.
- [x] Live-verified against the real running API (not just Jest): 20 rapid
      requests with a wrong password each returned `401`, the 21st
      returned `429`; a *correct* password submitted immediately after
      still returned `429` (proving the budget, not the credential, is
      what's being checked); `GET /health` and `GET /frameworks` in the
      same window returned their normal `200`/`401` rather than `429`,
      confirming the guard's scope is exactly `POST /auth/login` and
      nothing else.

  **Not built this pass**: the generic, API-wide rate limit the leftover
  `RATE_LIMIT_*` env vars describe (a separate, larger feature); a
  WAF/CDN-level control for a distributed (many-IP) attack, which a
  per-IP in-application throttle can't address on its own and belongs in
  front of the application in a real deployment, not inside it.

### Post-Phase-17: Pagination on Remaining List Endpoints
Continuing through the ranked gap list one item at a time (user's explicit
direction): every list endpoint except `/audit-events` returned its entire
tenant/organisation-scoped result set with no cap, a real scalability
problem `docs/threat-model.md` had flagged.

- [x] **Wired up `@cmmp/shared`'s already-scaffolded `PaginatedResponse<T>`/
      `PaginationSchema`** (Phase 1 leftovers, confirmed by grep to have
      never been imported by anything before this) rather than inventing a
      new shape -- one more "modeled but unused" gap closed in the same
      pass as actually using it.
- [x] New `apps/api/src/common/pagination.ts` -- `resolvePagination()`
      (normalizes untrusted `page`/`pageSize` query params into Prisma
      `skip`/`take`, defaulting to page 1 / size 20, and **always** capping
      `pageSize` at 100 server-side regardless of what's requested, so
      `?pageSize=100000` can't turn a paginated endpoint back into an
      unbounded one) and `toPaginatedResponse()` (shapes a page + its total
      count into the shared contract). `GET /audit-events`'s own existing
      pagination (Phase 13, default 50/cap 200) was deliberately left
      exactly as it was rather than retrofitted onto this new helper --
      it already works and is already tested; changing it would only add
      risk for no functional gain.
- [x] **`GET /users`, `/assessments`, `/risks`, `/initiatives`** all now
      run a `count()` + `findMany({ skip, take })` in parallel
      (`Promise.all`, matching the audit-events precedent) and return
      `PaginatedResponse<T>` instead of a bare array -- a real, breaking
      change to each endpoint's response shape, not just an additive
      query param.
- [x] **Found and fixed a real internal-caller bug while making this
      change**: `InitiativesService.getTimeline()` (the roadmap's 3/6/12
      month bucketed view) called its own `findAll()` expecting *every*
      initiative back -- after `findAll()` became paginated, that call
      would have silently limited the timeline to only the first page's
      worth of initiatives (a real, DB-agnostic wrong-answer bug: the
      roadmap would look like some initiatives had vanished, not error out
      loudly). Fixed by extracting a shared `buildInitiativesQuery()`
      (where/orderBy only) that both the paginated `findAll()` and an
      unpaginated direct `prisma.remediationInitiative.findMany()` call in
      `getTimeline()` now build from -- a timeline view genuinely needs
      every initiative to bucket correctly, not one page of them, so it
      deliberately doesn't route through the public paginated method at
      all. Caught by grepping for every internal (non-controller,
      non-spec) caller of each `findAll()` before considering this change
      finished, not by chance.
- [x] Frontend: `apps/web/lib/api.ts`'s `listAssessments`/`listRisks` now
      take a `page` argument and return `PaginatedResponse<T>`;
      `pages/assessments/index.tsx` and `pages/risks/index.tsx` both gained
      Previous/Next controls with a "Page X of Y" indicator, wired to a new
      `page` state that re-fetches on change. `listInitiatives` (used only
      by the risk-detail page's initiative *picker*, a dropdown that wants
      "all of them," not one page) keeps its original `InitiativeDetail[]`
      return contract unchanged for its one caller -- internally it now
      requests `pageSize=100` (the server's own max) and unwraps `.data`,
      so the picker needed zero changes at its call site. A tenant with
      more than 100 initiatives will have some missing from that picker
      specifically -- a known, documented limitation, not an oversight.
- [x] Tests: 7 new tests for the pagination helper itself
      (`common/pagination.spec.ts` -- defaults, skip/take math, the
      pageSize cap, invalid/fractional input handling, the
      `toPaginatedResponse` shape including the zero-results case); one
      new pagination-shape test added to each of the four affected
      services' existing spec files -- 155 tests total in `apps/api`, up
      from 144. Fixed one real integration-test break this change caused:
      `tenant-security.integration-spec.ts`'s cross-tenant risk-listing
      test was parsing `GET /risks`'s real HTTP response as a bare array
      (`risksB.some(...)`) -- updated to destructure `{ data }` from the
      new `PaginatedResponse` shape, confirming this was a genuine,
      real-HTTP-consumer breaking change caught by an actual integration
      test, not just a type error.
- [x] Live-verified end-to-end in a real browser against the real stack:
      created 24 temporary risks via the real API to push the seeded
      tenant's risk count past the default page size (27 total, 20/page),
      confirmed the Risk Register page showed "Page 1 of 2," clicking
      "Next" showed the remaining 7 rows with a *different* first row than
      page 1, "Page 2 of 2" with "Next" now disabled, and "Previous"
      correctly returning to page 1 with "Previous" disabled there --
      then deleted all 24 temporary risks to leave the demo database
      clean. Separately confirmed the initiative picker on the risk-detail
      page still populates correctly end-to-end (a real `GET
      /initiatives?sortBy=priority&pageSize=100` call, options rendered
      from real seeded initiative titles).

  **Not built this pass**: a searchable/paginated UI for the initiative
  picker itself (still a plain `<select>`, now backed by up to 100
  initiatives instead of an unbounded list -- fine at today's scale, a
  real limitation past 100); pagination for `GET /frameworks`,
  `GET /initiatives/timeline`, or `GET /assessments/:id/history`
  (deliberately out of scope -- see `docs/api-reference.md`'s
  "Conventions" section for why each was left as-is).

### Post-Phase-17: Fail-Fast Startup Check for `JWT_SECRET`/`NEXTAUTH_SECRET`
Continuing through the ranked gap list (user's explicit direction): both
secrets have publicly-visible hardcoded fallback values in code, and
`docs/threat-model.md` had flagged relying on an operator to override them
correctly as a real (if lower-probability) spoofing risk. Upgraded from a
process/checklist item to an enforced, code-level guarantee.

- [x] New `apps/api/src/config/validate-env.ts`, called at the very top of
      `main.ts`'s `bootstrap()` -- before `NestFactory.create()` even
      builds the DI container -- throws if `NODE_ENV=production` and
      `JWT_SECRET` is unset or equals any of three known placeholders:
      the two hardcoded fallbacks already in `auth.module.ts`/
      `jwt.strategy.ts` and `docker-compose.yml`, plus (found while
      testing this live against the sandbox's own `.env`)
      `.env.example`'s own placeholder text -- copying that file to
      `.env` without editing it is, if anything, a more likely real-world
      mistake than leaving the variable unset outright.
- [x] Web side needed two separate checkpoints, not one, for a subtle
      reason found only by testing the actual Docker deployment path
      rather than trusting `next dev`: `output: "standalone"` resolves
      `next.config.js` at *build* time, and the generated `server.js`
      never re-requires it at runtime, so a check placed only in
      `next.config.js` (kept, exported as a phase-aware function so it
      still fires for a non-Docker `next start`) silently never runs for
      `infrastructure/Dockerfile.web`'s real CMD. New
      `apps/web/scripts/check-env.js` -- a small standalone script, not
      traced/bundled by Next -- is copied into the runner image and run
      by `CMD ["sh", "-c", "node apps/web/scripts/check-env.js && node
      apps/web/server.js"]`, immediately before the server starts.
      `next.config.js`'s own check is also phase-guarded against
      `PHASE_PRODUCTION_BUILD` specifically, because `next build` forces
      `NODE_ENV=production` internally regardless of the ambient
      environment, and the Docker build stage never has `NEXTAUTH_SECRET`
      available (it's only injected into the container at runtime) --
      without that guard, every production image build would fail.
- [x] Tests: 6 new tests in `apps/api/src/config/validate-env.spec.ts`
      (no-op outside production even with no secret set; throws on unset,
      each of the three known placeholders, and passes with a real
      secret). 161 tests total in `apps/api`, up from 155.
- [x] Live-verified end-to-end, not just unit-tested: built `apps/api`
      and ran the real compiled `dist/main.js` with `NODE_ENV=production`
      under all four scenarios (unset, each hardcoded placeholder, a real
      secret) -- confirmed it fails closed with the intended message in
      the first three and boots all the way to "Nest application
      successfully started" + a live DB connection in the fourth. Did
      the same for `apps/web`: built the standalone output once, then ran
      `node scripts/check-env.js && node .next/standalone/apps/web/
      server.js` under the same four scenarios, confirming a real
      `HTTP 200` from the running server only in the valid case. Also
      confirmed `npm run build --workspace=apps/web` still succeeds with
      `NEXTAUTH_SECRET` completely unset, proving the build-phase guard
      actually prevents the Docker image build itself from breaking.

  **Not built this pass**: an analogous fail-fast check for
  `SETTINGS_ENCRYPTION_KEY` -- it already throws on first use if unset or
  malformed (`SettingsService`, see the Runtime-Configurable Encrypted
  Settings section above), which is a materially different situation from
  `JWT_SECRET`/`NEXTAUTH_SECRET`: it's optional (only needed once a
  `PLATFORM_ADMIN` actually tries to save an integration secret through
  `/admin/settings`), not something every deployment must set, so failing
  the whole app's startup over it would be wrong.

### Post-Phase-17: `EXECUTIVE_VIEWER` Wired to a Real Dashboard-Only Guard
Continuing through the ranked gap list (user's explicit direction): item #4
-- `docs/architecture.md`'s original design lists `EXECUTIVE_VIEWER` as
"Executive dashboard only," but no guard anywhere referenced that role
specifically; it behaved identically to `READ_ONLY_VIEWER`. Decided to
build the real restriction (matching the documented product intent) rather
than fold the role away, since it doesn't grant *more* access than a
read-only viewer already has today -- only less, once enforced.

- [x] New `ExecutiveDashboardAccessible()` decorator (metadata-only, mirrors
      the existing `@Roles()` pattern) marks a handler as reachable by an
      `EXECUTIVE_VIEWER`-only token. Applied to exactly: all seven
      `DashboardController` routes (that whole controller *is* the
      executive dashboard), `AssessmentsController.findAll` (`GET
      /assessments`, needed to pick which assessment's dashboard to open --
      deliberately NOT applied to `findOne`, the raw item-level assessment,
      which is exactly the "dashboard vs. raw data" line the design draws),
      and `AuthController`'s `logout`/`refresh`/`getCurrentUser` (session
      lifecycle stays available to every authenticated role regardless).
- [x] **Found and fixed a real bug in this feature's own first
      implementation, via live testing, not unit testing**: the natural
      first design was a `RolesGuard`-style deny-by-default guard
      registered globally (`APP_GUARD` in `app.module.ts`). Every unit test
      for it passed (mocking `request.user` directly proves the guard's own
      logic works in isolation) -- but NestJS runs global guards *before*
      controller-scoped ones, and `JwtAuthGuard` (which populates
      `request.user`) is controller-scoped. Booting the real API and
      hitting it with a real EXECUTIVE_VIEWER-only JWT over real HTTP
      showed `GET /assessments/:id` and `GET /users` both returning a real
      `200`, not the intended `403` -- the guard was silently never firing
      in production. Fixed by moving the check into `JwtAuthGuard` itself
      (`canActivate` calls `super.canActivate()` first, then composes
      `ExecutiveViewerScopeGuard`'s logic, guaranteeing the correct order by
      construction) rather than a second guard a future controller could
      forget to attach. `ExecutiveViewerScopeGuard` stays its own,
      independently unit-tested class; it's just no longer registered as a
      global guard.
- [x] Frontend: `pages/assessments/index.tsx` and `pages/assessments/[id].tsx`
      hide the Roadmap/Risk Register/Audit Log nav links for an
      `EXECUTIVE_VIEWER`-only session (they'd now 403), mirroring the
      existing `PLATFORM_ADMIN`-only Settings link pattern. A user who also
      holds a broader role sees the full nav, matching the guard's own
      multi-role treatment.
- [x] Tests: 6 new tests in `executive-viewer-scope.guard.spec.ts` (the
      guard's own logic, mocking `request.user` directly) plus 9 in a new
      `executive-dashboard-accessible.wiring.spec.ts` regression suite
      asserting the *exact* decorated-handler allowlist (would catch a
      future refactor silently widening or narrowing it) -- but see above:
      neither of those would have caught the ordering bug on their own.
      170 tests total in `apps/api`, up from 161.
- [x] **Live-verified end-to-end against the real stack, which is what
      actually caught the ordering bug above**: created a temporary
      `EXECUTIVE_VIEWER` user via the real API (`POST /users` +
      `POST /users/:id/roles/EXECUTIVE_VIEWER`), logged in for a real JWT,
      and hit every endpoint in this document over real HTTP -- confirmed
      `200` from `GET /assessments`, all seven dashboard sub-routes,
      `/auth/me`, and `/auth/logout`; confirmed `403` from
      `GET /assessments/:id`, `/assessments/:id/history`, `/risks`,
      `/users`, `/initiatives/timeline`, `/audit-events/summary`, and
      `/frameworks`. Assigned a second role (`GRC_MANAGER`) to the same
      user and confirmed full access returned, proving the multi-role
      carve-out works. Separately confirmed a `CISO` login was completely
      unaffected (no regression for every other role). Added a new
      `executive-viewer-scope.integration-spec.ts` (real HTTP, real
      Postgres, following `tenant-security.integration-spec.ts`'s pattern)
      to keep this behavior pinned going forward -- 15 integration tests
      total, up from 11. Then live-verified the frontend too, in a real
      browser against the real standalone production build: nav correctly
      shows only "Sign Out," the dashboard itself renders fully (KPIs,
      radar chart, heatmap, gap table), and a direct `/risks` visit shows
      the guard's own error message gracefully instead of crashing.
      Deleted the temporary test user afterward.

  **Not built this pass**: hiding the "Generate Roadmap from Gaps" button
  on the dashboard page for this role -- it already 403s for
  `EXECUTIVE_VIEWER` via the pre-existing `RolesGuard`/`@Roles()` on
  `RoadmapController`, unrelated to and unchanged by this pass, and
  matches how the same button already behaves for `READ_ONLY_VIEWER`
  today; out of this gap's scope.

### Post-Phase-17: Token Revocation (Logout Blacklist + Refresh Rotation)
Continuing through the ranked gap list (user's explicit direction): item
#5 -- `POST /auth/logout` only logged the event; a token remained valid
for its full 24h lifetime regardless. Built a logout-side blacklist plus
refresh-side rotation rather than the larger short-lived-access-token-
plus-separate-refresh-token architecture also floated for this gap --
materially smaller and lower-risk for the same practical benefit, and
`/auth/refresh`'s existing contract (re-sign the same token type) didn't
need to change shape.

- [x] New `RevokedToken` Prisma model/migration (`jti` primary key,
      `tenantId`, `userId`, the original token's own `expiresAt`,
      `revokedAt`). `AuthService.login()` now includes a random `jti`
      (`crypto.randomUUID()`) in every signed payload.
- [x] `JwtStrategy.validate()` looks up the incoming token's `jti` after
      passport-jwt's own signature/expiry checks pass; a hit throws
      `UnauthorizedException` immediately -- checked on every
      authenticated request, one extra indexed lookup, not a join against
      "all active tokens" (no row exists for a token that hasn't been
      revoked).
- [x] `POST /auth/logout` revokes the presented token before logging the
      `LOGOUT` audit event. `POST /auth/refresh` now **rotates**: the
      presented token is revoked the moment a new one (fresh `jti`) is
      issued, closing the "not a rotation scheme" gap `docs/api-reference.md`
      previously called out explicitly.
- [x] Revocation is an `upsert` on `jti` (the table's primary key), not a
      `create` -- a double-logout (retry, double-click) or two concurrent
      `/auth/refresh` calls racing to revoke the same token can't 500 on a
      unique-constraint violation. Each revocation call also
      opportunistically deletes rows past their own `expiresAt` (self-
      cleaning; those rows would already be rejected by `JwtStrategy`'s
      own expiration check regardless, so no separate cleanup job is
      needed).
- [x] **Found and fixed a real integration gap while live-testing, not
      just unit-testing**: the web app's "Sign Out" button called only
      NextAuth's own `signOut()`, which clears the browser's session
      cookie but has no idea the wrapped CMMP API JWT exists -- the
      backend token stayed valid the full 24h regardless of a user
      clicking "Sign Out." Discovered by actually clicking Sign Out in a
      real browser and then replaying the captured token against the real
      API afterward -- it still worked. Fixed with a new
      `apps/web/lib/auth.ts` `signOutAndRevoke()` that calls the new
      `api.logout()` (`POST /auth/logout`) before NextAuth's `signOut()`,
      wired into all six Sign Out buttons across the app (best-effort --
      a failed backend call still lets the user sign out client-side
      rather than getting stuck).
- [x] Tests: 4 new unit tests in `auth.service.spec.ts` (jti issued and
      unique per login; refresh rotates the jti and revokes the old one;
      logout revokes when `exp` is present; logout skips revocation
      gracefully when it isn't -- a defensive case for malformed/test
      payloads), a new `jwt.strategy.spec.ts` (2 tests -- none existed
      before this pass), and a new `token-revocation.integration-spec.ts`
      (3 tests, real HTTP against the real running app, following
      `tenant-security.integration-spec.ts`'s pattern): a token is
      rejected on the very next request after logout; revocation is
      per-token, not per-user (a second, still-valid token for the same
      user keeps working); refresh rotation actually invalidates the
      pre-refresh token. 175 unit tests total in `apps/api` (up from
      170), 18 integration tests (up from 15).
- [x] Live-verified end-to-end, not just via integration test: booted the
      real API and web app (the real standalone production build), logged
      in as a real seeded user in a real browser, captured the session's
      access token via the NextAuth session response, confirmed it worked
      against the real API (`200` from `/auth/me`), clicked the real
      "Sign Out" button, and confirmed the same token now gets a real
      `401` from the real API immediately afterward -- this is what
      caught the Sign-Out-doesn't-call-the-backend gap above; a
      unit/integration test alone would have missed it, since those test
      the API in isolation from the actual product surface that's
      supposed to trigger it.

  **Not built this pass**: password-change-triggered revocation (there is
  no password-change endpoint yet, so nothing to trigger it from);
  revoking every token for a user at once (e.g. on role change or account
  deactivation) -- today's model revokes one token at a time, by its own
  `jti`, which is what logout and refresh actually need; a per-user
  revocation-epoch column would be a natural, small extension if a real
  "deactivate this account everywhere, right now" requirement emerges.

### Post-Phase-17: CSP/HSTS/Referrer-Policy Headers (helmet)
Continuing through the remaining gaps in `docs/security-architecture.md`'s
"Known gaps" list (user's explicit direction, working through all of them
one at a time): a hand-rolled three-header `main.ts` middleware
(`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`) had no
CSP, HSTS, or Referrer-Policy at all, and `helmet` wasn't in use.

- [x] Installed `helmet` in `apps/api`; `main.ts`'s middleware now sets a
      maximal CSP (`default-src`/`frame-ancestors: 'none'` -- this is a
      pure JSON API that never renders HTML of its own, so blocking
      everything by default costs nothing and only helps if a response is
      ever misread as HTML by a buggy client), HSTS
      (`max-age=31536000; includeSubDomains`), `Referrer-Policy:
      no-referrer`, plus helmet's other bonus headers
      (`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
      `X-DNS-Prefetch-Control`, etc.). `X-XSS-Protection` deliberately
      not re-added -- deprecated, removed from helmet's own defaults
      since v6, superseded by the CSP.
- [x] `apps/web/next.config.js`'s existing headers (already had
      `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, and
      HSTS from an earlier phase, undocumented until now) gained the two
      that were actually missing: `Content-Security-Policy`
      (`default-src 'self'`, `script-src 'self'` with no
      `unsafe-inline`/`unsafe-eval`, `connect-src 'self'
      <NEXT_PUBLIC_API_URL>` so the browser's direct-to-API fetch calls
      aren't blocked) and `Referrer-Policy: strict-origin-when-cross-origin`.
      `X-XSS-Protection` dropped here too, for the same reason.
- [x] **Found a real constraint only by testing against the actual
      dashboard, not by reasoning about it**: a first-draft strict
      `style-src 'self'` (no exceptions) broke chart rendering --
      Recharts (the library behind the maturity radar/gap-bar/heatmap
      components) renders inline `style=""` attributes directly on SVG
      elements, not just external CSS. Fixed by adding `'unsafe-inline'`
      to `style-src` specifically (not `script-src`, which stays locked
      to `'self'` with no exceptions -- that's the directive that
      actually matters for stopping injected-script XSS).
- [x] Extracted `apps/api/test/test-app.ts`, a shared `createTestApp()`
      used by all five integration spec files (previously each one
      hand-copied its own `setGlobalPrefix`/`ValidationPipe` setup, and
      none of them had ever applied CORS or helmet at all). This wasn't
      optional cleanup: writing a first draft of the new
      `security-headers.integration-spec.ts` the old way (its own
      inline setup, not calling `helmet()`) produced a real, if
      short-lived, false failure -- the test asserted on headers a
      hand-assembled test app never actually applied, exactly the kind of
      drift a shared helper prevents by construction.
- [x] Tests: new `security-headers.integration-spec.ts` (1 test, asserting
      CSP/HSTS/Referrer-Policy/legacy headers on a real HTTP response from
      the real app). 19 integration tests total (up from 18); unit test
      count unchanged (175) since this is a bootstrap/middleware-only
      change with no service logic to unit-test.
- [x] Live-verified end-to-end: `curl -I` against both the real compiled
      API and the real standalone web server, confirming every header's
      exact value; a Playwright click-through of sign-in, the assessments
      list, the executive dashboard (with its Recharts SVG charts --
      confirmed 7 `<svg>` elements rendered), risks, roadmap, and audit
      pages, capturing browser console output and finding zero CSP
      violations.

### Post-Phase-17: Audit Log Immutability at the Database Level
Continuing through the remaining gaps in `docs/security-architecture.md`'s
"Known gaps" list: `AuditService` only ever exposed `log()`/read
methods -- a real application-level guarantee, but not a database-level
one. A determined actor with the app's own database credentials (a
compromised app process, a SQL-injection-class bug, direct psql access
using the same connection string) could still `UPDATE audit_events`
directly, bypassing the application entirely.

- [x] **Investigated the "obvious" fix first and found it doesn't work
      for this schema**: `REVOKE UPDATE/DELETE` grants require a database
      role distinct from the table's owner -- Postgres owners bypass
      GRANT/REVOKE on their own objects unconditionally. This repo's
      `cmmp_user` (docker-compose.yml/.env.example) is both the migration
      role (creates and owns every table) and the app's own runtime
      connection role -- the same credentials for both. A real GRANT/
      REVOKE fix would require introducing a second, more-restricted
      database role and updating every environment's connection string --
      a materially larger architectural change than this gap warrants on
      its own.
- [x] Built it as a Postgres trigger instead
      (`audit_events_no_update`, a raw-SQL migration Prisma's schema DSL
      can't express -- `packages/database/prisma/migrations/
      *_audit_events_immutable_update`): `BEFORE UPDATE ON audit_events`
      raises an exception unconditionally, for every role, with no bypass
      flag (a bypass the app's own credentials could flip would defeat
      the point).
- [x] **Traced the schema's own cascade behavior before writing the
      migration, not after breaking something**: `AuditEvent.tenantId` has
      `onDelete: Cascade` -- deleting a `Tenant` (a real, legitimate
      operation: account offboarding, GDPR erasure) cascades into deleting
      its `audit_events` rows through the same `DELETE` machinery a
      row-level trigger can't distinguish from a direct, illegitimate
      `DELETE` against this table. A blanket trigger blocking both UPDATE
      and DELETE would have broken tenant deletion (and, concretely, two
      existing integration tests' own cleanup, plus `seed.ts`'s
      `auditEvent.deleteMany()` reset step). Scoped to `UPDATE` only --
      no application code path ever updates an audit event anyway (grep
      confirmed it), so this is a purely additive guarantee with nothing
      to break.
- [x] Tests: new `audit-immutability.integration-spec.ts` (2 tests: a
      direct `UPDATE` is rejected and the row is confirmed unchanged; a
      direct `DELETE` still succeeds, proving the scoping is exactly what
      was intended). 21 integration tests total (up from 19).
- [x] Live-verified beyond the automated tests: ran `npm run db:seed`
      end-to-end against the real local Postgres with the trigger in
      place, confirming the reseed flow (which deletes and recreates audit
      events) still completes successfully; separately created a
      throwaway tenant/user/audit-event via a real Prisma script and
      confirmed deleting the tenant still cascades into its audit events
      without error.

  **Not built this pass**: a second, restricted database role for true
  `REVOKE`-based immutability (see the investigation above for why this
  would be a materially larger, separate architectural change); blocking
  `DELETE` as well (deliberately out of scope -- see the cascade reasoning
  above).

### Post-Phase-17: File-Upload Signature Validation (Partial Gap Closure)
Continuing through the remaining gaps in `docs/security-architecture.md`'s
"Known gaps" list: "no file-upload evidence scanning." Investigated what's
actually feasible here first, rather than assuming a full malware-scanner
integration was the right scope.

- [x] **Confirmed the real blast radius before deciding scope**: the
      `Evidence` model has no upload endpoint at all yet (nothing to scan
      there), and the one real upload path (spreadsheet import,
      `ImportController`) uses multer's default memory storage --
      confirmed by grep that `file.buffer` is used throughout
      `ImportService`/`@cmmp/import-engine` and `file.path`/`diskStorage`
      appear nowhere. An uploaded file is parsed from memory and never
      written to disk or served back to any user, which already bounds
      the practical risk regardless of what else is or isn't built.
- [x] New `validateFileSignature()` (`@cmmp/import-engine`'s
      `parse.ts`, called at the top of `parseAllSheets()`): rejects a file
      whose actual content doesn't match its claimed `format`, before any
      real parsing is attempted. `.xlsx` must start with the real ZIP
      local-file-header signature (`50 4B 03 04` -- xlsx is a ZIP archive
      under the hood); CSV (no universal magic byte, since it's plain
      text) is checked with the same text-vs-binary heuristic `file`/git
      use -- a NUL byte anywhere in the first 1KB means it isn't really
      text. This is the standard, OWASP-recommended first-line control
      for validating upload content against its claim, not malware
      scanning -- explicitly not conflated with that in the docs update.
- [x] Tests: 6 new tests in `@cmmp/import-engine/src/parse.spec.ts`
      (accepts a real xlsx/CSV, rejects a disguised/renamed file for each
      format, rejects a too-short buffer, and confirms a file with a
      *valid* ZIP signature but garbage xlsx content inside still fails
      via exceljs's own parser -- proving the new check and the existing
      parser validation work together rather than one masking the
      other). 37 tests total in `@cmmp/import-engine` (up from 31).
- [x] Live-verified against the real running API: uploaded a genuine CSV
      and a genuine xlsx (generated fresh via `exceljs`) to the real
      `POST /assessments/:id/import/preview` endpoint and got `201` for
      both; uploaded a plain-text file renamed to claim `format=xlsx` and
      a binary-laced file claiming `format=csv` and got a real `400` with
      the intended message for each, confirming the whole path (multipart
      upload -> `ImportController` -> `ImportService` ->
      `@cmmp/import-engine`) rejects disguised files before spending any
      parse effort on them.

  **Not built this pass, and explicitly not attempted**: real malware/
  antivirus scanning (no AV engine like ClamAV is integrated -- this
  sandbox has no reliable way to fetch and verify current virus
  definitions, and standing one up is a real infrastructure dependency, a
  scanning daemon plus a definitions-update pipeline, not a code change);
  zip-bomb protection for xlsx (a dedicated guard would need to inspect
  the ZIP's own declared uncompressed size before `exceljs` decompresses
  it -- the existing 5MB upload cap bounds this somewhat but doesn't solve
  it); an upload endpoint for the `Evidence` model (doesn't exist yet, so
  there's nothing there to add scanning to).

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

None -- every phase originally scoped in this document (1 through 17) is
now complete. What remains is the set of honestly-documented gaps and
follow-ups captured throughout (see "Known Issues" above, each phase's own
"Not built/verified this pass" notes, and "Next Steps" below) -- this is a
living project, not a claim that nothing further is needed.

## Blockers 🚫

None currently

## Architecture Decisions

> The one-line summaries below are kept for quick scanning. Phase 17
> expanded each into a full ADR with real Context/Alternatives/
> Consequences (including, where relevant, how much of the decision is
> actually realized vs. still aspirational) — see `docs/adr/`.

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
7. ~~Begin Phase 17: Documentation~~ — done this session (see Phase 17
   above): a security architecture document, a threat model/STRIDE
   analysis, a full API reference, data-model/scoring/framework-model/
   Excel-import/deployment/DevSecOps-pipeline documents, and 10 expanded
   ADRs, all grounded directly in the real schema/code/workflow files
   rather than summarized from memory — plus a pointer note atop the
   Phase-1 `docs/architecture.md` flagging where it's since drifted from
   reality (Redis, Kubernetes, an AWS ALB/WAF, a 1-hour JWT expiry that's
   actually 24h, and an entity list that doesn't match the real schema).
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
12. ~~Add rate limiting to `POST /auth/login`~~ — **done** (see
    "Post-Phase-17: Rate Limiting on `/auth/login`" above): `@nestjs/throttler`,
    scoped to the login handler only, live-verified against the real
    running API.
13. ~~Add pagination to the remaining list endpoints~~ — **done** (see
    "Post-Phase-17: Pagination on Remaining List Endpoints" above):
    `/users`, `/assessments`, `/risks`, `/initiatives` all paginate now,
    `@cmmp/shared`'s `PaginatedResponse<T>` finally wired up, live-verified
    with a real multi-page browser session.
14. ~~Confirm `JWT_SECRET`/`NEXTAUTH_SECRET` are never left at their
    hardcoded fallback in a real deployment~~ — **done, and upgraded from
    a checklist item to an enforced one** (see "Post-Phase-17: Fail-Fast
    Startup Check for `JWT_SECRET`/`NEXTAUTH_SECRET`" above): both the API
    and the web app now refuse to start with `NODE_ENV=production` if
    either secret is unset or equals any known placeholder, live-verified
    against the real compiled `dist/main.js` and the real standalone
    Next.js server under all four scenarios.
15. ~~`EXECUTIVE_VIEWER` never actually being distinguished from
    `READ_ONLY_VIEWER` by any guard~~ — **done** (see "Post-Phase-17:
    `EXECUTIVE_VIEWER` Wired to a Real Dashboard-Only Guard" above): a
    token whose only role is `EXECUTIVE_VIEWER` now gets a real 403 outside
    the dashboard/assessment-list/session-lifecycle surface, live-verified
    over real HTTP and in a real browser. Along the way, found and fixed a
    real bug in the fix's own first draft: a naive global-guard
    implementation looked correct in every unit test and silently did
    nothing in production, caught only by testing against the real running
    app.
16. ~~Token revocation~~ — **done** (see "Post-Phase-17: Token Revocation
    (Logout Blacklist + Refresh Rotation)" above): a logout-side
    blacklist keyed by a new `jti` claim, checked on every authenticated
    request, plus rotation on `POST /auth/refresh`. Along the way, found
    and fixed a real product-integration gap: the web app's "Sign Out"
    button only cleared the NextAuth session client-side and never
    actually called the backend, so the underlying API token stayed valid
    the full 24h regardless -- caught by replaying a captured token
    against the real API after clicking the real Sign Out button in a
    real browser, not by any unit or integration test in isolation. The
    only remaining item from `docs/threat-model.md`'s "Summary of the
    highest-priority items" is a WAF/CDN-level rate limit for a
    distributed (many-IP) attack the per-IP login throttle can't address
    alone -- explicitly out of this application's own scope (it belongs
    in front of the application, e.g. Cloudflare/a WAF, not inside it).

## Contact & Questions

- See CONTRIBUTING.md for contribution guidelines
- See SECURITY.md for security reporting
- Check docs/ for detailed documentation
