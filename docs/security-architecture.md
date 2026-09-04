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

## Security Gaps (Honestly, Not Implemented)

Declared somewhere (an env var, an earlier draft of `docs/architecture.md`,
`SECURITY.md`'s aspirational language) but not actually built:

- **Rate limiting** — `.env.example` declares `ENABLE_RATE_LIMITING`,
  `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`. Nothing in
  `apps/api/src` reads any of them (`grep -rn "RATE_LIMIT" apps/api/src`
  returns nothing). There is no rate limiting on any endpoint, including
  `POST /auth/login` — a real gap for a login endpoint specifically
  (brute-force exposure).
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
| Credential stuffing / password guessing against `POST /auth/login` | bcrypt (slow hash) makes offline cracking of a stolen hash expensive | **No rate limiting on login** — an attacker can attempt unlimited password guesses online. This is the single highest-priority gap in this section. |
| Forged JWT | HMAC-signed (`@nestjs/jwt`), verified by `JwtStrategy` on every request | `JWT_SECRET` has a hard-coded fallback (`auth.module.ts`) if the env var isn't set — a deployment that forgets to set it uses a secret visible in the public source tree. Fail-closed instead (refuse to start) is the fix, not yet made. |
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
| Login brute-force as a resource-exhaustion vector | None | Same gap as the Spoofing section — no rate limiting anywhere. |
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
| A05 | Security Misconfiguration | `JWT_SECRET` fallback (see Spoofing) is the concrete instance of this category in the current codebase |
| A06 | Vulnerable & Outdated Components | Dependabot + `npm audit --audit-level=high` in CI (Phase 16); GitHub's own banner currently shows 72 open advisories (1 critical, 25 high, 37 moderate, 9 low) repo-wide, un-triaged as of this writing |
| A07 | Identification & Authentication Failures | No MFA, no rate limiting on login, no session/token revocation on logout — see Security Gaps above |
| A08 | Software & Data Integrity Failures | `package-lock.json` committed (reproducible installs); no code-signing or SLSA-style provenance |
| A09 | Security Logging & Monitoring Failures | Audit logging exists and is append-only; no alerting/monitoring layer on top of it (no SIEM integration, no anomaly detection) |
| A10 | Server-Side Request Forgery | Not directly applicable — no endpoint accepts and fetches an arbitrary user-supplied URL |

## Priority Order for Closing Gaps

If picking one thing at a time, in order of actual risk:

1. **Rate limiting on `/auth/login`** — the highest-likelihood,
   highest-impact gap (credential stuffing against a live login endpoint
   with zero throttling).
2. **Fail-closed on missing `JWT_SECRET`** — refuse to start rather than
   fall back to a value visible in the public repository.
3. **Token revocation on logout** — even a simple in-memory/Redis
   deny-list for the remaining TTL would close the current no-op.
4. **Triage the 72 open Dependabot advisories.**
5. **Extend the tenant-isolation e2e pattern** to `Assessment`,
   `Framework`, and `User` explicitly, rather than relying on the
   pattern being structurally consistent across services.
