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
- PostgreSQL 15
- Prisma ORM

**Infrastructure:**
- Docker & Docker Compose
- GitHub Actions
- Redis (caching -- planned, not yet wired into any service; see docs/architecture.md)

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
├── infrastructure/             # Docker & deployment configs
├── docs/                       # Architecture & design docs
├── .github/workflows/          # CI/CD pipelines
├── docker-compose.yml          # Development environment
└── package.json               # Monorepo root configuration
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Docker & Docker Compose
- Git

### Local Development Setup

1. **Clone the repository** (when pushed to GitHub)
```bash
git clone https://github.com/yourusername/cybersecurity-maturity-platform.git
cd cybersecurity-maturity-platform
```

2. **Install dependencies**
```bash
npm install
```

3. **Create environment configuration**
```bash
cp .env.example .env
cp .env.example .env.local
```

4. **Update `.env` for local development** (if needed)
```bash
# Database
DATABASE_URL="postgresql://cmmp_user:cmmp_password@localhost:5432/cmmp_db?schema=public"

# NextAuth
NEXTAUTH_SECRET="your-development-secret-here-min-32-characters"
NEXTAUTH_URL="http://localhost:3000"

# API
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### Option 1: Docker Compose (Recommended)

```bash
# Start all services (PostgreSQL, API, Web)
npm run docker:up

# View logs
docker compose logs -f

# Stop services
npm run docker:down
```

Access:
- **Web UI**: http://localhost:3000
- **API**: http://localhost:3001
- **PostgreSQL**: localhost:5432

### Option 2: Local Development

```bash
# Install dependencies
npm install

# Generate Prisma client
cd apps/api && npx prisma generate

# Run database migrations
npm run db:migrate

# Seed sample data (optional)
npm run db:seed

# Start development servers (in separate terminals)
npm run dev

# In another terminal:
cd apps/web && npm run dev
```

Web UI will be available at http://localhost:3000
API will be available at http://localhost:3001

## Development Workflow

### Available Scripts

```bash
# Development
npm run dev              # Start all services in development mode
npm run dev:web         # Start only web application
npm run dev:api         # Start only API server

# Building
npm run build           # Build all applications
npm run build:web       # Build web application
npm run build:api       # Build API

# Testing
npm run test            # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Generate coverage reports

# Code Quality
npm run lint            # Run ESLint on all packages
npm run type-check      # TypeScript type checking
npm run format          # Format code with Prettier

# Database
npm run db:migrate      # Run database migrations
npm run db:seed         # Seed sample data
npm run db:studio       # Open Prisma Studio for database inspection

# Security
npm run security:audit  # Check for dependency vulnerabilities
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

## Demo Account

For local development, login with:

- **Email**: `admin@example.local`
- **Password**: `DemoPassword123!`

Role: Platform Administrator

**Note**: These credentials are for development only. Never use in production.

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
- RESTful endpoints for assessment management
- Authentication & authorization (NextAuth/OIDC)
- Business logic for scoring and reporting
- Integration with Prisma ORM
- Rate limiting and security middleware

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

### `/packages/security`
Security utilities and middleware:
- Input validation & sanitization
- Output encoding
- CSRF protection
- Tenant isolation enforcement
- Audit logging

## Configuration

### Environment Variables

See `.env.example` for all available options. Key variables:

```bash
# Database connection
DATABASE_URL=postgresql://user:password@host:5432/database

# Authentication
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000

# API endpoints
API_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001

# Application
NODE_ENV=development
LOG_LEVEL=debug

# Security
ENABLE_RATE_LIMITING=true
MAX_FILE_SIZE=52428800
```

## API Documentation

### Core Endpoints

```
GET  /api/v1/assessments           - List assessments
POST /api/v1/assessments           - Create assessment
GET  /api/v1/assessments/:id       - Get assessment detail
PUT  /api/v1/assessments/:id       - Update assessment

GET  /api/v1/frameworks            - List frameworks
GET  /api/v1/frameworks/:id        - Get framework detail

POST /api/v1/assessments/import    - Import from Excel/CSV
GET  /api/v1/assessments/:id/results - Get assessment results

GET  /api/v1/dashboard/executive   - Executive dashboard data
GET  /api/v1/dashboard/maturity    - Maturity dashboard data

GET  /api/v1/risks                 - List security risks
GET  /api/v1/roadmap               - Get remediation roadmap
```

See `docs/api-reference.md` for the complete, real API specification (every
endpoint, grep-verified against the actual controllers, with its exact
role requirement).

## Security

### Security principles actually applied today

- **Tenant isolation** enforced in application code (every query scoped by
  `tenantId`, verified by a dedicated integration test suite)
- **RBAC** via an 11-role model with per-endpoint `@Roles()` gates, plus a
  dashboard-only scope guard for `EXECUTIVE_VIEWER` (a token holding only
  that role is denied everything outside the executive dashboard)
- **Input validation** server-side (`ValidationPipe` with
  `forbidNonWhitelisted`) and Zod schemas for framework definitions
- **Output encoding** via React/Next.js's default JSX escaping
- **Parameterized queries** throughout (Prisma), preventing SQL injection
- **CSV/Excel formula-injection sanitization** on spreadsheet import
- **Audit logging** of all authenticated mutating actions plus login/logout,
  immutable at the database level (a Postgres trigger rejects any `UPDATE`
  against `audit_events` unconditionally, for every role)
- **CSP/HSTS/Referrer-Policy headers** — `helmet` on the API (a maximal
  `default-src 'none'` CSP, since it's a pure JSON API), a tuned CSP plus
  the same headers on the web app (`next.config.js`)
- **Rate limiting on `POST /auth/login`** — per-IP, via `@nestjs/throttler`
  (`AUTH_RATE_LIMIT_MAX_ATTEMPTS`/`AUTH_RATE_LIMIT_WINDOW_MS`)
- **Fail-fast startup check for `JWT_SECRET`/`NEXTAUTH_SECRET`** — both the
  API and web app refuse to start with `NODE_ENV=production` if either
  secret is unset or still equals a known placeholder value, rather than
  silently booting on a publicly-visible fallback
- **Token revocation** — a logout-side blacklist (`RevokedToken`, keyed by
  a `jti` claim, checked on every authenticated request) plus rotation on
  `POST /auth/refresh`; a logged-out token stops working on the very next
  request instead of remaining valid for its full 24h lifetime

### Honest gaps — not yet implemented, despite what older docs/`.env.example` imply

- **`ENABLE_RATE_LIMITING`/`RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX_REQUESTS`
  in `.env.example` are still unread by any code path** — those describe a
  separate, generic API-wide request budget, not the login-specific
  throttle above (which uses its own, different env vars).
- **No CSRF-specific protection** — not currently needed given the
  stateless bearer-token API design, but also not something explicitly
  implemented or tested for.

See `docs/security-architecture.md` for the full picture, including every
other known gap, and `docs/threat-model.md` for the STRIDE analysis these
feed into.

### Security scanning

CI/CD pipelines include:
- **SAST** via GitHub CodeQL (`.github/workflows/codeql.yml`)
- **Dependency scanning** via Dependabot (`.github/dependabot.yml`)
- **Secret scanning** via Gitleaks (`.github/workflows/gitleaks.yml`)
- **Container scanning + SBOM** via Trivy
  (`.github/workflows/container-scan.yml`)
- **DAST** via OWASP ZAP baseline (`.github/workflows/dast.yml`)

Trivy and ZAP currently run in report-only mode pending a first triage
pass — see `docs/devsecops-pipeline.md` for exactly what that means and
how to flip it to enforcing.

## Testing

### Test Coverage

- **Unit tests**: Jest with React Testing Library for components
- **Integration tests**: API endpoint testing
- **E2E tests**: Playwright for user workflows
- **Security tests**: Tenant isolation, authorization, input validation

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run E2E tests
cd apps/web && npm run test:e2e
```

## Documentation

Comprehensive documentation available in `/docs`:

- `architecture.md` - System architecture & design (Phase 1 design sketch —
  see the note at its top for where it's since drifted from what's real)
- `security-architecture.md` - Security design, RBAC, and honest gaps
- `data-model.md` - The real 28-model Prisma schema & relationships
- `api-reference.md` - Every real REST endpoint & its exact role gate
- `scoring-methodology.md` - Maturity scoring & gap-analysis methodology
- `framework-model.md` - Framework-agnostic engine & NIST CSF 2.0 authoring
- `excel-import-guide.md` - Spreadsheet upload format, mapping & validation
- `deployment-guide.md` - Docker/Compose & GHCR publish guide
- `devsecops-pipeline.md` - What every CI/security workflow actually does
- `threat-model.md` - STRIDE analysis with a ranked priority list
- `adr/` - Architecture Decision Records (0001-0011)
- `IMPLEMENTATION_STATUS.md` - Phase-by-phase build log & progress tracker

## CI/CD Pipeline

GitHub Actions workflows (see `docs/devsecops-pipeline.md` for full detail):

- `.github/workflows/ci.yml` - Lint, type-check, unit/integration/E2E tests,
  build, gated by a single `security-gate` aggregator job
- `.github/workflows/codeql.yml` - SAST (CodeQL)
- `.github/workflows/gitleaks.yml` - Secret scanning
- `.github/workflows/dast.yml` - OWASP ZAP baseline DAST
- `.github/workflows/container-scan.yml` - Trivy container scanning + SBOM
- `.github/workflows/deploy.yml` - Build, publish to GHCR, gated deploy
- `.github/dependabot.yml` - Dependency updates (npm, github-actions, docker)

`ci.yml`'s `security-gate` job is the one check branch protection should
require; a repo admin still needs to mark it (plus Gitleaks and CodeQL) as
a required status check in Settings → Branches — no workflow file can do
that on its own.

## License

[Specify License - e.g., Apache 2.0, MIT, Commercial]

## Support

For issues, questions, or contributions:
- Create GitHub Issues for bugs and feature requests
- See CONTRIBUTING.md for contribution guidelines
- Check ADRs in `/docs/adr/` for architecture decisions

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
