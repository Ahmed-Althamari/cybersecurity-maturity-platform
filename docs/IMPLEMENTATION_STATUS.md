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
- [x] Token revocation — done in the Post-Phase-17 Hardening section
      below (`RevokedToken` table keyed by `jti`, checked on every
      request in `JwtStrategy.validate()`), including refresh-token
      rotation: `POST /auth/refresh` revokes the token it was called
      with the moment it mints the replacement, so a leaked token isn't
      left valid just because its holder refreshed.
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

From `npm audit` (re-run 2026-09-04 as part of the Dependabot-triage item
in Post-Phase-17 Hardening below, after fixing `multer`): 30 findings
remain (8 high, 16 moderate, 6 low), effectively all requiring a
major-version bump to resolve. Classified per the finding-remediation
scheme in the master prompt (section 73):

- **Fixed — `multer` (Denial of Service, 4 advisories high + 1
  moderate)**: see the Post-Phase-17 Hardening section below. This one
  genuinely didn't need a major bump and is now resolved.
- **Dependency Issue — Next.js 14.0.2** (high): several CVEs (SSRF via
  rewrites, Server Action/RSC DoS, cache poisoning). User-facing surface
  (`apps/web`), so this is the one worth prioritizing next. Fix requires
  upgrading to Next 16.x, which is a real breaking change (App Router/config
  surface) — not attempted blind; needs its own scoped PR with the app
  actually exercised in a browser afterward, per this repo's own UI-testing
  expectations.
- **Dependency Issue — `@nestjs/core`/`@nestjs/platform-express`/
  `@nestjs/common`/`@nestjs/config`/`@nestjs/swagger`/`@nestjs/testing`**
  (moderate, mostly transitive — `file-type`'s ASF-parser infinite loop
  and ZIP-decompression-bomb advisories via `@nestjs/common`, `lodash`
  prototype pollution via `@nestjs/swagger`, `qs` DoS via
  `@nestjs/platform-express`): `npm audit fix` (the non-breaking form)
  makes no additional progress on any of these — confirmed by actually
  running it, not assumed — meaning every one of them genuinely needs
  the same `@nestjs/core@12`/`platform-express@12`/etc. major bump as
  `@nestjs/cli` below, not a safe patch release. These are runtime
  dependencies (unlike the `@nestjs/cli` toolchain), so this is a step
  up in real risk from how this section characterized the NestJS
  ecosystem before this pass.
- **Dependency Issue — `@nestjs/cli`/`turbo`/`@angular-devkit/*` toolchain**
  (mixed moderate/high: ajv, glob, picomatch, webpack, tmp, inquirer): all
  devDependencies used only for local builds/codegen, not shipped or
  reachable by an end user. Lower real-world risk than the Next.js or
  runtime-NestJS findings above. Fix requires `@nestjs/cli@12` (breaking
  relative to the `@nestjs/core@10` runtime this repo pins) and
  `turbo@2.10`.
- **Dependency Issue — `exceljs`, downgraded to informational — confirmed
  unreachable** (moderate finding via nested `uuid`; GHSA-w5hq-g745-h8pq,
  "missing buffer bounds check in v3/v5/v6 when `buf` is provided"):
  `npm audit fix --force` still only offers to *downgrade* to
  `exceljs@3.4.0`, which would be a backwards step, not a fix — so this
  was actually investigated instead, not left as an open question.
  Traced every call site: `exceljs@4.4.0` has exactly one place that
  calls into `uuid` at all
  (`node_modules/exceljs/lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`,
  the conditional-formatting-extension *writer*), and it calls `uuidv4()`
  with **zero arguments** — the advisory is specific to `v3`/`v5`/`v6`
  when a caller supplies its own pre-allocated `buf`; `v4` isn't even the
  affected function, and no `buf` is ever passed here regardless.
  Doubly moot for this repo specifically: `@cmmp/import-engine`
  (`parse-xlsx.ts`) only ever calls `workbook.xlsx.load(...)` to read an
  uploaded file — it never calls any `exceljs` write path, so that one
  call site isn't reachable through this codebase's own usage even in
  principle. **Confirmed via direct source inspection, not inferred** —
  this is the closer look Next Steps previously asked for. Genuinely
  safe to leave un-upgraded; the file-guard defenses (extension
  allowlist, 10MB size cap, `MAX_ROWS` during parse) remain in place
  regardless, as general hardening rather than because of this specific
  advisory.
- **Resolved**: removed the `xlsx` (SheetJS) dependency from
  `packages/reporting` — it had an advisory with no available fix and
  nothing in the codebase imports it (`exceljs` already covers this need).

**On the "72 Dependabot advisories" GitHub's own banner shows, versus
the ~30 `npm audit` finds**: this session has no tool access to GitHub's
Dependabot alerts API (no `gh` CLI, and the GitHub MCP server available
here doesn't expose a Dependabot-alert-listing tool), so the full list
was never directly enumerable — the gap between the two counts is a real,
open question, not something resolved by this pass. The likely
explanation is scope: `dependabot.yml` (Phase 16) watches the `npm`,
`docker`, and `github-actions` ecosystems, while `npm audit` only ever
sees the `npm` one — so a real chunk of the 72 is plausibly Docker
base-image and/or GitHub Actions advisories this session simply can't
see from here. Whoever has GitHub UI/API access to the Security tab
should pull the actual list before assuming the `npm audit` findings
above are the whole picture.

None of the still-open findings above are wired as a required
branch-protection check yet (see CI notes below) — `npm audit
--audit-level=high` runs on every PR/push via
`.github/workflows/security.yml` and will show red until the Next.js/NestJS
core/CLI upgrades happen, but doesn't block merges in the meantime.

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

### Fail closed on a missing `JWT_SECRET` in production
Second item from `docs/security-architecture.md`'s priority list.
`AuthModule`'s `resolveJwtSecret()` (exported for direct unit testing)
now throws — refusing the app to start — when `NODE_ENV === 'production'`
and `JWT_SECRET` is unset, instead of silently signing every token with
the value hard-coded in the public source tree. Outside production it
still falls back to that value, now with a loud `Logger.warn`, so local
dev/CI don't need to configure a secret just to run the test suite.
4 new unit tests (`auth.module.spec.ts`) cover all four cases: a real
secret always wins regardless of `NODE_ENV`; production + unset throws;
non-production + unset falls back with a warning; `NODE_ENV` itself
unset is never treated as production (falls back, doesn't throw).

**A genuinely interesting environmental finding while live-verifying
this**: attempting to start the built API with `NODE_ENV=production` and
`JWT_SECRET` deliberately unset in *this session's own sandbox* did
**not** throw — traced it down to the sandbox's root `.env` file (not
created by this session) already containing
`JWT_SECRET="your-jwt-secret-here-min-32-chars-long"`, which gets
absorbed into `process.env` as a side effect of `@prisma/client`'s own
runtime dotenv auto-loading (the same mechanism that explained, earlier
in this session, why `DATABASE_URL` always resolved correctly without
an explicit `apps/api/.env` — Prisma's generated client loads the
nearest `.env` it can find and populates *every* variable in it, not
just the ones Prisma itself cares about). This isn't a flaw in the
fail-closed logic — it's this specific sandbox's pre-existing `.env`
masking the unset case — so live process-level verification of the
throw path isn't meaningfully possible here; the unit tests, which
manipulate `process.env` directly and never go through Prisma's
require chain, are the real verification for this one.

### Token revocation on logout
Third item from `docs/security-architecture.md`'s priority list.
`POST /auth/logout` was previously a no-op — it returned success but
never invalidated the token, so a leaked/stolen token stayed valid for
its full 24h lifetime regardless of logging out. Fixed with a
database-backed revocation list rather than adding Redis (removed as
unused scaffolding in Phase 15 — reintroducing it just for this would
be the same kind of speculative infrastructure this session has
avoided elsewhere):
- New `RevokedToken` model (`jti` unique, `expiresAt`, indexed on
  `expiresAt` for future pruning) and migration
  (`20260904203511_add_revoked_tokens`). No FK to `User` — a JWT
  outlives nothing about the user record, and a revocation lookup only
  ever needs the token's own `jti` claim.
- `JwtPayload` gained a `jti` (via `crypto.randomUUID()`), minted fresh
  on every `login()` and every `refreshToken()` call — each issued
  token is independently revocable without touching any other session
  for the same user.
- `AuthService.logout(jti, expiresAt)` upserts a `RevokedToken` row;
  `isRevoked(jti)` checks for one. `JwtStrategy.validate()` now calls
  `isRevoked()` on every authenticated request and throws
  `UnauthorizedException` for a revoked token, even though it hasn't
  naturally expired. `AuthController.logout()` reads `jti`/`exp` off
  the already-authenticated request (via a new `CurrentUser`-typed
  `RequestUser.jti`/`.exp`) rather than re-parsing the token.
- This is **per-token**, not global "sign out everywhere": logging out
  of one device/tab never touches a different session's token, since
  each login mints its own `jti`. Verified explicitly by test (see
  below).
- `resolveJwtSecret()` was extracted out of `auth.module.ts` into its
  own `apps/api/src/auth/jwt-secret.ts` file (moving the spec file with
  it, via `git mv`, to `jwt-secret.spec.ts`) — `JwtStrategy` now needs
  the same secret `AuthModule` uses to sign tokens, and importing it
  from `auth.module.ts` directly would have created a circular import
  (`auth.module.ts` → `jwt.strategy.ts` → `auth.module.ts`). Caught and
  avoided before writing code that would have hit the cycle, not fixed
  after the fact.
- New/extended tests: `auth.service.spec.ts` gained a "unique jti per
  token, including across a refresh" test and a `logout`/`isRevoked`
  block (3 tests); new `jwt.strategy.spec.ts` (3 tests: rejects a
  revoked token, returns the correct request-user shape including
  `jti`/`exp` for a non-revoked one, confirms `isRevoked` is called
  with the token's own `jti`); new `apps/api/test/token-revocation.e2e-spec.ts`
  (2 tests, split into its own file — see below for why) covering the
  per-token-not-global behavior and that a token can't be used to log
  out twice.
- **A real NestJS testing limitation found and worked around while
  writing the e2e tests**: the first attempt put the 2 new revocation
  tests directly in `auth.e2e-spec.ts` and tried to bypass the rate
  limiter (needed here since the test logs in several times) via
  `.overrideGuard(ThrottlerGuard)`/`.overrideProvider(APP_GUARD)` on
  `Test.createTestingModule()`. Neither actually took effect — traced
  via direct instrumentation (a `let hit = false` flag inside the
  override's `canActivate` that never flipped to `true` on a real
  request) to a known `@nestjs/testing` limitation: overrides don't
  reliably intercept a guard registered globally via
  `{ provide: APP_GUARD, useClass: ... }`. The real throttle was firing
  for real and silently failing unrelated assertions with
  `expected 200, got 401`/`expected 201, got 401` because a login call
  was returning a real `429` that went unnoticed until the raw response
  body was logged. **Fix**: rather than fighting the guard, split the
  revocation tests into their own spec file
  (`token-revocation.e2e-spec.ts`), since every file using
  `createTestApp()` gets its own fresh app instance and therefore its
  own empty in-memory `ThrottlerStorage` — each file just needs to keep
  its own total login-call count under the real 5/60s limit.
  `test/support/app.ts`'s own comment now documents this limitation
  honestly for whoever writes the next e2e file that needs multiple
  logins.
- Verified end-to-end against the live PostgreSQL instance: real
  login → `GET /auth/me` 200 → `POST /auth/logout` → same token retried
  on `GET /auth/me` → 401 → a second, independent session's token for
  the same user still 200s → retrying `POST /auth/logout` with the
  already-revoked token → 401. Confirmed via `psql` that real rows
  land in `revoked_tokens`.
- Docs updated in the same pass: `docs/architecture.md` (a new
  "### Token revocation" subsection), `docs/security-architecture.md`
  (Controls table, Security Gaps list, STRIDE Spoofing table, OWASP
  A07 row, and the Priority Order list — struck through as done, with
  refresh-token rotation added as the new next item), and this file's
  own Phase 3 checklist item.
- **Known, documented gap left open on purpose**: no pruning job exists
  for `RevokedToken` rows past their own `expiresAt` — no correctness
  impact (an expired token is rejected on expiry alone regardless) but
  a real operational one at scale (see Next Steps).
- Full verification re-run after this change: `npx turbo run
  type-check test build` (27/27), unit tests (116/116), `npm run
  test:e2e` (21/21) across two consecutive stable runs, `npm run lint`
  clean.

### Refresh-token rotation
Fourth item from `docs/security-architecture.md`'s priority list, and a
direct follow-up to the token-revocation work above rather than new
infrastructure: `POST /auth/refresh` minted a new token but never
revoked the one it was called with, so a leaked pre-refresh token
stayed valid until its natural 24h expiry regardless of how often its
holder refreshed.
- `AuthService.refreshToken(token)` now calls `this.logout(payload.jti,
  new Date(payload.exp * 1000))` right after minting the replacement
  token — reusing the exact same `RevokedToken` upsert path `POST
  /auth/logout` already uses, not a second mechanism.
- `validateToken()`'s return type was widened to
  `JwtPayload & { exp: number }` (it already returned a real `exp`
  claim at runtime via `jwtService.verify()`; the type just hadn't
  declared it before, since nothing needed it until now).
- New unit test (`auth.service.spec.ts`): asserts `refreshToken()`
  calls `prisma.revokedToken.upsert` with the *original* token's exact
  `jti`/`expiresAt`. Writing this test surfaced a real gap in the test
  file's own setup: its hand-constructed `JwtService` had no
  `signOptions.expiresIn`, so tokens minted in tests carried no `exp`
  claim at all (`payload.exp` was `undefined`, producing an invalid
  `Date { NaN }`) — production's `AuthModule` always configures
  `expiresIn: '24h'`. Fixed by adding the same `signOptions` to the
  test's `JwtService` construction, matching production rather than
  masking the gap with a workaround in the app code.
- New e2e test (`token-revocation.e2e-spec.ts`, third test in that
  file): logs in, calls `/auth/refresh` with that token, confirms the
  pre-refresh token now 401s on `/auth/me` while the freshly minted one
  200s. That file's login budget is now 4 per run (2 + 1 + 1 across its
  three tests), still comfortably under the real 5/60s throttle.
- Verified live against a running server with a real seeded account:
  login → `/auth/me` 200 → `/auth/refresh` → old token retried on
  `/auth/me` → 401 → new token on `/auth/me` → 200; confirmed via
  `psql` that the old token's exact `jti` (read back out of the login
  response's own JWT) landed in `revoked_tokens` with a correct future
  `expiresAt`.
- Docs updated in the same pass: `docs/architecture.md`'s Token
  revocation subsection, `docs/security-architecture.md` (Controls
  table, Security Gaps list, OWASP A07 row, Priority Order list struck
  through as done).
- Full verification re-run after this change: `npx turbo run
  type-check test build` (27/27), unit tests (117/117), `npm run
  test:e2e` (22/22), `npm run lint` clean.

### Extending the tenant-isolation e2e pattern to Assessment, Framework, and User
Fifth item from `docs/security-architecture.md`'s priority list.
`apps/api/test/tenant-isolation.e2e-spec.ts` had exactly one resource
under dedicated cross-tenant e2e test — `Risk` — even though the same
validated-tenant-scope pattern is structurally consistent across every
service. Structural consistency isn't the same claim as "independently
verified," so this closes that gap for the three resources named in
the priority list.
- Restructured the file around one shared tenant-A/tenant-B pair
  (`beforeAll` logs in exactly twice, once per tenant) with nested
  `describe` blocks per resource — `Risk` (existing 5 tests, unchanged
  behavior), plus new `Assessment` (5 tests), `Framework` (4 tests),
  and `User` (5 tests) blocks, 19 new/kept tests total (14 net new).
  Reusing one login pair across every resource, rather than a fresh
  login per resource block, keeps the whole file's login count at 2 —
  comfortably under the real 5/60s `POST /auth/login` throttle from
  the rate-limiting hardening work above, without needing a second
  spec file the way `token-revocation.e2e-spec.ts` did.
- `tenantB`'s fixture role changed from `ORGANISATION_ADMIN` to
  `PLATFORM_ADMIN` — the tightest role gate exercised anywhere in the
  file is `User`'s `DELETE /users/:id` (`PLATFORM_ADMIN` only, stricter
  than `Risk`/`Assessment`'s delete gates which both also accept
  `ORGANISATION_ADMIN`). `PLATFORM_ADMIN` clears every role gate in the
  file, so a cross-tenant assertion always reaches the tenant check in
  the service layer instead of getting turned away earlier by an
  unrelated 403 from a role gate that isn't what's being tested.
- Assessment's fixture creates a `Framework` row directly via Prisma
  (bypassing the API, same reasoning as `createTestTenant` bypassing
  the API for Tenant/Organisation/User) — `POST /assessments` only
  needs a real `Framework` id to attach a default `AssessmentTemplate`
  to, not the full function/category/subcategory tree.
- **A real gap found and fixed in `test/support/fixtures.ts`'s own
  `cleanupTestTenant` while wiring this up**: it never deleted
  `Assessment`/`AssessmentTemplate` rows, because no test had created
  either before now. `assessments_organisationId_fkey` and
  `assessments_createdById_fkey`/`updatedById_fkey` are all `ON DELETE
  RESTRICT`, and `assessment_templates_frameworkId_fkey` is also `ON
  DELETE RESTRICT` — so the very first e2e run that created a real
  Assessment against a test tenant would have left `afterAll`'s
  `prisma.tenant.delete()` failing with an FK-constraint violation
  (Framework's own `tenants` FK is `ON DELETE CASCADE`, but that
  cascade can never fire while a still-referencing `AssessmentTemplate`
  blocks it). Fixed by explicitly deleting `Assessment` rows (which
  cascades `AssessmentItem`/`AssessmentHistory`/`Evidence` for free,
  since those *are* `ON DELETE CASCADE` from `Assessment`) and
  `AssessmentTemplate` rows scoped to the tenant's own frameworks,
  before the existing `User`/`Organisation`/`Tenant` deletes.
- Verified live via `psql` after a full e2e run: zero orphaned rows —
  no leftover `tenants`/`frameworks` matching the `e2e-%` slug pattern
  this file's fixtures use, and no leftover `assessments` named `Tenant
  A Assessment`/`Hijacked`, confirming the extended cleanup actually
  works rather than merely not erroring.
- Docs updated in the same pass: `docs/security-architecture.md`
  (Tampering STRIDE row corrected — `RemediationInitiative` was never
  actually covered by a dedicated e2e test despite an earlier draft of
  this document implying it was; Priority Order list struck through as
  done), this file's own Next Steps list.
- Full verification re-run after this change: `npx turbo run
  type-check test build` (27/27), `npm run test:e2e` (36/36, up from
  22 — the file went from 5 tests to 19), `npm run lint` clean.

**Follow-up, same file**: added a sixth nested `describe('RemediationInitiative', ...)`
block (6 tests: direct GET, org-scoped list, update, the risk-link
endpoint, delete, and owning-tenant read) right after `Risk`'s, closing
the one remaining resource this same section's Tampering STRIDE row had
flagged as still relying on pattern-consistency rather than its own
dedicated test. Reuses the same `tokenA`/`tokenB` pair (still 2 logins
total for the whole file). `apps/api/test/tenant-isolation.e2e-spec.ts`
now has 19 tests, `npm run test:e2e` 42/42 total. Verified live via
`psql`: zero orphaned `remediation_initiatives` rows after a full run.
`docs/security-architecture.md`'s Tampering STRIDE row updated to say
every tenant-scoped resource now has its own dedicated cross-tenant
test, not just four of five.

### Triaging the Dependabot / npm audit findings
Sixth and final item from `docs/security-architecture.md`'s priority
list. This session has no tool access to GitHub's Dependabot alerts API
(no `gh` CLI, no Dependabot-listing tool on the GitHub MCP server
available here), so a full triage of the 72 advisories GitHub's own
banner shows was never actually possible from inside this session — see
the new note in the Security Findings section above on the likely
`npm`-vs-`docker`/`github-actions`-ecosystem explanation for that gap.
What *was* possible: re-run `npm audit` for real (last done 2026-08-31)
and act on whatever it found that didn't require the large, deliberately
-deferred major-version bumps (Next.js 14→16, the NestJS 10→12
ecosystem).
- Re-running surfaced one genuinely fixable finding: `multer`, a
  **direct, runtime dependency** used by
  `apps/api/src/assessments/assessments.controller.ts`'s
  `FileInterceptor` on `POST /assessments/:id/import` — the same
  untrusted-file-upload endpoint `@cmmp/import-engine` already treats as
  live, security-relevant surface (Phase 8). Five real advisories, four
  high-severity: two "incomplete cleanup" DoS variants, an uncontrolled-
  recursion DoS, a deeply-nested-field-names DoS, and one moderate
  aborted-upload-cleanup DoS. All fixed in `multer@2.2.0`+; the repo was
  pinned at `2.0.2`.
- **The obvious fix wasn't as simple as bumping the version**: this
  repo's own direct dependency (`apps/api/package.json`, `^2.0.2`) would
  have happily resolved to a newer 2.x on its own, but
  `@nestjs/platform-express@10.4.22` — the actual package whose
  `FileInterceptor` uses `multer` internally — pins its own nested copy
  at the *exact* version `"2.0.2"` (not a range), and npm dedupes both
  requirements to one shared copy. That exact pin is what
  `npm audit fix`'s own suggestion of `@nestjs/platform-express@12.0.1`
  (a breaking major bump, exactly the kind of change this priority list
  exists to avoid making blind) was actually working around — not a
  real requirement, just npm's dependency resolver not knowing a root-
  level `overrides` field could do the same job without the major bump.
- Added a root `package.json` `"overrides": { "multer": "^2.3.0" }` —
  npm's mechanism for forcing every consumer in the tree (including one
  that pins an exact nested version, like `@nestjs/platform-express`
  does here) onto a single resolved version, without needing that
  consumer's own package.json to change. `apps/api/package.json`'s own
  declared range was bumped to match (`^2.3.0`).
- **A real resolution quirk hit while applying this, worth documenting
  since it cost real time**: neither a plain `npm install` nor a full
  `rm -rf node_modules && npm install` actually applied the override
  cleanly — both left a split tree (the old `2.0.2` still hoisted at the
  root, a *second*, separate `2.0.2`-vs-`2.3.0` mismatch reported by
  `npm ls` as `ELSPROBLEMS`). `npm dedupe` fixed the split but had an
  unacceptably wide blast radius for a security-only fix — it silently
  renegotiated ~630 lines of the lockfile, including *downgrading*
  `typescript` from `5.9.3` to `5.7.2` in the process, nothing to do
  with `multer` at all. Reverted that. The fix that actually worked:
  hand-editing the single `node_modules/multer` lockfile entry directly
  (bumping `version`/`resolved`/`integrity` to the real published
  `2.3.0` values, confirmed via `npm view multer@2.3.0 dist`) and then
  running `npm ci`, which installs exactly what the lockfile says
  without npm's resolver getting another chance to make a different
  choice. Net lockfile diff: 3 files, ~15 changed lines — `multer`
  only.
- Verified live against a running server with a real seeded account,
  since no e2e test exercises the file-upload endpoint at all (a
  pre-existing, separately-noted gap — see Next Steps): logged in,
  created a fresh `DRAFT` assessment, uploaded a real CSV through
  `POST /assessments/:id/import` — `201`, `importedCount: 1`, confirming
  the multipart parse path through the new `multer@2.3.0` behaves
  identically to before. Also hit the endpoint against the seeded
  (already-`SUBMITTED`) demo assessment first, which correctly 409'd
  *after* multer had already parsed the multipart body — proof the
  upload pipeline itself was intact even before finding a `DRAFT`
  assessment to complete the happy path against.
- `npm audit` before/after: 31 findings (10 high/15 moderate/6 low) →
  30 (8 high/16 moderate/6 low). `multer` itself is fully gone from the
  findings list; `@nestjs/platform-express`'s own severity rating
  dropped from high to moderate as a direct consequence (multer was its
  highest-severity contributor).
- Also checked whether `@nestjs/common`'s `file-type`-sourced findings
  (two moderate DoS advisories, notably a ZIP-decompression-bomb one —
  relevant given `import-engine`'s own documented, still-open zip-bomb
  gap) had a similarly narrow fix. They don't: `npm audit fix` (the
  non-force, non-breaking form) was actually run, not assumed, and made
  zero additional changes — confirming this one and the rest of the
  NestJS-ecosystem findings genuinely need the same major-version bump
  `@nestjs/cli`'s findings do, not a safe patch. Left as documented,
  deferred work rather than force-applied.
- Docs updated in the same pass: the Security Findings section above
  (re-run numbers, the `multer` fix, the runtime-vs-toolchain NestJS
  distinction, the 72-vs-~30 ecosystem-scope note),
  `docs/security-architecture.md`'s DoS threat-model row and Priority
  Order list (struck through as done — the list's last remaining item).
- Full verification re-run after this change: `npx turbo run
  type-check test build` (27/27, after regenerating the Prisma client —
  a clean `node_modules` reinstall drops the generated
  `.prisma/client`), `npm run test:e2e` (36/36), `npm run lint` clean,
  plus the live upload verification above.

### Pruning expired RevokedToken rows
Closes the last of the smaller, well-scoped items left in Next Steps
after the priority list itself was cleared above: nothing deleted a
`RevokedToken` row once its own `expiresAt` had passed, so the table
would grow without bound (harmless correctness-wise — an expired token
is rejected on expiry alone regardless — but a real operational
concern at scale, and explicitly named as such in
`docs/security-architecture.md`'s Gaps list until now).
- Added `@nestjs/schedule` (`^6.1.3` — the latest release still
  supporting this repo's pinned NestJS 10.x via peer deps; the current
  major, `12.x`, requires NestJS 12) as a new direct dependency of
  `@cmmp/api`. Checked it doesn't introduce any new `npm audit`
  findings of its own (it doesn't — confirmed via a real re-run, not
  assumed) and that the lockfile diff is limited to its own dependency
  tree.
- New `RevokedTokenCleanupService` (`apps/api/src/auth/`),
  `@Cron(CronExpression.EVERY_HOUR)`, deletes rows where
  `expiresAt < now`. Registered as a provider in `AuthModule`
  (revocation is that module's own concern); `ScheduleModule.forRoot()`
  added once, globally, to `AppModule` — required for any module's
  `@Cron()` to actually fire, not just this one.
- New `revoked-token-cleanup.service.spec.ts` (2 tests: deletes with
  the correct `expiresAt < now` filter, handles the zero-expired case
  without erroring).
- Verified live against the real database rather than trusting the
  mocked unit test alone: inserted one already-expired and one
  future-dated `RevokedToken` row directly via `psql`, ran the exact
  same `PrismaService`/`RevokedTokenCleanupService` the app uses
  end-to-end via a throwaway script (not the mocked mode the unit test
  uses), confirmed precisely the expired row was deleted and the
  future-dated one survived untouched.
- Also confirmed the full e2e suite (which boots and closes a real
  `AppModule` — now including a registered cron job — five times
  across five spec files) doesn't hang or leak an open handle on
  `app.close()`; `@nestjs/schedule` tears its registered jobs down on
  module destroy.
- Docs updated in the same pass: `docs/security-architecture.md` (new
  Controls-table row, the corresponding Gaps-list bullet removed),
  `docs/architecture.md`'s Token revocation subsection, this file's own
  Next Steps list.
- Full verification: `npx turbo run type-check test build` (27/27, unit
  tests 119/119), `npm run test:e2e` (42/42), `npm run lint` clean,
  plus the live pruning verification above.

## Post-Phase-17 Feature Work

Real feature additions requested after the security-hardening list above
was cleared, picked from `docs/IMPLEMENTATION_STATUS.md`'s own Next Steps
(items the user asked to prioritize).

### Multi-assessment rollup on the dashboard
Every `/dashboard/*` endpoint scoped to exactly one assessment (the org's
latest submitted one, or an explicit `assessmentId`) — an organisation
with more than one active assessment (different frameworks, different
business units, a phased rollout) only ever saw one of them reflected in
its headline numbers. `@cmmp/scoring-engine`'s `combineScores` existed
since Phase 7 but was never wired into `DashboardService`.
- `getMaturityOverview` (and, through it, `getExecutiveSummary`) now
  combines every `SUBMITTED`/`APPROVED` assessment for an organisation
  via `combineScores`, weighted by each assessment's own
  `applicableCount` — a bigger, more-complete assessment counts more
  than a small partial one, rather than every assessment counting
  equally regardless of size. `DRAFT`/`IN_PROGRESS` assessments (not yet
  real, signed-off data) and `ARCHIVED` ones (retired) never enter the
  rollup. An explicit `assessmentId`, or an org with 0-1 active
  assessments, keeps the exact single-assessment behavior from before —
  this is additive, not a behavior change for the common case.
- New response fields (`assessmentIds: string[]`, `combined: boolean`)
  on `MaturityOverview` (added to `@cmmp/shared` and mirrored in
  `apps/web/lib/api.ts`, matching that file's existing "mirrored, not
  imported" pattern from Phase 10) — additive, not a breaking change to
  the existing `overallMaturity`/`targetMaturity`/etc. fields.
- **Deliberately scoped out, not silently dropped**: `getFunctionMaturity`
  and `getGapAnalysis` (the function/category-level breakdowns) still
  resolve to a single assessment. Combining function-level breakdowns
  *across different frameworks* doesn't have an honest answer — NIST
  CSF's `GV.OC` and an ISO 27001 control domain aren't the same axis, so
  averaging them together would be meaningless, not just imprecise.
  Revisit if/when this needs solving for real (e.g. scoping the
  combination to assessments that share one framework).
- **A real bug found and fixed while writing the unit tests, not just
  assumed correct**: the first version double-fetched the organisation
  (once in the new rollup-resolution path, again inside the existing
  single-assessment fallback it delegated to) — harmless in production
  (an extra identical query) but caught immediately by a test using
  `mockResolvedValueOnce` a second time than the code actually called
  it, which surfaced as a false `NotFoundException`. Fixed by extracting
  a shared `assertOrganisation` check and a `findLatestAssessment`
  lookup that assumes it's already been done, so the org is verified
  exactly once per call regardless of which path is taken.
- **A second real issue found via live browser verification, not caught
  by any unit test**: the "primary" assessment used for `assessmentId`
  (what the dashboard's detail widgets — heatmap, radar chart, function
  cards — drill into) was initially just `assessments[0]`, ordered by
  most-recent `assessmentDate`. Live-tested by creating a second,
  near-empty assessment for the seeded demo org and submitting it — it
  sorted first (most recent) and became "primary," so the KPI cards
  correctly showed the combined ~2.5/96% numbers while the heatmap and
  function cards below rendered an almost-entirely-red, 3%-complete
  tree from the tiny new assessment instead of the real, 97%-complete
  one. Fixed by picking the "primary" by *substance*
  (`applicableCount`) instead of array position; added a dedicated unit
  test (`assessments[0]` deliberately made the less-substantive one, to
  prove the fix isn't just "return the first result").
- Verified live end-to-end against a running server and a real
  Playwright-driven browser session, not just the mocked unit tests: created
  a second real assessment for the seeded demo org, answered one
  question, submitted it, confirmed `GET /dashboard/maturity` and `GET
  /dashboard/executive` both returned `combined: true` with the correct
  weighted-average math (hand-verified: `(2.46×106 + 5×1)/107 ≈ 2.48`,
  matching the API's own output exactly), confirmed the dashboard UI's
  new "Combined across 2 active assessments…" indicator rendered
  correctly, and confirmed the detail widgets showed the substantive
  assessment's real data after the primary-selection fix — all via a
  real signed-in browser session and a screenshot, not just an API
  response. Cleaned up the test assessment afterward (soft-deleted, per
  the app's own delete semantics).
- Full verification: `npx turbo run type-check test build` (27/27, unit
  tests 123/123 — 4 new dashboard tests plus the existing suite),
  `npm run test:e2e` (42/42, unaffected — no e2e suite exercises the
  dashboard endpoints yet, a pre-existing gap not introduced here),
  `npm run lint` clean.

### Frontend: framework navigation view
First of the Phase 10 frontend follow-ups. Two new pages:
`/frameworks` (a card grid over `GET /frameworks`, linking into each)
and `/frameworks/[id]` (the function → category → subcategory tree via
`GET /frameworks/:id/navigation`, rendered as nested, collapsible
`<details>`/`<summary>` — native, keyboard-accessible, no client-side
expand/collapse state to manage by hand). A "Frameworks" link was added
to the dashboard header so it's actually reachable, not just a page
that exists if you type the URL.
- New `apps/web/lib/api.ts` calls: `getFramework` and
  `getFrameworkNavigation`, plus the mirrored `NavigationNode` type.
- New `apps/web/components/frameworks/NavigationTree.tsx` — recursive,
  generic on tree depth (matches `buildFrameworkNavigation`'s own
  framework-agnostic design from Phase 4; nothing here assumes NIST CSF
  specifically).
- **A real, if minor, UX bug caught only by looking at a live
  screenshot, not by type-checking or a unit test**: the seed data
  derives each subcategory's assessment-question text from its own
  outcome statement, so `label` and `description` are often
  word-for-word identical — the first render showed every leaf node's
  sentence twice (once as the bold label, once again directly below in
  muted gray). Fixed by only rendering `description` when it actually
  differs from `label`; re-verified with a second screenshot after the
  fix.
- Verified live via a real signed-in Playwright browser session: signed
  in, clicked through from the dashboard to `/frameworks`, confirmed
  the real seeded NIST CSF 2.0 card renders, clicked into it, confirmed
  all 6 functions and their categories render collapsed-by-default with
  correct child counts, expanded a category and confirmed its real
  subcategories (codes, labels, no more duplicated description text)
  render correctly.
- Full verification: `npx turbo run type-check build --filter=@cmmp/web`
  clean, `npm run lint` clean, plus the live browser verification above.

### Frontend: assessment-taking flow
Second of the Phase 10 frontend follow-ups. Two new pages:
`/assessments` (a list over `GET /assessments`, status badges, links
into each) and `/assessments/[id]/items` — the actual response-recording
UI, backed by a new client-interactive `AssessmentItemsForm` component.
- New `apps/web/lib/api.ts` calls/types: `getAssessment` (assessment
  detail, `AssessmentDetail`/`AssessmentItemRecord`), `getFrameworkTree`
  (the raw nested tree with every `AssessmentQuestion`, distinct from
  the flattened `NavigationNode[]` the `/navigation` endpoint returns —
  needed here because taking an assessment means answering actual
  questions, not just browsing the hierarchy), `upsertAssessmentItem`,
  `submitAssessment`.
- One row per question (grouped by function → category → subcategory),
  two `<select>`s (Current/Target maturity). Each change auto-saves
  immediately via `POST /assessments/:id/items` — no separate "Save"
  step — with a small inline Saving…/Saved/Failed indicator per row,
  and a live "N of *total* questions answered" counter. A submitted (or
  otherwise non-`DRAFT`/`IN_PROGRESS`) assessment renders every
  dropdown disabled with a "Read-only" badge and no Submit button,
  matching the API's own `EDITABLE_STATUSES` gate rather than only
  relying on the API to reject the write after the fact.
- **Deliberately scoped to current/target maturity only for this first
  cut, not silently incomplete**: `UpsertAssessmentItemDto` also
  accepts `rationale`/`evidence`/`assessorComments`/`owner*`/
  `remediationDueDate`/`riskLevel`/`businessCriticality`/`controlStatus`
  — none of those have UI yet. Revisit if/when the extended metadata
  actually needs entering through this flow rather than only via
  import or direct API access.
- Verified live via a real signed-in Playwright browser session end to
  end: created a real `DRAFT` assessment, opened its items page,
  confirmed all 106 real seeded questions render grouped by function
  with correct codes/text, answered one question's Current/Target
  selects and confirmed the inline "Saved" indicator plus the counter
  moving from "0 of 106" to "1 of 106", confirmed the status line
  itself flipped from `DRAFT` to `IN_PROGRESS` after that first answer
  (matching `AssessmentsService`'s own documented auto-transition),
  clicked Submit and confirmed a real redirect to `/assessments`,
  reloaded the items page and confirmed it now renders fully read-only
  (`SUBMITTED`, every select disabled, no Submit button) — not assumed
  from the API contract alone. Test assessment soft-deleted afterward.
- Full verification: `npx turbo run type-check test build` (27/27),
  `npm run lint` clean, plus the live browser verification above (a
  full create → answer → submit → read-only round trip against a real
  server and database).

### Frontend: risk register view
Third of the Phase 10 frontend follow-ups. Three new pages: `/risks`
(list, sort by priority/recent, filter by status, all via query-string
links rather than client state), `/risks/new` (create form), and
`/risks/[id]` (view/edit/delete). New `apps/web/lib/roles.ts` — UX-only
role gating (hide the New/Save/Delete controls a signed-in user's
`session.roles` couldn't use anyway; the API's `RolesGuard` is the real
enforcement either way, this just avoids showing a button that would
403) mirroring the API's own `RISK_WRITE_ROLES`/delete-only role sets.
- New `apps/web/lib/api.ts` calls/types: `listRisks`, `getRisk`,
  `createRisk`, `updateRisk`, `deleteRisk`, `RiskRecord`.
- New `apps/web/components/risks/RiskLevelBadge.tsx` — reuses
  `maturity-scale.ts`'s existing `riskLevelColor()` from Phase 10
  rather than inventing a second color mapping; the risk level's own
  text is always printed inside the badge, never color alone.
- **A real bug found only by looking at a live screenshot, not by
  type-checking**: `/risks` showed "No risks match this filter" on
  first load even though the seeded org has 13 real risks. Root cause:
  `listRisks`'s query-string builder spread `{ status, riskLevel, sort
  }` straight into `new URLSearchParams(...)` — and
  `URLSearchParams`'s object constructor calls `String()` on every
  value, so an *unset* `status` (`undefined`, meaning "no filter")
  became the literal query string `status=undefined`, which the API
  correctly treated as filtering for a status that matches nothing.
  Every other endpoint in this same file already avoided this via a
  conditional spread (`...(x ? { x } : {})`); `listRisks` was the one
  place that didn't, added directly in this pass. Fixed by only adding
  each param when it's actually set, and audited every other
  `new URLSearchParams` call site in the file to confirm none of the
  others have the same bug (they don't).
- Verified live via a real signed-in Playwright browser session, full
  CRUD round trip against the real seeded org: opened the (buggy) list
  first, confirmed the fix made all 13+ real risks render sorted by
  priority; created a new risk (likelihood 5 × impact 4), confirmed the
  server-computed inherent risk score (20) matched by hand; edited its
  impact down to 2 and confirmed the score recomputed to 10 (matching
  `RisksService`'s documented recompute-on-change behavior); deleted it
  and confirmed it no longer appears in the list. Test risk fully
  cleaned up (no leftover row, soft-deleted per the API's own
  semantics).
- Full verification: `npx turbo run type-check test build` (27/27),
  `npm run test:e2e` (42/42), `npm run lint` clean, plus the live
  browser CRUD verification above.

### Frontend: Excel import wizard UI
Fourth and last of the Phase 10 frontend follow-ups. New
`/assessments/[id]/import` page, reachable via an "Import from
Excel/CSV" button on the assessment items page (only shown while the
assessment is still editable).
- **Honest about what the API actually supports, not a fictitious
  multi-step wizard**: `POST /assessments/:id/import` runs the real
  import immediately on upload — there is no dry-run/preview mode and
  no way to pass a manual `columnMapping` override (the DTO only
  auto-maps). Master prompt §14's wizard steps (upload → select
  worksheet → map columns → validate → preview → import) would need
  backend changes this session didn't make. Rather than fake a preview
  screen that doesn't reflect reality, the UI says so directly ("the
  import runs immediately on upload rather than showing a preview
  first") and instead has two honest steps: choose a file, then see
  the real result. This was the explicit trade-off named when this
  task was scoped, resolved by shipping the auto-mapping-only path
  rather than adding the backend work.
- New `apps/web/lib/api.ts`: `apiFetchFormData` — a second low-level
  fetch helper alongside `apiFetch`, needed because `apiFetch`
  unconditionally sets `Content-Type: application/json` whenever a
  body is present, which would have corrupted a multipart upload (a
  browser's `fetch()` needs to set its own `Content-Type` with the
  `boundary=...` it generates for a `FormData` body; forcing JSON here
  would mean `FileInterceptor` never sees a real file field). Also adds
  `importAssessmentFile` and the `ImportResult` type.
- Results screen shows the exact response shape `AssessmentsService.importFile`
  already returns (total/imported/valid/warning/invalid/duplicate
  counts, unmapped columns) plus a client-side "Download error report"
  button — the API already returns the full CSV content inline in the
  JSON response (`errorReportCsv`), so this is a plain `Blob`/`<a
  download>` in the browser, no extra endpoint needed.
- Verified live via a real signed-in Playwright browser session against
  a real fresh `DRAFT` assessment: uploaded a deliberately mixed CSV (2
  clean rows, 1 duplicate `Control_ID`, 1 unmatched `Control_ID`),
  confirmed the results screen showed exactly `4` total / `2` imported
  / `3` valid / `0` warnings / `1` invalid / `1` duplicate — matching
  hand-verified expectations, not just "some numbers appeared" — and
  confirmed the unmapped-columns list correctly named every canonical
  column this test file didn't include. Also verified the error-report
  download itself: triggered a real browser download, read the
  downloaded file back, and confirmed its two rows correctly identified
  the invalid row (unmatched `Control_ID`) and the duplicate row (with
  a back-reference to the original row number) — not merely that a
  download happened, but that its content was right. Test assessment
  soft-deleted afterward.
- Full verification: `npx turbo run type-check test build` (27/27),
  `npm run test:e2e` (42/42), `npm run lint` clean, plus the live
  browser verification above (upload → results → error-report download,
  content checked at every step).

This closes out every item from Next Steps' "Frontend follow-ups from
Phase 10" bullet — all four (framework navigation, assessment-taking,
risk register, Excel import wizard) are now built and live-verified.

### Frontend test coverage: React Testing Library component tests
`apps/web` had the RTL/Jest dependencies installed since Phase 1
scaffolding but zero test files and no Jest config. Added both.
- New `apps/web/jest.config.js` (using `next/jest`, which handles the
  same SWC transform/CSS/image mocks `next dev`/`next build` use, so
  component tests see the app the same way it actually runs) and
  `jest.setup.js` (`@testing-library/jest-dom` matchers).
- 5 new test files, 17 tests total, all real assertions (not padding):
  `KpiCard.test.tsx`, `RiskLevelBadge.test.tsx`,
  `NavigationTree.test.tsx`, `maturity-scale.test.ts` (the pure
  `maturityBand`/`riskLevelColor` functions), and a page-level test for
  `RisksPage` covering the empty-filter state, the error state, and the
  write-role-gated "New Risk" button.
- **Two real environment gotchas found and fixed, not just "tests
  pass"**:
  1. `tsc --noEmit` failed on every `toBeInTheDocument()`/`toHaveStyle()`
     call — `@testing-library/jest-dom` ships its own types rather than
     via a separate `@types/*` package, so TypeScript's default
     "auto-include every `@types/*` package" behavior never picks it up.
     Fixed with a one-line ambient reference
     (`apps/web/types/jest.d.ts`), not a broader `tsconfig.json`
     `types` array (which would have needed every other implicit
     `@types/*` package listed explicitly too).
  2. A page-level test (`RisksPage`) needs to import the page file
     directly — but that page also exports `getServerSideProps`, which
     imports `lib/auth` → `next-auth/next` → `next-auth/core` →
     `openid-client` → `jose` (ESM-only) at module load time, which
     Jest's default transform can't parse, breaking the whole test
     file with a cryptic `SyntaxError: Unexpected token 'export'`
     several layers down a dependency chain the test itself never
     touches. Fixed by mocking `lib/auth` in that one test file rather
     than widening Jest's `transformIgnorePatterns` project-wide to
     parse a dependency chain no component test actually exercises.
  3. **A more serious one, only caught by running the real production
     build, not `next lint`/`tsc`/`jest` individually**: that same
     page-level test file was originally colocated at
     `pages/risks/index.test.tsx`, right next to the page it tests.
     Next.js's pages-router treats *any* `.tsx` file under `pages/` as
     a real route by filename alone — it doesn't care about a `.test.`
     infix — so `next build` tried to compile the test file as the
     page at `/risks/index.test`, and failed outright on the
     Jest-only `jest.mock` global (`ReferenceError: jest is not
     defined`) baked into the webpack bundle. This would have silently
     broken every future production build the moment a page-level test
     existed, and neither `tsc --noEmit` nor `jest` alone would have
     caught it — only `next build` does, since it's specifically
     `pages/`'s own file-based routing that's unsafe here, not anything
     TypeScript or Jest checks. Fixed by moving page-level tests to a
     mirrored `apps/web/__tests__/pages/` tree instead of colocating
     them — component tests aren't affected (`components/` isn't
     special to Next's router), so those stay colocated as normal.
- Full verification: `npx turbo run type-check test build` across the
  whole monorepo (27/27 — this is exactly what caught gotcha #3 above;
  running only `apps/web`'s own `test`/`type-check` scripts in
  isolation would not have), `npm run test:e2e` (42/42, unaffected),
  `npm run lint` clean.

### Frontend test coverage: a persisted Playwright E2E suite
The other half of the "zero automated tests in `apps/web`" gap — the
`@playwright/test` dependency and `test:e2e` script existed since Phase
1 scaffolding, but no spec file had ever been written and nothing ran
it in CI.
- New `apps/web/playwright.config.ts`: a two-entry `webServer` array
  (`node dist/main` for `apps/api`, `npm run start` for `apps/web`)
  drives real HTTP servers against the real Postgres, not a mocked
  stack — the same "test the real thing" discipline the API's own
  e2e-spec suite already follows. `reuseExistingServer: !process.env.CI`
  lets a developer keep both servers running locally across repeated
  runs; CI always starts fresh.
- `apps/web/e2e/global-setup.ts` signs in once per demo role
  (`admin@example.local`, `ciso@example.local`, `viewer@example.local`)
  through the real credentials → NextAuth → API round trip and saves a
  Playwright `storageState` per role, so every spec reuses an
  authenticated session instead of re-logging-in per test.
- 4 spec files, 9 tests, covering flows a unit/component test can't:
  `auth.spec.ts` (invalid credentials, valid sign-in, an
  unauthenticated visitor bounced from `/dashboard`), `dashboard.spec.ts`
  (KPI cards + nav links, navigating to Risks, sign-out), `risks.spec.ts`
  (a `READ_ONLY_VIEWER` can't see "New Risk"; a full admin lifecycle —
  create, edit status, delete — against the real API, cleaning up after
  itself), and `frameworks.spec.ts` (list → detail → the
  `NavigationTree`'s `<details>` stay open at depth 0).
- Small accessibility fix that was also a testability blocker:
  `risks/new.tsx` and `risks/[id].tsx`'s form `<label>`s had no
  `htmlFor`/`id` pairing (unlike `auth/signin.tsx`, which already did
  this correctly) — `getByLabel()` can't resolve an unassociated label,
  in Playwright or in a screen reader. Wired up `htmlFor`/`id` on every
  field in both forms.
- **Real gotchas found and fixed, not just "tests pass"**:
  1. Jest's default `testMatch` picks up any `*.spec.ts`, which is also
     Playwright's own spec-file convention — `apps/web`'s existing
     `jest.config.js` already anticipated this with a
     `testPathIgnorePatterns` entry for a `test-e2e/` folder that was
     never actually the folder name used here (`e2e/`). Fixed by
     pointing the ignore pattern at the real directory.
  2. The API's health check is deliberately excluded from the global
     `api/v1` prefix (`app.setGlobalPrefix('api/v1', { exclude:
     ['health'] })`, for orchestrator probes) and lives at bare
     `/health`, not `/api/v1/health`. `webServer`'s reuse check first
     polled `/api/v1` and treated its 404 as "not ready," which made
     Playwright try to start a second `node dist/main` on an
     already-bound port and crash with `EADDRINUSE`. Fixed by pointing
     the health check at the real `/health` route.
  3. **The one worth remembering**: `next start` reads its build
     manifest and embeds the build ID into every page's SSR'd HTML once,
     at process boot — it does not notice a later `next build`
     overwriting `.next` on disk. Rebuilding `apps/web` without
     restarting the already-running `next start` process produces a
     server that serves *old* HTML referencing a build ID whose chunk
     files no longer exist on disk (404s served as `text/html`, which
     the browser then refuses to execute as script — a strict-MIME-type
     console error, not a thrown exception). The visible symptom is
     stranger than the cause: React never finishes hydrating, so click
     handlers silently do nothing — a "Sign Out" button and a "Save
     Changes" button that appear to do absolutely nothing, with no
     error anywhere in sight. This cost real debugging time (a `401` on
     `/api/auth/callback/credentials` in one repro was itself just
     `authorize()` returning `null` for an unrelated login-throttle
     `429`, a second rabbit hole layered on top of the first). Not a
     code bug — an operational rule: **restart `next start` after every
     rebuild**, which is exactly what CI's `web-e2e` job does by
     construction (build, then start, in the same job run, only once).
  4. The login endpoint's real `@Throttle({ limit: 5, ttl: 60_000 })` (see
     Post-Phase-17 Hardening above) is keyed per IP across every login
     attempt, not per account — a single CI run of this suite makes
     exactly 5 login calls (3 in `global-setup`, 2 in `auth.spec.ts`),
     right at the boundary. Repeatedly re-running the suite locally
     within the same 60-second window reproduces real 429s. Worth
     knowing before adding a 4th demo-user login or another
     login-exercising spec — either would push a single CI run over the
     limit.
- New CI job `web-e2e` in `.github/workflows/ci.yml`: its own Postgres
  service, migrate + seed, `turbo run build` for both `@cmmp/api` and
  `@cmmp/web`, `playwright install --with-deps chromium` (this
  sandbox's pre-installed Chromium doesn't exist on a GitHub-hosted
  runner), then `npm run test:e2e --workspace=@cmmp/web`; uploads the
  HTML report as an artifact on every run (`if: always()`) since a
  failure's trace is far more useful than its log line.
- `apps/web/e2e/.auth/*.json` (the saved storage states — real, if
  short-lived, session tokens) and `apps/web/playwright-report/` /
  `apps/web/test-results/` are gitignored, not committed.
- Full verification: `npx turbo run type-check test build` (27/27,
  unaffected — the new spec files are excluded from Jest by gotcha #1
  above, but still typecheck cleanly under `apps/web/tsconfig.json`'s
  `**/*.ts`/`**/*.tsx` globs against `@playwright/test`'s own types),
  `npx turbo run lint` clean, `npm run test:e2e` for `@cmmp/api` (42/42,
  unaffected), and — after learning gotcha #3 the hard way — a final
  clean `node dist/main` + `npm run start` + `npx playwright test` run
  against a genuinely fresh build: **9/9 passing**.

### LLM-assisted column mapping + import wizard preview step
Closes the `columnMapping` override gap flagged above: `POST /assessments/:id/import`
only ever auto-mapped columns, with no way to pass a manual override and no way to
see what would happen before committing.
- `apps/api/src/assessments/import-mapping/llm-client.ts`: a provider-agnostic
  `LlmClient` interface plus an `HttpLlmClient` targeting any OpenAI-compatible
  `/chat/completions` endpoint (OpenRouter, Together, Groq, or a self-hosted
  Ollama/vLLM later) — `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` env vars, defaulting
  to `openrouter/free` (OpenRouter's own router-level free entry point, which
  picks among whatever's currently free rather than naming one model — a named
  free Hermes slot was the first default here, and it was delisted from
  OpenRouter's free tier within weeks of being written, which is exactly the
  churn this default is chosen to survive; Groq's free tier, real named
  Llama/Mixtral/Qwen models, no card required, is a documented fallback via the
  same env vars). `resolveLlmClient()` returns `null`
  (not a throwing stub) when no key is configured, wired through Nest via a
  `LLM_CLIENT` DI token (an interface has no runtime identity Nest can use as a
  token by itself) so the whole feature is optional infrastructure, not a hard
  dependency — the platform works identically with or without a key set.
- `ImportMappingSuggesterService` (`mapping-suggester.service.ts`): given the
  file's headers, a few sample rows, and the canonical columns `autoMapColumns`
  couldn't resolve, asks the LLM for a JSON mapping and validates every suggestion
  before trusting it — a suggested field must actually be one of the unmapped
  canonical columns, and its value must be one of the file's real headers, or it's
  dropped. Any client error, timeout (15s), or unparseable response degrades to an
  empty mapping rather than failing the import — this is a best-effort assist,
  never a blocker. 8 unit tests with a fake `LlmClient` cover the accept/reject/
  degrade paths, including a model that ignores "JSON only" instructions and wraps
  its answer in prose.
- New `POST /assessments/:id/import/preview` endpoint: parses the upload, auto-maps,
  asks the mapping assistant to fill any gaps, and returns the resulting mapping +
  validation counts (total/valid/warning/invalid/duplicate) — without writing
  anything to the database. `POST /assessments/:id/import` (the real one) now
  accepts an optional `columnMapping` form field (a JSON object, validated against
  the real canonical-column list and rejected with a clear `BadRequestException`
  if it names an unknown field or a non-string value) that overrides auto-mapping.
- Frontend (`assessments/[id]/import.tsx`): the wizard gained a step between
  "select file" and "see results" — upload triggers a preview call, then an
  editable table shows every canonical column with a `<select>` of the file's
  actual headers, pre-filled from auto-mapping and any LLM suggestion (marked with
  a ✨ and a "AI-assisted mapping enabled" badge when the assistant is configured).
  The user can correct any field before confirming, at which point the real import
  runs against exactly the mapping shown.
- Small accessibility fix that doubled as a testability fix: `risks/new.tsx` and
  `risks/[id].tsx`'s form `<label>`s had no `htmlFor`/`id` pairing (unlike
  `auth/signin.tsx`, which already did this correctly) — `getByLabel()` can't
  resolve an unassociated label in Playwright or a screen reader alike. Wired up
  `htmlFor`/`id` on every field in both forms.
- New e2e spec `e2e/import.spec.ts`: since there's no UI to create an assessment
  (only `POST /assessments`), it creates its own DRAFT fixture by calling the real
  API directly — getting its access token from NextAuth's own `/api/auth/session`
  endpoint via `page.request` (which reuses the browser context's session cookie)
  rather than logging in again, since the login endpoint's real 5/min throttle is
  shared across the whole suite and was already fully spent by `global-setup` +
  `auth.spec.ts`. Deletes the fixture assessment afterward.
- No real `LLM_API_KEY` was available in this sandbox to exercise an actual model
  call end-to-end; `isConfigured` reports `false` and the suggester short-circuits
  to auto-mapping-only in every test and local run here. The client, prompt, and
  response-validation logic are covered by the 8 unit tests against a fake client
  instead — genuinely exercising the real endpoint is the one piece a future
  session with real credentials should do before calling this fully proven.
- Full verification: `npx turbo run type-check test build lint` (29/29), `npm run
  test:e2e` for `@cmmp/api` (42/42), and a full Playwright run against a real
  build — **10/10 passing**, including the new import spec.

### LLM client rework: any wire format, a real fallback chain, Claude as a paid tier
Follow-up to the section above, from a live `WebSearch` check plus a direct ask to
support "any AI model format," not just OpenAI-shaped ones:
- **A real bug caught by that search**: the default model (a named free Hermes slot
  on OpenRouter) had already been delisted from OpenRouter's free tier within weeks
  of being written. Switched the default to `openrouter/free` — OpenRouter's own
  router-level free entry point, which picks among whatever's currently free
  instead of naming one model that can be delisted out from under it.
- `llm-client.ts` now supports two wire formats behind the same `LlmClient`
  interface — `OpenAiCompatibleClient` (unchanged, raw `fetch`, any
  OpenAI-shaped `/chat/completions` endpoint) and a new `AnthropicMessagesClient`
  using the **official `@anthropic-ai/sdk`** (Claude doesn't speak the OpenAI wire
  format, and the project's `claude-api` skill is explicit that Claude calls go
  through the official SDK, not raw HTTP, whenever one exists for the language).
  Structured JSON comes from `output_config.format` (a plain JSON Schema) rather
  than the SDK's Zod-based `zodOutputFormat()` helper — that helper is typed
  against zod's newer `zod/v4` core specifically, a different type identity than
  the classic `zod` import already used everywhere else in this repo, and it
  type-checked under a plain `tsc` run but failed under `ts-jest` (a real,
  reproduced tooling inconsistency, not a hunch) — not worth the friction for a
  schema this loose, when the actual per-key/value validation already lives one
  layer up in `ImportMappingSuggesterService.parseAndValidate` regardless of
  which client produced the text.
- **A real, ordered fallback chain** (`FallbackLlmClient`): tries each configured
  provider in sequence, only advancing on an actual failure (error/timeout), and
  propagates the last error only once every provider in the chain has failed —
  at which point the existing catch-in-`suggestMapping` degrades to auto-mapping
  as it always did. Configured via numbered env slots —
  `LLM_PROVIDER_<n>_API_KEY`/`_FORMAT`/`_BASE_URL`/`_MODEL` (n = 1-5) — where
  slots 1-3 have sensible defaults for their remaining fields (1: OpenRouter free,
  2: Groq free, 3: Claude Opus 5 — the `claude-api` skill's non-negotiable default
  model absent an explicit request for a different one) so setting just the three
  API keys is enough to get a three-provider free→free→paid chain with zero other
  config; slots 4-5 exist for a fully custom provider and need every field spelled
  out explicitly. Exactly one configured slot returns that client directly (no
  pointless single-entry chain); zero slots still returns `null`, same
  graceful-degradation contract as before.
- 14 new unit tests (`llm-client.spec.ts`): `FallbackLlmClient` trying the next
  client only on failure and never calling a later one once an earlier one
  succeeds; `OpenAiCompatibleClient` posting the right shape and surfacing a
  non-2xx status; `AnthropicMessagesClient` extracting the text block and
  rejecting a contentless (e.g. refused) response; and `resolveLlmClient`'s env-var
  scanning — zero slots, one slot (direct, unwrapped), multiple slots (wrapped in
  a chain), an explicit format override on a defaulted slot, and a slot beyond the
  defaulted ones (4/5) that's skipped when nothing overrides its format but
  activates once all three fields are given explicitly.
- Full verification: `npx turbo run type-check test build lint` (all green),
  `npm run test:e2e` for `@cmmp/api` (42/42, unaffected). Still no real
  `LLM_API_KEY`/`ANTHROPIC_API_KEY` available in this sandbox to exercise an
  actual model call end-to-end for any of the three providers — same standing gap
  as the section above, now spanning three providers instead of one.

### UI polish: shared navigation, consistent chrome, and two real CSS bugs
Every top-level page (dashboard, risks, assessments, frameworks) had hand-rolled
its own header, and only `dashboard.tsx`'s actually linked to the other three —
navigating from Risks to Frameworks meant a detour back through the dashboard.
- New `apps/web/components/layout/AppHeader.tsx`: one persistent top bar (logo,
  active-aware nav to Dashboard/Risks/Assessments/Frameworks via `lucide-react`
  icons, user email, sign out) used on every signed-in page, including
  detail/sub-pages — which keep their own `BackLink` breadcrumb underneath it
  (`components/layout/BackLink.tsx`) rather than losing the global nav entirely,
  a standard app-bar-plus-breadcrumb layout. `components/layout/EmptyState.tsx`
  replaces five near-duplicate "nothing here" `<div>`s with one consistent,
  icon-led empty state.
- **Two real, pre-existing cosmetic bugs found while doing this, not introduced
  by it** — both from `globals.css`'s unused shadcn/ui scaffolding (CSS variables
  and base-layer heading/link styles nothing in the app actually opted into):
  1. A blanket `a { @apply underline underline-offset-4; }` base rule meant every
     single link in the app — nav items, "New Risk", entire card-as-link rows —
     rendered underlined, since not one of them overrides it. Removed; this is an
     app UI, not prose content that needs inline-link affordance.
  2. `h2 { @apply border-b pb-2 ...; }` put an unwanted horizontal rule under
     every in-page `<h2>` (framework card titles, "Function Detail", "Import
     Results", "Review Column Mapping", the landing page's "Welcome to CMMP") —
     intended for a docs-style page with real section dividers, not small card
     headings. Removed the border, kept the rest.
  Both were visible in every screenshot taken before this pass and in none after
  — confirmed via live Playwright screenshots of the dashboard, risks, frameworks,
  and framework-detail pages before/after.
- Existing Recharts-based dashboard charts (`FunctionGapBarChart`,
  `MaturityDistributionChart`, etc.) were left untouched — they already follow
  good practice (direct labels, a recessive grid, status-reserved colors, a
  single hue per series) and needed no changes. One thing checked and ruled
  out, not fixed: a screenshot taken immediately on page navigation sometimes
  shows the two bar charts empty (axes only, no bars) — confirmed via a
  side-by-side screenshot with a 1-second settle delay that this is purely a
  `ResponsiveContainer`-measures-after-first-paint timing artifact of
  screenshotting instantly, not a real bug a person browsing normally would ever
  see (or that existed before this session's changes — the same components,
  untouched).
- Full verification: `npx turbo run type-check test build lint` (29/29 — the RTL
  page test needed a `next/router` mock added alongside its existing `lib/auth`
  mock, since `AppHeader` calls `useRouter()` to highlight the active nav item),
  and a full Playwright run against a genuinely fresh build — **10/10 passing**.

### NIST CSF 2.0 fixture data: partial verification against the official structure
Next Steps previously flagged that `packages/database/prisma/fixtures/nist-csf-2.0.json`
was reproduced from training-data knowledge, never actually checked against NIST's
own CSWP 29 publication. `WebFetch` was blocked in this sandbox for every domain
tried (`nist.gov`, `csrc.nist.gov`, `csf.tools`, even `wikipedia.org` — general
egress, not a NIST-specific block), but `WebSearch` worked and returned enough of
the official structure, corroborated across two independent searches, to check the
taxonomy level that matters most for navigation, scoring, and rollups:
- All 6 Functions (GV, ID, PR, DE, RS, RC) — codes and names match.
- All 22 Categories' codes, names, and per-Function counts (GV=6, ID=3, PR=5,
  DE=2, RS=4, RC=2) match exactly, Govern's included (GV.OC, GV.RM, GV.RR, GV.PO,
  GV.OV, GV.SC — the one set not in the first search's summarized answer, checked
  again explicitly).
- **Not verified**: the outcome-statement text of the 106 individual Subcategories
  — that needs the actual CSWP 29 PDF/JSON content fetched, which this session's
  network access couldn't reach. A future session with working `WebFetch` access
  to NIST's own reference tool (or the PDF) should finish this before treating the
  fixture as compliance-grade at the Subcategory level.

## Next Steps

What's left, roughly in priority order. Every item from
`docs/security-architecture.md`'s own priority list — Docker
verification, rate limiting, the JWT_SECRET fail-closed fix, token
revocation on logout + refresh, extending the tenant-isolation e2e
pattern, and the Dependabot/`npm audit` triage — is now done above (the
triage closed with one real fix (`multer`) and a documented, deliberate
punt on the rest pending dedicated major-version-bump work):

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
2. All four Phase 10 frontend follow-ups (framework navigation,
   assessment-taking, risk register, Excel import wizard) are now done
   — see Post-Phase-17 Feature Work above, and the import wizard's
   `columnMapping` override + preview step (also flagged here previously)
   is done too. What's left from that same area: extracting the
   dashboard components into `@cmmp/ui` if/when a second app or page
   needs them (not worth the abstraction for one dashboard page yet);
   the assessment-taking flow only covers current/target maturity, not
   the extended per-item metadata fields (`rationale`/`evidence`/
   `owner*`/etc.), no UI yet.
3. Finish the NIST CSF 2.0 fixture verification — the Function/Category
   taxonomy is now confirmed against the official structure (see
   Post-Phase-17 Feature Work above), but the 106 Subcategories'
   outcome-statement text is still unverified; this session's `WebFetch`
   couldn't reach NIST's own reference tool or the CSWP 29 PDF to check
   it.
4. Exercise the new LLM-assisted column-mapping feature
   (`apps/api/src/assessments/import-mapping/`) against a real model —
   this session had no `LLM_API_KEY`/`ANTHROPIC_API_KEY` for any of the
   three configured providers (OpenRouter free, Groq free, Claude), so
   it's covered by unit tests against fakes/mocks only, never a real
   call to any of them — see that section's own writeup.
5. **Get real GitHub Dependabot alert data.** This session triaged what
   `npm audit` could see (30 findings; `multer`'s 5 fixed, see
   Post-Phase-17 Hardening above) but never had tool access to GitHub's
   own Dependabot alerts API, so the gap between GitHub's "72
   vulnerabilities" banner and `npm audit`'s ~30 was never actually
   closed — only reasoned about (likely the `docker`/`github-actions`
   ecosystems `dependabot.yml` also watches, which `npm audit` can't
   see at all). Whoever has GitHub UI/API access should pull the real
   list before assuming the `npm audit`-visible findings are the whole
   picture.
6. The large, deliberately-deferred major-version bumps themselves:
   Next.js 14→16 (`apps/web`, user-facing, worth prioritizing first) and
   the NestJS 10→12 ecosystem (`@nestjs/core`/`platform-express`/
   `common`/`config`/`swagger`/`testing`/`cli`, `turbo`). Both need their
   own scoped PR with real testing afterward (a browser pass for
   Next.js, the full test suite plus manual verification for NestJS) —
   not something to do blind in an autonomous pass.

## Contact & Questions

- See CONTRIBUTING.md for contribution guidelines
- See SECURITY.md for security reporting
- Check docs/ for detailed documentation
