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
| **Authentication** | JWT (`@nestjs/jwt`), bcrypt password hashing (12 salt rounds, `users.service.ts`), Passport JWT strategy validates every protected request | `auth.service.spec.ts` + `apps/api/test/auth.e2e-spec.ts` (real login/logout/refresh/me against a live server) |
| **Audit logging** | Global `AuditInterceptor`, append-only `AuditEvent` rows, no update/delete method exists on `AuditService` | `audit.interceptor.spec.ts`, `audit.service.spec.ts`, live verification in Phase 13's own writeup |
| **Credential redaction in audit trail** | `sanitizeForAudit()` replaces `password`/`token`/`secret`-shaped keys with `[REDACTED]` before a request body is ever persisted | `sanitize.spec.ts` + live: confirmed a real login/user-create audit row shows `[REDACTED]`, not the submitted password |
| **Formula/CSV injection defense** | `@cmmp/import-engine`'s `sanitizeCellValue()` — a cell starting with `=`, `+`, `-`, `@`, or a control character gets prefixed with `'` before storage | `sanitize.spec.ts` in `import-engine`, plus a live end-to-end import test |
| **Input validation** | `class-validator` DTOs with `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — an unexpected field in a request body is rejected outright, not silently dropped | Exercised by every e2e test that posts a body |
| **File upload hardening** | `@cmmp/import-engine`'s `validateFileUpload()` — extension allowlist, path-traversal character rejection, 10MB size cap, 20,000 row cap | `file-guard.spec.ts` |
| **Security response headers** | `main.ts`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block` on every response | Manual inspection of `main.ts`; not asserted by a test |
| **CORS** | Restricted to a single configured origin (`CORS_ORIGIN` env var, defaults to `http://localhost:3000`), not `*` | Manual inspection of `main.ts` |
| **Soft delete** | `deletedAt` timestamp instead of hard `DELETE` across tenant-scoped resources — every read filters `deletedAt: null` | Consistent pattern, unit-tested per-resource (e.g. `risks.service.spec.ts`'s "soft-deletes rather than hard-deletes") |
| **Rate limiting** | `@nestjs/throttler`, global `APP_GUARD`. App-wide default (100 req/15min/IP, configurable via `RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_MS`) plus a much tighter override on `POST /auth/login` specifically (5/min/IP via `@Throttle()`) — that's the one endpoint reachable with zero prior authentication, so it's the one that needs brute-force resistance rather than just general abuse protection. `GET /health` is exempted (`@SkipThrottle()`) since it's designed for frequent automated polling. `ENABLE_RATE_LIMITING` in `.env.example` is *not* wired as an on/off toggle — rate limiting is unconditionally on, a deliberate choice for a security product (opt-out is the wrong default here) | `apps/api/test/rate-limit.e2e-spec.ts` — 5 login attempts succeed (as 401s, wrong password), the 6th gets a real 429 with a `Retry-After` header even when the credentials on that 6th attempt are correct; `/health` confirmed still reachable after login's limit is exhausted |

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
- **Session/token revocation** — `POST /auth/logout` is a no-op
  (`auth.service.ts`: "Token-based auth doesn't require server-side
  logout... A revocation list can be added here if immediate token
  invalidation is needed"). A JWT issued before logout stays valid until
  its 24h expiry regardless of a subsequent logout call.
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
| Session fixation / token theft | Bearer token over HTTPS (in a real deployment — this sandbox runs plain HTTP locally) | No token binding to IP/user-agent; a stolen token works from anywhere until expiry. Standard JWT trade-off, not unique to this system, but worth naming. |

### Tampering (modifying data or requests in transit/at rest)

| Threat | Mitigation | Residual risk |
|---|---|---|
| A user modifying another tenant's data by guessing/enumerating IDs | Every query scoped server-side to the caller's `tenantId` — verified live via `tenant-isolation.e2e-spec.ts` | None identified for the resources this session built (Risk, RemediationInitiative). Not independently re-verified for `Assessment`/`Framework`/`User` in this same e2e style — the *pattern* is consistent across services, but only Risk and RemediationInitiative have a dedicated cross-tenant e2e test. |
| A client sending computed fields it shouldn't control (e.g. `riskLevel`, `inherentRiskScore`) | Both are always recomputed server-side from `likelihood`/`impact`; `ValidationPipe({ whitelist: true })` strips unrecognised fields from the DTO before the service ever sees them | None identified. |
| Formula/CSV injection via a malicious spreadsheet upload | `sanitizeCellValue()` neutralises any formula-looking cell before storage | Covered. |
| Man-in-the-middle on API traffic | None at the application layer — TLS is a deployment-time concern | No TLS termination configured anywhere in this repo (Docker Compose, CI). Must be added at the reverse-proxy/load-balancer layer in any real deployment. |

### Repudiation (denying an action was taken)

| Threat | Mitigation | Residual risk |
|---|---|---|
| A user denying they performed a mutating action | `AuditEvent` rows: actor, action, resource, resourceId, IP, user-agent, correlation id, timestamp — append-only | Audit writes are best-effort: `AuditService.record()` catches its own errors and logs rather than failing the request (a deliberate trade-off — a logging outage shouldn't take down the API), so a database blip during a write could produce a gap in the trail with no alert raised for it. |
| Tampering with the audit log itself to hide an action | No `update`/`delete` method exists on `AuditService`; `AuditController` exposes only `GET` routes | Nothing stops direct database access (e.g. `psql`) from modifying `audit_events` rows — this is an application-layer guarantee, not a database-level one (no append-only table constraint, no separate audit-log service). |

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
| Unbounded file upload | 10MB size cap, 20,000 row cap (`file-guard.ts`) | A zip bomb inside a valid-looking `.xlsx` isn't fully mitigated — `exceljs` doesn't expose a cheap "inspect before decompressing" API, so the compressed-size cap is the practical defense today, not a true streaming byte-budget decompressor. Documented as a known limitation in `import-engine`'s own code comments since Phase 8. |
| Login brute-force as a resource-exhaustion vector | 5/min/IP throttle on `POST /auth/login` | Same distributed-source caveat as the Spoofing section. |
| Unbounded query results | Most list endpoints don't paginate (`GET /risks`, `GET /remediation-initiatives` return everything matching the filter); `GET /audit-events` does paginate (`limit`/`offset`, default 50) | A tenant with a very large Risk/RemediationInitiative table could produce a large, slow response. Not yet a problem at demo-data scale (106 seeded assessment items), worth revisiting before real production data volumes. |

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
| A07 | Identification & Authentication Failures | Login is now rate-limited (5/min/IP); no MFA and no session/token revocation on logout remain open — see Security Gaps above |
| A08 | Software & Data Integrity Failures | `package-lock.json` committed (reproducible installs); no code-signing or SLSA-style provenance |
| A09 | Security Logging & Monitoring Failures | Audit logging exists and is append-only; no alerting/monitoring layer on top of it (no SIEM integration, no anomaly detection) |
| A10 | Server-Side Request Forgery | Not directly applicable — no endpoint accepts and fetches an arbitrary user-supplied URL |

## Priority Order for Closing Gaps

If picking one thing at a time, in order of actual risk. The first two
are done — struck rather than deleted, so the priority history stays
visible:

1. ~~Rate limiting on `/auth/login`~~ — done (`@nestjs/throttler`,
   5/min/IP, `apps/api/test/rate-limit.e2e-spec.ts`).
2. ~~Fail-closed on missing `JWT_SECRET`~~ — done
   (`resolveJwtSecret()` in `auth.module.ts` throws in production when
   unset; `auth.module.spec.ts`).
3. **Token revocation on logout** — even a simple in-memory deny-list
   for the remaining TTL would close the current no-op; a database-backed
   revoked-token table is the more correct option (survives a restart,
   works across multiple instances) but needs a `jti` claim added to the
   JWT payload and a migration. Neither built yet.
4. **Triage the 72 open Dependabot advisories.**
5. **Extend the tenant-isolation e2e pattern** to `Assessment`,
   `Framework`, and `User` explicitly, rather than relying on the
   pattern being structurally consistent across services.
