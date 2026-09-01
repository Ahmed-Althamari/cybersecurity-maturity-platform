# ADR-0004: PostgreSQL Database

**Status**: Accepted

## Context

CMMP's data model (`docs/data-model.md`) is relational by nature — a
strict Function → Category → Subcategory → Question hierarchy, many-to-many
Risk↔RemediationInitiative links, and multi-tenant scoping that benefits
from real foreign-key constraints and transactional guarantees (the
spreadsheet importer applies an entire batch in one transaction — see
`docs/excel-import-guide.md`).

## Decision

PostgreSQL 15 (pinned consistently across `docker-compose.yml`, every CI
workflow's service container, and `infrastructure/Dockerfile.api`'s
runtime expectations — `POSTGRES_IMAGE: postgres:15-alpine` in `ci.yml`).
Real Postgres enums back the small, stable value sets
(`MaturityLevel`, `RiskLevel`, `ControlStatus`, `AuditAction`); larger or
application-defined workflow states (`Assessment.status`,
`Risk.status`, etc.) are deliberately plain `String` columns instead,
enforced by application code — see `docs/data-model.md`'s "Conventions"
section for the reasoning.

## Alternatives considered

MySQL, MongoDB, Firebase/Firestore.

## Consequences

- Strong ACID guarantees back the import engine's transactional apply and
  the assessment state machine's transitions.
- No JSONB columns are actually used today despite being a commonly-cited
  reason to pick Postgres — several fields that could have been JSONB
  (`Role.permissions`, various `*Data`/`*Report` fields) are instead
  plain `String` columns holding serialized JSON, parsed/stringified in
  application code rather than queried with Postgres's native JSON
  operators. This is a missed opportunity, not a hard constraint of the
  choice itself.
- The one migration committed so far
  (`packages/database/prisma/migrations/20260901072626_init/`) was
  generated and applied against a real PostgreSQL 16 instance during this
  project's development (Postgres 16 client against a 15-targeted schema —
  no version-specific SQL feature is used that would make this matter).
