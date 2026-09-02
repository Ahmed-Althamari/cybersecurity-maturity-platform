# API Reference

Base URL: `http://localhost:3001/api/v1` (the `/health` endpoint is the one
exception — deliberately excluded from the `api/v1` prefix so orchestrators
can probe it unauthenticated; see `main.ts`).

Every endpoint below is read directly off the real NestJS controllers under
`apps/api/src/**/*.controller.ts` — this is not a planned/aspirational API
surface. Request/response shapes are the actual DTOs and `@cmmp/shared`
types; nothing here is speculative.

## Conventions

- **Auth**: every controller except `AuthController` and `HealthController`
  carries `@UseGuards(JwtAuthGuard)` at the class level — a valid `Bearer`
  JWT (see `docs/security-architecture.md`) is required for everything
  else. `Authorization: Bearer <token>`.
- **Tenant scoping**: every service method takes the caller's `tenantId`
  (read off the JWT payload via `@CurrentUser()`) as an explicit first
  argument and filters every Prisma query by it — there is no
  request-context-implicit tenant filtering (e.g. Prisma middleware); it's
  spelled out in every service call. A resource that exists but belongs to
  a different tenant 404s, it never leaks a 403 that would confirm its
  existence.
- **Role gating**: where a route has an additional `@Roles(...)` decorator
  (on top of the class-level `JwtAuthGuard`), the required roles are listed
  below. A route with **no roles listed** means any authenticated member of
  the tenant can call it — this is intentional for read endpoints
  (dashboards, framework browsing) and is not an oversight.
- **Validation**: global `ValidationPipe({ whitelist: true,
  forbidNonWhitelisted: true, transform: true })` (`main.ts`) — any request
  body field not declared on the target DTO is rejected outright (mass-
  assignment protection), not silently dropped.
- **Pagination**: only `GET /audit-events` paginates today (`page`/
  `pageSize`, capped at 200/page). Every other list endpoint returns its
  full tenant/organisation-scoped result set.

Role name abbreviations used below match the `UserRole` enum exactly:
`PLATFORM_ADMIN`, `ORGANISATION_ADMIN`, `CISO`, `SECURITY_ARCHITECT`,
`GRC_MANAGER`, `ASSESSOR`, `CONTROL_OWNER`, `REMEDIATION_OWNER`, `AUDITOR`,
`EXECUTIVE_VIEWER`, `READ_ONLY_VIEWER`.

---

## Auth (`/auth`) — no guard (login), `JwtAuthGuard` otherwise

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/auth/login` | — | `{ email, password }` → real Prisma `User` lookup + `bcryptjs.compare`; issues a JWT (`expiresIn: '24h'`, see `AuthModule`) carrying `sub`, `email`, `tenantId`, `organisationId`, `role`, `roles[]`. Logs an `AuditAction.LOGIN` event directly (bypasses the generic interceptor so it can attach IP/user-agent even though `AuthController` responses are excluded from that interceptor's path). |
| POST | `/auth/logout` | any authenticated | Logs `AuditAction.LOGOUT`. Stateless — there is no server-side session or token blacklist; this only records the event. |
| POST | `/auth/refresh` | any authenticated | Re-signs a **valid, unexpired** token with a fresh expiry. Not a rotation scheme — the old token remains valid until its own expiry too. See "Known Issues" in `IMPLEMENTATION_STATUS.md`: no revocation/rotation exists yet. |
| GET | `/auth/me` | any authenticated | Returns the caller's own decoded JWT claims. |

## Users (`/users`)

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/users` | `PLATFORM_ADMIN`, `ORGANISATION_ADMIN` | Create a user in the caller's tenant. |
| GET | `/users` | any authenticated | Tenant-scoped list. |
| GET | `/users/:id` | any authenticated | Tenant-scoped lookup; 404 across tenants. |
| PATCH | `/users/:id` | `ORGANISATION_ADMIN`, `PLATFORM_ADMIN` | |
| DELETE | `/users/:id` | `PLATFORM_ADMIN` | Soft delete (`deletedAt`). |
| GET | `/users/:id/roles` | any authenticated | Lists the user's `UserRoleAssignment` rows. |
| POST | `/users/:id/roles/:role` | `ORGANISATION_ADMIN`, `PLATFORM_ADMIN` | Grants an additional role. |
| DELETE | `/users/:id/roles/:role` | `ORGANISATION_ADMIN`, `PLATFORM_ADMIN` | Revokes a role assignment. |

## Frameworks (`/frameworks`)

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/frameworks` | any authenticated | Every active framework in the tenant (name/version/description) — powers the assessment-creation framework picker. |
| GET | `/frameworks/:slug` | any authenticated | The full hydrated `FrameworkTree` (Function → Category → Subcategory → Question) for the latest version of that slug. |
| GET | `/frameworks/:slug/components` | any authenticated | The compact `buildFrameworkComponentDescriptor()` output (function list with color + counts) — for chart/nav rendering without hard-coding NIST CSF's six functions. |
| POST | `/frameworks/validate` | any authenticated | Dry-run: validates a `FrameworkDefinition` (Zod shape + structural checks) without persisting anything. |
| POST | `/frameworks` | `PLATFORM_ADMIN`, `ORGANISATION_ADMIN` | Persists a new framework via `persistFrameworkDefinition()` (nested nested Prisma create of the whole tree). |

## Assessments (`/assessments`)

`AUTHORS` = `PLATFORM_ADMIN`, `ORGANISATION_ADMIN`, `CISO`, `GRC_MANAGER`,
`ASSESSOR`. `APPROVERS` = `PLATFORM_ADMIN`, `ORGANISATION_ADMIN`, `CISO`.
`ARCHIVERS` = `PLATFORM_ADMIN`, `ORGANISATION_ADMIN`.

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/assessments` | AUTHORS | Resolves the named framework/version, flattens every question, bulk-creates one `AssessmentItem` per question. |
| GET | `/assessments` | any authenticated | Organisation-scoped list. |
| GET | `/assessments/:id` | any authenticated | Includes `items[]` (see `AssessmentItemDetail`). |
| PATCH | `/assessments/:id` | AUTHORS | Name/description/date only — item edits go through the item endpoint below. |
| DELETE | `/assessments/:id` | ARCHIVERS | Soft delete. |
| PATCH | `/assessments/:id/items/:itemId` | AUTHORS | Per-item update (maturity, risk, control status, rationale, evidence, owner, due date). Blocked once the assessment is `SUBMITTED`/`APPROVED`/`ARCHIVED` — reopen first. First edit on a `DRAFT` assessment auto-transitions it to `IN_PROGRESS`. Recomputes and persists the assessment's `currentMaturity`/`targetMaturity`/`maturityGap`/`completionPercentage` in the same write. |
| POST | `/assessments/:id/submit` | AUTHORS | Requires 100% `completionPercentage`. `IN_PROGRESS → SUBMITTED`. |
| POST | `/assessments/:id/approve` | APPROVERS | `SUBMITTED → APPROVED`. |
| POST | `/assessments/:id/reopen` | AUTHORS | `SUBMITTED`/`APPROVED → IN_PROGRESS`, re-enabling item edits. |
| POST | `/assessments/:id/archive` | ARCHIVERS | Reachable from any non-terminal state. |
| GET | `/assessments/:id/history` | any authenticated | Every `AssessmentHistory` row, versioned/timestamped. |
| GET | `/assessments/:id/scores` | any authenticated | `?levels=function,category,subcategory&minGap=` — the full hierarchical score plus gap-analysis list. |

## Assessment Dashboard (`/assessments/:id/dashboard`) — no extra role gate

All six of these require only `JwtAuthGuard` — any authenticated tenant
member can view an assessment's dashboard; there is no `@Roles()` on this
controller.

| Method | Path | Returns |
|---|---|---|
| GET | `/assessments/:id/dashboard` | `ExecutiveDashboard` — fans out to every section below in parallel, one payload. |
| GET | `/assessments/:id/dashboard/maturity-overview` | `MaturityOverview` — org-wide current/target/gap, completion%, critical gaps, high-risk findings, open remediations. |
| GET | `/assessments/:id/dashboard/functions` | `FunctionMaturity[]` — one per NIST function, in framework display order. |
| GET | `/assessments/:id/dashboard/gaps?minGap=` | `GapAnalysis[]` — function-level gaps enriched with code/name/`affectedControls`. |
| GET | `/assessments/:id/dashboard/heatmap` | `MaturityHeatmap` — function → category → subcategory nesting, each node's current/target/gap/riskLevel, plus a level-count `distribution`. |
| GET | `/assessments/:id/dashboard/risks` | `RiskSummary` — risks traced through this assessment's items, grouped by level/status, top 10 by severity. |
| GET | `/assessments/:id/dashboard/roadmap` | `RoadmapStatus` — initiatives traced through the Risk↔Initiative graph, grouped by status, next 10 by target date. |

## Roadmap generation (`/assessments/:id/roadmap`)

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/assessments/:id/roadmap/generate` | `PLATFORM_ADMIN`, `ORGANISATION_ADMIN`, `CISO`, `GRC_MANAGER`, `REMEDIATION_OWNER` | `?minGap=` (body, default 0.5 in the service). Creates one draft `RemediationInitiative` per function-level gap at/above the threshold; priority/timeline/complexity derived from the gap's `riskLevel` and magnitude — see `docs/scoring-methodology.md`. |

## Import (`/assessments/:id/import`)

Roles on all three routes: `PLATFORM_ADMIN`, `ORGANISATION_ADMIN`, `CISO`,
`GRC_MANAGER`, `ASSESSOR`.

| Method | Path | Notes |
|---|---|---|
| POST | `/assessments/:id/import/preview` | Multipart `file` + `format` (`csv`\|`xlsx`). Read-only — parses **every worksheet tab** in one pass (a CSV has one implicit tab) and returns `{ sheets: [{ sheetName, headers, rowCount, sampleRows, sampleFormulas }], requiredField: 'subcategoryCode', optionalFields }`. `sampleFormulas` is parallel to `sampleRows` — `{}` for a sample row with no formula cells, else `{header: "=A1+A2"}` alongside the already-resolved value in `sampleRows`. Nothing is persisted. Powers the frontend's sheet-tab picker and column-mapping UI. |
| POST | `/assessments/:id/import/suggest-mapping` | JSON body `{ headers, sampleRows }` (from a prior preview call — no file re-upload). Asks Claude to suggest a `ColumnMapping` for headers that don't exactly match a target field name (e.g. "Current Level" → `currentMaturity`). Every suggested header is verified against the real `headers` list before being returned — a hallucinated column name is dropped, never trusted. Returns `{ mapping: {} }` (never an error) when `ANTHROPIC_API_KEY` is unset or the call fails; this endpoint is a pure enhancement, never required. |
| POST | `/assessments/:id/import` | Multipart `file` + `format` + a JSON `mapping` (`ColumnMapping`) + optional `sheetName` (which xlsx tab to import — omit for CSV or a single-sheet workbook, where the importer falls back to the first sheet). 5MB cap. Parses, validates, sanitizes, then applies every valid/warning row's `AssessmentItem` update plus every row's `ImportRecord` in one `$transaction`, alongside the `ImportJob` (whose `fileName` records which sheet was imported, e.g. `"file.xlsx [Identify]"`). See `docs/excel-import-guide.md` for the full row-status contract. |

## Risks (`/risks`)

`AUTHORS` = `PLATFORM_ADMIN`, `ORGANISATION_ADMIN`, `CISO`, `GRC_MANAGER`,
`ASSESSOR`, `CONTROL_OWNER`. `DELETERS` = `PLATFORM_ADMIN`,
`ORGANISATION_ADMIN`.

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/risks` | AUTHORS | `inherentRiskScore` always server-computed (`likelihood × impact`); `riskLevel` auto-suggested unless supplied. |
| GET | `/risks?sortBy=score&organisationId=&riskLevel=&status=&assessmentItemId=` | any authenticated | Default sort: `inherentRiskScore` descending. |
| GET | `/risks/:id` | any authenticated | Includes linked control (subcategory code/question) and linked initiatives. |
| PATCH | `/risks/:id` | AUTHORS | Recomputes score/level if likelihood/impact change. |
| DELETE | `/risks/:id` | DELETERS | Hard-scoped soft delete. |
| POST | `/risks/:id/initiatives/:initiativeId` | AUTHORS | Links an existing `RemediationInitiative` (verified to belong to the caller's own tenant first). |
| DELETE | `/risks/:id/initiatives/:initiativeId` | AUTHORS | Unlinks. |

## Remediation Initiatives (`/initiatives`)

`AUTHORS` = `PLATFORM_ADMIN`, `ORGANISATION_ADMIN`, `CISO`, `GRC_MANAGER`,
`REMEDIATION_OWNER`. `DELETERS` = `PLATFORM_ADMIN`, `ORGANISATION_ADMIN`.

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/initiatives` | AUTHORS | Manual creation (in addition to `/roadmap/generate` above). |
| GET | `/initiatives` | any authenticated | Organisation-scoped list — this is what the risk-detail page's initiative picker calls. |
| GET | `/initiatives/timeline` | any authenticated | Buckets every non-completed initiative into `next3Months`/`next6Months`/`next12Months`/`beyondOrUnscheduled` by `targetCompletionDate`. |
| GET | `/initiatives/:id` | any authenticated | |
| PATCH | `/initiatives/:id` | AUTHORS | Any of the five `status` values (`PLANNED`/`IN_PROGRESS`/`COMPLETED`/`BLOCKED`/`ON_HOLD`) — a plain field, not an audited state-machine like `Assessment.status`. |
| DELETE | `/initiatives/:id` | DELETERS | |
| POST | `/initiatives/:id/risks/:riskId` | AUTHORS | Same many-to-many as the risk-side endpoint, from the initiative side. |
| DELETE | `/initiatives/:id/risks/:riskId` | AUTHORS | |

## Audit Events (`/audit-events`)

Roles on both routes: `PLATFORM_ADMIN`, `ORGANISATION_ADMIN`, `AUDITOR`,
`CISO`. Note: `@Roles()`/`@UseGuards(RolesGuard)` are applied per-*method*
here, not at the class level — a deliberate fix after a Phase 13 bug where
class-level `@Roles()` was silently ignored by `RolesGuard` (which only
ever reads handler-level metadata) and let any authenticated user read the
audit log. See `docs/security-architecture.md`.

| Method | Path | Notes |
|---|---|---|
| GET | `/audit-events?userId=&action=&resource=&resourceId=&correlationId=&from=&to=&page=&pageSize=` | Paginated, capped at 200/page. |
| GET | `/audit-events/summary?sinceDays=30` | `totalEvents`, zero-filled `byAction` counts for every `AuditAction`, `byResource` counts, 20 most recent events. |

## Settings (`/settings`)

Roles on all three routes: `PLATFORM_ADMIN` only — these configure a
shared, installation-wide integration credential, not a per-tenant
preference. Every response is `IntegrationSettingsStatus` — booleans/enums
only; **none of these endpoints ever returns the key itself**, on a read
or right after a write. See `docs/security-architecture.md`'s "Runtime-
configurable secrets" section for the full encryption-at-rest design.

| Method | Path | Notes |
|---|---|---|
| GET | `/settings/integrations` | `{ anthropicApiKeyConfigured, anthropicApiKeySource: 'database'\|'environment'\|'none' }`. |
| PUT | `/settings/integrations/anthropic-api-key` | Body `{ apiKey: string }`. Encrypts (AES-256-GCM, `@cmmp/security`) and upserts into `PlatformSetting`; takes effect on the very next call `AiMappingService` makes, no API restart. 400 if the value looks too short to be real; 500 (with a clear message, not a stack trace) if `SETTINGS_ENCRYPTION_KEY` itself isn't configured or is malformed. |
| DELETE | `/settings/integrations/anthropic-api-key` | Removes the stored key (idempotent). Falls back to the `ANTHROPIC_API_KEY` environment variable, if set, exactly as if none had ever been saved. |

## Health (`/health`) — no guard, excluded from `/api/v1` prefix

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Real DB connectivity check (`SELECT 1` via Prisma). Returns `503` (not a static 200) if the database is unreachable. Used by both Dockerfiles' `HEALTHCHECK` directives and `docker-compose.yml`'s `depends_on: condition: service_healthy`. |

---

## Error shape

NestJS's default `HttpException` JSON body throughout:
`{ "statusCode": number, "message": string | string[], "error": string }`.
Validation failures (`ValidationPipe`) return `400` with `message` as an
array of per-field violations. A resource in a different tenant/org, or one
that simply doesn't exist, returns `404` — the two are indistinguishable by
design (no existence-confirming `403`).
