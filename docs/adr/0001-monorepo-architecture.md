# ADR-0001: Monorepo Architecture

**Status**: Accepted

## Context

CMMP needs several distinct pieces of scoring/framework/import logic
(`docs/scoring-methodology.md`, `docs/framework-model.md`,
`docs/excel-import-guide.md`) shared between a NestJS API and a Next.js
frontend, plus a common set of TypeScript types (`@cmmp/shared`) both
sides agree on without duplicating.

## Decision

A single npm-workspaces monorepo: `apps/{api,web}` for the two runnable
applications, `packages/{shared,database,framework-engine,scoring-engine,
import-engine,ui,reporting,security}` for shared logic, orchestrated by
Turborepo (`turbo.json`'s `dependsOn: ["^build"]` resolves the whole
workspace dependency graph for `build`/`test`/`lint`/`type-check`), with
one root `package-lock.json` covering every workspace.

## Alternatives considered

- Separate repositories per package/app, published to a private registry.
- A different build orchestrator (Nx, Lerna, plain workspace scripts with
  no orchestration).

## Consequences

- Single deployment pipeline and a single source of truth for shared types
  (`@cmmp/shared`'s `MaturityLevel`, `RiskLevel`, dashboard types, etc. are
  imported directly by both `apps/api` and `apps/web` — no duplication or
  drift).
- One CI run (`docs/devsecops-pipeline.md`) covers everything; Dependabot
  needs only one `npm` ecosystem entry (`docs/devsecops-pipeline.md`).
- **A real cost realized in practice**: a workspace package with no local
  `tsconfig.json` (three of the eight — `ui`, `reporting`, `security` —
  were empty Phase-1 scaffolds) causes `tsc --noEmit` to fall back to the
  *root* `tsconfig.json`, which has no `include` array and therefore
  defaults to checking the **entire repository** from within that
  package's directory. This silently broke `npm run type-check` repo-wide
  until Phase 16 gave each scaffold package its own scoped `tsconfig.json`
  — a monorepo-specific failure mode a single-repo-per-package layout
  wouldn't have.
- Docker images for a single app (`infrastructure/Dockerfile.api`/`.web`)
  must build from the **repository root** as context, since a workspace's
  `dist/` depends on its sibling packages' `dist/` output — see
  `docs/deployment-guide.md`. A narrower per-app build context, which
  would be natural in a multi-repo layout, doesn't work here.
