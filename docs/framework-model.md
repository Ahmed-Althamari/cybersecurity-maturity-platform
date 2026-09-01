# Framework Model

CMMP is built to assess against *any* hierarchical control framework, not
just NIST CSF. This is realized by `@cmmp/framework-engine` (ADR-006) and is
one of the more deliberately-engineered pieces of the system — this
document explains the two-shape design and how NIST CSF 2.0 is authored
against it as the first (and currently only) concrete framework.

## Two shapes, one hierarchy

`packages/framework-engine/src/types.ts` defines the same four-level tree
(**Function → Category → Subcategory → Question**) twice, deliberately, for
two different moments in a framework's life:

- **Definition types** (`FrameworkDefinition`, `FunctionDefinition`,
  `CategoryDefinition`, `SubcategoryDefinition`, `QuestionDefinition`) —
  Zod schemas describing a framework *before* it exists in the database.
  This is the shape you'd hand-author (or generate from a spreadsheet, or
  receive from an import) to define a brand-new framework: plain
  code/name/description/displayOrder fields, no IDs.
- **Node/Tree types** (`FrameworkTree`, `FunctionNode`, `CategoryNode`,
  `SubcategoryNode`, `QuestionNode`) — the same shape, but hydrated from
  Postgres with real UUIDs and an owning `tenantId`. This is what
  `GET /frameworks/:slug` returns and what the scoring/assessment engines
  actually operate on.

Nothing in the *definition* schema encodes anything NIST-CSF-specific — no
"function must be one of GV/ID/PR/DE/RS/RC" constraint, no fixed depth
beyond the four levels, no hard-coded count of functions or categories.
Adding ISO/IEC 27001 or CIS Controls as a second framework is authoring a
new `FrameworkDefinition` JSON document, not a code or schema change.

## Validation pipeline

`validator.ts` runs two passes, both usable independently:

1. **Shape validation** — `FrameworkDefinitionSchema.safeParse()` (Zod):
   required fields, string length caps (`code` ≤ 64 chars, `name` ≤ 255),
   slug format (`^[a-z0-9]+(-[a-z0-9]+)*$`), and the structural minimums
   (a framework needs ≥1 function, a function ≥1 category, a category ≥1
   subcategory).
2. **Structural validation** — `validateFrameworkStructure()`: sibling code
   uniqueness, case-insensitively, at every level (no two categories under
   the same function may share a code, etc.) — a check the Zod shape
   schema alone can't express since it requires comparing siblings against
   each other.

`POST /frameworks/validate` runs both passes as a dry run (nothing
persisted) so an author can iterate on a definition before committing it.
`assertValidFrameworkDefinition()` is the throwing variant used by
`POST /frameworks` and by the seed script — a validation failure becomes a
`400` with the full list of issues, not a partially-created framework.

## Persistence: `persistFrameworkDefinition()`

`packages/framework-engine/src/persist.ts` is the single implementation
both `FrameworkService.create()` (the API route) and
`packages/database/prisma/seed.ts` call — there used to be two parallel
implementations (one for the seed script, one for the API) before Phase 5
consolidated them into this shared helper, so a framework created via the
API and a framework loaded at seed time go through byte-for-byte the same
persistence logic (one nested Prisma `create` building the whole
Framework → Function → Category → Subcategory → Question tree from a
validated `FrameworkDefinition`, plus one `AssessmentQuestion` per
subcategory when a subcategory defines no explicit `questions`).

## Loading: `loadFrameworkTree()`

`loader.ts` hydrates a `FrameworkTree` from the database via a minimal
structural `FrameworkQueryClient` interface — not a hard dependency on
`@prisma/client`. This is what keeps `@cmmp/framework-engine` genuinely
persistence-agnostic and unit-testable with a hand-built mock client
instead of a real database or a mocked Prisma client; the actual Prisma
implementation of that interface lives in `apps/api/src/framework/`.
Every level is returned ordered by its own `displayOrder`.

## Dynamic component descriptor

`component-descriptor.ts`'s `buildFrameworkComponentDescriptor()` reduces a
full `FrameworkTree` into a compact summary — one entry per function with
an assigned display color and category/subcategory/question counts — that
the frontend walks to render navigation, radar charts, and the maturity
heatmap without ever hard-coding "there are six functions named GV/ID/PR/
DE/RS/RC." A framework with four functions, or nine, renders exactly the
same way through this descriptor. `GET /frameworks/:slug/components`
exposes it directly.

## NIST CSF 2.0: the first framework, authored against this model

`packages/framework-engine/src/definitions/nist-csf-2.0.json` (+ a typed
wrapper `nist-csf-2-0.ts`) is authored as an ordinary
`FrameworkDefinition` — nothing about how it's loaded or persisted is
NIST-specific. It carries the complete official structure:

- **6 Functions**: GOVERN, IDENTIFY, PROTECT, DETECT, RESPOND, RECOVER
- **22 Categories**: the official CSF 2.0 codes (`GV.OC`, `GV.RM`, `GV.RR`,
  `GV.PO`, `GV.OV`, `GV.SC`, `ID.AM`, `ID.RA`, `ID.IM`, `PR.AA`, `PR.AT`,
  `PR.DS`, `PR.PS`, `PR.IR`, `DE.CM`, `DE.AE`, `RS.MA`, `RS.AN`, `RS.CO`,
  `RS.MI`, `RC.RP`, `RC.CO`)
- **106 Subcategories** — with NIST's actual (non-contiguous) numbering
  preserved exactly as published: e.g. `ID.AM` skips `-06`, `DE.CM` runs
  `01, 02, 03, 06, 09`, `RS.CO` runs `02, 03`. This was authored against
  NIST's real published core rather than re-numbered into a clean
  sequence, and is pinned by a test asserting the official 6/22/106 totals.
- **106 Questions** — one auto-generated question per subcategory (NIST CSF
  has no separate "question" concept distinct from its outcome
  statements), each carrying the subcategory's official Implementation
  Examples as assessor guidance text.

### Data provenance — read before treating this as compliance-grade

The CSF 2.0 Core and Implementation Examples are public domain, originating
from NIST's own Cybersecurity and Privacy Reference Tool (CPRT). The
sandbox this was built in could not reach `nist.gov`/`csrc.nist.gov`
directly (network egress policy), so the data was sourced from a
third-party structured mirror of the CPRT export
(`github.com/MarianoFacundoArch/nist-csf-evidence-gap-analysis-tool`,
`data/csf-core.json`), not fetched from NIST directly. The resulting
counts match NIST's published totals exactly (a strong integrity signal,
verified by test), but nobody has diffed the outcome wording byte-for-byte
against the official NIST CSWP 29 publication. **Spot-check outcome text
against the official publication before relying on this for real
compliance reporting.** This is tracked as an open item in
`IMPLEMENTATION_STATUS.md`'s Next Steps.

## Adding a second framework

Because nothing downstream (scoring, gap analysis, assessment creation,
the dashboard, the heatmap) is NIST-specific, adding e.g. ISO/IEC 27001
means:

1. Author a `FrameworkDefinition` JSON document for it (functions →
   categories → subcategories → questions, following ISO's own control
   grouping).
2. Validate it via `POST /frameworks/validate` (or the same validator
   function directly in a script) until it's clean.
3. Persist it via `POST /frameworks` (as `PLATFORM_ADMIN`/
   `ORGANISATION_ADMIN`) or add it to the seed script the same way NIST CSF
   2.0 is seeded today.
4. Everything else — assessment creation, item scoring, gap analysis, the
   dashboard, the heatmap, spreadsheet import/export — works against it
   immediately, with no code changes, because none of it imports anything
   from `definitions/nist-csf-2.0.json` directly; it only ever consumes the
   generic `FrameworkTree` shape.

The one place multi-framework support is *not* fully wired end-to-end
today: `Assessment` doesn't carry its own framework slug/id directly (only
each `AssessmentItem`'s `questionId` implies one, transitively through
`Subcategory → Category → Function → Framework`), so a page that wants to
group an assessment's items by function/category without an extra
framework-tree fetch can't do so from the assessment payload alone — see
the "Frontend Gap Closure" section of `IMPLEMENTATION_STATUS.md` for the
specific UI this affects and the two ways to close it.
