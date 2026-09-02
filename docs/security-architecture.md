# Security Architecture

The as-built security posture of CMMP: authentication, authorization,
tenant isolation, input handling, audit logging, and where the real gaps
are. Everything here is grounded in the actual code under `apps/api/src`
as of this session — including the honest gaps, not just what's
implemented. See `docs/threat-model.md` for the STRIDE analysis this feeds,
and `docs/devsecops-pipeline.md` for the automated security tooling that
continuously checks this codebase.

## Authentication

- **Credential storage**: `User.passwordHash`, hashed with `bcryptjs` (pure
  JS — chosen deliberately over native `bcrypt` because this repo's
  `allowScripts` install-script allowlist blocks unreviewed native
  postinstall scripts). Login (`AuthService.login()`) does a real Prisma
  lookup by `(tenantId, email)` and `bcryptjs.compare()` — there is no
  hardcoded demo-credentials path anywhere in the code today (there
  briefly was, in the frontend's NextAuth config, before Phase 10 wired it
  to the real endpoint).
- **Token issuance**: `POST /auth/login` issues a JWT via `@nestjs/jwt`,
  `expiresIn: '24h'`, carrying `sub`, `email`, `tenantId`,
  `organisationId`, `role` (first assigned role, kept for backward
  compatibility) and `roles: UserRole[]` (the full set — see "Authorization"
  below). `POST /auth/refresh` re-signs a still-valid token with a fresh
  expiry.
- **Verification**: `JwtStrategy` (`passport-jwt`) validates the signature
  and attaches the decoded payload as `request.user` on every guarded
  route.
- **A real bug found and fixed this session**: `AuthModule` originally
  called `JwtModule.register({ secret: process.env.JWT_SECRET })` —
  `.register()` reads `process.env` at module-**decoration** time, which
  happens while `app.module.ts`'s own top-level `imports` array (including
  `AuthModule` itself) is still being resolved, *before*
  `ConfigModule.forRoot()` in that same array has actually loaded `.env`.
  `JwtStrategy` (an `@Injectable()`) read the same variable later, at
  DI-**instantiation** time, after `.env` was genuinely loaded. Net effect:
  every login-issued token was signed with the hardcoded fallback secret
  while every protected route verified against the real `.env` secret —
  every authenticated request 401'd whenever a real `JWT_SECRET` was
  configured (i.e. in any deployment following the security guidance to
  not use the default). No unit test caught this, because every existing
  auth test constructs `AuthService`/`JwtService` directly, bypassing
  Nest's actual module system — this class of bug is only visible when the
  real DI container wires the real modules. Fixed via
  `JwtModule.registerAsync()` with a `ConfigService`-injected factory, and
  `JwtStrategy` injecting `ConfigService` instead of reading
  `process.env` directly — both now resolve the secret at the same,
  post-`ConfigModule` point in bootstrap.
- **No revocation or rotation.** A token is valid for its full 24-hour
  lifetime no matter what happens to the account afterward (password
  change, role removal, deactivation) — there is no server-side blacklist
  or session store. This is a known, documented gap (see "Known gaps"
  below), not an oversight.
- **NextAuth on the frontend** (`apps/web`) is a thin pass-through, not a
  second identity provider: its `CredentialsProvider.authorize()` calls
  the real `POST /api/v1/auth/login` and carries the NestJS-issued JWT
  inside the NextAuth session (`types/next-auth.d.ts` module augmentation)
  — the browser never receives a NextAuth-minted token, only the real one.

## Authorization (RBAC)

- **11 roles** (`UserRole` enum — see `docs/data-model.md`), assigned via
  `UserRoleAssignment`, which allows a user to hold **more than one role**,
  optionally scoped to a specific organisation.
- **`RolesGuard`** (`apps/api/src/auth/guards/roles.guard.ts`) reads
  `@Roles(...)` metadata off the route **handler** (never the controller
  class) and checks it against the caller's **full `roles[]` array**, not
  just the single convenience `role` field.
- **Two real authorization bugs found and fixed this session** (both via
  test-writing during Phase 14, not code inspection):
  1. `AuditController`'s `@Roles(...AUDIT_READERS)` had been applied at the
     **class** decorator level. `RolesGuard.canActivate()` only ever reads
     `context.getHandler()` (method-level) metadata — every other
     controller in the codebase applies `@Roles()` per-method, which is
     what the guard actually checks. The practical effect:
     `Reflect.getMetadata` returned `undefined` for every audit-events
     route, so the guard's no-metadata-means-public fallback let **any**
     authenticated user, including `READ_ONLY_VIEWER`, read the full audit
     log. First surfaced by the Playwright suite (a viewer account saw the
     real event table instead of a 403), reproduced by the integration
     suite, then fixed by moving the guard/decorator onto each handler
     method individually, with a regression test asserting the metadata
     lands where the guard actually reads it.
  2. `RolesGuard` originally checked only `user.role` (the first assigned
     role) — a user whose *second* role assignment happened to satisfy a
     `@Roles()` check would be incorrectly denied. Fixed to check the full
     `roles[]` array, falling back to the singular field only if absent.
- **The per-endpoint permission matrix** is documented exactly, endpoint by
  endpoint, in `docs/api-reference.md` rather than duplicated here — read
  that as the source of truth for who can call what. A few structural
  patterns worth calling out:
  - Every mutating endpoint in the system requires an explicit role beyond
    "authenticated" — there is no endpoint where any logged-in user can
    write.
  - Most **read** endpoints (dashboards, framework browsing, lists,
    detail views) require only `JwtAuthGuard` — no additional role check.
    This is intentional: read access to an assessment's own dashboard,
    for example, is gated by tenant/organisation membership (you can only
    see assessments belonging to organisations you're a member of), not by
    a specific role on top of that. `READ_ONLY_VIEWER` and
    `EXECUTIVE_VIEWER` exist specifically to represent "can see everything,
    can write nothing" and "can see only the executive dashboard" — but the
    latter distinction (limiting `EXECUTIVE_VIEWER` to *only* dashboard
    endpoints) is not currently enforced anywhere; that role today behaves
    identically to `READ_ONLY_VIEWER` from the API's point of view. This is
    a real gap, not a design decision — tracked here rather than silently
    left undocumented.

## Tenant isolation

Multi-tenancy is enforced **explicitly in application code**, not via a
database-level mechanism (no Postgres row-level security, no Prisma
middleware that injects a tenant filter automatically):

- Every service method that reads/writes tenant-owned data takes the
  caller's `tenantId` (read off the verified JWT payload, never from a
  request body or query param) as an explicit argument and includes it in
  every Prisma `where` clause.
- Cross-tenant access to a real resource returns **404, not 403** — the
  API never confirms that a resource exists in a tenant the caller can't
  see.
- `RisksService.linkInitiative()` (and its symmetric counterpart in
  `InitiativesService`) additionally verifies the *other* side of a
  cross-resource link belongs to the caller's own tenant before connecting
  it — a resource ID from one tenant can't be used to link into another
  tenant's risk/initiative just because both happen to be valid UUIDs.
- **Verified by a dedicated integration suite**
  (`apps/api/test/tenant-security.integration-spec.ts`, Phase 14): boots
  the real `AppModule` — every module, guard, and interceptor, nothing
  mocked — against a live database, creates a second real tenant/org/user/
  risk, and asserts a second tenant's data never appears in the first
  tenant's listings and a direct-by-id cross-tenant fetch 404s.

## Input validation & injection prevention

- **Global `ValidationPipe`** (`main.ts`): `whitelist: true` +
  `forbidNonWhitelisted: true` — any request body field not declared on
  the target DTO is rejected outright (400), not silently stripped or
  passed through — this is the system's mass-assignment defense,
  live-verified in the Phase 14 integration suite.
- **Zod schemas** additionally validate framework definitions end to end
  (`@cmmp/framework-engine` — see `docs/framework-model.md`) at both shape
  and cross-field structural levels.
- **SQL injection**: Prisma's query builder parameterizes every query;
  nothing in this codebase constructs raw SQL from user input.
- **CSV/Excel formula injection (CWE-1236)**: every free-text field
  accepted through the spreadsheet importer is sanitized — a leading
  `=`/`+`/`-`/`@`/tab/CR is neutralized with Excel's own "force text"
  single-quote prefix rather than stripped. See
  `docs/excel-import-guide.md` for the full rule set. This was
  live-verified against a real `=cmd|'/C calc'!A1` payload during
  development.
- **XSS**: React/Next.js's default JSX escaping is the primary defense on
  the frontend (no `dangerouslySetInnerHTML` usage in this codebase); the
  API additionally sets `X-XSS-Protection: 1; mode=block` (see "HTTP
  security headers" below), which is a legacy, largely-deprecated
  browser-enforced mitigation, not a substitute for output encoding.

## Audit logging

- **`AuditInterceptor`** (global, via `APP_INTERCEPTOR`) auto-logs every
  authenticated `POST`/`PUT`/`PATCH`/`DELETE` as `CREATE`/`UPDATE`/
  `UPDATE`/`DELETE` respectively, deriving `resource` from the controller
  name and preferring the route's own `:id` param over the response
  body's `id` for `resourceId`. `GET` requests are never logged (by
  design — read access isn't tracked at this granularity). The
  `AuthController` is explicitly excluded from this generic path — it logs
  its own `LOGIN`/`LOGOUT` directly, since `login()` has no
  `request.user` yet at request time and `logout()` doesn't fit a
  CRUD-shaped action.
- **Immutability**: `AuditService` exposes only `log()` (create) and read
  methods (`findAll()`, `getSummary()`) — there is no update or delete
  path anywhere in the codebase, and no other service imports
  `prisma.auditEvent` directly. This is an application-level guarantee,
  not a database-level one (no Postgres `REVOKE UPDATE/DELETE` grant is
  in place) — a determined operator with direct database access could
  still tamper with the table.
- **Fail-safe, never fail-open on the wrong axis**: `log()` truncates
  oversized `newValue` payloads (5,000-char cap) and never throws — a
  failed audit write is caught, logged via `Logger.error`, and swallowed,
  so an audit-logging failure can never break (or roll back) the request
  it was trying to audit. This is a deliberate choice favoring
  availability of the underlying action over guaranteed completeness of
  the audit trail — a real tradeoff, made explicitly rather than by
  accident.
- **Read access** to `GET /audit-events`/`GET /audit-events/summary` is
  restricted to `PLATFORM_ADMIN`/`ORGANISATION_ADMIN`/`AUDITOR`/`CISO` —
  see the RBAC bug above for the specific incident this restriction was
  once silently bypassed by.

## HTTP-level hardening

- **CORS**: `app.enableCors({ origin: process.env.CORS_ORIGIN, credentials:
  true, ... })` — a single configured origin, not a wildcard.
- **Manually-set security headers** (`main.ts`): `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`.
  There is **no `helmet` package** in use and **no Content-Security-Policy,
  HSTS, or Referrer-Policy header set** — these three headers are the
  extent of it today. This is a real, honest gap: adding `helmet` (or the
  equivalent headers by hand) would be a low-effort improvement.
- **No rate limiting is actually implemented**, despite `.env.example`
  defining `ENABLE_RATE_LIMITING`, `RATE_LIMIT_WINDOW_MS`, and
  `RATE_LIMIT_MAX_REQUESTS` — grepping the codebase confirms none of these
  three variables is read anywhere in `apps/api` or `apps/web`, and there
  is no `@nestjs/throttler` (or equivalent) dependency installed. This
  means `POST /auth/login` has **no brute-force protection** today beyond
  whatever sits in front of it in a real deployment (a WAF, an API
  gateway). This is the most concrete, actionable gap in this document —
  see `docs/threat-model.md`'s authentication section for the specific
  threat this leaves open.

## Secrets management

- Every secret (`JWT_SECRET`, `NEXTAUTH_SECRET`, `DATABASE_URL`) is a plain
  environment variable today — supplied via `.env` locally, via
  `docker-compose.yml`'s variable substitution, or (for `deploy.yml`'s
  eventual real deploy step) a GitHub Environment secret. There is no
  Vault/AWS Secrets Manager integration — `docs/architecture.md`'s mention
  of one is aspirational, not implemented.
- Both `JWT_SECRET` and `NEXTAUTH_SECRET` have **hardcoded fallback
  values** in code (`'your-secret-key-change-in-production'` and similar)
  that apply if the environment variable is unset. These fallbacks are
  publicly visible in this repository's own source — **never rely on
  them outside of local development**; every real deployment must set
  both explicitly, per `docs/deployment-guide.md`.
- `.dockerignore` (added during Phase 15, alongside fixing the fact it had
  itself been accidentally `.gitignore`d) excludes `.env*` from every
  Docker build context, so a real `.env` file's contents can't end up
  baked into an image layer via a stray `COPY . .`.

### Runtime-configurable secrets (`PlatformSetting`)

One secret — the `ANTHROPIC_API_KEY` that powers `AiMappingService`'s
column-mapping suggestion (`docs/excel-import-guide.md`) — can *also* be
set live by a `PLATFORM_ADMIN` through `/admin/settings` in the app
(`docs/api-reference.md`'s `/settings` routes), rather than only via an
environment variable requiring a redeploy. This is a second, database-
backed secrets path alongside the env-var one above, so its design is
worth stating explicitly:

- **Encrypted at rest, never plaintext in the database.** `PlatformSetting.value`
  stores AES-256-GCM ciphertext (`@cmmp/security`'s `encrypt()`/`decrypt()`
  — this package's first real implementation, previously an empty Phase-1
  scaffold) under a separate `SETTINGS_ENCRYPTION_KEY` environment
  variable — itself still a plain env var, since something has to anchor
  the chain and turning *that* into a database-stored value too would just
  move the problem in a circle. Losing or rotating `SETTINGS_ENCRYPTION_KEY`
  makes a previously-saved value undecryptable; `SettingsService` treats
  that as "not configured" (falls back to the env var, if any) rather than
  throwing, consistent with this feature being a pure enhancement
  everywhere else.
- **Write-only from the UI's perspective.** `GET`/`PUT`/`DELETE
  /settings/integrations/anthropic-api-key` all return only
  `IntegrationSettingsStatus` (a boolean + an enum) — never the key, not
  even right after the `PUT` that just set it. The settings page never
  pre-fills the input with a real value; there is nothing to leak even if
  the response were somehow logged.
- **`PLATFORM_ADMIN` only, `@Roles()` on every handler method** — the same
  per-method pattern the Audit Events fix (above) established, applied
  here from the start rather than learned the hard way a second time.
- **Takes effect immediately.** `AiMappingService` resolves the key fresh
  on every call (database value first, environment variable fallback) —
  it does not cache a client or a key at construction time, so a saved
  change is live for the very next import with no API restart.
- **The write path itself is audited** — `PUT`/`DELETE` are ordinary
  mutating requests, so the global `AuditInterceptor` logs who changed the
  integration setting and when, the same as every other resource — see
  "Audit logging" above. The logged `newValue` is the response body
  (`IntegrationSettingsStatus`), never the request body, so the key is
  never at risk of ending up in the audit trail either.

## Container & pipeline security

- Both runtime images run as a dedicated non-root user, on a pinned
  minimal base (`node:20-alpine`), never bake a secret into a layer — see
  `docs/deployment-guide.md`.
- CodeQL (SAST), Gitleaks (secret scanning), Trivy (container CVE
  scanning), and OWASP ZAP baseline (passive DAST) all run continuously —
  see `docs/devsecops-pipeline.md` for exactly what each covers and the
  current report-only posture on Trivy/ZAP.

## Known gaps (honest summary)

These are real, current gaps — not filled in with aspirational text
elsewhere in this repo's docs:

1. **No token revocation/rotation** — a compromised or stale JWT remains
   valid for its full 24h lifetime regardless of any server-side state
   change.
2. **No rate limiting anywhere**, despite env vars suggesting otherwise —
   `/auth/login` is unprotected against credential-stuffing/brute-force at
   the application layer.
3. **No CSP/HSTS/Referrer-Policy headers**, no `helmet`.
4. **`EXECUTIVE_VIEWER`'s intended scope (dashboards only) isn't actually
   enforced** — it behaves identically to `READ_ONLY_VIEWER` today.
5. **Audit log immutability is application-level only** — no database
   grant revokes `UPDATE`/`DELETE` on `audit_events` for the app's own
   database role.
6. **Trivy and ZAP are report-only**, not yet enforcing (deliberately, on
   a documented timeline — see `docs/devsecops-pipeline.md`).
7. **No file-upload evidence scanning** — the `Evidence` model exists but
   nothing uploads to it yet (see `docs/data-model.md`); the one real file
   upload path today (spreadsheet import) is size-capped and parsed by a
   library, not executed, but isn't run through any malware scanner.
