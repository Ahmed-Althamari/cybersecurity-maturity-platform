# CMMP Implementation Status

Last Updated: 2026-09-01

## Overall Progress

**Phase**: 6 / 17
**Completion**: ~35%

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
- [ ] Migrations structure — schema is migration-ready but no migration has
      been generated yet; requires a reachable Postgres instance
      (`npm run db:generate` then `prisma migrate dev` from
      `packages/database`). Not runnable in this sandbox (no Docker/Postgres
      available).

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
- [ ] End-to-end verification against a live database — not possible in this
      sandbox (no Docker/Postgres). Verified instead via: `tsc --noEmit`,
      `nest build`, and Jest unit tests with a mocked `PrismaService`.

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
      (all green); end-to-end verification against a live database is still
      blocked on the same no-Docker/Postgres sandbox limitation noted under
      Phase 2/3

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

### Phase 7: Scoring Engine
- [ ] Maturity level definitions
- [ ] Item scoring calculation
- [ ] Category aggregation
- [ ] Function aggregation
- [ ] Organization-wide scoring
- [ ] Gap analysis
- [ ] Weighted scoring (future)

### Phase 8: Excel Import Engine
- [ ] Excel/CSV parser
- [ ] Column mapping UI
- [ ] Data validation
- [ ] Formula injection prevention
- [ ] Error reporting
- [ ] Bulk import with transaction support

### Phase 9: Dashboard APIs
- [ ] Executive dashboard endpoint
- [ ] Maturity overview endpoint
- [ ] Function maturity endpoint
- [ ] Gap analysis endpoint
- [ ] Risk summary endpoint
- [ ] Roadmap status endpoint

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

None recorded yet

## Next Steps

1. **Generate the first Prisma migration** once a Postgres instance is
   reachable (`docker compose up postgres`, then
   `npm run db:generate && cd packages/database && npx prisma migrate dev`)
2. **Begin Phase 7**: Scoring Engine — item scoring calculation, category/
   function aggregation, org-wide scoring, and gap analysis, now that
   `AssessmentItem.currentMaturity`/`targetMaturity` are real assessor
   input and `Assessment.currentMaturity`/`targetMaturity`/`maturityGap`
   are sitting there null waiting for it (see the Phase 6 scope note above)
3. Wire the Next.js frontend to the new `/api/v1/auth/login`,
   `/api/v1/users`, `/api/v1/frameworks*`, and `/api/v1/assessments*`
   endpoints (login page, session/token storage, framework selection UI,
   an assessment-taking flow)
4. Spot-check the seeded NIST CSF 2.0 outcome text against the official
   NIST CSWP 29 publication (see the Phase 5 data-provenance note above) —
   this sandbox couldn't reach nist.gov directly to verify byte-for-byte
5. Fix the repo-wide ESLint plugin gap (see Known Issues)

## Contact & Questions

- See CONTRIBUTING.md for contribution guidelines
- See SECURITY.md for security reporting
- Check docs/ for detailed documentation
