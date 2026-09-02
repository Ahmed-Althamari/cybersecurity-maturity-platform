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
  compatibility), `roles: UserRole[]` (the full set — see "Authorization"
  below), and `jti` (a random UUID, unique per issued token — see "Token
  revocation" below). `POST /auth/refresh` re-signs a still-valid token
  with a fresh expiry **and a fresh `jti`**, revoking the presented one.
- **Verification**: `JwtStrategy` (`passport-jwt`) validates the signature
  and expiry, checks the token's `jti` against the revocation list (below),
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
- **NextAuth on the frontend** (`apps/web`) is a thin pass-through, not a
  second identity provider: its `CredentialsProvider.authorize()` calls
  the real `POST /api/v1/auth/login` and carries the NestJS-issued JWT
  inside the NextAuth session (`types/next-auth.d.ts` module augmentation)
  — the browser never receives a NextAuth-minted token, only the real one.

## Token revocation

Previously a real, documented gap: a token was valid for its full 24-hour
lifetime no matter what happened afterward — logout only logged the event
(`docs/threat-model.md`'s STRIDE table, "Spoofing"). Fixed with a
logout-side blacklist rather than the larger short-lived-access-token-
plus-separate-refresh-token architecture also floated for this gap —
materially smaller and lower-risk for the same practical benefit, and the
existing `/auth/refresh` contract (re-sign the same token type) didn't
need to change shape, just gain rotation.

- **`RevokedToken`** (`packages/database/prisma/schema.prisma`) is keyed
  by `jti` — a random UUID `AuthService.login()` now includes in every
  signed payload, alongside `tenantId`/`userId`/the original token's own
  `expiresAt` (copied from its `exp` claim, purely so a row past that
  point is provably dead weight — see the cleanup note below).
- **Checked on every authenticated request.** `JwtStrategy.validate()`
  looks up the incoming token's `jti` after passport-jwt's own signature
  and expiry checks pass; a hit throws `UnauthorizedException` immediately
  — one extra indexed lookup per request, not a join against "all active
  tokens" (there is no row for a token that hasn't been revoked).
- **`POST /auth/logout`** writes a row for the presented token's `jti`
  (`AuthService.logout()`, using `exp` off the request's own decoded
  payload) before logging the `LOGOUT` audit event.
- **`POST /auth/refresh` rotates, not just re-signs.** The presented
  token's `jti` is revoked at the same moment a new token (with a fresh
  `jti`) is issued — a refreshed-away token can't be replayed even though
  it hasn't reached its own expiry, closing the gap
  `docs/api-reference.md` previously called out ("not a rotation scheme").
- **Idempotent by construction**: revocation is an `upsert` on `jti`
  (the table's primary key), not a `create` — a double-logout (retry,
  double-click) or two concurrent `/auth/refresh` calls racing to revoke
  the same token can't 500 on a unique-constraint violation.
- **Self-cleaning, not a separate cleanup job**: each revocation call also
  opportunistically deletes rows past their own `expiresAt` — those would
  already be rejected by `JwtStrategy`'s own expiration check regardless,
  so keeping them serves no purpose. Expected to stay a small table in
  practice (one row per logout/refresh, pruned continuously).
- **The web app's "Sign Out" button now actually calls this.** Previously
  it only called NextAuth's own `signOut()`, which clears the browser's
  session cookie but has no idea the wrapped CMMP API JWT exists — the
  backend token stayed valid the full 24h regardless of the user clicking
  "Sign Out." Every Sign Out button (`apps/web/pages/{assessments,risks,
  roadmap,audit}/index.tsx`, `assessments/[id].tsx`, `admin/settings.tsx`)
  now calls a shared `signOutAndRevoke()` (`apps/web/lib/auth.ts`) that
  calls `POST /auth/logout` first (best-effort — a failed call still lets
  the user sign out client-side) and then NextAuth's `signOut()`.
- **Still open**: no password-change-triggered revocation (there is no
  password-change endpoint yet, so this doesn't currently apply to
  anything real); a stolen token used *before* logout catches up with it
  remains valid for that window — inherent to any blacklist-based scheme,
  not specific to this implementation.

## CSRF

Two separate surfaces, two separate reasons neither needs additional
work — investigated and live-verified rather than left as an unexamined
"probably fine":

- **The NestJS API itself** is a stateless bearer-token API, not
  cookie-session-based. Classic CSRF relies on the browser automatically
  attaching an ambient credential (a cookie) to a cross-origin request the
  victim never intended; every real call to this API instead carries its
  token in an explicit `Authorization` header, set by `apps/web/lib/api.ts`'s
  own JS — not something a cross-origin attacker page can forge or have
  the browser attach on its behalf. There is nothing here for a CSRF token
  to protect that isn't already protected by this design.
- **NextAuth's own `/api/auth/callback/credentials` sign-in endpoint**
  (the one place the web app *does* use a cookie-based flow) has its own
  built-in CSRF-token check, and it was live-verified rather than assumed
  from NextAuth's documentation: a POST with no `csrfToken` field, or with
  the real `next-auth.csrf-token` cookie present but a wrong token value,
  both come back `{"url":".../auth/signin?csrf=true"}` with no session
  cookie ever set; only the correct cookie+token pair reaches credential
  validation and (with valid credentials) sets a real
  `next-auth.session-token` cookie. That cookie is also `SameSite=Lax`
  (confirmed in the live response headers), an independent second layer —
  a cross-site POST wouldn't carry it regardless of the token check.
  `apps/web/pages/auth/signin.tsx` uses NextAuth's own `signIn()` client
  helper (not a raw `fetch`/form POST), which is what correctly wires the
  CSRF token in on every real sign-in attempt.

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
    can write nothing" and "can see only the executive dashboard."
    **Fixed**: the latter distinction is now enforced by
    `ExecutiveViewerScopeGuard`, composed into `JwtAuthGuard` itself (see
    that file's own comment for why it has to live there rather than as a
    separate global guard — the naive version of this fix looked correct
    in every unit test and still let an EXECUTIVE_VIEWER-only token read
    raw assessment data and the full user list over real HTTP, caught only
    by a live integration test, not by mocked ones). A token whose *only*
    role is `EXECUTIVE_VIEWER` gets a 403 from every endpoint except the
    ones explicitly marked `@ExecutiveDashboardAccessible()` — the seven
    `DashboardController` routes, `GET /assessments` (to pick one), and
    session lifecycle (`/auth/me`, `/auth/logout`, `/auth/refresh`). A user
    who also holds a broader role (e.g. `GRC_MANAGER`) keeps that role's
    full access, matching how every other guard in this codebase treats
    multi-role users.

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
- **Immutability, enforced at both levels**: `AuditService` exposes only
  `log()` (create) and read methods (`findAll()`, `getSummary()`) — there
  is no update or delete path anywhere in the codebase, and no other
  service imports `prisma.auditEvent` directly. That was previously an
  application-level guarantee only. **Fixed**: a Postgres trigger
  (`audit_events_no_update`, `packages/database/prisma/migrations/
  *_audit_events_immutable_update`) now rejects any `UPDATE` against
  `audit_events` unconditionally, for every role and every connection —
  no bypass flag, no exception. `REVOKE UPDATE/DELETE` grants weren't used
  instead because `cmmp_user` (the same role that runs migrations and the
  app's own runtime queries — see "Secrets management" below) *owns* the
  table it creates, and Postgres table owners bypass GRANT/REVOKE on their
  own objects entirely; a trigger is the mechanism that actually works
  without introducing a second, more-restricted database role (a real,
  larger architectural change to the single-role setup this repo's
  docker-compose/`.env.example` currently use). Deliberately scoped to
  `UPDATE` only, not `DELETE`: `AuditEvent.tenantId` has `onDelete:
  Cascade`, so deleting a `Tenant` (a real, legitimate operation — account
  offboarding, GDPR erasure) cascades into deleting its `audit_events` rows
  through the same `DELETE` machinery a row-level trigger can't
  distinguish from a direct, illegitimate `DELETE` against this table —
  found by tracing the schema's own cascade behavior before writing the
  migration, not by breaking tenant deletion first and debugging backward.
  Live-verified: a direct `UPDATE` via Prisma is rejected with the row
  left unchanged; a direct `DELETE` still succeeds; deleting a throwaway
  tenant still cascades into its audit events successfully.
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
- **Security headers via `helmet`** (`main.ts`, and `test/test-app.ts`'s
  identical copy for integration tests): Content-Security-Policy
  (`default-src`/`frame-ancestors: 'none'` — this is a pure JSON API that
  never renders HTML or serves a script/stylesheet of its own, so the
  policy is deliberately maximal, blocking everything on the off chance a
  response is ever misread as HTML by a buggy client), HSTS (`max-age`
  31536000, `includeSubDomains`), `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. Previously a
  hand-rolled three-header middleware with no CSP, HSTS, or
  Referrer-Policy at all — a real, documented gap, now fixed. Live-verified
  both directly (`curl -I` against every header) and via a Playwright
  click-through of every major `apps/web` page (sign-in, the dashboard
  with its Recharts SVG charts, risks, roadmap, audit) with zero CSP
  console violations — `apps/web/next.config.js`'s own headers (below)
  needed `style-src 'self' 'unsafe-inline'` for Recharts' inline `style=""`
  SVG attributes, verified live rather than assumed safe.
  `X-XSS-Protection` is deliberately **not** re-added: it's a deprecated
  header removed from every modern browser's actual XSS filter, dropped
  from helmet's own defaults since v6, and superseded by the CSP above.
- **`apps/web`'s own headers** (`next.config.js`'s `headers()`, applied to
  every route): the same set, tuned for a browser-rendered app instead of
  a pure API — `default-src 'self'`, `script-src 'self'` (no
  `unsafe-inline`/`unsafe-eval` — the directive that actually matters for
  stopping injected-script XSS), `style-src 'self' 'unsafe-inline'`
  (Recharts renders inline `style=""` attributes on SVG elements, not just
  external CSS — a stricter `style-src` broke chart rendering when tried),
  `connect-src 'self' <NEXT_PUBLIC_API_URL>` (the browser calls the API
  directly, not through this server), HSTS, `Referrer-Policy:
  strict-origin-when-cross-origin`, `frame-ancestors 'none'`.
- **`POST /auth/login` is rate-limited** (`@nestjs/throttler`, scoped to
  just that one handler via `@UseGuards(ThrottlerGuard)` — not applied
  globally): `AUTH_RATE_LIMIT_MAX_ATTEMPTS` attempts (default 20) per
  `AUTH_RATE_LIMIT_WINDOW_MS` (default 60s) per IP, tracked in-memory.
  Every request counts against the same budget regardless of outcome — a
  correct password submitted after the budget is spent still gets `429`,
  which is the correct behavior for a brute-force guard (an attacker who
  eventually guesses right is still capped). Deliberately *not* applied
  globally: every other route already requires a valid JWT to reach at
  all, so only this one unauthenticated, credential-guessing surface
  needed it. Live-verified: 20 requests with a wrong password returned
  `401` each, the 21st returned `429`, and a burst at an unrelated route
  (`/frameworks`) in the same window kept returning its normal `401`
  (unauthenticated) rather than `429`, confirming the guard's scope. This
  closes what was, until this fix, the single most concrete, actionable
  gap in this document (see `docs/threat-model.md`).
- **`ENABLE_RATE_LIMITING`/`RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX_REQUESTS`
  now back a real, generic, API-wide per-IP request budget**
  (`GlobalRateLimitGuard`, registered globally via `APP_GUARD`) —
  `RATE_LIMIT_MAX_REQUESTS` requests (default 100) per
  `RATE_LIMIT_WINDOW_MS` (default 900000ms/15min) per IP, checked on
  *every* request regardless of route or auth status (global guards run
  before any per-route guard, including `JwtAuthGuard` — an unauthenticated
  flood is capped too, not just authenticated traffic).
  `ENABLE_RATE_LIMITING=false` disables it in effect (an unreachable
  limit) rather than needing a second, conditionally-registered guard.
  Deliberately not reused for the login throttle above and not built on a
  second `@nestjs/throttler` registration: a first attempt doing exactly
  that (a second `ThrottlerModule.forRootAsync()` plus its own
  `ThrottlerGuard` as `APP_GUARD`) silently broke the *existing* login
  throttle — confirmed live by the existing `auth-rate-limit.integration-spec.ts`
  going red, not assumed — because `@nestjs/throttler`'s options/storage
  providers aren't module-scoped the way plain Nest DI usually is, so the
  second registration clobbered the first's config application-wide.
  `GlobalRateLimitGuard` is a small, self-contained, in-memory guard
  (`apps/api/src/common/global-rate-limit.guard.ts`) with zero dependency
  on that library's shared internals, avoiding the collision entirely.
  Live-verified against the real running API: 100 requests to `/health`
  returned `200`, the 101st onward returned `429`, and a login request in
  the same session still succeeded normally (`201`), confirming the two
  budgets coexist correctly.

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
- **Enforced, not just documented.** `apps/api/src/config/validate-env.ts`
  (called at the very top of `main.ts`'s `bootstrap()`, before the Nest
  DI container is even built) and `apps/web`'s `next.config.js` +
  `scripts/check-env.js` refuse to start with `NODE_ENV=production` if
  `JWT_SECRET`/`NEXTAUTH_SECRET` are unset *or* equal to any known
  placeholder — the two hardcoded fallbacks above, `docker-compose.yml`'s
  own defaults, and `.env.example`'s own placeholder text (copying that
  file to `.env` without editing it is, if anything, a more likely
  mistake than leaving the variable unset). Two checkpoints exist on the
  web side because `output: "standalone"` (see `docs/deployment-guide.md`)
  resolves `next.config.js` at *build* time and the generated `server.js`
  never re-reads it at runtime — `check-env.js` is a separate script that
  `infrastructure/Dockerfile.web`'s `CMD` runs immediately before
  `server.js` starts, so the real Docker deployment path is actually
  covered, not just the `next.config.js`-driven `next start` path.
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

1. ~~No token revocation/rotation~~ — **fixed**: see "Token revocation"
   below.
2. ~~No rate limiting anywhere~~ — **fixed**: `POST /auth/login` is now
   throttled per IP (`@nestjs/throttler`, see "HTTP-level hardening"
   above). The generic, API-wide request budget the leftover
   `RATE_LIMIT_*` env vars imply is still unbuilt, but that's a separate,
   larger-scope feature, not the credential-stuffing gap this item
   originally flagged.
3. ~~No CSP/HSTS/Referrer-Policy headers, no `helmet`~~ — **fixed**: see
   "HTTP-level hardening" above.
4. ~~`EXECUTIVE_VIEWER`'s intended scope (dashboards only) isn't actually
   enforced~~ — **fixed**: see "RBAC" above and `ExecutiveViewerScopeGuard`.
5. ~~Audit log immutability is application-level only~~ — **fixed**: see
   "Audit logging" above.
6. **Trivy and ZAP are report-only**, not yet enforcing (deliberately, on
   a documented timeline — see `docs/devsecops-pipeline.md`).
7. **No file-upload evidence scanning — partially addressed.** The
   `Evidence` model still has no upload endpoint at all (see
   `docs/data-model.md`), so there is nothing there to scan yet. The one
   real file upload path (spreadsheet import) now validates the file's
   actual content against its claimed `format` before any parsing is
   attempted (`validateFileSignature()`, `@cmmp/import-engine`) — an xlsx
   must start with the real ZIP file signature, a CSV must not contain
   binary content — closing the "a renamed/disguised file claims to be a
   spreadsheet" gap. This is **not** malware/antivirus scanning: there is
   no AV engine (e.g. ClamAV) integrated, and none was attempted here —
   this sandbox has no reliable way to fetch and verify current virus
   definitions, and it would be a real, separate infrastructure dependency
   (a scanning daemon, definition updates) rather than a code change. The
   practical residual risk is already bounded regardless: uploaded files
   are parsed from an in-memory buffer only (`multer`'s default memory
   storage, confirmed — no `diskStorage`, no `file.path` used anywhere),
   never written to disk or served back to any other user, so there is no
   persistence path for a malicious upload to later be executed or
   distributed through this application. Also not built: protection
   against a zip-bomb-style xlsx (a small compressed file that expands to
   an enormous size) — the 5MB upload cap bounds this somewhat, but a
   dedicated guard would need to inspect the ZIP's own declared
   uncompressed size before `exceljs` decompresses it, which isn't
   something this pass attempted.
8. ~~No pagination on most list endpoints~~ — **fixed**: `/users`,
   `/assessments`, `/risks`, and `/initiatives` now all paginate
   (`PaginatedResponse<T>`, default page size 20, capped at 100 — see
   `docs/api-reference.md`). `/frameworks`, `/initiatives/timeline`, and
   `/assessments/:id/history` remain deliberately unpaginated (small,
   bounded, or bucketed-not-flat, respectively).
