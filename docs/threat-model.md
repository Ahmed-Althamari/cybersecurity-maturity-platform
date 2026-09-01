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
| Attacker forges a JWT to impersonate a user | HMAC-signed JWT (`JwtStrategy` verifies signature against `JWT_SECRET`); no algorithm-confusion risk (`@nestjs/jwt` defaults to `HS256`, and the strategy doesn't accept an alternate algorithm from the token header) | Low, **provided** `JWT_SECRET` is a real, non-default value in production — the hardcoded fallback is a known public string in this repo, so a deployment that forgets to override it is trivially spoofable. See `docs/security-architecture.md`'s "Secrets management." |
| Credential stuffing / brute force against `/auth/login` | **None.** No rate limiting exists in this codebase despite `.env.example` implying it does (confirmed by grep — see `docs/security-architecture.md`). | **High** for an internet-facing deployment with weak passwords. This is the single most actionable finding in this threat model: add `@nestjs/throttler` (or an upstream WAF rule) on `POST /auth/login` before any real deployment. |
| Stolen/leaked JWT reused after logout or password change | `POST /auth/logout` only logs the event — it does not invalidate the token. A stolen token remains valid for up to 24h regardless. | Medium. Mitigated only by the 24h expiry ceiling; no revocation list exists. Tracked in "Known gaps." |
| CSRF against a browser-held session | The API is a stateless bearer-token API, not cookie-session-based, so classic CSRF (which relies on the browser auto-attaching cookies) doesn't directly apply to it. NextAuth's own session cookie on the Next.js side is `HttpOnly`/`SameSite`-protected by NextAuth's defaults. | Low. |

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

## Denial of Service

| Threat | Mitigation | Residual risk |
|---|---|---|
| Oversized spreadsheet upload exhausting memory/CPU during parsing | 5MB hard cap enforced by the multipart interceptor before parsing begins (`MAX_IMPORT_FILE_BYTES`). | Low for this one endpoint. |
| Unbounded/expensive query (e.g. a very large `GET /risks` with no pagination) | **No pagination exists** on most list endpoints (only `/audit-events` paginates) — a tenant with a very large dataset returns its entire result set in one response. | Medium as data volume grows; not exploitable cross-tenant (an attacker can only hurt their own tenant's response time), but a real scalability gap worth addressing before onboarding a large customer. |
| Login-endpoint flooding | No rate limiting — see "Spoofing" above; the same gap applies here as a resource-exhaustion vector, not just a credential-guessing one. | High for an internet-facing deployment. |
| CI pipeline abuse (e.g. a malicious PR triggering expensive jobs repeatedly) | GitHub Actions' own default concurrency/cost controls apply; `ci.yml` additionally cancels superseded runs on the same ref (`concurrency: cancel-in-progress: true`). | Low — standard GitHub Actions posture, nothing CMMP-specific added beyond the cancel-in-progress setting. |

## Elevation of Privilege

| Threat | Mitigation | Residual risk |
|---|---|---|
| A user with one role reaches an endpoint gated to another role | `RolesGuard` checks the caller's full `roles[]` array against the route's `@Roles()` metadata — see the two real bugs already found and fixed in this exact mechanism (documented in `docs/security-architecture.md`, not repeated here). | Low today, given both were found and fixed with regression tests, but this guard is hand-written (not a framework-provided, independently-audited primitive) — any new controller must apply `@Roles()` at the method level, matching the established pattern, or it silently falls through to "no roles required." |
| A user without an organisation assignment reaches organisation-scoped data anyway | `Organisation`-scoped queries filter by the resource's own `organisationId`, checked against organisations the caller's tenant/role legitimately has access to at the service layer (e.g. `AssessmentsService` checks organisation ownership against the caller's tenant before an assessment can even be created against it). | Low, but this is enforced per-service rather than by one central authorization primitive — a new resource type added without following the same pattern could reintroduce a gap. |
| `EXECUTIVE_VIEWER` reaching non-dashboard endpoints it was conceptually meant to be excluded from | **Not enforced.** Confirmed by grep: no guard anywhere in `apps/api/src` references `UserRole.EXECUTIVE_VIEWER` specifically — it is only ever included in role lists identically to `READ_ONLY_VIEWER`. Functionally, today, `EXECUTIVE_VIEWER` **is** `READ_ONLY_VIEWER` with a different label. | Low as a security issue (it doesn't grant *more* access than a read-only viewer already has — see `docs/architecture.md`'s permission matrix aspiration vs. reality), but it's a real product/design gap if "executive-only, dashboard-only" access was an actual requirement. |
| Import endpoint used to create/modify resources beyond assessment items (path traversal via a crafted mapping, arbitrary field writes) | `ColumnMapping`'s target fields are restricted to a fixed, typed key set (`keyof MappedAssessmentRow`) — a mapping can only ever address one of those named fields, never an arbitrary Prisma field. | Low. |

## Summary of the highest-priority items

Ranked by a rough severity × likelihood judgment, for whoever picks this up
next:

1. **Add rate limiting to `/auth/login`** (Spoofing/DoS) — the single
   highest-value fix in this document; currently zero mitigation.
2. **Confirm `JWT_SECRET`/`NEXTAUTH_SECRET` are real values, never the
   hardcoded fallback, before any non-local deployment** — a process/
   checklist fix, not a code fix (though a startup check that refuses to
   boot on the default value would be a stronger, code-level guarantee).
3. **Add pagination to the remaining list endpoints** (DoS/scalability) —
   before onboarding a tenant with a large dataset.
4. **Decide whether `EXECUTIVE_VIEWER` needs real behavior** — either wire
   it to a dashboard-only guard, or fold it into `READ_ONLY_VIEWER` and
   remove the distinction rather than leave it silently unenforced.
5. **Token revocation** — at minimum a logout-side blacklist, ideally
   short-lived access tokens plus a refresh-token rotation scheme.
