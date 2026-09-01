# ADR-0006: Framework-Agnostic Engine

**Status**: Accepted

## Context

CMMP's first (and so far only) supported framework is NIST CSF 2.0, but
the product goal is to support additional frameworks (ISO/IEC 27001, CIS
Controls) without a redesign each time.

## Decision

`@cmmp/framework-engine` defines the Function → Category → Subcategory →
Question hierarchy generically, in two shapes: `FrameworkDefinition` (Zod
schemas, authoring/import time, no IDs) and `FrameworkTree` (hydrated,
post-persistence, real IDs) — see `docs/framework-model.md` for the full
design. NIST CSF 2.0 is authored as an ordinary `FrameworkDefinition`
document, with no framework-specific code anywhere in the engine itself.

## Alternatives considered

Hard-code NIST CSF's six functions/22 categories directly into the schema
and application logic.

## Consequences

- Adding a second framework is entirely a data-authoring exercise (write a
  new `FrameworkDefinition`, validate it, persist it) — no code change to
  the assessment, scoring, gap-analysis, dashboard, or import machinery,
  all of which consume only the generic `FrameworkTree`/hierarchy shape.
- **This is not yet fully realized end-to-end**: `Assessment` doesn't
  carry its own framework slug/id directly — only each `AssessmentItem`'s
  `questionId` implies one, transitively. This means a UI that wants to
  group an assessment's own items by function/category (rather than a flat
  filterable list) needs either a second framework-tree fetch and ID
  cross-referencing, or a new `Assessment.frameworkSlug`-style field — a
  real, documented gap (see the "Frontend Gap Closure" section of
  `IMPLEMENTATION_STATUS.md`), not a flaw in the engine design itself.
- The NIST CSF 2.0 data itself was sourced from a third-party mirror of
  NIST's own public-domain CPRT export, since this project's sandbox
  couldn't reach `nist.gov` directly — verified against NIST's published
  totals (6/22/106) but not diffed byte-for-byte against the official
  publication. See `docs/framework-model.md`'s "Data provenance" section.
