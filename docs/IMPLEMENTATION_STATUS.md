# CMMP Implementation Status

Last Updated: 2026-09-04 (Phase 17 + post-Phase-17 hardening)

## Overall Progress

**Phase**: 17 / 17 — all 17 phases from the master prompt have a
Completed section below, plus a "Post-Phase-17 Hardening" section for
security-gap work done after the master prompt's own scope was covered.
**Completion**: ~95%. Not 100%: Phase 15's Docker images have still
never actually been built or run (see that phase's own caveat, restated
in `docs/DEPLOYMENT.md`), `apps/web` has zero automated tests, and a
handful of frontend flows (framework navigation, assessment-taking,
the import wizard's UI) were never built — all tracked below under
"Next Steps," none silently dropped. "All phases complete" describes
breadth of coverage, not "nothing left to do."

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

### Phase 10: Dashboard UI
- [x] Real authentication wired end to end — NextAuth's Credentials
      provider now calls the actual `POST /api/v1/auth/login` (previously
      four hardcoded demo users baked into the frontend, per Phase 3's
      "Next Steps" left open since then); the JWT `access_token`,
      `tenantId`, `organisationId`, `role`, and `roles` are carried through
      NextAuth's `jwt`/`session` callbacks so every server-rendered page
      has what it needs to call the API as that user
- [x] `apps/web/lib/api.ts` — a typed client for `/frameworks`,
      `/assessments/:id/results`, and every `/dashboard/*` endpoint from
      Phase 9, with response types mirrored from the API rather than
      re-derived
- [x] Landing/home dashboard (`pages/index.tsx`, `pages/dashboard.tsx`) —
      unauthenticated visitors see a landing page; authenticated ones are
      redirected straight to `/dashboard` (and vice versa: `/dashboard`
      redirects an unauthenticated visitor to sign-in), both via
      `getServerSideProps` session checks, not client-side flicker
- [x] Sign-in page (`pages/auth/signin.tsx`) — didn't exist before despite
      `NextAuthOptions.pages.signIn` already pointing at it; clicking
      "Sign In" previously 404'd
- [x] KPI cards (Maturity, Target, Gap, Completion, Critical Gaps,
      High-Risk Findings, Open Remediation Actions) — `GET
      /dashboard/maturity`
- [x] Radar chart, 6 functions, current vs target — `GET
      /dashboard/functions`, recharts `RadarChart`
- [x] Maturity gap bar chart — same endpoint, sorted descending, bars
      colored by the function's current-maturity status band
- [x] Function detail cards — current/target/gap, completion %,
      high-risk-gap count, and a status badge per function
- [x] Security maturity heatmap — one row per function, one cell per
      category, from `GET /assessments/:id/results`'s full tree (the
      dashboard endpoints only go down to function level; the heatmap
      needed category-level data, which only the per-assessment results
      endpoint has)
- [x] Top 10 gaps table — `GET /dashboard/gaps`, with risk-level badges
- [x] Maturity distribution — count of subcategories at each maturity
      level (Initial..Optimised), computed client-side from the same
      results tree the heatmap uses
- [x] Color: loaded the `dataviz` skill before writing any chart code.
      Maturity score -> a fixed 4-band status scale (critical/serious/
      warning/good, the skill's validated dark-mode status hexes) rather
      than a continuous rainbow gradient; current-vs-target uses the
      skill's categorical slots 1/2 (blue/orange) with a legend; every
      colored value is also printed as a number or label, never color
      alone (`apps/web/lib/maturity-scale.ts`)
- [x] **Not built** (out of this backend-adjacent phase's practical
      scope, same "defer the UI polish" pattern every prior phase has
      followed): a `@cmmp/ui` shared component library (dashboard
      components live directly in `apps/web` for now), an organisation
      picker (single-org assumed via the session, matching the seed
      data), and the manual `columnMapping` override step of the Excel
      import wizard (Phase 8's own noted gap)
- [x] Verified in an actual browser via Playwright end to end, not just
      `tsc`/`next build`: signed in as a real seeded user, landed on
      `/dashboard`, confirmed every chart/card/table rendered with real
      numbers matching Phase 9's own manual verification (106 scored
      subcategories, correct per-function gaps and colors); confirmed an
      unauthenticated visit to `/dashboard` redirects to sign-in, a wrong
      password shows an inline error and stays on the sign-in page, and
      sign-out actually invalidates the session (a follow-up visit to
      `/dashboard` redirects again rather than serving a cached page)

### Phase 11: Risk Register
- [x] Risk model — already existed from Phase 2; this phase is the first
      thing besides the seed script that can create/update/delete `Risk`
      rows
- [x] Risk creation API (`RisksModule`, `apps/api/src/risks`) —
      `POST /risks` validates the organisation (and, if given, the linked
      `assessmentItemId`) belong to the caller's tenant the same way
      `AssessmentsService` does; `inherentRiskScore` and `riskLevel` are
      always computed server-side from `likelihood × impact` (never
      trusted from the client) via a 5×5 matrix banded into `RiskLevel`
- [x] Risk detail page (API side — `GET /risks/:id`) — includes the linked
      `assessmentItem` (with its question and subcategory) plus
      `initiatives`/`recommendations`, so the drill-down chain from master
      prompt §24 (Risk → Remediation Initiative, Risk → Assessment
      Question/Subcategory) is answerable from one call
- [x] Risk-control mapping — a risk optionally links to the
      `AssessmentItem` it originated from (already a schema relation);
      creation/validation enforces that link stays within the same
      tenant/organisation
- [x] Risk prioritisation — `GET /risks?sort=priority` orders by
      `inherentRiskScore` descending. Per master prompt §20 ("do not
      permanently hard-code this formula"), the likelihood×impact→band
      mapping lives in one clearly-named function
      (`riskLevelFromScore`) rather than scattered inline, so swapping in
      a configurable formula later doesn't mean hunting through the
      service — but it's still a fixed function today, not yet
      admin-configurable (that's real future work, not done here)
- [x] Risk remediation tracking — read-side for now: `GET /risks/:id`
      surfaces linked `initiatives`. A write-side "link this risk to that
      initiative" endpoint is deliberately deferred to Phase 12, once
      `RemediationInitiative` has its own creation API — linking makes
      more sense as part of creating/editing an initiative (picking which
      risks it addresses) than as a separate endpoint on `Risk` today
- [x] `PATCH /risks/:id` recomputes `inherentRiskScore`/`riskLevel` only
      when `likelihood`/`impact` actually changes (verified: a status-only
      update leaves the score untouched); `residualRiskScore` stays an
      explicit, user-set field (post-control effectiveness isn't something
      a formula should guess) rather than auto-derived
- [x] Role-gated writes — `RISK_WRITE_ROLES` (PLATFORM_ADMIN,
      ORGANISATION_ADMIN, CISO, GRC_MANAGER, SECURITY_ARCHITECT) for
      create/update, PLATFORM_ADMIN/ORGANISATION_ADMIN only for delete;
      any authenticated role can read
- [x] Unit tests (`risks.service.spec.ts` — 15 tests): tenant/org
      isolation on create and read, the assessment-item cross-tenant
      rejection, every likelihood×impact band via a parametrised test,
      priority sorting, invalid-riskLevel-filter rejection, the
      score-recompute-only-when-changed behaviour, and soft-delete
- [x] Verified end-to-end against the live PostgreSQL instance: created a
      risk linked to a real assessment item (confirmed the full drill-down
      response), confirmed a bogus `assessmentItemId` 404s, updated
      `impact` and watched `inherentRiskScore`/`riskLevel` recompute
      (20/CRITICAL → 12/HIGH) while `residualRiskScore` was set
      independently, confirmed `sort=priority` and `riskLevel` filtering,
      confirmed an invalid `riskLevel` 400s, confirmed a non-privileged
      role (ASSESSOR) gets 403 on create and CISO gets 403 on delete
      (write roles and delete roles are deliberately different sets), and
      confirmed the deleted risk 404s afterward

### Phase 12: Remediation Roadmap
- [x] `RemediationInitiative` model — already existed from Phase 2; this
      phase is the first thing besides the seed script that can create/
      read/update/delete rows through a real API
      (`RemediationInitiativesModule`, `apps/api/src/remediation-initiatives`)
- [x] Initiative CRUD — `POST/GET/PATCH/DELETE /remediation-initiatives`,
      following the same shape as `RisksService`: the target organisation
      is validated against the caller's tenant up front, `riskIds` (if
      given) are validated as belonging to that same org before linking,
      and delete is a soft-delete (`deletedAt`)
- [x] Risk↔initiative linking — the write-side endpoint deferred from
      Phase 11 (`POST/DELETE /remediation-initiatives/:id/risks/:riskId`),
      validating the risk belongs to the initiative's organisation before
      connecting/disconnecting the Prisma relation
- [x] Prioritisation algorithm — master prompt §20's
      "Priority Score = Risk × Gap × Business Criticality × Weight, do
      not permanently hard-code this formula" is `computePriority()`, one
      exported, independently unit-tested function (raw score banded into
      1–5), following the same isolate-the-formula pattern as Phase 11's
      `riskLevelFromScore`. `GET /remediation-initiatives?sort=priority`
      orders by it
- [x] Auto-generation from gaps — `POST /remediation-initiatives/generate`
      calls `AssessmentsService.getGaps()` (Phase 7) at subcategory depth,
      creates one `PLANNED` initiative per open gap with priority computed
      from the *real* backing `AssessmentItem`'s stored `riskLevel`,
      `businessCriticality`, and `weight` (never left at a placeholder
      default), and skips any subcategory that already has a non-terminal
      initiative tracking it — `securityCapability` doubles as that dedup
      key since the schema has no dedicated gap FK on the model. Defaults
      to the organisation's latest `SUBMITTED` assessment when no
      `assessmentId` is given, matching the dashboard's own resolution
      rule
- [x] Status tracking — `status` is a free-form field validated against a
      fixed set (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `BLOCKED`,
      `ON_HOLD`) at the DTO layer; setting `status: COMPLETED` without an
      explicit `actualCompletionDate` stamps "now" server-side, but an
      explicit date always takes precedence
- [x] Role-gated writes — reuses the same role set as Risk Register
      (PLATFORM_ADMIN, ORGANISATION_ADMIN, CISO, GRC_MANAGER,
      SECURITY_ARCHITECT) for create/update/link/unlink/generate,
      PLATFORM_ADMIN/ORGANISATION_ADMIN only for delete; any authenticated
      role can read
- [x] Unit tests (`remediation-initiatives.service.spec.ts` — 23 tests):
      `computePriority`'s banding thresholds via a parametrised test,
      tenant/org isolation and riskIds cross-org rejection on create,
      priority sorting, the COMPLETED auto-date-stamp behaviour (and that
      an explicit date wins, and that a non-terminal status leaves it
      alone), soft-delete, link/unlink risk (including the cross-org
      404), and `generateFromGaps`'s no-submitted-assessment 404,
      existing-non-terminal-initiative skip, real-assessment-item priority
      computation, and the no-backing-item default-values fallback
- [x] Timeline views (3/6/12 month) and a roadmap UI page are **not**
      built — Phase 12 here is API-only, matching the backend-first
      discipline of Phases 4–9 (Phase 10 was the one dedicated frontend
      phase so far). `startDate`/`targetCompletionDate`/
      `actualCompletionDate` are all real persisted fields, so a timeline
      view is a pure frontend read against existing data whenever that
      phase is picked up — noted honestly rather than silently dropped
- [x] Verified end-to-end against the live PostgreSQL instance (freshly
      reseeded): created an initiative, linked and unlinked a real risk,
      confirmed linking a foreign/nonexistent risk 404s, set `status` to
      `COMPLETED` and confirmed `actualCompletionDate` auto-stamped,
      confirmed VIEWER gets 403 on create and delete while CISO (a write
      role but not a delete role) also gets 403 on delete, confirmed
      PLATFORM_ADMIN's delete soft-deletes (subsequent `GET` 404s), and
      ran `POST /remediation-initiatives/generate` twice against the
      seeded assessment — the first run created 3 new `PLANNED`
      initiatives (one per top open gap, real computed priorities), the
      second run created 0 (correctly deduped against the initiatives
      the first run had just created)

### Phase 13: Audit Logging
- [x] Audit event model — `AuditEvent`/`AuditAction` already existed in
      the schema from Phase 2 (tenant-scoped, `userId`, `action`,
      `resource`/`resourceId`, `previousValue`/`newValue` as JSON
      strings, `ipAddress`/`userAgent`/`correlationId`); this phase is the
      first thing that actually writes and reads rows through the API
- [x] Logging interceptor — rather than threading an `AuditService.record()`
      call into every existing service (Assessments, Risks,
      RemediationInitiatives, Users, Auth), audit capture is one global
      `AuditInterceptor` (`APP_INTERCEPTOR`, registered once in the new
      `AuditModule`) plus a `@AuditLog(action, resource)` decorator on the
      controller methods worth recording — adding auditing to a future
      endpoint is one decorator, not a new service dependency. Captures
      actor (from `request.user`, or from the response body's `user.id`/
      `user.tenantId` for the one pre-auth case, login), resource id
      (from the response body's `.id`, falling back to the route's `:id`
      param), the sanitized request body as `newValue`, IP, user-agent,
      and a correlation id (reused from an `X-Correlation-Id` request
      header if present, else generated)
- [x] Credential redaction — `sanitizeForAudit()` deep-clones any recorded
      body and replaces `password`/`token`/`secret`/-shaped keys with
      `[REDACTED]` before it's ever written, so `POST /auth/login` and
      `POST /users` (both of which carry a plaintext password in the
      request body) never leak it into the audit trail; verified live
      that a real login/user-create audit row shows `[REDACTED]`, not the
      submitted password
- [x] Immutable audit trail — `AuditService` exposes `record`/`findAll`/
      `findOne` and deliberately no `update`/`delete`; there is no
      PATCH/DELETE route on `AuditController` at all. `record()` never
      throws — a logging failure is caught and logged via `Logger.error`
      rather than breaking the request it's describing (own trade-off:
      an audit write can silently fail rather than being guaranteed;
      acceptable for this stage, a real compliance requirement might want
      a dead-letter queue instead)
- [x] Audit log API — `GET /audit-events` (tenant-scoped, filterable by
      `userId`/`action`/`resource`/`resourceId`/`from`/`to`, paginated via
      `limit`/`offset`) and `GET /audit-events/:id`, both including the
      acting user's `id`/`name`/`email`. Read-gated to PLATFORM_ADMIN,
      ORGANISATION_ADMIN, CISO, AUDITOR, GRC_MANAGER
- [x] Instrumented every existing mutating endpoint: `POST/PATCH/DELETE
      /risks`, `/remediation-initiatives` (including `/generate` and the
      risk-link/unlink endpoints), `/assessments` (including `/items`,
      `/submit`, `/import`), `/users` (including role assign/remove), and
      `POST /auth/login` + `/auth/logout`
- [x] Audit dashboard is **not** built — Phase 13 here is API-only, same
      backend-first scoping as Phase 12; a dashboard view is a pure
      frontend read against `GET /audit-events` whenever picked up
- [x] Unit tests: `sanitize.spec.ts` (redaction, nested objects/arrays,
      the empty-body → `undefined` case), `audit.service.spec.ts`
      (record swallows a write failure rather than throwing, tenant
      scoping and filters, the `from`/`to` date-range filter, 404 on
      cross-tenant read), `audit.interceptor.spec.ts` (no-op when a
      handler has no `@AuditLog` metadata, records using the
      authenticated user + route param id, falls back to the response
      body's `user` for login and confirms the password is redacted in
      `newValue`, and skips recording entirely when no actor can be
      identified) — 15 tests total
- [x] Verified end-to-end against the live PostgreSQL instance: logged in
      and created a risk, confirmed both a `LOGIN` and a `CREATE Risk`
      row appeared with the password redacted; filtered by `action` and
      `resource`; fetched a single event and confirmed the joined
      `user` summary; created a `RemediationInitiative` and a `User`
      (via PLATFORM_ADMIN) and confirmed both showed up correctly
      attributed with redacted/sanitized `newValue`; confirmed
      `POST /audit-events` 404s (no write route exists)
- [x] **Bug found and fixed during this same live verification**: the
      first version of `AuditController` applied `@Roles(...AUDIT_READ_ROLES)`
      at the *class* level. `RolesGuard.canActivate()` (from Phase 3)
      reads role metadata via `this.reflector.get(ROLES_KEY,
      context.getHandler())` — handler-level only, it never checks the
      controller class — so the class-level decorator was silently a
      no-op and every authenticated role, not just the five intended
      ones, could read the audit log. Confirmed the bug live (ASSESSOR
      got 200), moved `@Roles()` onto each individual route handler
      (matching how every other controller in the codebase already does
      it — this was the one controller written differently), and
      reconfirmed ASSESSOR/READ_ONLY_VIEWER get 403 while CISO/
      PLATFORM_ADMIN get 200. Worth a repo-wide grep before trusting any
      *new* controller's role gating — `RolesGuard` has no safety net for
      a class-level `@Roles()`, it just silently does nothing

### Phase 14: Tests
- [x] Unit tests (Jest) — already extensive from every prior phase
      (service-level specs across `apps/api` plus every `packages/*`
      engine); this phase's own addition is a real `apps/api/test/`
      **e2e** suite, distinct from the unit specs living beside each
      service
- [x] API tests / Integration tests — `apps/api/test/*.e2e-spec.ts`
      (Jest + `supertest`, `test:e2e` script, `test/jest-e2e.json`) boots
      the *real* `AppModule` — real `PrismaService` against the live
      Postgres instance, the real `JwtModule`, the real global
      `AuditInterceptor` — behind `supertest`, so these exercise the
      actual HTTP/guard/interceptor stack rather than mocked services.
      `test/support/fixtures.ts` creates an isolated Tenant + Organisation
      + User (+ role assignment) directly via Prisma per test file
      (bypassing the API, which has no tenant-creation endpoint) and
      tears everything down afterward — verified live that a run leaves
      zero orphaned rows
- [x] Tenant isolation tests — `tenant-isolation.e2e-spec.ts`: two
      independent tenants, tenant A creates a Risk, and tenant B is
      confirmed unable to read it directly (404), list it even when
      explicitly querying tenant A's `organisationId` (empty array, not
      an error), update it (404), or delete it (404) — while tenant A
      itself can still read it
- [x] Authorization tests — `authorization.e2e-spec.ts`: a
      READ_ONLY_VIEWER is blocked (403) from creating a Risk and from
      reading the audit log, a PLATFORM_ADMIN/AUDITOR can read the audit
      log, and a CISO (write-role but not delete-role) can create but not
      delete a Risk. Includes an explicit regression test for the Phase
      13 class-vs-method `@Roles()` bug on `AuditController` — the exact
      kind of thing no unit test caught, only live HTTP testing did
- [x] Security tests — scoped narrowly here to what the above two suites
      already cover (authz boundaries, tenant isolation); no dedicated
      fuzzing/injection/SAST-style suite beyond that
- [x] 17 e2e tests total, all passing against a live Postgres instance;
      `npx turbo run type-check test build` is unaffected since `test:e2e`
      is a separate script from `test` (matching the standard Nest
      convention of keeping fast unit tests and slower, real-DB e2e tests
      on different commands)
- [ ] Component tests (React Testing Library) — **not** built; the
      frontend has zero automated tests. This session's own frontend
      verification (Phase 10) was manual Playwright screenshot checks,
      not a persisted, repeatable suite
- [ ] E2E tests (Playwright) — **not** built as an automated,
      checked-in suite. Playwright was used interactively during Phase
      10 to catch real rendering bugs (the radar chart's stray axis
      line), but nothing from those sessions was saved as a spec file
      that runs in CI or on demand — a real gap, honestly noted rather
      than claimed as done

### Phase 15: Docker
**Important caveat up front**: this session's sandbox has the `docker` CLI
but no reachable daemon (`docker info` fails with
`dial unix /var/run/docker.sock: connect: no such file or directory`, and
`service docker start` fails with `ulimit: error setting limit (Operation
not permitted)` — a sandbox restriction, not something fixable from here).
That means none of this was verified the way every other phase in this
session was (build the real thing, hit it with curl/Playwright, look at
the result) — **no image in this phase was actually built or run**. What
follows was validated as far as it's possible to without a daemon: real
`turbo prune` runs against this exact repo, a real Next.js production
build with `output: "standalone"` inspected file-by-file, and
`docker compose config` (a client-side parse/interpolation step that
doesn't need the daemon) confirming the compose file is syntactically
valid and resolves variables correctly. Whoever picks this up next should
run `docker compose build && docker compose up` for real before trusting
it in any deployment.

- [x] Docker image builds — `infrastructure/Dockerfile.api` and
      `infrastructure/Dockerfile.web`, both rewritten from scratch. The
      versions already in the repo (from Phase 1 scaffolding) were
      broken beyond just "unverified": they ran `pnpm install` against a
      `pnpm-lock.yaml` that doesn't exist anywhere in this npm-workspaces
      repo, and `Dockerfile.api` copied a `/app/dist` that no build
      script in this repo produces. Rewrote both using Turborepo's own
      documented `turbo prune <workspace> --docker` recipe — verified
      live (without a daemon, `turbo prune` is a plain CLI command) that
      `turbo prune @cmmp/api --docker` correctly resolves to exactly
      `@cmmp/database`, `@cmmp/framework-engine`, `@cmmp/import-engine`,
      `@cmmp/scoring-engine`, `@cmmp/shared` (not `packages/reporting`,
      `packages/security`, `packages/ui`, or `apps/web` — none of which
      `@cmmp/api` actually imports), and that `turbo prune @cmmp/web
      --docker` resolves to just `@cmmp/web` itself (it has no `@cmmp/*`
      dependencies despite declaring `@prisma/client` directly — an
      unused leftover dependency, noted but not removed, out of scope
      here). Each Dockerfile is prune → install once → build → copy into
      a slim `node:22-alpine` runtime stage running as a non-root user
- [x] Enabled `output: "standalone"` in `apps/web/next.config.js` — not
      set before this phase. Rebuilt the app for real (this part doesn't
      need Docker) and confirmed the exact output shape a Turborepo
      monorepo produces:
      `apps/web/.next/standalone/apps/web/server.js`, with static assets
      and `public/` deliberately *not* included (Next's own docs call
      this out — the Dockerfile copies `.next/static` and `public/`
      alongside the standalone bundle explicitly)
- [x] Found and fixed real bugs while writing these, each caught by
      tracing through actual repo state rather than assuming the old
      scaffolding was trustworthy:
  - `@cmmp/database`'s `build` script is only `tsc` — it does **not**
    run `prisma generate` (that's a separate script). Without an
    explicit `prisma generate` step in the image build, `@cmmp/database`
    fails to type-check its own `export * from '@prisma/client'`
    re-export, and even if that were skipped, `node_modules/.prisma`
    would be missing at runtime. Added the step explicitly.
  - Prisma's query engine on Alpine/musl dynamically links `libssl`,
    which recent Alpine images don't ship by default — the classic
    "Unable to require libquery_engine... libssl.so.3 not found" failure
    happens at *runtime*, not build time, so it's easy to ship a build
    that silently breaks on first request. Added `openssl` to both the
    stage that runs `prisma generate` and the final runtime stage.
  - `apps/web/public/` didn't exist anywhere in the repo, which would
    have failed the Dockerfile's `COPY .../public ./apps/web/public`
    outright (Docker's `COPY` hard-fails on a missing source). Created
    it (with a `.gitkeep`) — a real, if minor, pre-existing gap (every
    production Next.js app ends up wanting a `public/` dir for a
    favicon etc.) surfaced only by actually trying to write a correct
    Dockerfile for this app
  - The old `docker-compose.yml` never set `API_URL` for the `web`
    service (only `NEXT_PUBLIC_API_URL`). NextAuth's own server-side
    login call (`apps/web/pages/api/auth/[...nextauth].ts`) reads
    `API_URL`, defaulting to `http://localhost:3001` — which inside the
    `web` container's own network namespace does **not** reach the `api`
    container. Login would have failed 100% of the time under the old
    compose file. Fixed by explicitly setting `API_URL: http://api:3001`
    (the internal service name) while `NEXT_PUBLIC_API_URL` stays
    `http://localhost:3001` (that one runs in the *browser*, which
    reaches the host's published port, not the internal service name) —
    the split between the two is now called out with a comment so it
    doesn't get collapsed back into one variable later
  - The old compose file hardcoded `NEXTAUTH_SECRET:
    dev-secret-not-for-production` directly in version-controlled YAML.
    Replaced with `${NEXTAUTH_SECRET:?...}` / `${JWT_SECRET:?...}` —
    required, no fallback baked into the file — sourced from the
    root `.env` (which `docker compose` auto-loads since it sits next to
    `docker-compose.yml`), matching every other secret in this repo
  - `infrastructure/init-db.sql` (mounted into Postgres's
    `docker-entrypoint-initdb.d`) manually ran `CREATE TYPE
    maturity_level AS ENUM (...)` and similar for every enum already
    defined in `schema.prisma`. Since Postgres's `CREATE TYPE` has no
    `IF NOT EXISTS`, and Prisma's own migrations create these same types
    the first time `prisma migrate deploy` runs, this file would have
    made the *first* migration fail outright with "type already exists".
    Deleted it — Prisma migrations are the single source of truth for
    schema in this project, and this file only ever fought that
  - The old compose file included a `redis` service (with its own
    healthcheck) that nothing in `apps/api` or `apps/web` connects to —
    no `redis`/`ioredis` dependency, no `REDIS_URL` usage anywhere in
    application code. Removed it rather than keep a service that looks
    load-bearing but isn't; add it back for real once something actually
    needs caching
- [x] Health checks — added `GET /health` (deliberately unauthenticated,
      deliberately excluded from the `api/v1` prefix via
      `app.setGlobalPrefix('api/v1', { exclude: ['health'] })` in
      `main.ts` so it stays reachable at a stable path regardless of API
      versioning), checking real DB connectivity via `SELECT 1` through
      `PrismaService`. Verified live (no Docker needed for this part):
      `GET /health` → 200 `{"status":"ok","database":"up"}`, and
      `GET /api/v1/health` → 404 (confirming the prefix exclusion
      actually took effect, not just that the route responds somewhere).
      Both Dockerfiles' `HEALTHCHECK` instructions call this endpoint
      (API) or `/` (web, which has no dedicated health route), and
      `docker-compose.yml`'s `depends_on: condition: service_healthy`
      chains on these
- [x] Volume management — a single named volume (`pgdata`) for Postgres
      data, matching the pattern already used elsewhere in this repo
- [x] Network configuration — one bridge network (`cmmp-network`); `api`
      and `web` are reachable from the host via published ports
      (3001/3000) while Postgres is only reachable at its internal
      service name (`postgres`) from the other two containers plus a
      published `5432` for local tooling (`psql`, Prisma Studio) —
      matches how this session itself has been working against the
      local Postgres instance all along
- [x] Container security — both runtime stages run as a created non-root
      user (`nestjs`/`nextjs`, uid 1001), multi-stage builds keep build
      tooling (the `turbo` CLI, the full pruner-stage source tree) out of
      the final image, `.dockerignore` (new, didn't exist before) keeps
      `node_modules`, `.git`, `.env*` (except `.env.example`) and build
      artifacts out of the build context so a stray local `.env` can
      never end up baked into an image layer. **Not** done: an actual
      image vulnerability scan (Trivy/Grype/Docker Scout) — needs a
      built image to scan, which needs the daemon this session doesn't
      have; that belongs in Phase 16's CI pipeline where a real runner
      will have one
- [x] Fixed the root `package.json`'s `docker:build`/`docker:up`/
      `docker:down` scripts — they invoked the standalone `docker-compose`
      binary, which isn't installed in this environment (only the
      `docker compose` v2 plugin is); switched to `docker compose`

### Phase 16: CI/CD Security Pipeline
**Different from every other phase in this session**: the bulk of this
was already done — well, not by me, and not in this session. The repo
owner merged PR #1 ("Wire up CI, security scanning, Dependabot, and
CODEOWNERS") directly to `main` on 2026-09-02, two days before this
phase started, and this branch had already inherited it (confirmed via
`git merge-base HEAD origin/main` landing exactly on that commit, and
`git branch --contains` showing it only on this branch's ancestry). It
is genuinely solid work — commit messages reference specific real CI
failures it was adjusted for ("Code scanning is not enabled for this
repository", "Dependency review is not supported on this repository" —
both GitHub Advanced Security limitations on a private repo without the
paid add-on, worked around by archiving SARIF as artifacts instead of
uploading to the Security tab). So Phase 16 here is verification and
closing the gaps *this session's own Phases 12-15 opened*, not building
a pipeline from nothing.
- [x] GitHub Actions CI workflow (`.github/workflows/ci.yml`) — already
      existed: separate `lint`/`type-check`/`test`/`build` jobs. Re-ran
      `npm run lint` for real during this phase and it caught a genuine
      leftover bug from Phase 13: `audit.interceptor.spec.ts` imported
      `AUDIT_LOG_KEY` and never used it (an unused-import ESLint error
      that would have failed CI's `lint` job on this branch). Fixed
- [x] Added the one real gap: an `e2e` job with a `postgres:16-alpine`
      service container running Phase 14's `apps/api/test/*.e2e-spec.ts`
      suite via `npx prisma migrate deploy` + `npm run test:e2e` — the
      existing `test` job only ever ran the fast, mocked unit-test
      pipeline task (`turbo run test`), which never touched the e2e
      suite since `test:e2e` wasn't a registered turbo task before this.
      Added `test:e2e` to `turbo.json`'s pipeline (`dependsOn: ["^build"]`,
      `cache: false` — it hits a live, mutable DB) and scoped the new
      root `npm run test:e2e` script to `--filter=@cmmp/api`, since
      `apps/web` already had its own (pre-existing, unrelated to this
      session) `test:e2e: playwright test` script that fails with "No
      tests found" — matching Phase 14's own honest note that no
      Playwright suite exists yet. Verified live: `npm run test:e2e`
      passes all 17 e2e tests against the real local Postgres instance
- [x] SAST (`security.yml`'s CodeQL job), dependency scanning
      (`dependabot.yml` — npm workspace-aware, github-actions, and
      docker ecosystems), secret scanning (`security.yml`'s Gitleaks
      job), DAST (`dast.yml`, OWASP ZAP baseline, schedule/manual-
      dispatch only by design — a ZAP scan is too slow/noisy to gate
      every PR), container scanning (`container-security.yml`, Trivy
      against both Dockerfiles), and SBOM generation (`security.yml`,
      weekly CycloneDX) — all already existed, all reviewed this phase,
      none needed new work
- [x] Fixed a real, previously-latent bug in `dast.yml` while reviewing
      it: its own comment said it wasn't wired to PR/push because the API
      had no `/health` endpoint yet — true when it was written, resolved
      by Phase 15. But its actual readiness check
      (`curl -sf http://localhost:3001/api/v1`) was checking a route that
      doesn't exist (no controller registers the bare prefix root, so
      that 404s), meaning the wait-for-reachable loop could never
      succeed and this workflow would always time out after 150s —
      completely independent of the missing-`/health` reasoning in the
      comment, and never caught because this workflow has never actually
      run (schedule/manual-dispatch only, and nothing manually triggered
      it before now). Pointed the check at the real `/health` endpoint
      and updated the stale comment; kept the schedule/manual-dispatch-
      only trigger design as-is (still the right call — that reasoning
      was independent of the missing-prerequisites one)
- [x] Security gates — `security.yml`'s `dependency-audit` job runs
      `npm audit --audit-level=high`, failing the job on high/critical
      findings; GitHub's own PR banner already separately surfaces 72
      existing advisories repo-wide (1 critical, 25 high, 37 moderate, 9
      low) — triaging those is real, unstarted work, not something this
      phase did
- [x] Deployment workflow — genuinely **not** built, and deliberately out
      of scope: there's no target environment (staging/production host,
      registry credentials, secrets store) for a deploy workflow to
      target yet. Building one against nothing to deploy to would be
      exactly the kind of speculative infrastructure this session has
      avoided elsewhere. Revisit once Phase 15's Docker images have
      actually been built and run for real somewhere (see that phase's
      own caveat) and there's a real place to ship them
- [x] Corrected a stale/inaccurate "Known Issues" entry while re-checking
      lint for this phase: it claimed `eslint-plugin-security`,
      `eslint-plugin-react` etc. weren't installed anywhere and that
      `npm run lint` "currently fails repo-wide" — neither was true
      by the time this phase checked. See the corrected entry below

### Phase 17: Documentation
The last unstarted phase. `docs/architecture.md` (and, before this
phase, several other docs) dated to Phase 1 — written before any real
code existed, describing a system that only partially got built the way
it was planned (a `scoring/` NestJS module, Redis, AWS ALB/WAF/VPC,
`AssessmentResponse`/`AssessmentHistory`/`Evidence`/`FrameworkVersion` as
separate entities, a permission matrix that didn't match any real
`@Roles()` array). Publishing docs that describe a system more capable
than the one that exists is worse than no docs — it costs a future
reader (human or agent) time discovering the gap the hard way. This
phase's work was corrective as much as additive: every claim below was
checked against the real code, not assumed from the original design.
- [x] **Security architecture document + Threat model & STRIDE
      analysis** — `docs/security-architecture.md` (new). A verified
      table of real controls with how each is tested, an honest "not
      implemented" list (rate limiting is the standout — genuinely
      absent everywhere, including on login), a full STRIDE pass across
      the actual system (not a generic template), an OWASP Top 10
      cross-reference, and a priority-ordered list of what to fix first.
      Documents the Phase 13 class-vs-method `@Roles()` bug as a
      concrete Elevation-of-Privilege case study, since it's the one
      real incident this session has to point to
- [x] **Data model documentation + Framework model documentation +
      Scoring methodology** — folded into a rewritten
      `docs/architecture.md` rather than three separate files (better
      information architecture — these are tightly coupled, and
      fragmenting them into stubs would've meant three thinner, harder
      -to-cross-reference documents). Data model diagram corrected
      against the real `schema.prisma` (caught two of my own drafting
      mistakes before committing: `AssessmentItem` links to
      `Subcategory` through `AssessmentQuestion`, not directly; and
      `Recommendation` has three independent optional FKs, not a strict
      child-of-`RemediationInitiative` relationship). Scoring section
      corrects the rollup formula specifically — it's a **weighted
      average** excluding `NOT_APPLICABLE` items, 0-5 scale, not the
      simple-average description the original draft had
- [x] **API design document** — two complementary pieces rather than one
      static file: (1) `docs/architecture.md`'s API Surface section — a
      verified table of all 9 controllers, their base paths, and the
      exact role-gating per resource, built from a real `grep` across
      every controller's `@Roles(...)` calls, not from memory; (2) live
      OpenAPI/Swagger via `@nestjs/swagger` (`ENABLE_SWAGGER=true` env
      var, off by default — see the security rationale in
      `docs/security-architecture.md`), `@ApiTags`/`@ApiBearerAuth` on
      every controller. Verified live: `/api/docs` returns 200,
      `/api/docs-json` lists all 35 routes correctly tagged and grouped,
      confirmed off (404) when the env var is unset. A hand-written API
      doc goes stale the moment a route changes; a live schema generated
      from the actual decorators can't
- [x] **Excel import format guide** — `docs/EXCEL_IMPORT_GUIDE.md` (new),
      the one genuinely user-facing document from this phase (not
      developer architecture) — the 17 canonical columns and their
      aliases, accepted maturity/risk/status value formats, the
      formula-injection defense explained for a non-developer audience,
      row-outcome rules (valid/warning/invalid/duplicate — including
      that a duplicate `Control_ID` doesn't override a more severe
      `invalid` status), the exact JSON response shape read straight
      from `AssessmentsService.importFile`, and an explicit callout that
      the API endpoint is real but the upload-wizard *UI* isn't built
- [x] **Deployment guide** — `docs/DEPLOYMENT.md` (new). Leads with the
      same Docker caveat as Phase 15 itself (never built/run in this
      session) rather than burying it; documents the two-different-
      API-URLs Docker Compose gotcha Phase 15 found; a verified
      configuration reference (every env var the running code actually
      reads, cross-checked against source, not transcribed from
      `.env.example`); explicitly lists what's genuinely not built
      (a deploy workflow, TLS termination, any cloud-specific config)
      rather than gesturing at "production-ready"
- [x] **DevSecOps pipeline documentation** — summarised inside
      `docs/DEPLOYMENT.md`'s CI/CD section (what each of the five
      `.github/workflows/*.yml` files actually does, in plain language)
      rather than a separate file — the workflows themselves are
      already thoroughly commented (Phase 16), so a separate doc would
      mostly restate them
- [x] **ADRs (Architecture Decision Records)** — already existed, inside
      `docs/IMPLEMENTATION_STATUS.md`'s "Architecture Decisions" section
      (ADR-001 through ADR-010) from earlier in this session. Not
      duplicated into a separate `docs/adr/` directory; `README.md` and
      `SECURITY.md` corrected to point at where they actually live
      rather than a nonexistent path
- [x] Fixed real inaccuracies found while cross-checking every doc
      against the code rather than trusting earlier drafts: `README.md`
      claimed apps/api used "NextAuth/OIDC" (it doesn't — NextAuth is
      frontend-only, the API uses `@nestjs/jwt`), claimed rate limiting
      and CSRF protection were implemented (neither is), listed
      `dev:web`/`dev:api`/`build:web`/`build:api`/`test:coverage` npm
      scripts that don't exist in `package.json`, listed six
      `docs/*.md` files that don't exist under those names, referenced
      `.github/workflows/deploy.yml`/`container.yml` (real name:
      `container-security.yml`; no deploy workflow exists), and only
      listed one of the four seeded demo accounts. `SECURITY.md`'s
      "Security Baseline"/"Infrastructure Security" sections stated
      rate limiting, AWS Secrets Manager/Vault, and CloudWatch/ELK as
      present-tense facts; rewritten to match `docs/security-architecture.md`'s
      verified findings, and its existing (previously dead) link to
      `/docs/security-architecture.md` now resolves for real
- [x] Verified live rather than assumed: full `npx turbo run type-check
      test build` (27/27 tasks) and `npm run test:e2e` (17/17) both still
      pass after every code change this phase made (the Swagger wiring,
      mainly); `npm run lint` clean; the Swagger UI/JSON endpoints
      behave exactly as documented (live curl checks, both with and
      without `ENABLE_SWAGGER` set)

## Known Issues 🐛

- **Re-verified during Phase 16**: the actual `npm run lint` (=`turbo run
  lint`, what CI's lint job runs, what every prior phase in this session
  has been running) works cleanly — that part of this note was stale/
  wrong. A *bare* `npx eslint . --ext ts,tsx` run directly at the repo
  root (something nothing in `package.json` scripts or CI actually does)
  does resolve its plugins fine, but has no root-level ignore
  configuration for `dist/`, `node_modules/`, `.next/`, `coverage/`, etc.,
  so it recurses into build output and complains about generated `.d.ts`
  files. Low priority — add a root `.eslintignore` (or `ignorePatterns`)
  if a repo-root lint command ever becomes something people actually run
  directly, but nothing today depends on it.
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
- `prisma/seed.ts`'s own gap-derived `RemediationInitiative` rows (created
  directly, not through `generateFromGaps`) leave `securityCapability`
  `null`. `generateFromGaps`'s dedup check keys off `securityCapability`,
  so re-running it after a fresh seed does **not** recognise those seeded
  rows as already covering a gap and will create a second, API-created
  initiative for the same subcategory. Not a correctness bug in the new
  code — the dedup key does exactly what it says — but worth fixing by
  either having the seed script set `securityCapability` too, or accepting
  the duplication as expected when seed data and the real generator are
  both in play.

## Not Started ⭕

Nothing — Phase 17 was the last unstarted phase. See "Next Steps" below
for what's still open within already-"complete" phases (the Docker
build-and-run verification, frontend tests, a few deferred UI flows).

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

## Post-Phase-17 Hardening

Work done after all 17 master-prompt phases were complete, picking up
the top item from `docs/security-architecture.md`'s own priority list
rather than inventing new scope.

### Rate limiting on `POST /auth/login`
`docs/security-architecture.md` named this the single highest-priority
open gap: a live login endpoint reachable with zero prior authentication
and zero throttling. Fixed:
- `@nestjs/throttler`, registered globally (`APP_GUARD`) with an
  app-wide default (100 req/15min/IP, configurable via
  `RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_MS` — both were already
  declared in `.env.example` and unused until now)
- `POST /auth/login` overrides that default with a much tighter 5
  attempts/minute/IP via `@Throttle()` — the one endpoint that actually
  needs brute-force resistance, not just general abuse protection
- `GET /health` opts out entirely (`@SkipThrottle()`) since it's
  designed for frequent automated polling, not user traffic
- `ENABLE_RATE_LIMITING` is deliberately **not** wired as an on/off
  toggle — rate limiting is unconditionally on; a security product
  shouldn't default to opt-out on this
- New `apps/api/test/rate-limit.e2e-spec.ts` — its own unthrottled app
  instance (every other e2e suite overrides `ThrottlerGuard` to always
  allow, since they each log in several times per file against
  fixtures/roles and aren't testing rate limiting), verifying 5 attempts
  succeed and the 6th gets a real 429 with `Retry-After`, even when that
  6th attempt uses correct credentials
- Verified live before writing the regression test: 7 rapid login
  attempts against a running server returned 401/401/401/401/401/429/429,
  and `/health` stayed reachable throughout
- `docs/security-architecture.md`, `SECURITY.md`, `README.md`, and
  `docs/architecture.md` all updated to move this from "gap" to
  "implemented" rather than leaving stale claims in place
- Full verification re-run after this change: `npx turbo run type-check
  test build` (27/27), `npm run test:e2e` (19/19, including the 2 new
  rate-limit tests), `npm run lint` clean

## Next Steps

What's left, roughly in priority order (Docker verification and rate
limiting were the top two open items; rate limiting is now done above):

1. **Actually build and run Phase 15's Docker images.** `docker compose
   build && docker compose up` somewhere with a working daemon (this
   session's sandbox never had one). Everything was validated as far as
   possible without a daemon (`turbo prune` run for real, `docker
   compose config` parsing cleanly, the Next.js `standalone` output
   inspected file-by-file), but "parses correctly" and "boots and serves
   traffic" are different claims, and only the first one has been
   checked. `container-security.yml`'s Trivy scan and `dast.yml`'s ZAP
   scan will do this automatically the next time either fires on a
   GitHub Actions runner (which does have a working daemon) — worth
   watching for that specifically, since it's the first real
   verification those Dockerfiles will get.
2. **Fail closed on a missing `JWT_SECRET`** (refuse to start rather
   than fall back to the hard-coded value in `auth.module.ts`) and
   **implement real token revocation on logout** (currently a no-op) —
   both called out in `docs/security-architecture.md`'s priority list.
3. Frontend test coverage — zero automated tests in `apps/web` today.
   React Testing Library component tests and a persisted Playwright E2E
   suite (the dependency and a `test:e2e` script exist, scaffolded since
   Phase 1, but no spec file has ever been written).
4. **Multi-assessment rollup**: every `/dashboard/*` endpoint currently
   scopes to *one* assessment (the org's latest submitted one, or an
   explicit `assessmentId`) — a real "organisation-wide" score across
   several concurrently-active assessments (different frameworks, business
   units) would need `@cmmp/scoring-engine`'s `combineScores`, which
   exists but isn't wired into the dashboard yet. Revisit if/when an org
   genuinely has more than one active assessment at a time.
5. Frontend follow-ups from Phase 10: a framework navigation view, an
   assessment-taking flow (`/assessments/:id/items`), a risk register view
   (`/risks` now has a real API), the Excel import wizard's upload/
   preview/column-mapping steps, and extracting the dashboard components
   into `@cmmp/ui` if/when a second app or page needs them (not worth the
   abstraction for one dashboard page yet)
6. Wire `POST /assessments/:id/import`'s `columnMapping` override — the
   library (`ImportOptions.columnMapping`) already supports it, but the
   endpoint only auto-maps columns today; needs a way to accept a manual
   mapping as a form field or a preceding "preview" call, matching the
   import wizard's step 3 in master prompt §14.
7. Look more closely at the `exceljs` → `uuid` advisory now that
   `import-engine` genuinely parses untrusted uploads (see Known Issues) —
   confirm whether `exceljs`'s internal `uuid` usage ever hits the
   vulnerable buffer-bounds code path, or upgrade past it.
8. Before relying on the seeded NIST CSF 2.0 data for anything
   compliance-facing, diff `packages/database/prisma/fixtures/nist-csf-2.0.json`
   against the official NIST CSWP 29 publication — it was reproduced from
   training-data knowledge, not transcribed from the source document (see
   Phase 5 notes above)
9. Triage the 72 existing Dependabot advisories GitHub surfaces on every
   push (1 critical, 25 high, 37 moderate, 9 low) — noted several times
   across this session but never actually investigated
10. Extend the dedicated tenant-isolation e2e pattern
    (`apps/api/test/tenant-isolation.e2e-spec.ts`) to `Assessment`,
    `Framework`, and `User` explicitly — today only `Risk` has a
    cross-tenant e2e test; the isolation *pattern* is structurally
    consistent across every service, but that consistency itself isn't
    independently e2e-verified per resource yet

## Contact & Questions

- See CONTRIBUTING.md for contribution guidelines
- See SECURITY.md for security reporting
- Check docs/ for detailed documentation
