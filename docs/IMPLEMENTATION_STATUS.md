# CMMP Implementation Status

Last Updated: 2026-09-04

## Overall Progress

**Phase**: 4 / 17
**Completion**: ~24%

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
- [ ] "NIST CSF configuration structure" as a filled-in JSON config file is
      Phase 5's work (loading the full NIST CSF 2.0 hierarchy through this
      loader) — the seed script still creates the sample hierarchy directly
      via Prisma calls rather than through `POST /frameworks/import`;
      switching it over belongs with the Phase 5 data work so the two land
      together

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

### Phase 5: NIST CSF Framework Data
- [ ] NIST CSF 2.0 complete hierarchy
- [ ] Functions (GOVERN, IDENTIFY, PROTECT, DETECT, RESPOND, RECOVER)
- [ ] Categories (GV.RM, GV.SC, ID.BE, etc.)
- [ ] Subcategories & Outcomes
- [ ] Assessment questions
- [ ] Framework seed data

### Phase 6: Assessment Engine
- [ ] Assessment model
- [ ] Assessment creation
- [ ] Assessment responses
- [ ] Assessment history tracking
- [ ] Draft/submitted states

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
- **Dependency Issue — `exceljs`** (moderate, via nested `uuid`): `npm audit
  fix --force` offers to *downgrade* to `exceljs@3.4.0` to resolve this,
  which would be a backwards step, not a fix. No consuming code exists yet
  (Phase 8 territory) — revisit when `import-engine` is actually built.
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

1. **Generate the first Prisma migration** once a Postgres instance is
   reachable (`docker compose up postgres`, then
   `npm run db:generate && cd packages/database && npx prisma migrate dev`)
2. **Begin Phase 5**: NIST CSF Framework Data — build the full NIST CSF 2.0
   hierarchy (all 6 functions, ~22 categories, ~106 subcategories) as a JSON
   config loadable through `@cmmp/framework-engine`'s
   `parseFrameworkDefinition`, and switch the seed script to load it via
   `POST /frameworks/import` (or the service directly) instead of the
   hand-written Prisma calls it uses today
3. Wire the Next.js frontend to the new `/api/v1/auth/login` and
   `/api/v1/users` endpoints (login page, session/token storage)
4. Fix the repo-wide ESLint plugin gap (see Known Issues)

## Contact & Questions

- See CONTRIBUTING.md for contribution guidelines
- See SECURITY.md for security reporting
- Check docs/ for detailed documentation
