# ADR-0008: Multi-Tenant Architecture

**Status**: Accepted

## Context

CMMP is a SaaS product serving multiple customer organizations from one
deployment. Each tenant's assessments, risks, and audit trail must never
be visible to another tenant, without requiring a separate database or
deployment per customer.

## Decision

A **shared-database, shared-schema** multi-tenancy model: every tenant-
owned table carries a `tenantId` (or reaches it transitively through
`organisationId`), and isolation is enforced **entirely in application
code** — every service method takes the caller's `tenantId` (from the
verified JWT, never client-supplied) as an explicit argument and includes
it in every query. See `docs/security-architecture.md`'s "Tenant
isolation" and `docs/data-model.md`'s "Conventions" for the full
mechanism, and `docs/threat-model.md` for the specific threats this
addresses.

A second scoping level exists below `Tenant`: `Organisation` (a business
unit within a tenant), which most business objects (`Assessment`, `Risk`,
`RemediationInitiative`, etc.) actually hang off of, not the tenant
directly.

## Alternatives considered

- Database-per-tenant (strongest isolation, highest operational overhead —
  a migration or schema change must run N times).
- Schema-per-tenant within one database (Postgres `search_path`-based).
- Row-level security (RLS) policies enforced by Postgres itself, rather
  than application code.

## Consequences

- Cheapest to operate (one schema, one migration path, one connection
  pool) — the tradeoff explicitly accepted is that isolation is only as
  strong as *every* service method remembering to filter by `tenantId`.
  There is no database-level backstop (no RLS policy) if a future query
  forgets to.
- This tradeoff is mitigated, not eliminated, by a dedicated integration
  test suite (`apps/api/test/tenant-security.integration-spec.ts`) that
  boots the real, fully-wired application against a live database and
  specifically asserts cross-tenant isolation on every tested resource
  type — a regression here would need to break a real, running query path,
  not just a mock.
- A resource in a different tenant returns `404`, never `403` — a
  deliberate choice not to let a response code confirm a resource's
  existence to a caller who can't see it.
- `Role` (the free-text permission-string model, see `docs/data-model.md`)
  is per-installation, not per-tenant, and unused; actual permissions are
  the fixed, shared `UserRole` enum applied identically to every tenant —
  no tenant can define its own custom roles today.
