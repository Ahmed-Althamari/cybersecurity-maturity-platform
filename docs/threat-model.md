# Threat Model (STRIDE)

A STRIDE analysis of CMMP as actually built — grounded in
`docs/security-architecture.md` and `docs/data-model.md`, not a generic
template. Each section lists concrete threats against this specific
system's assets and flows, the mitigation actually in place today (if any),
and the residual risk. Where a mitigation doesn't exist yet, that's stated
plainly rather than glossed over — this document is meant to be acted on.

## Assets in scope

- Tenant/organisation data (assessments, risks, remediation initiatives,
  audit trail) — the core thing tenant isolation exists to protect.
- User credentials and session tokens (JWTs).
- Uploaded spreadsheets (assessment-response imports) and their content.
- The audit trail itself, as a record of what happened.
- The CI/CD pipeline and its GHCR-published container images.

## Trust boundaries

1. **Browser ↔ Next.js (`apps/web`)** — untrusted input from any visitor.
2. **Next.js server-side ↔ NestJS API** — `INTERNAL_API_URL`/
   `NEXT_PUBLIC_API_URL`, carries the bearer JWT.
3. **NestJS API ↔ PostgreSQL** — the only place raw tenant data is queried;
   Prisma is the sole client.
4. **Tenant A ↔ Tenant B** — no shared trust; enforced entirely in
   application code (see `docs/security-architecture.md`'s "Tenant
   isolation").
5. **CI runner ↔ GHCR / the Security tab** — where built images and scan
   results leave the repo's own control.

---

## Spoofing (identity)

| Threat | Mitigation | Residual risk |
|---|---|---|
| Attacker forges a JWT to impersonate a user | HMAC-signed JWT (`JwtStrategy` verifies signature against `JWT_SECRET`); no algorithm-confusion risk (`@nestjs/jwt` defaults to `HS256`, and the strategy doesn't accept an alternate algorithm from the token header). **Fixed:** the hardcoded fallback secret is still in code for local-dev convenience, but `validate-env.ts`/`next.config.js`+`check-env.js` now refuse to start with `NODE_ENV=production` if `JWT_SECRET`/`NEXTAUTH_SECRET` are unset or equal to any known placeholder (including `.env.example`'s own text) — see `docs/security-architecture.md`'s "Secrets management." | Low. A production deployment can no longer silently boot on the public fallback string; it fails closed instead. |
| Credential stuffing / brute force against `/auth/login` | **Fixed.** `@nestjs/throttler` on the login handler only: `AUTH_RATE_LIMIT_MAX_ATTEMPTS` (default 20) per `AUTH_RATE_LIMIT_WINDOW_MS` (default 60s) per IP, every attempt counted regardless of outcome. Live-verified: attempt 21 in a window returns `429`, an unrelated route in the same window is unaffected. | Low-Medium — meaningfully raises the cost of automated guessing, but tracking by IP means a distributed attack (many source IPs) isn't slowed by this alone; that needs a WAF/CDN-level control in front of a real deployment, which is out of this application's own scope. |
| Stolen/leaked JWT reused after logout | **Fixed.** Every issued token now carries a random `jti` claim; `POST /auth/logout` writes it to a `RevokedToken` table, and `JwtStrategy.validate()` checks that table on every authenticated request — a logged-out token is rejected on the very next call, not just after its 24h expiry. `POST /auth/refresh` also rotates: the presented token is revoked the moment a new one is issued, so a refreshed-away token can't be replayed either. `POST /auth/change-password` closes the last gap here too: it stamps `User.passwordChangedAt`, and `JwtStrategy` rejects *any* token issued before that timestamp — not just the one used to make the change, every other outstanding session for that user as well (a stolen token included), while minting a fresh one so the caller's own session survives. Live-verified over real HTTP (including a real running server, not just the test app) and in a real browser (the actual "Sign Out" button now calls the backend, not just NextAuth's client-side session). | Low. A stolen token used *before* logout or a password change is caught remains valid for that window — the only remaining gap, not the entire lifetime. |
| CSRF against a browser-held session | The API is a stateless bearer-token API, not cookie-session-based, so classic CSRF (which relies on the browser auto-attaching cookies) doesn't directly apply to it — every real API call carries its token in an `Authorization` header, set explicitly by JS a cross-origin attacker page can't forge. NextAuth's own `/api/auth/callback/credentials` sign-in endpoint additionally has its own CSRF-token check, live-verified: a request with no token, or a real cookie paired with a wrong token, is rejected (`{"url":"...?csrf=true"}`, no session cookie set); only the correct cookie+token pair reaches credential validation and sets a real session cookie. That session cookie is also `SameSite=Lax` (confirmed in the live response), so a cross-site POST wouldn't even carry it regardless of the token check. | Low. |

## Tampering (data integrity)

| Threat | Mitigation | Residual risk |
|---|---|---|
| Client sends a fabricated `inherentRiskScore` to inflate/deflate a risk's severity | Always server-computed as `likelihood × impact` in `RisksService`; never trusted from the request body. | Low. |
| Client sends extra/unexpected fields to overwrite fields it shouldn't (mass assignment) | Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` rejects any undeclared field outright. Live-verified by the Phase 14 integration suite. | Low. |
| CSV/Excel formula injection re-weaponizing imported free text later (e.g. in a future report export) | `sanitizeFormulaInjection()` neutralizes any leading formula-trigger character on import — see `docs/excel-import-guide.md`. Live-verified against a real `=cmd|'/C calc'!A1` payload. | Low, for the import path. **Not yet applicable** to any export path, because no spreadsheet/report export feature exists yet — worth re-checking whenever one is built. |
| A tampered JWT signature is accepted | `passport-jwt` rejects any signature mismatch; covered by an explicit integration test (a bit-flipped token 401s, not just a missing one). | Low. |
| Direct database tampering with `audit_events` bypassing the app | `AuditService` exposes no update/delete path in application code, but nothing at the database-grant level prevents a query run with the app's own DB credentials from doing so directly. | Medium — this is an application-level guarantee only. A future improvement: revoke `UPDATE`/`DELETE` on `audit_events` for the app's Postgres role, or ship to an append-only external sink. |

## Repudiation (accountability)

| Threat | Mitigation | Residual risk |
|---|---|---|
| A user denies having performed an action | `AuditInterceptor` logs every authenticated mutating request (who/what/when/resource/resourceId), plus explicit `LOGIN`/`LOGOUT` events from `AuthService`. `correlationId` (from `x-request-id` or a generated UUID) ties a request's audit entries together. | Low for actions taken through the API. **Gap**: no `previousValue` diff is captured (only `newValue`, and only from the response body) — reconstructing exactly what changed on an `UPDATE` requires cross-referencing `AssessmentHistory` (assessment status transitions only) or nothing at all for most other resources. |
| An audit log write silently fails, leaving no record | `AuditService.log()` never throws (a failure is caught and `Logger.error`'d) — this is a deliberate availability-over-completeness tradeoff: the underlying action still succeeds even if its audit record doesn't. | Medium — a failed audit write is currently only visible in application logs, not surfaced anywhere an operator would reliably see it (no alerting on audit-write failures). |

## Information Disclosure

| Threat | Mitigation | Residual risk |
|---|---|---|
| Tenant A reads Tenant B's data via a guessed/enumerated ID | Every service method filters by the caller's own `tenantId`; a cross-tenant fetch by ID 404s rather than 403ing (doesn't even confirm existence). Verified by a dedicated integration suite creating a second real tenant. | Low. |
| A non-privileged role reads the audit log | **Was a real, exploitable bug** (Phase 13): class-level `@Roles()` on `AuditController` was silently ignored by `RolesGuard` (which only reads handler-level metadata), so any authenticated user — including `READ_ONLY_VIEWER` — could read the full tenant audit trail. Found by the Playwright suite, fixed by moving `@Roles()` to each handler method with a regression test pinning the fix. | Low now, but this class of bug (guard metadata applied at the wrong decorator level) could recur on a new controller that copies the old pattern — worth a lint rule or code-review checklist item, not currently automated. |
| Verbose error responses leak internals (stack traces, SQL, file paths) | NestJS's default exception filter returns a structured `{statusCode, message, error}` body; no custom filter in this codebase adds request internals to error responses. | Low, but not independently verified against every code path — a raw, unhandled exception in a service method would still surface NestJS's default (safe) shape rather than a stack trace, per Nest's own framework behavior, but this hasn't been fuzzed. |
| Secrets in logs | `AuditService` truncates oversized values but doesn't redact known-sensitive field names (e.g. a `password` field accidentally included in a request body would be logged verbatim if it somehow reached `newValue`). In practice, no DTO in this codebase currently accepts a raw password outside `/auth/login`, so the exposure window is narrow today. | Low today; would become Medium if a future endpoint accepted any secret-shaped field without updating the interceptor to redact it. |
| Sensitive data in a Docker image layer | `.dockerignore` excludes `.env*`; secrets are supplied at runtime via env vars, never `COPY`'d in. | Low. |
| A saved integration key (e.g. the Anthropic API key set via `/admin/settings`) leaks through the API or audit trail | `SettingsController`'s three endpoints return only `IntegrationSettingsStatus` (booleans/enums), never the key -- on a read or immediately after the write that just set it. `AuditInterceptor` only ever logs the *response* body (never the request), so the key can't reach the audit trail either. Gated to `PLATFORM_ADMIN`, `@Roles()` applied per-method from the start. See `docs/security-architecture.md`'s "Runtime-configurable secrets" and ADR-0011. | Low. |
| Direct database access exposes a stored integration key | `PlatformSetting.value` is AES-256-GCM ciphertext, never plaintext -- reading the table directly still requires `SETTINGS_ENCRYPTION_KEY` (a separate env var) to recover the real value. | Low for the database alone; Medium if `SETTINGS_ENCRYPTION_KEY` and the database backup end up accessible to the same party (the same caveat that applies to any application-level encryption-at-rest scheme with the key stored outside the database). |

## Denial of Service

| Threat | Mitigation | Residual risk |
|---|---|---|
| Oversized spreadsheet upload exhausting memory/CPU during parsing | 5MB hard cap enforced by the multipart interceptor before parsing begins (`MAX_IMPORT_FILE_BYTES`). | Low for this one endpoint. |
| Unbounded/expensive query (e.g. a very large `GET /risks` with no pagination) | **Fixed.** `/users`, `/assessments`, `/risks`, `/initiatives` all paginate now (`page`/`pageSize`, capped at 100 server-side regardless of what's requested — see `docs/api-reference.md`), same convention `/audit-events` already used. | Low. `/frameworks`, `/initiatives/timeline`, and `/assessments/:id/history` remain unpaginated deliberately (small/bounded/bucketed) — not a residual gap, a scoping choice. |
| Login-endpoint flooding | The same per-IP throttle covers this too (see "Spoofing" above) — a flood from one IP is capped identically whether the intent is guessing credentials or just burning CPU on `bcrypt.compare`. | Low-Medium, same caveat as above: a distributed flood across many IPs isn't slowed by a per-IP limit alone. |
| CI pipeline abuse (e.g. a malicious PR triggering expensive jobs repeatedly) | GitHub Actions' own default concurrency/cost controls apply; `ci.yml` additionally cancels superseded runs on the same ref (`concurrency: cancel-in-progress: true`). | Low — standard GitHub Actions posture, nothing CMMP-specific added beyond the cancel-in-progress setting. |

## Elevation of Privilege

| Threat | Mitigation | Residual risk |
|---|---|---|
| A user with one role reaches an endpoint gated to another role | `RolesGuard` checks the caller's full `roles[]` array against the route's `@Roles()` metadata — see the two real bugs already found and fixed in this exact mechanism (documented in `docs/security-architecture.md`, not repeated here). | Low today, given both were found and fixed with regression tests, but this guard is hand-written (not a framework-provided, independently-audited primitive) — any new controller must apply `@Roles()` at the method level, matching the established pattern, or it silently falls through to "no roles required." |
| A user without an organisation assignment reaches organisation-scoped data anyway | `Organisation`-scoped queries filter by the resource's own `organisationId`, checked against organisations the caller's tenant/role legitimately has access to at the service layer (e.g. `AssessmentsService` checks organisation ownership against the caller's tenant before an assessment can even be created against it). | Low, but this is enforced per-service rather than by one central authorization primitive — a new resource type added without following the same pattern could reintroduce a gap. |
| `EXECUTIVE_VIEWER` reaching non-dashboard endpoints it was conceptually meant to be excluded from | **Fixed.** `ExecutiveViewerScopeGuard`, composed into `JwtAuthGuard`, denies a token whose *only* role is `EXECUTIVE_VIEWER` on every endpoint except those marked `@ExecutiveDashboardAccessible()` (the dashboard sub-routes, the assessment list, and session lifecycle). Live-verified over real HTTP and in a real browser — see `docs/security-architecture.md`'s "RBAC" section for why a naive version of this (a global `APP_GUARD`) looked correct in every unit test yet did nothing in production. | Low. A user who also holds a broader role keeps that role's full access, matching every other guard in this codebase. |
| Import endpoint used to create/modify resources beyond assessment items (path traversal via a crafted mapping, arbitrary field writes) | `ColumnMapping`'s target fields are restricted to a fixed, typed key set (`keyof MappedAssessmentRow`) — a mapping can only ever address one of those named fields, never an arbitrary Prisma field. | Low. |

## Summary of the highest-priority items

Ranked by a rough severity × likelihood judgment, for whoever picks this up
next:

1. ~~Add rate limiting to `/auth/login`~~ — **done**: `@nestjs/throttler`,
   per-IP, scoped to the login handler only. Was the single highest-value
   fix in this document; see `docs/security-architecture.md`.
2. ~~Confirm `JWT_SECRET`/`NEXTAUTH_SECRET` are real values, never the
   hardcoded fallback, before any non-local deployment~~ — **done, and
   upgraded from a checklist item to a code-level guarantee**:
   `apps/api/src/config/validate-env.ts` and `apps/web`'s `next.config.js`
   + `scripts/check-env.js` now refuse to start with `NODE_ENV=production`
   if either secret is unset or equals any known placeholder (the two
   hardcoded fallbacks, `docker-compose.yml`'s defaults, or
   `.env.example`'s own placeholder text). See `docs/security-architecture.md`.
3. ~~Add pagination to the remaining list endpoints~~ — **done**: `/users`,
   `/assessments`, `/risks`, `/initiatives` all paginate now (`PaginatedResponse<T>`,
   default 20/page, capped at 100 — see `docs/api-reference.md`).
4. ~~Decide whether `EXECUTIVE_VIEWER` needs real behavior~~ — **done**:
   wired to a real dashboard-only guard (`ExecutiveViewerScopeGuard`),
   matching `docs/architecture.md`'s original "executive dashboard only"
   design intent rather than folding the role away. See
   `docs/security-architecture.md`'s "RBAC" section.
5. ~~Token revocation~~ — **done**: a logout-side blacklist
   (`RevokedToken`, keyed by a new `jti` claim on every issued token,
   checked in `JwtStrategy.validate()` on every request) plus rotation on
   `POST /auth/refresh` (the pre-refresh token is revoked the moment a new
   one is issued). Not the full short-lived-access-token-plus-separate-
   refresh-token architecture the original wording floated — the existing
   `/auth/refresh` contract (re-sign the same token type) was kept as-is,
   with rotation layered on top of it, since that's a materially smaller
   and lower-risk change for the same practical benefit. See
   `docs/security-architecture.md`.
6. **A WAF/CDN-level rate limit for a real internet-facing deployment** —
   the new per-IP login throttle helps against a single attacking host,
   but not a distributed one; that class of mitigation belongs in front of
   the application, not inside it. Now the only remaining item on this
   list — everything else here is either done or explicitly out of this
   application's own scope.
