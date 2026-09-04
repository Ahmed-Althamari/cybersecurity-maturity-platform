# CMMP Implementation Status

Last Updated: 2026-09-04

## Overall Progress

**Phase**: 9 / 17
**Completion**: ~53%

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
- [x] Seed data script (`packages/database/prisma/seed.ts`) — full NIST CSF
      2.0 hierarchy (see Phase 5), demo tenant/org/users, 106 sample
      assessment items, 12 risks, 6 remediation initiatives
- [x] Migrations structure — this environment had a local PostgreSQL 16
      available (unlike the sandbox that did Phases 1-4): generated and
      applied the first real migration
      (`packages/database/prisma/migrations/20260904143053_init/`) via
      `npx prisma migrate dev`, matching the 28-model schema. Committed to
      the repo per the master prompt's "migration and seed scripts must be
      included" requirement.

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
- [ ] NextAuth.js configuration on the Next.js frontend (not started — the
      NestJS API issues its own JWTs for now; frontend session wiring is
      still open)
- [ ] Token revocation / refresh-token rotation (current `refresh` endpoint
      re-signs a valid token; no blacklist or rotation yet)
- [x] End-to-end verification against a live database — this environment had
      PostgreSQL 16 available; ran the real migration, seeded the database,
      started the API, and confirmed `POST /api/v1/auth/login` issues a
      working JWT against the real `admin@example.local` row.

### Phase 4: Framework Engine
- [x] `@cmmp/framework-engine` package: framework-agnostic `FrameworkDefinition`
      tree types (function → category → subcategory → question), separate
      from `@cmmp/shared`'s flat, persistence-oriented interfaces
- [x] Framework loader (`parseFrameworkDefinition` / `loadFrameworkFromJson`)
      — accepts a raw object or JSON string, per master prompt §34
      ("Framework definitions should be loadable from JSON or database
      records")
- [x] Framework validation — zod shape/type validation (code format,
      kebab-case slug, required fields) plus a semantic pass for invariants
      zod can't express on its own (duplicate sibling codes at every level
      of the hierarchy); every issue is collected and reported in one pass,
      not just the first
- [x] Dynamic navigation tree generation (`buildFrameworkNavigation`) —
      walks the generic function/category/subcategory shape recursively;
      verified with an NIST-CSF-shaped and an unrelated ISO-27001-shaped
      input to confirm there's no framework-specific branching (per master
      prompt §34, "Avoid framework-specific if/else statements")
- [x] `flattenFramework` — code-indexed lookup maps, groundwork for the
      Phase 6/7 assessment and scoring engines
- [x] Unit tests (`loader.spec.ts`, `navigation.spec.ts`,
      `flatten.spec.ts` — 14 tests)
- [x] Wired into the API: `FrameworksModule` (`apps/api/src/frameworks`) —
      `GET /frameworks`, `GET /frameworks/:id`, `GET /frameworks/:id/navigation`
      (tenant-scoped reads via Prisma's nested `include`, mapped into the
      engine's shape) and `POST /frameworks/import` (validates a submitted
      definition through the engine, then persists the whole tree as one
      nested Prisma transaction; PLATFORM_ADMIN/ORGANISATION_ADMIN only)
- [x] Unit tests: tenant isolation on `findAll`/`findOne`, navigation
      built from a persisted tree, invalid-definition rejection short-circuits
      before touching the database, duplicate slug/version mapped to 409
      (`frameworks.service.spec.ts` — 6 tests)
- [x] Prisma ↔ engine mapping (`toFrameworkDefinition`, `buildFrameworkCreateInput`,
      `frameworkTreeInclude`) moved from `apps/api`'s `FrameworksService` into
      `@cmmp/database` (`src/framework-import.ts`) so both the API and the
      seed script share one implementation instead of two copies

### Phase 5: NIST CSF Framework Data
- [x] Full NIST CSF 2.0 hierarchy: 6 Functions, 22 Categories, 106
      Subcategories (`packages/database/prisma/fixtures/nist-csf-2.0.json`),
      matching the official CSWP 29 counts. Codes, names, and outcome
      statements reproduced from training-data knowledge of the public
      standard, not copy-pasted from the PDF — validated for internal
      consistency (unique codes at every level, correct hierarchy) via the
      Phase 4 loader, but not diffed word-for-word against the official
      publication. Treat as a strong starting point; verify exact wording
      against the official NIST CSWP 29 document before relying on it for
      real compliance/audit use.
- [x] One assessment question per subcategory, auto-derived from its
      outcome statement ("To what extent has the organization achieved the
      following outcome: …?") — 106 questions total
- [x] Framework seed data now flows through the Phase 4 loader instead of
      ad hoc Prisma calls: `seed.ts` loads the JSON, validates it with
      `parseFrameworkDefinition`, and persists the whole tree via
      `buildFrameworkCreateInput` in one nested transaction
- [x] Realistic (non-uniform) sample assessment data, per master prompt §36:
      a seeded deterministic PRNG spreads current maturity around each
      function's target profile (Govern 2.2, Identify 3.1, Protect 2.8,
      Detect 2.4, Respond 2.1, Recover 1.9 — the master prompt's own
      example numbers) with target maturity in the 3.5-4.5 range, one
      `AssessmentItem` per subcategory (106 total). The 12 highest-gap
      items become tracked `Risk` records, 6 of those get
      `RemediationInitiative`s — not a 1:1 mirror of the assessment, the
      way a real risk register stays curated
- [x] Regression test: `framework-import.spec.ts` validates the real JSON
      fixture through `parseFrameworkDefinition` on every test run, so a
      future edit that breaks the hierarchy (duplicate code, bad format)
      fails CI instead of only failing at seed time
- [x] Verified end-to-end against a live PostgreSQL 16 instance (available
      in this environment): generated the first Prisma migration, ran
      `npm run db:seed`, confirmed function/category/subcategory counts in
      the database match the fixture exactly (GV 6/31, ID 3/21, PR 5/22,
      DE 2/11, RS 4/13, RC 2/8), and exercised the framework navigation
      through the running API

### Phase 6: Assessment Engine
- [x] `AssessmentsModule` (`apps/api/src/assessments`) — `AssessmentsService`/
      `AssessmentsController`, the first thing other than the seed script
      that can write `Assessment`/`AssessmentItem`/`AssessmentHistory` rows
- [x] Assessment creation (`POST /assessments`) — takes an `organisationId` +
      `frameworkId` (both verified to belong to the caller's tenant), and
      finds-or-creates that framework's default `AssessmentTemplate` rather
      than requiring template management as its own separate step. Starts
      in `DRAFT`.
- [x] Assessment responses (`POST /assessments/:id/items`) — upserts one
      `AssessmentItem` per question (unique on `assessmentId`+`questionId`).
      Validates the question actually belongs to the assessment's own
      framework (joined through subcategory → category → function →
      framework) before writing, so a response can't reference another
      framework's — or another tenant's — subcategory.
- [x] Draft/submitted states — `DRAFT` auto-transitions to `IN_PROGRESS` on
      the first recorded response; `POST /assessments/:id/submit` moves to
      `SUBMITTED` (rejects an assessment with zero responses, and rejects
      re-submitting one already `SUBMITTED`/`APPROVED`/`ARCHIVED`). Once
      `SUBMITTED`, both `PATCH /assessments/:id` and `POST .../items` are
      rejected with 409 — matching how the seed data's own `SUBMITTED`
      assessment behaves when exercised through the API.
      `completionPercentage` is recomputed on every item write as
      `answered / totalQuestionsInFramework`.
- [x] Assessment history tracking — `POST .../submit` appends a versioned
      `AssessmentHistory` snapshot (`GET /assessments/:id/history` lists
      them, newest first). The seed script's own demo assessment now gets
      the same treatment (version 1) instead of being `SUBMITTED` with no
      history, and is linked to a real `AssessmentTemplate` for the first
      time (previously `templateId` was left null).
- [x] Deliberately NOT computed here: `currentMaturity`/`targetMaturity`/
      `maturityGap` on `Assessment` stay whatever they were (null for a
      freshly created one) — the master prompt calls scoring out as its
      own "standalone scoring service" (§33), so those numbers are Phase
      7's job, not folded into the response-recording workflow.
- [x] Unit tests (`assessments.service.spec.ts` — 17 tests): tenant
      isolation, template reuse-vs-creation, every status-transition guard,
      the cross-framework question rejection, and history versioning
      (including the "no history yet" starting-at-1 case)
- [x] Verified end-to-end against the live PostgreSQL instance: created an
      assessment via the API, hit the cross-framework-question 400, wrote a
      real response (confirmed the DRAFT→IN_PROGRESS transition and
      `completionPercentage`), submitted it, confirmed the history entry,
      and confirmed editing after submit 409s

### Phase 7: Scoring Engine
- [x] `@cmmp/scoring-engine` package (per master prompt §33: "standalone
      scoring service... reusable functions and unit tests", not folded
      into React components or into the Assessment Engine's write path)
- [x] Maturity level definitions — `maturityLevelToScore`/
      `scoreToMaturityLevel` map `@cmmp/shared`'s `MaturityLevel` enum
      to/from a 0-5 numeric scale (NOT_APPLICABLE = 0, excluded from
      averages rather than scored as a zero)
- [x] Item scoring calculation — `scoreItems` is a weighted average over a
      flat list of scored responses; NOT_APPLICABLE items are dropped from
      the denominator entirely (a not-applicable control shouldn't drag
      the average toward zero, and its target doesn't matter either)
- [x] Category/Function/Framework aggregation — `scoreFramework` walks a
      `@cmmp/framework-engine` `FrameworkDefinition` tree and scores every
      node (subcategory, category, function) plus a framework-wide
      `overall`, all as direct weighted averages of the items beneath that
      node (not an average-of-averages, so precision doesn't erode going
      up the tree)
- [x] Organisation-wide scoring — `combineScores` weight-averages
      already-computed `MaturityScore`s (e.g. per-assessment) into one,
      for whenever an organisation has more than one active assessment
- [x] Weighted scoring — every `ScoredItem` carries its own `weight`;
      both `scoreItems` and `combineScores` use it directly rather than
      treating all inputs as equal
- [x] Gap analysis — `analyzeGaps` flattens a scored tree into a
      prioritised, sorted list (largest gap first), optionally filtered to
      one tree depth or above a minimum gap; nodes with no applicable
      items or already at/past target are dropped rather than shown as a
      "0 gap"
- [x] Trend — `computeTrend` compares the two most recent scored points
      (e.g. from `AssessmentHistory` versions) and reports direction +
      change, skipping points with no recorded score
- [x] Unit tests (`levels.spec.ts`, `aggregate.spec.ts`,
      `framework-score.spec.ts`, `gaps.spec.ts`, `trend.spec.ts` — 26
      tests)
- [x] Wired into `AssessmentsService`: `GET /assessments/:id/results`
      (overall + per-function/category/subcategory scores) and
      `GET /assessments/:id/gaps` (prioritised gap list, `depth`/`limit`/
      `minGap` query params), per master prompt §32's API design.
      `POST /assessments/:id/submit` now computes the overall score at
      submit time and persists it onto `Assessment.currentMaturity`/
      `targetMaturity`/`maturityGap` (and into the `AssessmentHistory`
      snapshot) — closing the gap Phase 6 deliberately left open ("those
      numbers are Phase 7's job")
- [x] Unit tests for the new service methods (tenant-scoped, missing-
      template rejection, correct overall/per-function scores, gap list)
      plus updated `submit()` tests covering the persisted-score and
      nothing-applicable-so-null-scores cases (21 tests total in
      `assessments.service.spec.ts`, up from 17)
- [x] Verified end-to-end against the live PostgreSQL instance: `results`
      on the seeded 106-item assessment reproduced the master prompt's own
      example per-function numbers (Govern ~2.2, Identify ~3.1, Protect
      ~2.8, Detect ~2.4, Respond ~2.1, Recover ~1.9) to within the
      precision lost by discretizing to `MaturityLevel` enum steps;
      `gaps?depth=0` and `?depth=2` both returned correctly prioritised
      lists; created a fresh 2-item assessment, submitted it, and
      confirmed `currentMaturity`/`targetMaturity`/`maturityGap` were
      computed exactly right (3 / 4.5 / 1.5) and carried into history

### Phase 8: Excel Import Engine
- [x] `@cmmp/import-engine` package: parses `.xlsx`/`.xls` (via `exceljs`)
      and `.csv` (via `papaparse`) into a common `RawSheet` shape
- [x] Column mapping — `autoMapColumns` matches a file's actual headers to
      the master prompt §14 canonical columns (`Control_ID`,
      `Current_Maturity`, etc.) by exact name or known alias,
      case/spacing-insensitive; verified the prompt's own example
      ("Current Score" auto-maps to `Current_Maturity`). A manual
      `columnMapping` override is supported by the library
      (`ImportOptions.columnMapping`) but not yet exposed as a request
      parameter on `POST /assessments/:id/import` — see Next Steps.
      **Not built**: the multi-step import *wizard UI* (upload → select
      worksheet → map columns → validate → preview → import) is Next.js
      frontend work, out of this backend-only phase's scope, same as every
      other phase's UI has been deferred so far.
- [x] Data validation — every cell is parsed and typed (`Current_Maturity`/
      `Target_Maturity` accept either a level name or a 0-5 number via
      `@cmmp/scoring-engine`'s `scoreToMaturityLevel`; `Risk`/`Status`
      accept common synonyms like "In Progress"; `Business_Criticality`
      must be an integer 1-5; an unparseable `Due_Date` is a warning, not
      a hard failure). Every issue is collected, not just the first.
- [x] Formula injection prevention (master prompt §40) — any cell starting
      with `=`, `+`, `-`, `@`, or a tab/CR/LF (and not a plain number) is
      neutralised with a leading `'` before it's ever stored, so it can't
      execute when reopened in a spreadsheet or re-exported to CSV. A
      formula *cell* read from an uploaded `.xlsx` is taken from its
      computed `.result`, never its `.formula` text.
- [x] File-level defenses — extension allowlist (`.xlsx`/`.xls`/`.csv`),
      path-traversal-in-filename rejection, a 10MB size cap, and a
      `MAX_ROWS` cutoff during parsing. Zip-bomb defense is honestly
      limited to the size cap — `exceljs` doesn't expose a cheap
      inspect-before-decompress API — noted as a known limitation rather
      than silently assumed solved.
- [x] Error reporting — every row is classified `valid`/`warning`/
      `invalid`/`duplicate` (duplicate = a repeated `Control_ID`; an
      already-`invalid` row that also happens to be a duplicate stays
      `invalid`, not masked as merely a duplicate). `buildErrorReportCsv`
      produces a downloadable CSV of every non-clean row and why, per
      master prompt §14's "never silently discard bad data."
- [x] Bulk import with transaction support — wired into
      `AssessmentsService.importFile` (`POST /assessments/:id/import`,
      multipart upload via `FileInterceptor` + in-memory `multer`
      storage): resolves each importable row's `Control_ID` to a real
      `AssessmentQuestion` in the assessment's own framework, writes every
      matched row in one `$transaction`, and recomputes
      `completionPercentage`/DRAFT→IN_PROGRESS the same way
      `upsertItem` does (factored into a shared `recomputeCompletion`
      helper). `valid` **and** `warning` rows are both imported — a
      warning means "flagged, already handled" (e.g. a sanitised formula
      cell), not "blocked"; only `invalid`/`duplicate` rows are held back.
      A `Control_ID` that doesn't match any subcategory in this
      assessment's framework is reported as invalid rather than imported
      silently into the wrong place.
- [x] Unit tests: 51 in `@cmmp/import-engine` (sanitisation, column
      mapping, file guards, row validation, duplicate detection, a real
      in-memory `.xlsx` round-trip via `exceljs` including the
      formula-cell-uses-`.result` case, and full-pipeline integration
      tests) plus 27 in `assessments.service.spec.ts` (up from 21) for
      `importFile`'s DB-matching and transaction behaviour, including a
      regression test for the valid-vs-warning double-counting bug found
      and fixed during manual verification (see below)
- [x] Verified end-to-end against the live PostgreSQL instance: uploaded a
      CSV mixing a clean row, a formula-injection row, a duplicate, an
      unmatched `Control_ID`, and a missing `Control_ID`, using the master
      prompt's own "Current Score" alias — confirmed the response counts,
      the downloadable error report content, and that the DB stores the
      *neutralised* comment text (`'=cmd|'/c calc'!A1`), never the raw
      formula. Also verified a real `.xlsx` upload and a rejected `.exe`
      upload (400). Manual testing caught a real bug — warning rows
      weren't being imported at all, only clean `valid` ones — fixed
      before commit and locked in with new tests.

### Phase 9: Dashboard APIs
- [x] `DashboardModule` (`apps/api/src/dashboard`) — six organisation-scoped
      GET endpoints, all thin wrappers over `@cmmp/scoring-engine` and the
      existing `AssessmentsService.getResults` rather than new scoring
      logic (per master prompt §33, scoring stays in one place). Every
      endpoint requires `organisationId`; `assessmentId` is optional and
      defaults to the organisation's most recently *submitted* assessment
      (falling back to the most recently updated one of any status if none
      is submitted yet).
- [x] Maturity overview endpoint (`GET /dashboard/maturity`) — shaped to
      match `@cmmp/shared`'s pre-existing `MaturityOverview` interface
      from Phase 1's scaffolding (overallMaturity, targetMaturity,
      maturityGap, completionPercentage, criticalGaps, highRiskFindings,
      openRemediationActions) instead of inventing a new response shape
- [x] Function maturity endpoint (`GET /dashboard/functions`) — matches
      `@cmmp/shared`'s `FunctionMaturity` interface. `completionPercentage`
      is computed per function from real question totals (not just
      answered-item counts), `highRiskGaps` counts CRITICAL/HIGH items
      per function. `trend` is only computed when the caller passes an
      explicit `compareToAssessmentId` — which earlier assessment counts
      as "the" comparison point is a judgement call left to the caller
      rather than auto-detected.
- [x] Gap analysis endpoint (`GET /dashboard/gaps`) — matches
      `@cmmp/shared`'s `GapAnalysis` interface: function-level gaps sorted
      descending, each with the worst `riskLevel` among that function's
      items and an `affectedControls` count
- [x] Risk summary endpoint (`GET /dashboard/risks`) — open-risk counts by
      `riskLevel` plus the top N by inherent risk score
- [x] Roadmap status endpoint (`GET /dashboard/roadmap`) — remediation
      initiatives grouped into the master prompt §21 timeline buckets
      (Immediate 0-3mo / Short Term 3-6mo / Medium Term 6-12mo / Strategic
      12-36mo / Unscheduled) plus a status breakdown and an overdue count
- [x] Executive dashboard endpoint (`GET /dashboard/executive`, master
      prompt §23) — composes the above into one response: enterprise/
      target maturity, top 5 risks, top 5 maturity gaps, roadmap status,
      overdue high-risk actions, and a real `maturityTrend` built from
      every `AssessmentHistory` snapshot across the organisation's
      assessments. **Deliberately omitted**: "Top Improving/Deteriorating
      Capabilities" — `SecurityCapability` only stores a current snapshot,
      not a time series, so there's no honest way to compute a trend for
      it without a schema change; rather than fake one from a single
      point-in-time gap, it's left out and noted here.
- [x] Unit tests (`dashboard.service.spec.ts` — 10 tests): tenant/org
      isolation via `resolveAssessment`, the submitted-vs-fallback
      assessment selection, per-function completion math, gap sorting and
      risk-level/affected-control aggregation, risk-level counting,
      timeline bucketing (including an overdue item correctly landing in
      *both* "overdue" and "immediate"), and the executive composition
- [x] Verified end-to-end against the live PostgreSQL instance and the
      real 106-item seeded assessment: `functions` showed 100% completion
      and correct `affectedControls` counts per function matching the
      known NIST CSF 2.0 category counts (31/21/22/11/13/8); `gaps` sorted
      correctly by severity; `roadmap` bucketed the seed's 6 initiatives
      correctly (2 immediate/3 short/1 medium); `executive` composed
      everything including real cross-assessment trend history; a request
      missing `organisationId` correctly 400s

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
- `exceljs@4.4.0` ships its own minimal ambient `Buffer` shim instead of
  depending on `@types/node`, which no longer structurally matches modern
  `@types/node`'s generic `Buffer extends Uint8Array<T>` shape. Worked
  around with a narrow, commented `as never` cast at the one call site
  (`packages/import-engine/src/parse-xlsx.ts`) rather than a project-wide
  `typeRoots` change — a real Node `Buffer` satisfies both shapes at
  runtime, this is purely a type-declaration mismatch.

## Not Started ⭕

### Phase 10: Dashboard UI
- [ ] Landing/home dashboard
- [ ] KPI cards (Maturity, Gap, Completion, etc.)
- [ ] Radar chart (6 functions)
- [ ] Maturity gap bar chart
- [ ] Function detail cards
- [ ] Security maturity heatmap
- [ ] Top 10 gaps table
- [ ] Maturity distribution

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

From `npm audit` (2026-08-31, after removing the unused `xlsx` dependency
and running non-breaking `npm audit fix`): 29 findings remain (9 high, 15
moderate, 5 low), all requiring a major-version bump to resolve. Classified
per the finding-remediation scheme in the master prompt (section 73):

- **Dependency Issue — Next.js 14.0.2** (high): several CVEs (SSRF via
  rewrites, Server Action/RSC DoS, cache poisoning). User-facing surface
  (`apps/web`), so this is the one worth prioritizing. Fix requires
  upgrading to Next 16.x, which is a real breaking change (App Router/config
  surface) — not attempted blind; needs its own scoped PR with the app
  actually exercised in a browser afterward, per this repo's own UI-testing
  expectations.
- **Dependency Issue — `@nestjs/cli`/`turbo`/`@angular-devkit/*` toolchain**
  (mixed moderate/high: ajv, glob, picomatch, webpack, tmp, inquirer): all
  devDependencies used only for local builds/codegen, not shipped or
  reachable by an end user. Lower real-world risk than the Next.js findings.
  Fix requires `@nestjs/cli@12` (breaking relative to the `@nestjs/core@10`
  runtime this repo pins) and `turbo@2.10`.
- **Dependency Issue — `exceljs`** (moderate, via nested `uuid`; GHSA-w5hq-
  g745-h8pq, "missing buffer bounds check in v3/v5/v6 when `buf` is
  provided"): `npm audit fix --force` still only offers to *downgrade* to
  `exceljs@3.4.0`, which would be a backwards step, not a fix. **Status
  change as of Phase 8**: `@cmmp/import-engine` now genuinely parses
  untrusted user-uploaded files with `exceljs` (`POST
  /assessments/:id/import`), so this is no longer a dormant, unreached
  dependency — it's live, security-relevant surface. Our own code never
  calls the vulnerable `uuid` API (passing a pre-allocated `buf`); whether
  `exceljs` does so internally when parsing an .xlsx hasn't been fully
  audited here. Mitigated in the meantime by defense already in this
  phase's file-guard (extension allowlist, 10MB size cap, `MAX_ROWS`
  during parse) rather than by the dependency fix — worth a closer look
  (or an `exceljs` major-version upgrade) before this ships with
  untrusted uploads enabled in production.
- **Resolved**: removed the `xlsx` (SheetJS) dependency from
  `packages/reporting` — it had an advisory with no available fix and
  nothing in the codebase imports it (`exceljs` already covers this need).

None of these are wired as a required branch-protection check yet (see CI
notes below) — `npm audit --audit-level=high` runs on every PR/push via
`.github/workflows/security.yml` and will show red until the Next.js/NestJS
CLI upgrades happen, but doesn't block merges in the meantime.

## CI / DevSecOps Pipeline

- `.github/workflows/ci.yml` — Lint, Type Check, Test, Build as separate
  jobs. All four verified green locally (`turbo run lint/type-check/test/
  build` across all 10 workspaces) before being wired into Actions.
- `.github/workflows/security.yml` — CodeQL (SAST), Gitleaks (secrets),
  `npm audit`, `dependency-review-action` (PRs only), weekly CycloneDX SBOM.
- `.github/workflows/dast.yml` — OWASP ZAP baseline scan. Schedule +
  manual-dispatch only for now, **not** on PR/push: the API has no
  `/health` endpoint yet and no migration has been generated, so a
  docker-compose-in-CI target isn't reliable yet. Revisit once Phase 4+
  lands a health endpoint.
- `.github/workflows/container-security.yml` — Trivy scan of both
  Dockerfiles, SARIF uploaded to GitHub code scanning. `exit-code: 0`
  (report-only) until a real run has been observed from this environment
  (no Docker available in the sandbox that did this work).
- `.github/dependabot.yml` — npm (workspace-aware), github-actions, docker.
- `.github/CODEOWNERS` — points at the actual repo owner; the original
  Phase 1 version referenced teams (`@developers`, `@security-team`, etc.)
  that don't exist on a personal GitHub account and were silent no-ops.

**Required branch-protection status checks**: only the four `ci.yml` jobs
(Lint, Type Check, Test, Build) — the only ones verifiable from this
sandbox before being pushed. CodeQL/Gitleaks/audit/DAST/Trivy run and
report for real visibility but aren't blocking yet; promote them once
they've been observed passing on an actual PR.

## Next Steps

1. **Begin Phase 10**: Dashboard UI — the Next.js frontend work every prior
   phase has deferred; `/dashboard/*` now has real endpoints to build the
   KPI cards, radar chart, gap table, and roadmap Gantt view against
   (master prompt §21-23/§38)
2. **Multi-assessment rollup**: every `/dashboard/*` endpoint currently
   scopes to *one* assessment (the org's latest submitted one, or an
   explicit `assessmentId`) — a real "organisation-wide" score across
   several concurrently-active assessments (different frameworks, business
   units) would need `@cmmp/scoring-engine`'s `combineScores`, which
   exists but isn't wired into the dashboard yet. Revisit if/when an org
   genuinely has more than one active assessment at a time.
3. Wire `POST /assessments/:id/import`'s `columnMapping` override — the
   library (`ImportOptions.columnMapping`) already supports it, but the
   endpoint only auto-maps columns today; needs a way to accept a manual
   mapping as a form field or a preceding "preview" call, matching the
   import wizard's step 3 in master prompt §14.
4. Look more closely at the `exceljs` → `uuid` advisory now that
   `import-engine` genuinely parses untrusted uploads (see Known Issues) —
   confirm whether `exceljs`'s internal `uuid` usage ever hits the
   vulnerable buffer-bounds code path, or upgrade past it.
5. Before relying on the seeded NIST CSF 2.0 data for anything
   compliance-facing, diff `packages/database/prisma/fixtures/nist-csf-2.0.json`
   against the official NIST CSWP 29 publication — it was reproduced from
   training-data knowledge, not transcribed from the source document (see
   Phase 5 notes above)
6. Wire the Next.js frontend to the new `/api/v1/auth/login`,
   `/api/v1/users`, `/api/v1/frameworks`, `/api/v1/assessments` (including
   `/results`, `/gaps`, `/import`), and `/api/v1/dashboard/*` endpoints
   (login page, session/token storage, a framework navigation view, an
   assessment-taking flow, the Excel import wizard, and now the actual
   dashboard views this phase's endpoints feed)
7. Fix the repo-wide ESLint plugin gap (see Known Issues)

## Contact & Questions

- See CONTRIBUTING.md for contribution guidelines
- See SECURITY.md for security reporting
- Check docs/ for detailed documentation
