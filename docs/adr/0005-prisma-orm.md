# ADR-0005: Prisma ORM

**Status**: Accepted

## Context

A 28-model schema (`docs/data-model.md`) with deep nested relations
(Framework → Function → Category → Subcategory → Question,
five levels) needs both type-safe query construction across the API and
a hydration path (`@cmmp/framework-engine`'s `loadFrameworkTree()`) that
walks the same hierarchy without hand-writing five layers of joins.

## Decision

Prisma as the sole database client — `@cmmp/database` package re-exports
the generated Prisma Client for every other workspace to import, so
`npm run db:generate` is a build-order dependency of nearly everything
(see ADR-0001's monorepo consequence: every workspace's `type-check`
depends on it).

## Alternatives considered

TypeORM, Sequelize, Knex (query builder only, no schema/migrations).

## Consequences

- Generated, type-safe query results end-to-end — no hand-maintained
  entity classes to keep in sync with the schema.
- Migrations (`prisma migrate dev` locally, `prisma migrate deploy` in
  `docker-compose.yml`'s `api` command and in CI) are the single source of
  schema truth — `prisma db push` is never used in any environment that
  needs a migration history.
- **A real, monorepo-specific rough edge, documented as a known issue**:
  `packages/database`'s local `prisma` devDependency can resolve
  inconsistently under npm workspaces (`@prisma/client`'s
  `peerDependencies: { prisma: "*" }` can pull in a newer major version
  than the pinned `^5.22.0`, which `npm ls` then reports as "invalid").
  Workaround in place: always run Prisma generate from the repo root
  (`npm run db:generate`), never via the workspace-local binary directly.
- `@cmmp/framework-engine`'s loader deliberately depends on a **minimal
  structural interface** (`FrameworkQueryClient`), not `@prisma/client`
  directly — this is what keeps that package unit-testable with a plain
  mock instead of a real database or a mocked Prisma client, and is a
  direct architectural consequence of not wanting Prisma's generated types
  to leak into a package meant to stay persistence-agnostic (see
  `docs/framework-model.md`).
