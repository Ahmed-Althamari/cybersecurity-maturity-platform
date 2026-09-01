# ADR-0007: Configurable Maturity Scoring

**Status**: Accepted, partially realized

## Context

Different organizations weight controls differently, and different
maturity models use different numbers of levels (a 4-level CMMI-style
scale vs. a 5-level scale). The scoring engine (`docs/scoring-methodology.md`)
was designed to support both without a rewrite.

## Decision

Two configurability seams were built into the schema and engine:

1. **Per-item weighting**: `AssessmentItem.weight` (`Float`, default
   `1.0`) is threaded through every level of
   `@cmmp/scoring-engine`'s `aggregateHierarchy()` already.
2. **A configurable N-level scale**: `MaturityModel`/`MaturityModelLevel`
   tables exist in the schema, allowing a named model with its own set of
   numbered levels (name, description, color) per tenant.

## Alternatives considered

Hard-code a single 1-5 scale and a flat unweighted average everywhere.

## Current state — what's actually realized vs. not

- **Weighting is mechanically ready but has no producer.** The aggregation
  math already respects `weight` correctly (verified by
  `aggregate.spec.ts`), but no API endpoint or UI exists to set an item's
  weight to anything other than the schema default. Every real assessment
  today is, in effect, unweighted at the item level (subcategory/category/
  function-level weighting *does* vary naturally as a side effect of how
  many applicable responses roll up — see `docs/scoring-methodology.md`).
- **The configurable scale is modeled but entirely unused.**
  `MaturityModel`/`MaturityModelLevel` are never read or written by any
  service. `@cmmp/scoring-engine`'s `MATURITY_LEVEL_SCORES` is a hard-coded
  map keyed directly off the `MaturityLevel` Postgres enum (`INITIAL`=1 …
  `OPTIMISED`=5) — the one true scale in this system today, seeded as
  `"CMMP Standard 0-5"` but not actually *read* from that seed row by
  anything.

## Consequences

- A future "custom maturity model per tenant" feature has its schema seam
  already in place — it's an API/UI feature, not a data-model migration.
- Until that's built, this ADR's "Accepted" status describes an
  architectural intention that the codebase is *ready for*, not a feature
  a tenant can use today. Treat any reference to "configurable scoring" in
  other documents or in conversation with this codebase as referring to
  this readiness, not a shipped customization capability.
