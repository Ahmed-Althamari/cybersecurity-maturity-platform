# Scoring Methodology

The scoring logic lives entirely in `@cmmp/scoring-engine` — a
framework-agnostic package with no NestJS/Prisma dependency, unit-tested
(19 tests) against plain objects, then wired into the API by
`apps/api/src/scoring/scoring.service.ts`. Everything in this document is
the real, currently-shipping algorithm — not a target design.

## The maturity scale

`packages/scoring-engine/src/maturity-scale.ts` backs the platform's
default maturity model (seeded as `"CMMP Standard 0-5"` in
`prisma/seed.ts`):

| `MaturityLevel` | Score |
|---|---|
| `NOT_APPLICABLE` | *(excluded — see below)* |
| `INITIAL` | 1 |
| `DEVELOPING` | 2 |
| `DEFINED` | 3 |
| `MANAGED` | 4 |
| `OPTIMISED` | 5 |

**`NOT_APPLICABLE` is not a zero** — an item marked not-applicable is
dropped from every average it would otherwise contribute to, on both the
current *and* target axis. This matters because `AssessmentItem`'s schema
defaults are `currentMaturity: NOT_APPLICABLE`, `targetMaturity: DEFINED`:
an item nobody has answered yet must not leak its default target score of
3 into an assessment's average just because a row exists. `scoreResponses()`
enforces this by only reading an item's `target` once its `current` is
non-null.

`scoreToMaturityLevel(score)` is the inverse: clamps a 1–5 float to the
valid range, rounds to the nearest integer, and maps it back to a label —
used to turn a computed average back into a human-readable level (e.g. for
the roadmap generator's `currentMaturity`/`targetMaturity` fields on a new
initiative).

## Aggregation: subcategory → category → function → organisation

`aggregateHierarchy()` (`packages/scoring-engine/src/aggregate.ts`) rolls a
flat list of scored responses up through the full framework tree in one
pass:

1. **Item level**: each response's `currentMaturity`/`targetMaturity`
   contribute their numeric score (or `null` if not applicable), weighted
   by `AssessmentItem.weight` (defaults to `1.0` — see "Weighting" below).
2. **Subcategory score**: the weighted average of every item's current
   score, independently of every item's target score (an item that's
   `NOT_APPLICABLE` contributes to neither average; an item with a current
   score but no meaningful target still contributes to the current
   average).
3. **Category score**: the weighted average of its subcategories' scores —
   and **a subcategory's own weight one level up is its own applicable
   response weight**, not a flat 1. A subcategory where every item is
   `NOT_APPLICABLE` contributes weight 0 to its category, so a thin or
   fully-excluded subcategory can't distort the category average by
   counting as a full vote with a meaningless score.
4. **Function score**: same rollup, one level up, from categories.
5. **Organisation score**: same rollup, one level up, from functions.

Every level's `gap` is simply `targetScore - currentScore` (rounded to 2
decimal places), `null` if either side has nothing applicable to average.

**Worked example** (matches the pattern in `aggregate.spec.ts`): a category
with two subcategories, one scored `current=3, target=4` from 2 applicable
items and one scored `current=1, target=5` from 1 applicable item:

```
category.currentScore = (3 * 2 + 1 * 1) / (2 + 1) = 7/3 ≈ 2.33
category.targetScore  = (4 * 2 + 5 * 1) / (2 + 1) = 13/3 ≈ 4.33
category.gap          = 4.33 - 2.33 = 2.00
```

## Gap analysis & risk classification

`identifyGaps()` (`packages/scoring-engine/src/gap-analysis.ts`) flattens
an already-aggregated hierarchy into a sorted list of gap entries at any
combination of `function`/`category`/`subcategory` levels (the
`GET /assessments/:id/dashboard/heatmap` endpoint requests all three at
once; the top-gaps table and roadmap generator request function-level
only). Each entry's `riskLevel` comes purely from **gap magnitude** on the
1–5 scale:

| Gap | Risk level |
|---|---|
| ≥ 3 | `CRITICAL` |
| ≥ 2 | `HIGH` |
| ≥ 1 | `MEDIUM` |
| ≥ 0 | `LOW` |
| gap is `null` (nothing applicable was scored) or ≤ 0 (already at/above target) | `MINIMAL` |

Entries sort by gap descending — largest, highest-risk gaps first;
entries with no gap sort last. There is deliberately no "magic" beyond
these plain magnitude bands — the comment in the source code is explicit
that this isn't a strongly-opinionated risk model, just a starting point.

This is a **different** risk-scoring scheme from the Risk Register's
`likelihood × impact` model (see `docs/data-model.md`'s Risk Register
section) — gap-magnitude risk describes *maturity shortfall*, while
inherent/residual risk score describes a *specific identified risk*'s
severity. They are related (a risk is often linked to the control whose
gap produced it) but computed independently and never conflated.

## Weighting (ADR-007, partially realized)

`AssessmentItem.weight` (`Float`, default `1.0`) is threaded through every
level of `aggregateHierarchy()` already — nothing in the aggregation code
would need to change to support non-uniform weighting. What's missing is a
producer: no API surface or UI exists yet to set a weight to anything
other than the default, so in practice every rollup today is an unweighted
mean at the item level (subcategory/category/function weights *do* already
vary naturally, per the "applied weight" mechanism above). A future
"prioritize this control" feature would only need to expose
`PATCH .../items/:itemId`'s existing `weight` field, nothing more.

Similarly, `MaturityModel`/`MaturityModelLevel` (see `docs/data-model.md`)
are the schema seam for a fully configurable, per-tenant N-level scale in
place of the hard-coded 1–5 map above — unused today.

## Remediation roadmap generation

`POST /assessments/:id/roadmap/generate` (`InitiativesService`, see
`docs/api-reference.md`) is the one place gap analysis feeds forward into
a concrete work item, not just a dashboard number:

1. Calls `computeGapAnalysis` at **function level only**, filtered to gaps
   at or above `?minGap=` (default `0.5`).
2. For each qualifying gap, derives:
   - **Priority** and **target-completion timeline** from the gap's
     `riskLevel` (not gap size directly):
     `CRITICAL → priority 1, 90 days`, `HIGH → priority 2, 90 days`,
     `MEDIUM → priority 3, 180 days`, `LOW → priority 4, 365 days`,
     `MINIMAL → priority 5, 365 days`.
   - **Complexity** (1–5) from the gap's raw magnitude directly
     (`≥3 → 4`, `≥2 → 3`, smaller gaps → lower complexity) — a separate
     heuristic from priority, since a small-but-urgent gap and a
     large-but-already-tolerated one shouldn't be scored the same way on
     both axes.
   - **`currentMaturity`/`targetMaturity`** on the new
     `RemediationInitiative` via `scoreToMaturityLevel()` on the gap's
     numeric scores — the roadmap never invents a maturity label
     independently of the scoring engine's own scale.
3. Creates one draft `RemediationInitiative` per qualifying gap
   (`status: PLANNED`). Re-running generation does not currently
   deduplicate against initiatives already created from an earlier run —
   it always proposes fresh drafts for whatever still qualifies.

## Where this is wired into the API

`ScoringService` (`apps/api/src/scoring/`) is the only consumer of
`@cmmp/scoring-engine` in the backend: it loads an assessment's items
together with each item's Function/Category/Subcategory (via the
question's relations), builds the flat `ScoredResponse[]` the engine
expects, and calls `aggregateHierarchy()` / `identifyGaps()`.
`AssessmentsService`'s per-item `PATCH` handler calls `ScoringService`
after every write to keep `Assessment.currentMaturity` /
`targetMaturity` / `maturityGap` / `completionPercentage` current — scores
are always recomputed synchronously in the same request that changed an
item, never lazily or on a schedule.
