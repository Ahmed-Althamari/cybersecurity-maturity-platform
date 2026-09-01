# Excel / CSV Import Guide

How to bulk-load assessment responses into an existing assessment via
`@cmmp/import-engine`, and exactly what the importer accepts, rejects, and
sanitizes. This describes the real, shipping behavior of
`POST /assessments/:id/import` and `POST /assessments/:id/import/preview`
(see `docs/api-reference.md`) and the frontend at
`apps/web/pages/assessments/[id]/import.tsx`.

## Supported file formats

- **CSV** (`format: "csv"`) — parsed with `papaparse`, `header: true`.
  Headers are trimmed of surrounding whitespace.
- **XLSX** (`format: "xlsx"`) — parsed with `exceljs`, **first worksheet
  only**. A few cell-type behaviors worth knowing:
  - A **formula cell** resolves to its last *calculated* result, not the
    formula text — the importer never re-evaluates a formula itself
    (partly a safety property: a formula string is exactly the kind of
    content the formula-injection sanitizer below exists to neutralize on
    the way *out*, and this importer doesn't execute untrusted formulas on
    the way in either).
  - **Rich text** cells flatten to plain concatenated text.
  - A **hyperlink** cell's display text is used, not the URL.

Row numbers reported everywhere (preview, import results, `ImportRecord`)
are **1-based and match what you'd see with the file open** — row 1 is
always the header row, so the first data row is row 2.

**Size limit**: 5 MB per upload (`MAX_IMPORT_FILE_BYTES` in
`import.controller.ts`), enforced at the multipart-interceptor level —
an oversized file is rejected before parsing begins.

## The two-step flow: preview, then import

1. **`POST /assessments/:id/import/preview`** — upload the file with no
   mapping yet. Purely read-only: parses the file and returns:
   ```json
   {
     "headers": ["Control ID", "Current Level", "Owner", "..."],
     "rowCount": 42,
     "sampleRows": [ /* first few parsed rows, for a mapping-UI preview */ ],
     "requiredField": "subcategoryCode",
     "optionalFields": ["currentMaturity", "targetMaturity", "riskLevel", "businessCriticality",
                          "controlStatus", "rationale", "evidence", "assessorComments",
                          "ownerName", "ownerEmail", "remediationDueDate"]
   }
   ```
   Nothing is persisted by this call. The frontend's mapping UI
   auto-matches same-named source headers to target fields
   (case-insensitive exact match) and lets a human correct the rest —
   `headers`/`optionalFields` here are the single source of truth the
   mapping form is built from, so the UI can never drift out of sync with
   what the real import endpoint accepts.
2. **`POST /assessments/:id/import`** — the same file, plus the confirmed
   `mapping` (a JSON object: target field name → source column header) and
   `format`. This one actually validates, sanitizes, and applies.

## Column mapping

Exactly one required target field: **`subcategoryCode`** — the value the
importer uses to find the matching `AssessmentItem` in *this specific
assessment* (via its question's subcategory code). A code with no match in
the assessment's own framework becomes a row-level `ERROR`, not a batch
failure.

Every other target field is optional and, if mapped, must resolve to one
of `AssessmentItem`'s mutable fields: `currentMaturity`, `targetMaturity`,
`riskLevel`, `businessCriticality`, `controlStatus`, `rationale`,
`evidence`, `assessorComments`, `ownerName`, `ownerEmail`,
`remediationDueDate`. A target field with nothing mapped to it is simply
left untouched on the existing item — import only ever updates the fields
you actually mapped.

**Import never creates new `AssessmentItem`s.** Phase 6 already seeds
every item when the assessment itself is created (one per question in its
chosen framework); import can only update the field values on rows that
already exist for this assessment.

## Field validation rules

Applied per-row, per-mapped-field, by `mapAndValidateRows()`:

| Field | Rule |
|---|---|
| `subcategoryCode` | Required; a missing value is an immediate row error. |
| `currentMaturity`, `targetMaturity` | Must match a `MaturityLevel` value, case- and separator-insensitive (`normalizeEnumInput`: trims, upper-cases, collapses spaces/hyphens to `_` — so `"In Progress"`, `"in-progress"`, and `"IN_PROGRESS"` all match `IN_PROGRESS`). |
| `riskLevel` | Same normalization, matched against `RiskLevel`. |
| `controlStatus` | Same normalization, matched against `ControlStatus`. |
| `businessCriticality` | Must parse as an integer 1–5. |
| `ownerEmail` | Must match a basic `local@domain.tld` pattern. |
| `remediationDueDate` | Must parse as a valid JS `Date` (any format `Date()` itself accepts). |
| `rationale`, `evidence`, `assessorComments`, `ownerName` | Free text — sanitized for formula injection (below), no format constraint otherwise. |

A row with **any** validation failure becomes status `ERROR`: nothing from
that row is applied, and every failure message is collected (not just the
first) so a user can fix everything in one pass rather than one error at a
time.

## Formula-injection sanitization (CWE-1236 / OWASP CSV Injection)

Every free-text field above is checked for a leading formula-trigger
character: `=`, `+`, `-`, `@`, a tab, or a carriage return. If found, the
importer prefixes the value with a single quote (`'`) — the same
"force text" convention Excel itself uses — rather than stripping the
content. This matters because imported free text (rationale, evidence,
owner name) can end up back in a spreadsheet later (e.g. a future
re-exported report); a value like `=cmd|'/C calc'!A1` sanitizes to
`'=cmd|'/C calc'!A1`, which every major spreadsheet application renders as
inert literal text instead of executing it, while the original content
stays fully visible and reversible. Sanitization is flagged as a row
**`WARNING`**, never silently applied and never treated as an `ERROR` —
the row's data is still safe to import, the user is just told it was
adjusted. This exact attack was live-verified against a real payload
during development (see "First End-to-End Verification" in
`IMPLEMENTATION_STATUS.md`).

## Row outcomes

Every parsed row becomes exactly one of three statuses:

- **`VALID`** — every mapped field validated cleanly, nothing needed
  sanitizing. Applied as-is.
- **`WARNING`** — validated cleanly, but one or more free-text fields
  needed formula-injection sanitization. Still applied, with the
  sanitized (safe) value.
- **`ERROR`** — at least one field failed validation. Nothing from this
  row is applied; the messages describe every failure found.

## Transactional apply

`ImportService` applies an entire file in **one Prisma `$transaction`**:
every `VALID`/`WARNING` row's `AssessmentItem` update, every row's
`ImportRecord` (for the audit trail — `VALID`, `WARNING`, and `ERROR` rows
are all recorded, not just the ones that succeeded), and the owning
`ImportJob` (`successCount`/`errorCount`/`warningCount`, an `errorReport`
JSON summary of just the failed rows). The assessment's overall
`completionPercentage`/scores are recalculated **once**, after the whole
batch, not once per row (`AssessmentsService.recalculateProgress` is
called a single time at the end).

The response returned to the caller mirrors this: applied count, warning
count, error count, and the per-row messages for anything that wasn't
`VALID` — this is what the frontend's import-results panel renders
directly.

## What this importer does not do

- It does not create a new assessment or new framework items — see above.
- It has no "undo" — a completed import's changes are ordinary
  `AssessmentItem` updates, reversible only by editing those items again
  (manually, or via a corrected re-import).
- It does not remember a column mapping between imports — every import
  (even a second file against the same framework) starts from a fresh
  preview and mapping step. Tracked as a documented follow-up in
  `IMPLEMENTATION_STATUS.md`.
