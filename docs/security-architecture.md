# Security Architecture & Threat Model

This is the security counterpart to `docs/architecture.md`: what's
actually implemented and verified, a STRIDE-based threat model of the
real system, and an honest list of what's declared (in `.env.example`,
in earlier drafts of this document, in `SECURITY.md`) but not actually
built. `SECURITY.md` covers contribution/reporting process; this covers
design.

## Security Controls (Implemented & Verified)

| Control | Where | How it's verified |
|---|---|---|
| **Tenant isolation** | Every tenant-scoped service, `where: { tenantId, ... }` on every query, `tenantId` sourced from the JWT never a client value | `apps/api/test/tenant-isolation.e2e-spec.ts` — two real tenants, one creates a Risk, the other 404s/empty-lists it on every read/write path |
| **RBAC** | `RolesGuard` + `@Roles(...)` on individual route handlers (not the controller class — see the Phase 13 bug below) | `apps/api/test/authorization.e2e-spec.ts` — role-by-role 403/200 assertions against a live server, including a regression test for the class-vs-method bug |
| **Authentication** | JWT (`@nestjs/jwt`), bcrypt password hashing (12 salt rounds, `users.service.ts`), Passport JWT strategy validates every protected request | `auth.service.spec.ts` + `apps/api/test/auth.e2e-spec.ts` (real login/me against a live server) — see the Token revocation row below for logout specifically |
| **Audit logging** | Global `AuditInterceptor`, append-only `AuditEvent` rows, no update/delete method exists on `AuditService` | `audit.interceptor.spec.ts`, `audit.service.spec.ts`, live verification in Phase 13's own writeup |
| **Credential redaction in audit trail** | `sanitizeForAudit()` replaces `password`/`token`/`secret`-shaped keys with `[REDACTED]` before a request body is ever persisted | `sanitize.spec.ts` + live: confirmed a real login/user-create audit row shows `[REDACTED]`, not the submitted password |
| **Formula/CSV injection defense** | `@cmmp/import-engine`'s `sanitizeCellValue()` — a cell starting with `=`, `+`, `-`, `@`, or a control character gets prefixed with `'` before storage | `sanitize.spec.ts` in `import-engine`, plus a live end-to-end import test |
| **Input validation** | `class-validator` DTOs with `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — an unexpected field in a request body is rejected outright, not silently dropped | Exercised by every e2e test that posts a body |
| **File upload hardening** | `@cmmp/import-engine`'s `validateFileUpload()` — extension allowlist, path-traversal character rejection, 10MB size cap, 20,000 row cap — plus `validateFileSignature()`, which rejects a file whose actual bytes don't match its claimed extension (a real ZIP local-file-header signature for `.xlsx`/`.xls`; a binary-content check for `.csv`) before any parsing is attempted, closing the "renamed/disguised file" gap the extension/size/MIME checks alone don't catch | `file-guard.spec.ts` |
| **Security response headers** | `helmet()` on the NestJS API (`main.ts`) — CSP (`default-src`/`frame-ancestors: 'none'`, appropriate for a pure JSON API), HSTS (1 year, includes subdomains), `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`. Replaces an earlier hand-rolled middleware that set only the latter two headers (plus the deprecated, no-longer-meaningful `X-XSS-Protection`) with no CSP/HSTS/Referrer-Policy at all. The Next.js web app (`apps/web/next.config.js`) sets the equivalent headers via its own `headers()` config | `apps/api/test/security-headers.integration-spec.ts` — asserts every header directly against a real HTTP response from the real app (via `apps/api/test/support/app.ts`, which now mirrors `main.ts`'s full middleware stack) |
| **CORS** | Restricted to a single configured origin (`CORS_ORIGIN` env var, defaults to `http://localhost:3000`), not `*` | Manual inspection of `main.ts` |
| **Soft delete** | `deletedAt` timestamp instead of hard `DELETE` across tenant-scoped resources — every read filters `deletedAt: null` | Consistent pattern, unit-tested per-resource (e.g. `risks.service.spec.ts`'s "soft-deletes rather than hard-deletes") |
| **Rate limiting** | `@nestjs/throttler`, global `APP_GUARD`. App-wide default (100 req/15min/IP, configurable via `RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_MS`) plus a much tighter override on `POST /auth/login` specifically (5/min/IP via `@Throttle()`) — that's the one endpoint reachable with zero prior authentication, so it's the one that needs brute-force resistance rather than just general abuse protection. `GET /health` is exempted (`@SkipThrottle()`) since it's designed for frequent automated polling. `ENABLE_RATE_LIMITING` in `.env.example` is *not* wired as an on/off toggle — rate limiting is unconditionally on, a deliberate choice for a security product (opt-out is the wrong default here) | `apps/api/test/rate-limit.e2e-spec.ts` — 5 login attempts succeed (as 401s, wrong password), the 6th gets a real 429 with a `Retry-After` header even when the credentials on that 6th attempt are correct; `/health` confirmed still reachable after login's limit is exhausted |
| **Token revocation on logout** | A `RevokedToken` table keyed by `jti` (a unique id added to every JWT at sign time). `POST /auth/logout` upserts a row for *that specific token's* `jti`; `JwtStrategy.validate()` checks it on every authenticated request and rejects with 401 if found. Per-token, not a global "sign out everywhere" — a different session for the same user (a different device, a different tab) is untouched | `apps/api/test/token-revocation.e2e-spec.ts` — logs out one of two sessions and confirms the other still works, confirms the same token can't log out twice; `auth.service.spec.ts`/`jwt.strategy.spec.ts` unit-test the upsert and the revocation check directly |
| **Refresh-token rotation** | `POST /auth/refresh` revokes the token it was called with (same `RevokedToken` mechanism as logout) the moment it mints the new one, so a leaked pre-refresh token can't go on being used indefinitely just because its holder refreshes | `apps/api/test/token-revocation.e2e-spec.ts` — the token used to call `/refresh` 401s immediately afterward while the newly minted one works; `auth.service.spec.ts` asserts the exact revocation call (correct `jti`/`expiresAt`) |
| **RevokedToken pruning** | `RevokedTokenCleanupService` (`@nestjs/schedule`, `@Cron(CronExpression.EVERY_HOUR)`) deletes rows whose `expiresAt` has already passed, keeping the table from growing without bound | `revoked-token-cleanup.service.spec.ts`; live: inserted a real already-expired row and a real future-dated row directly via `psql`, ran the service's own query against the live database, confirmed exactly the expired row was deleted and the future one survived |
| **Password change with cross-session revocation** | `POST /auth/change-password` verifies the current password, stamps `User.passwordChangedAt`, and mints a fresh token for the caller. `JwtStrategy.validate()` rejects any token whose `issuedAtMs` claim predates that stamp — a wholesale cutoff of every *other* previously-issued token for that user (a stolen/leaked token, a session left open on another device), not just the one used to make the change. Uses a custom millisecond-precision `issuedAtMs` claim rather than the standard `iat` (only second-precision — not fine enough to correctly order a token issued in the same wall-clock second as the change; this was caught as a real, intermittent integration-test failure, not a hypothetical) | `auth.service.spec.ts` / `jwt.strategy.spec.ts` unit-test the hashing, stamping, and rejection logic directly; `apps/api/test/change-password.integration-spec.ts` confirms it end-to-end against a live server — two concurrent sessions, one changes the password, both its own old token and the other session's token 401 afterward, and the freshly-returned token still works |
| **Audit log immutability at the database level** | A Postgres trigger (`prevent_audit_events_update()`, `packages/database/prisma/migrations/*_audit_events_immutable_update`) unconditionally rejects any `UPDATE` against `audit_events`, for every role and connection, with no bypass — defense-in-depth on top of (not a replacement for) the application-level guarantee below. Deliberately scoped to `UPDATE` only, not `DELETE`: `AuditEvent.tenantId` has `onDelete: Cascade`, so deleting a Tenant (a real, legitimate operation) cascades into deleting its audit rows through the same DELETE machinery a row-level trigger can't distinguish from a direct, illegitimate delete — blocking DELETE unconditionally would have broken that cascade | `apps/api/test/audit-immutability.integration-spec.ts` — a direct `UPDATE` against a real row is rejected at the database level; a direct `DELETE` is confirmed still allowed |

## Security Gaps (Honestly, Not Implemented)

Declared somewhere (an env var, an earlier draft of `docs/architecture.md`,
`SECURITY.md`'s aspirational language) but not actually built:

- **Encryption at rest** — no application-level field encryption; relies
  entirely on whatever the Postgres host provides. Nothing wrong with
  that as a starting point, but it's not "AES-256 for sensitive fields"
  as an earlier draft of this document claimed.
- **Secrets management** — environment variables only. No AWS Secrets
  Manager / HashiCorp Vault integration exists (both were mentioned in
  earlier drafts as "production" behavior that was never built).
- **WAF / network-layer controls** — there is no cloud deployment at all
  yet (see `docs/DEPLOYMENT.md`), so there's nothing to put a WAF in
  front of. Not a gap in the running system so much as a gap that
  doesn't apply until a real deployment target exists.
- **MFA** — not implemented. Single-factor password login only.
- **Frontend security testing** — zero automated frontend tests (unit,
  component, or E2E) — see `docs/architecture.md`'s frontend section.

## Threat Model — STRIDE

Scoped to the system as it exists (`apps/api`, `apps/web`, PostgreSQL —
no cloud infrastructure yet, so infrastructure-layer threats are noted
as "not yet applicable" rather than analysed against a target that
doesn't exist).

### Spoofing (impersonating a user or the API itself)

| Threat | Mitigation | Residual risk |
|---|---|---|
| Credential stuffing / password guessing against `POST /auth/login` | bcrypt (slow hash) makes offline cracking of a stolen hash expensive; `@nestjs/throttler` caps login at 5 attempts/minute/IP (see Security Controls above) | IP-based limiting is bypassable by an attacker rotating source IPs (a botnet, a proxy pool) — this stops casual/single-source brute force, not a distributed one. No account-level lockout exists as a second layer. |
| Forged JWT | HMAC-signed (`@nestjs/jwt`), verified by `JwtStrategy` on every request; `resolveJwtSecret()` refuses to start in production if `JWT_SECRET` is unset rather than falling back to the value hard-coded in the public source tree | Outside production the fallback still applies (by design, so dev/CI don't need a configured secret) — a staging environment that forgets to set `NODE_ENV=production` would silently keep using it. |
| Session fixation / token theft | Bearer token over HTTPS (in a real deployment — this sandbox runs plain HTTP locally); a user who suspects theft can now log out to actually kill that specific token (previously a no-op) | No token binding to IP/user-agent, and revocation only helps if the legitimate user notices and logs out — an attacker who's quietly using a stolen token isn't detected or cut off automatically. Standard JWT trade-off, not unique to this system, but worth naming. |

### Tampering (modifying data or requests in transit/at rest)

| Threat | Mitigation | Residual risk |
|---|---|---|
| A user modifying another tenant's data by guessing/enumerating IDs | Every query scoped server-side to the caller's `tenantId` — verified live via `tenant-isolation.e2e-spec.ts`, which now covers `Risk`, `RemediationInitiative`, `Assessment`, `Framework`, and `User` each with their own dedicated cross-tenant test (read/list/update/delete, or the applicable subset per resource) | None identified for the resources with a dedicated e2e test — every tenant-scoped resource in the system now has one. |
| A client sending computed fields it shouldn't control (e.g. `riskLevel`, `inherentRiskScore`) | Both are always recomputed server-side from `likelihood`/`impact`; `ValidationPipe({ whitelist: true })` strips unrecognised fields from the DTO before the service ever sees them | None identified. |
| Formula/CSV injection via a malicious spreadsheet upload | `sanitizeCellValue()` neutralises any formula-looking cell before storage | Covered. |
| Man-in-the-middle on API traffic | None at the application layer — TLS is a deployment-time concern | No TLS termination configured anywhere in this repo (Docker Compose, CI). Must be added at the reverse-proxy/load-balancer layer in any real deployment. |

### Repudiation (denying an action was taken)

| Threat | Mitigation | Residual risk |
|---|---|---|
| A user denying they performed a mutating action | `AuditEvent` rows: actor, action, resource, resourceId, IP, user-agent, correlation id, timestamp — append-only | Audit writes are best-effort: `AuditService.record()` catches its own errors and logs rather than failing the request (a deliberate trade-off — a logging outage shouldn't take down the API), so a database blip during a write could produce a gap in the trail with no alert raised for it. |
| Tampering with the audit log itself to hide an action | No `update`/`delete` method exists on `AuditService`; `AuditController` exposes only `GET` routes — and, as of this reconciliation, a Postgres trigger also unconditionally rejects any `UPDATE` against `audit_events` at the database level, closing the gap direct database access (e.g. `psql`) previously left open | `DELETE` against `audit_events` is still unrestricted at the database level (a deliberate scope choice — see the Security Controls table above) — a direct, illegitimate delete via `psql` is not distinguishable from the legitimate tenant-deletion cascade this system relies on. |

### Information Disclosure (exposing data to those who shouldn't see it)

| Threat | Mitigation | Residual risk |
|---|---|---|
| Cross-tenant data leakage via API responses | Server-side tenant scoping (see Tampering) | Same scope caveat as above. |
| Leaking credentials via the audit trail | `sanitizeForAudit()` redaction | Covered for `password`/`token`/`secret`-named fields specifically; a differently-named sensitive field (e.g. a custom DTO field not matching the redaction key list) would NOT be caught — the redaction list is a fixed set of key names, not a content-based scan. |
| Verbose error messages leaking internals | NestJS's default exception filter returns structured JSON without stack traces in production mode | Not independently verified in this session — depends on `NODE_ENV=production` actually being set at deploy time. |
| Exposing the full API schema via Swagger | `ENABLE_SWAGGER` env var, off unless explicitly set (Phase 17) | If a deployment sets `ENABLE_SWAGGER=true` in production without also putting it behind auth/network controls, the full route/DTO schema (not data, but structure) becomes public. Deliberate opt-in, not a silent default — but still worth remembering to unset in production. |
| Health endpoint leaking infrastructure detail | `GET /health` returns only `{status, database}` — no version strings, stack traces, or connection details | Covered — deliberately minimal by design. |

### Denial of Service

| Threat | Mitigation | Residual risk |
|---|---|---|
| Unbounded file upload | 10MB size cap, 20,000 row cap (`file-guard.ts`); the underlying multipart parser (`multer`) is now `2.3.0`, past 5 real DoS advisories (4 high, 1 moderate — incomplete-cleanup, resource-exhaustion, uncontrolled-recursion, and deeply-nested-field-name variants) that affected the exact `<2.0.2` version this repo shipped through Post-Phase-17 Hardening | A zip bomb inside a valid-looking `.xlsx` isn't fully mitigated — `exceljs` doesn't expose a cheap "inspect before decompressing" API, so the compressed-size cap is the practical defense today, not a true streaming byte-budget decompressor. Documented as a known limitation in `import-engine`'s own code comments since Phase 8. Also unaddressed: `@nestjs/common`'s own `file-type` dependency carries a separate, still-open ZIP-decompression-bomb advisory (moderate) — confirmed to require the same NestJS-ecosystem major-version bump as the rest of that dependency cluster, not a safe patch. |
| Login brute-force as a resource-exhaustion vector | 5/min/IP throttle on `POST /auth/login` | Same distributed-source caveat as the Spoofing section. |
| Unbounded query results | Most list endpoints don't paginate (`GET /risks` returns everything matching the filter); `GET /audit-events` and (as of this reconciliation) `GET /remediation-initiatives` do paginate (`page`/`pageSize`, capped at 100) | A tenant with a very large Risk table could still produce a large, slow response. Not yet a problem at demo-data scale (106 seeded assessment items), worth revisiting before real production data volumes. |

### Elevation of Privilege

| Threat | Mitigation | Residual risk |
|---|---|---|
| A lower-privileged role calling a higher-privileged endpoint | `RolesGuard` checks `@Roles(...)` per handler | **Found and fixed during Phase 13**: `@Roles()` applied at the controller *class* level is a silent no-op — `RolesGuard.canActivate()` reads `this.reflector.get(ROLES_KEY, context.getHandler())`, handler-level only. The first version of `AuditController` had exactly this bug (class-level `@Roles()`), meaning every authenticated role — not just the five intended ones — could read the audit log, until live testing caught it (ASSESSOR got 200 where 403 was expected). Fixed, and now has a dedicated regression test (`authorization.e2e-spec.ts`). Worth a repo-wide grep before trusting any *new* controller's role gating, since the guard has no compile-time or lint-time safety net for this specific mistake. |
| A user assigning themselves a higher role | `POST /users/:id/roles/:role` is itself role-gated to PLATFORM_ADMIN/ORGANISATION_ADMIN | Covered — a non-admin cannot self-escalate through this endpoint. |
| JWT tampering to inject a different `role`/`roles` claim | HMAC signature verification rejects any modified token | Covered, contingent on `JWT_SECRET` actually being a real secret in production (see Spoofing). |

## OWASP Top 10 (2021) — Quick Cross-Reference

| # | Category | Status |
|---|---|---|
| A01 | Broken Access Control | Server-side tenant scoping + RBAC implemented and e2e-tested; see the Phase 13 class-vs-method bug above as a cautionary example of how this category bites even with a guard in place |
| A02 | Cryptographic Failures | bcrypt for passwords; no TLS termination configured in this repo (deployment-time); no encryption at rest beyond the DB host's own |
| A03 | Injection | Prisma parameterises all queries (no raw SQL string concatenation anywhere in the services this session touched); formula/CSV injection specifically defended against on spreadsheet import |
| A04 | Insecure Design | Tenant isolation and RBAC are structural (every service follows the same validated-scope pattern), not bolted on per-endpoint |
| A05 | Security Misconfiguration | `JWT_SECRET` now fails closed in production (see Spoofing); the residual case is a non-production environment mislabeled as such |
| A06 | Vulnerable & Outdated Components | Dependabot + `npm audit --audit-level=high` in CI (Phase 16); GitHub's own banner currently shows 72 open advisories (1 critical, 25 high, 37 moderate, 9 low) repo-wide, un-triaged as of this writing |
| A07 | Identification & Authentication Failures | Login is now rate-limited (5/min/IP), and logout and refresh both really revoke the token being replaced; no MFA remains open — see Security Gaps above |
| A08 | Software & Data Integrity Failures | `package-lock.json` committed (reproducible installs); no code-signing or SLSA-style provenance |
| A09 | Security Logging & Monitoring Failures | Audit logging exists and is append-only; no alerting/monitoring layer on top of it (no SIEM integration, no anomaly detection) |
| A10 | Server-Side Request Forgery | Not directly applicable — no endpoint accepts and fetches an arbitrary user-supplied URL |

## Priority Order for Closing Gaps

Every item below is now done — struck rather than deleted, so the
priority history stays visible. See `docs/IMPLEMENTATION_STATUS.md`'s
"Next Steps" for what's still genuinely open (the large NestJS/Next.js
major-version bumps this list deliberately never asked for, and getting
real GitHub Dependabot alert data this session had no tool access to):

1. ~~Rate limiting on `/auth/login`~~ — done (`@nestjs/throttler`,
   5/min/IP, `apps/api/test/rate-limit.e2e-spec.ts`).
2. ~~Fail-closed on missing `JWT_SECRET`~~ — done
   (`resolveJwtSecret()` in `jwt-secret.ts` throws in production when
   unset; `jwt-secret.spec.ts`).
3. ~~Token revocation on logout~~ — done: a database-backed
   `RevokedToken` table keyed by `jti` (survives a restart, works across
   multiple instances, unlike an in-memory deny-list), checked in
   `JwtStrategy.validate()` on every request;
   `apps/api/test/token-revocation.e2e-spec.ts`.
4. ~~Refresh-token rotation~~ — done: `refreshToken()` now revokes the
   token it was called with (via the same `RevokedToken` mechanism)
   right after minting the replacement, rather than leaving the old one
   valid alongside the new one; `apps/api/test/token-revocation.e2e-spec.ts`.
5. ~~Triage the 72 open Dependabot advisories~~ — done as far as this
   session's tooling allowed: no GitHub Dependabot-alerts API access
   existed here, so `npm audit` (~30 findings, the npm-ecosystem subset
   of the 72) was the real, actionable source. Found and fixed `multer`
   — a direct runtime dependency behind the file-upload endpoint, 5 real
   DoS advisories, fixable via a root `overrides` entry without the
   major-version bump `npm audit`'s own suggestion implied was required.
   Confirmed the rest (Next.js, the NestJS 10→12 ecosystem) genuinely
   need those major bumps — not left unchecked, actually verified via a
   real `npm audit fix` run finding nothing further. See
   `docs/IMPLEMENTATION_STATUS.md`'s Post-Phase-17 Hardening section for
   the full writeup, including a resolution quirk (`npm dedupe`'s
   unrelated blast radius) worth knowing about before touching this
   dependency tree again.
6. ~~Extend the tenant-isolation e2e pattern~~ — done: `Assessment`,
   `Framework`, and `User` now each have their own cross-tenant e2e
   coverage in `apps/api/test/tenant-isolation.e2e-spec.ts` (nested
   `describe` blocks reusing one tenant-A/tenant-B pair rather than
   logging in separately per resource), not just `Risk`.
7. ~~Security response headers beyond the legacy trio~~ — done:
   `helmet()` on the API (CSP, HSTS, Referrer-Policy) and the Next.js
   equivalent on the web app, replacing a hand-rolled
   `X-Content-Type-Options`/`X-Frame-Options`/`X-XSS-Protection`-only
   middleware with no CSP/HSTS/Referrer-Policy at all;
   `apps/api/test/security-headers.integration-spec.ts`.
8. ~~Audit log immutability at the database level~~ — done: a Postgres
   trigger rejects any `UPDATE` against `audit_events` unconditionally,
   for every role and connection, on top of the existing application-
   level guarantee (no update/delete method on `AuditService`);
   `apps/api/test/audit-immutability.integration-spec.ts`.
9. ~~File-upload signature/magic-byte validation~~ — done:
   `validateFileSignature()` rejects a file whose actual bytes don't
   match its claimed extension (ZIP signature for `.xlsx`/`.xls`, a
   binary-content check for `.csv`) before any parsing is attempted, in
   addition to the existing extension/size/MIME checks; `file-guard.spec.ts`.
10. ~~Password-change-triggered token revocation~~ — done:
    `POST /auth/change-password` stamps `passwordChangedAt`, and
    `JwtStrategy` rejects any token issued before that stamp — every
    *other* outstanding session is revoked, while a fresh token is
    minted for the caller's own session; `apps/api/test/change-password.integration-spec.ts`.

This reconciliation (see `docs/IMPLEMENTATION_STATUS.md`'s "Branch
Reconciliation" section for the full writeup) merged a second,
independently-developed hardening effort (PRs #2/#20) into the branch
that already contained items 1–6 above (PR #21). Items 7–10 are what
that second effort added that wasn't already covered; its own
independent rebuilds of already-covered ground (a second rate-limiting
implementation, a second RBAC/audit/import stack, etc.) were not carried
forward — see that section for which was which and why.
