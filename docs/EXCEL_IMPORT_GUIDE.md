# Excel/CSV Import Guide

`POST /api/v1/assessments/:id/import` (`multipart/form-data`, field name
`file`) bulk-loads assessment responses from a spreadsheet instead of
answering each question one at a time through `POST /:id/items`. This
describes the actual column format and validation rules implemented in
`@cmmp/import-engine`, verified against the code and against real
end-to-end import tests, not an aspirational spec.

**Frontend note**: the API endpoint is fully implemented and tested; the
upload/preview/column-mapping *wizard UI* described in the original
design (master prompt §14) does not exist in `apps/web` yet — this guide
is for calling the API directly (a script, `curl`, Postman) until that
UI is built.

## Accepted File Types

`.xlsx`, `.xls`, or `.csv`. Rejected outright (not just warned) if:

- the extension isn't one of the three above
- the filename contains `..`, `/`, or `\` (path traversal characters)
- the file exceeds **10MB**
- the sheet has more than **20,000 rows**

A mismatched or generic MIME type (many browsers send
`application/octet-stream` for spreadsheets regardless of actual type)
is only a warning — the file extension is the real gate, since
browser-reported MIME types for spreadsheets aren't reliable.

## Columns

17 canonical columns. None are strictly required by the *file format*
except `Control_ID` (a row without one is rejected outright — there's no
way to match it to a framework subcategory). Every other column is
optional; a blank cell just means that field isn't set on the resulting
`AssessmentItem`.

| Canonical column | Recognised alternate headers | Type | Notes |
|---|---|---|---|
| `Control_ID` | `Control ID`, `ControlID`, `Subcategory Code`, `Subcategory ID`, `Control Code`, `ID` | text | **Required.** Must match a subcategory code that exists in this assessment's framework (e.g. `GV.OC-01` for NIST CSF 2.0) — a `Control_ID` that doesn't match anything in the framework is rejected as invalid, not silently skipped. |
| `Current_Maturity` | `Current Score`, `Current Maturity Level`, `Current` | number 0-5 or level name | See Maturity Values below. |
| `Target_Maturity` | `Target Score`, `Target Maturity Level`, `Target` | number 0-5 or level name | Same format as Current_Maturity. |
| `Weight` | `Item Weight` | non-negative number | Defaults to `1` if blank. Used in the weighted-average rollup (see `docs/architecture.md`'s Scoring Methodology). |
| `Risk` | `Risk Level` | `CRITICAL`/`HIGH`/`MEDIUM`/`LOW`/`MINIMAL` | Case-insensitive, spaces/hyphens normalised to underscores. |
| `Business_Criticality` | `Criticality`, `Business Impact` | integer 1-5 | Rejected if not an integer in range. |
| `Evidence` | `Evidence Link`, `Evidence Reference` | text | Free text — a URL, a description, whatever the assessor provides. |
| `Comments` | `Comment`, `Notes`, `Assessor Comments` | text | |
| `Owner` | `Control Owner`, `Owner Name` | text | |
| `Due_Date` | `Remediation Due Date`, `Target Date` | date | Any format `new Date()` can parse. An unparseable date is a **warning**, not an error — the row still imports, just without that field set. |
| `Status` | `Control Status` | see Status Values below | |
| `Framework` | `Framework Name` | text | Informational only — the actual framework is determined by the assessment, not this column. |
| `Function`, `Category`, `Subcategory` | `Sub-Category`, `Sub Category` | text | Informational — the real hierarchy placement comes from `Control_ID` matching a subcategory, not from these columns. |
| `Assessment_Question` | `Assessment Question`, `Question` | text | Informational. |
| `Recommendation` | `Recommendations`, `Remediation Recommendation` | text | Currently parsed but not persisted onto `AssessmentItem` — captured for a future `Recommendation` row, not wired up yet. |

Column matching is case- and spacing-insensitive (`"current score"`,
`"Current_Score"`, and `"CURRENT SCORE"` all match). You can also skip
auto-mapping entirely and provide an explicit mapping — the underlying
library (`ImportOptions.columnMapping`) supports it — but the API
endpoint itself doesn't yet accept a manual mapping override as a
request parameter; it always auto-maps. This is a known gap (see
`docs/IMPLEMENTATION_STATUS.md`'s Next Steps).

### Maturity Values

`Current_Maturity`/`Target_Maturity` accept either:

- **A number 0-5** (e.g. `3`, `2.5`) — rounded to the nearest whole
  level.
- **A level name**: `NOT_APPLICABLE` (or `N/A`), `INITIAL`,
  `DEVELOPING`, `DEFINED`, `MANAGED`, `OPTIMISED`. Case-insensitive,
  spaces/hyphens become underscores (`"not applicable"` and
  `"Not-Applicable"` both work).

| Level | Score |
|---|---|
| NOT_APPLICABLE | 0 |
| INITIAL | 1 |
| DEVELOPING | 2 |
| DEFINED | 3 |
| MANAGED | 4 |
| OPTIMISED | 5 |

An unrecognised value in either column is a hard **error** for that row.

### Status Values

`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `BLOCKED` — plus recognised
synonyms: `NOTSTARTED`, `IN PROGRESS`/`INPROGRESS`, `COMPLETE`. An
unrecognised status is a hard **error**.

## Security: Formula/CSV Injection Defense

Every cell is checked before it's ever stored. A cell whose content
starts with `=`, `+`, `-`, `@`, or a leading tab/carriage-return/newline
is treated as a potential formula-injection attempt (the classic
`=cmd|'/c calc'!A1`-style attack that executes when the file is reopened
in Excel or re-exported to CSV) and gets prefixed with a single quote
(`'`) to force it to be treated as plain text. A genuine negative number
like a weight of `-1` is recognised as a plain number and left alone —
only values that would actually be interpreted as a formula get
sanitised. Sanitisation is reported as a **warning**, not an error — the
row still imports, with the defused value.

## Row Outcomes

Every row lands in exactly one bucket:

- **`valid`** — imports as-is.
- **`warning`** — imports (a sanitised formula cell, an unparseable due
  date, etc. — non-blocking issues). **Both `valid` and `warning` rows
  are imported** — this wasn't always true (a Phase 8 bug silently
  dropped warning rows; fixed and regression-tested).
- **`duplicate`** — a `Control_ID` that appears more than once in the
  file. Flagged as duplicate *unless* the row is already `invalid` for a
  more severe reason (a missing `Control_ID`, say) — in that case the
  more severe status is preserved and the duplicate note is appended to
  its issues rather than overwriting it.
- **`invalid`** — not imported. Either a validation error (bad
  maturity/risk/status value, non-numeric weight, out-of-range business
  criticality) or a `Control_ID` that doesn't match any subcategory in
  this assessment's framework.

A `Control_ID` that already has an `AssessmentItem` in this assessment
gets its existing item **updated** (upsert), not duplicated — re-running
an import with corrections is safe.

## Response

```json
{
  "totalRows": 106,
  "importedCount": 104,
  "validCount": 100,
  "warningCount": 4,
  "invalidCount": 2,
  "duplicateCount": 0,
  "columnMapping": { "Control_ID": "Control ID", "Current_Maturity": "Current Score", "...": "..." },
  "unmappedColumns": ["Some Extra Column"],
  "errorReportCsv": "Row,Column,Severity,Message\n..."
}
```

`errorReportCsv` is a ready-to-download CSV of every non-`valid` row's
issues — hand it back to whoever prepared the spreadsheet rather than
making them dig through a JSON array.

## Example Minimal File

```csv
Control_ID,Current_Maturity,Target_Maturity,Weight,Risk,Owner
GV.OC-01,DEVELOPING,MANAGED,1,HIGH,Jane Smith
GV.OC-02,2,4,1.5,MEDIUM,Jane Smith
ID.AM-01,Not Applicable,Not Applicable,,,
```
