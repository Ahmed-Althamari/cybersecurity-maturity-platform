# Cybersecurity Maturity Management Platform (CMMP)

An enterprise-grade cybersecurity maturity assessment and management platform designed for CISOs, security architects, GRC teams, and risk managers to assess, measure, visualize, track, and improve organizational cybersecurity maturity.

## Overview

CMMP is a comprehensive platform that enables organizations to:

- Create cybersecurity assessments using industry frameworks (NIST CSF 2.0, ISO 27001, CIS Controls, etc.)
- Upload assessment data via Excel/XLSX/CSV
- Score cybersecurity maturity across 6 levels (Initial → Optimised)
- Visualize maturity posture through executive dashboards
- Identify security capability gaps
- Generate prioritized remediation initiatives
- Track cybersecurity roadmap progress
- Maintain audit trail of all security decisions
- Analyze any uploaded spreadsheet for automatic charts/insights, either
  fully offline (AutoViz, zero LLM calls — for data that must never
  leave the platform) or via an AI-powered natural-language mode
  (PandasAI) — see [Data Analysis](#data-analysis) below

## Architecture

### Technology Stack

**Frontend:**
- Next.js 14+ with TypeScript
- React 18+
- Tailwind CSS
- shadcn/ui
- Recharts for visualizations

**Backend:**
- NestJS
- Node.js 18+
- TypeScript
- Express

**Database:**
- PostgreSQL 16
- Prisma ORM

**Data Analysis Service** (`services/data-analysis`, a separate microservice, not part of the Node/npm workspaces above):
- Python 3.11, FastAPI
- [AutoViz](https://github.com/AutoViML/AutoViz) — the "local"/zero-LLM analysis mode
- [PandasAI](https://github.com/sinaptik-ai/pandas-ai) 3.0.0 + LiteLLM — the "ai" mode

**Infrastructure:**
- Docker & Docker Compose (`api`/`web` images written, never actually
  built/run — see `docs/DEPLOYMENT.md`; `data-analysis`'s image is new
  alongside it, same caveat)
- GitHub Actions

### Repository Structure

```
cybersecurity-maturity-platform/
├── apps/
│   ├── web/                    # Next.js frontend application
│   └── api/                    # NestJS backend API
├── packages/
│   ├── ui/                     # Shared React components
│   ├── database/               # Prisma schema & migrations
│   ├── security/               # Security utilities & middleware
│   ├── framework-engine/       # Framework configuration engine
│   ├── scoring-engine/         # Maturity scoring calculations
│   ├── shared/                 # Shared types & utilities
│   ├── import-engine/          # Excel/CSV import logic
│   └── reporting/              # Report generation
├── services/
│   └── data-analysis/          # Python/FastAPI microservice (PandasAI + AutoViz) — not an npm workspace
├── infrastructure/             # Docker & deployment configs
├── docs/                       # Architecture & design docs
├── .github/workflows/          # CI/CD pipelines
├── docker-compose.yml          # Development environment
└── package.json               # Monorepo root configuration
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- A PostgreSQL 16 instance (local install or any reachable server) —
  only Docker/Docker Compose if going that route instead (Option 2 below)
- Git

### Setup

```bash
git clone https://github.com/Ahmed-Althamari/cybersecurity-maturity-platform.git
cd cybersecurity-maturity-platform
cp .env.example .env   # edit if your local Postgres uses different credentials
```

### Option 1: Local Development (verified, recommended)

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed          # optional — demo tenant, users, a scored assessment
npm run dev               # starts every app/package's dev script in parallel via Turborepo
```

Web UI at http://localhost:3000, API at http://localhost:3001.

### Option 2: Docker Compose (written, not yet verified end-to-end)

```bash
cp .env.example .env      # edit JWT_SECRET / NEXTAUTH_SECRET to real values first
npm run docker:build
npm run docker:up
docker compose exec api sh -c "cd packages/database && npx prisma migrate deploy"
```

Brings up four services: `postgres`, `api`, `web`, and `data-analysis`
(the isolated Python microservice behind the Data Analysis feature —
see [Data Analysis](#data-analysis) above; internal-network only, never
published on a host port).

**These Dockerfiles and this compose file have never actually been
built or run** — the session that wrote them had no Docker daemon
available. See `docs/DEPLOYMENT.md` for exactly what was and wasn't
verified before relying on this path.

## Development Workflow

### Available Scripts

```bash
# Development (all via Turborepo — use --filter=@cmmp/api or --filter=@cmmp/web
# directly if you only want one app, e.g. `npx turbo run dev --filter=@cmmp/web`)
npm run dev              # Start every app/package's dev script in parallel
npm run build            # Build all workspaces
npm run start            # Start built apps (production mode, after `npm run build`)

# Testing
npm run test             # Unit tests (mocked, fast) across every workspace
npm run test:watch       # Unit tests in watch mode
npm run test:e2e         # apps/api's real end-to-end suite against a live Postgres
                          # (requires DATABASE_URL pointing at a real, migrated DB)

# Code Quality
npm run lint             # ESLint across every workspace
npm run type-check       # TypeScript type checking across every workspace
npm run format           # Format code with Prettier

# Database
npm run db:generate      # Generate the Prisma client
npm run db:migrate       # Apply migrations (non-interactive — for CI/deploys)
npm run db:seed          # Seed demo tenant, users, and a scored assessment
npm run db:studio        # Open Prisma Studio for database inspection

# Security
npm run security:audit   # npm audit --audit-level=moderate

# Docker (see the caveat above and docs/DEPLOYMENT.md)
npm run docker:build
npm run docker:up
npm run docker:down
```

### Database Management

```bash
# Create new migration
cd apps/api
npx prisma migrate dev --name migration_name

# Push schema changes to database
npx prisma db push

# Generate Prisma Client
npx prisma generate

# Open Prisma Studio
npx prisma studio
```

## Demo Accounts

After `npm run db:seed`, four demo users exist, all with password
`DemoPassword123!` (override via the `DEMO_USER_PASSWORD` env var):

| Email | Role |
|---|---|
| `admin@example.local` | Platform Administrator |
| `ciso@example.local` | CISO |
| `assessor@example.local` | Assessor |
| `viewer@example.local` | Read-Only Viewer |

**Note**: These credentials are for local development only. Never use in production.

## Project Structure Details

### `/apps/web`
Next.js 14 frontend application with:
- Pages for dashboard, assessments, frameworks, risks, roadmap
- React components built with shadcn/ui
- Tailwind CSS styling
- Server-side rendering for better performance
- API integration with backend

### `/apps/api`
NestJS backend API with:
- RESTful endpoints for assessment, risk, remediation, and audit management
- JWT authentication (`@nestjs/jwt` + Passport) and role-based
  authorization (`apps/web`'s NextAuth.js is a separate, frontend-only
  layer that calls this API's `/auth/login` — the API itself has no
  OIDC/SSO integration)
- Business logic delegating to `@cmmp/scoring-engine`/`@cmmp/framework-engine`
- Integration with Prisma ORM
- Rate limiting (`@nestjs/throttler`) — app-wide default, with a much
  tighter limit on login specifically (see `docs/security-architecture.md`)

### `/packages/database`
Prisma-managed database layer:
- Schema definitions for all entities
- Database migrations
- Seed scripts for demo data

### `/packages/framework-engine`
Framework-agnostic assessment engine:
- NIST CSF 2.0 framework configuration
- Extensible framework loader
- Support for future frameworks (ISO 27001, CIS, etc.)

### `/packages/scoring-engine`
Maturity scoring calculations:
- Item-level maturity calculation
- Category & function aggregation
- Organization-wide scoring
- Gap analysis

### `/packages/security`, `/packages/reporting`, `/packages/ui`
Present in the workspace but currently **unused** — nothing in
`apps/api` or `apps/web` imports any of them. Input validation happens
via `class-validator` DTOs directly in `apps/api`; audit logging lives
in `apps/api/src/audit`; tenant isolation is enforced per-service, not
via a shared middleware package. Treat these three as unbuilt
scaffolding, not working infrastructure.

### `/services/data-analysis`
Standalone Python/FastAPI microservice — a separate language runtime,
not an npm workspace, built/deployed as its own Docker image:
- `POST /analyze` — accepts a spreadsheet (.xlsx/.xls/.csv) plus a
  `mode` (`local` or `ai`) and an optional `question`
- `analysis/local_mode.py` — AutoViz, zero LLM/network calls
- `analysis/ai_mode.py` + `analysis/llm_client.py` — PandasAI, backed by
  the same `LLM_PROVIDER_<n>_*` fallback-chain scheme as the import
  wizard's column-mapping assistant
- Called only by `apps/api/src/data-analysis/` (a thin proxy module), on
  the internal Docker network — never reachable directly from the
  browser or published on a host port
- Own `pytest` suite (19 tests) — not run by any `npm run test*` script,
  since it isn't an npm workspace; see `services/data-analysis/tests/`

## Data Analysis

A new, deliberately isolated feature for analyzing *any* uploaded
spreadsheet — not just an assessment import — with automatic charts and
insights. Full architectural detail lives in `docs/architecture.md`'s
"Data Analysis Service" section; this is the how-it-works summary.

**Two modes, picked per upload:**

| Mode | What runs | Data leaves the platform? | Requires configuration? |
|---|---|---|---|
| `local` (Local / Privacy-Preserving) | [AutoViz](https://github.com/AutoViML/AutoViz) generates a fixed set of charts (bar plots, distributions, a correlation heatmap, violin plots) entirely in-process | **Never** — zero LLM calls, zero network calls of any kind | No |
| `ai` (AI-Powered) | [PandasAI](https://github.com/sinaptik-ai/pandas-ai) turns a natural-language question into code run against your data, returning a text answer, a table, or a chart | Yes — the data is sent to whichever LLM provider is configured | Yes — at least one `LLM_PROVIDER_<n>_API_KEY` (see Configuration below); without one, `ai` mode returns a clear error instead of silently failing |

**How a request flows:**

1. `apps/web/pages/data-analysis/index.tsx` — pick a mode, upload a
   file, optionally ask a question (`ai` mode only)
2. `apps/api`'s `DataAnalysisController`/`DataAnalysisService` —
   authenticates the request, then proxies the same multipart upload to
   the Python service over the internal network
3. `services/data-analysis`'s `POST /analyze` — runs AutoViz or
   PandasAI depending on `mode`, returns rows/columns/charts/answer as
   JSON

**Reusing the LLM fallback chain**: `ai` mode's `LLM_PROVIDER_<n>_*` env
vars are the exact same ones the Excel import wizard's LLM-assisted
column-mapping assistant already reads (see Configuration below) —
configuring credentials once enables both features, tried in the same
provider order (free tiers first, a paid tier last).

## Configuration

### Environment Variables

See `.env.example` for the full list and `docs/DEPLOYMENT.md`'s
Configuration table for exactly which variables the running code
actually reads (`.env.example` includes several — SMTP, AWS, rate
limiting — that nothing consumes yet). The ones that matter:

```bash
# Database connection
DATABASE_URL=postgresql://user:password@host:5432/database

# Authentication — set real values in any shared/deployed environment;
# JWT_SECRET has a hard-coded fallback if unset (see docs/security-architecture.md)
JWT_SECRET=your-jwt-secret
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000

# API endpoints — API_URL is server-side (NextAuth's own login call),
# NEXT_PUBLIC_API_URL is client-side (the browser) — they differ under Docker,
# see docs/DEPLOYMENT.md
API_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001

# Application
NODE_ENV=development

# Opt-in Swagger UI at /api/docs — off by default
ENABLE_SWAGGER=false

# Optional — powers the import wizard's LLM-assisted column mapping and the
# Data Analysis feature's "ai" mode (see the Data Analysis section above).
# Slot 1-3 have working defaults (OpenRouter free / Groq free / Claude) —
# only the API key needs setting per slot actually used. Leave every slot
# empty and both features still work: mapping falls back to plain
# auto-matching, "ai" mode returns a clear error instead of failing.
LLM_PROVIDER_1_API_KEY=
LLM_PROVIDER_2_API_KEY=
LLM_PROVIDER_3_API_KEY=

# Where apps/api reaches the isolated Data Analysis microservice —
# docker-compose.yml overrides this automatically inside the compose network
DATA_ANALYSIS_SERVICE_URL=http://localhost:8000
```

## API Documentation

### Core Endpoints

```
GET    /health                              - Liveness/readiness probe (no /api/v1 prefix, no auth)

GET    /api/v1/assessments                  - List assessments
POST   /api/v1/assessments                  - Create assessment
GET    /api/v1/assessments/:id              - Get assessment detail
PATCH  /api/v1/assessments/:id              - Update assessment
POST   /api/v1/assessments/:id/import       - Import from Excel/CSV
GET    /api/v1/assessments/:id/results      - Get assessment results
GET    /api/v1/assessments/:id/gaps         - Gap analysis

GET    /api/v1/frameworks                   - List frameworks
GET    /api/v1/frameworks/:id               - Get framework detail

GET    /api/v1/risks                        - List risks
POST   /api/v1/risks                        - Create risk

GET    /api/v1/remediation-initiatives       - List remediation initiatives
POST   /api/v1/remediation-initiatives/generate - Auto-generate initiatives from gaps

GET    /api/v1/dashboard/executive          - Executive dashboard data
GET    /api/v1/dashboard/maturity           - Maturity dashboard data

GET    /api/v1/audit-events                 - Query the audit trail (role-gated)

POST   /api/v1/data-analysis/analyze        - Analyze an uploaded spreadsheet (mode: local | ai)
```

This is a representative subset, not the full route table — see
`docs/architecture.md`'s API Surface section for the complete
controller/role list, or run the API with `ENABLE_SWAGGER=true` and open
`/api/docs` for a live, always-accurate schema of every route.

## Security

See `docs/security-architecture.md` for the full picture, including a
STRIDE threat model and an honest list of what's implemented versus
declared-but-not-built (the top remaining gap: `JWT_SECRET` still falls
back to a hard-coded value if unset, rather than refusing to start).
What's real today:

- Server-side tenant isolation on every query (not client-trusted)
- Role-based access control, enforced per-route
- Parameterized queries throughout (Prisma) — no raw SQL string
  concatenation
- Server-side input validation (`class-validator` DTOs, `whitelist: true`)
- Formula/CSV injection defense on spreadsheet import
- Append-only audit logging with credential redaction
- Rate limiting (`@nestjs/throttler`), with a tight 5/min/IP limit on
  `POST /auth/login` specifically

### Security Scanning

CI/CD pipelines include:
- **SAST** via GitHub CodeQL
- **Dependency scanning** via npm audit & Dependabot
- **Secret scanning** via Gitleaks
- **Container scanning** via Trivy (scans the Docker images from Phase
  15 — the first time they'll actually be built, see the Docker caveat
  above)
- **DAST** via OWASP ZAP (schedule/manual-dispatch only, not on every PR)

## Testing

### Test Coverage

- **`apps/api`**: extensive — a Jest unit-test spec beside every
  service (100+ tests, mocked Prisma), plus a real end-to-end suite
  (`apps/api/test/*.e2e-spec.ts`, Jest + supertest, boots the actual
  `AppModule` against a live Postgres instance) covering auth, tenant
  isolation, and role-based authorization
- **`apps/web`**: React Testing Library component tests
  (`components/**/*.test.tsx`, `__tests__/pages/**`) plus a persisted
  Playwright E2E suite (`e2e/*.spec.ts` — auth, dashboard, risks,
  frameworks, the import wizard)
- **Every `packages/*` engine** (`scoring-engine`, `import-engine`,
  `framework-engine`) has its own thorough unit-test suite — these are
  pure functions, easy to test exhaustively
- **`services/data-analysis`**: 19 `pytest` tests (fallback-chain
  ordering, both analysis modes via fake/stub LLMs — no real network
  calls — and the FastAPI endpoints). Not an npm workspace, so it's not
  covered by any `npm run test*` script — run it directly:
  `cd services/data-analysis && pip install -r requirements.txt && pytest`

```bash
npm run test       # unit tests across every Node workspace
npm run test:e2e   # apps/api's real e2e suite (needs a live, migrated Postgres)
npm run test:e2e --workspace=@cmmp/web   # apps/web's Playwright suite
```

## Documentation

Documentation actually present in `/docs` (plus `SECURITY.md` and
`CONTRIBUTING.md` at the repo root):

- `docs/architecture.md` - System architecture, data model, framework
  model, scoring methodology, API surface, role matrix, and the Data
  Analysis Service
- `docs/security-architecture.md` - Security controls, gaps, and a
  STRIDE threat model
- `docs/DEPLOYMENT.md` - Local dev, Docker Compose (with its caveat),
  configuration reference, CI/CD summary
- `docs/EXCEL_IMPORT_GUIDE.md` - Spreadsheet column format and
  validation rules for the assessment import endpoint
- `docs/IMPLEMENTATION_STATUS.md` - Phase-by-phase build log, ADRs,
  known issues, and next steps — the most detailed and most frequently
  updated document in the repo

## CI/CD Pipeline

GitHub Actions workflows (`.github/workflows/`):

- `ci.yml` - lint, type-check, unit tests, build, and a real Postgres-
  backed e2e job, on every PR and push to `main`
- `security.yml` - CodeQL, Gitleaks, `npm audit`, weekly SBOM
- `container-security.yml` - Trivy scan of all three Docker images
  (`api`, `web`, `data-analysis`)
- `dast.yml` - OWASP ZAP baseline scan (scheduled/manual only)
- `dependabot.yml` - weekly dependency update PRs (npm, github-actions,
  docker)

There is no deployment workflow — no target environment exists yet to
deploy to (see `docs/DEPLOYMENT.md`).

## License

[Specify License - e.g., Apache 2.0, MIT, Commercial]

## Support

For issues, questions, or contributions:
- Create GitHub Issues for bugs and feature requests
- See CONTRIBUTING.md for contribution guidelines
- Architecture Decision Records live in
  `docs/IMPLEMENTATION_STATUS.md`'s "Architecture Decisions" section
  (there's no separate `/docs/adr/` directory)

## Roadmap

### MVP (Current)
- NIST CSF 2.0 assessments
- Excel import
- Executive dashboards
- Risk register
- Remediation roadmap
- Audit logging
- RBAC

### Phase 2
- Multiple frameworks (ISO 27001, CIS, NIST SP 800-53)
- Benchmarking
- Security technology inventory
- Advanced reporting

### Phase 3
- AI-powered recommendations
- API integrations (SIEM, CMDB, ServiceNow)
- Advanced analytics
- ML-based insights

See `docs/IMPLEMENTATION_STATUS.md` for detailed progress tracking.
