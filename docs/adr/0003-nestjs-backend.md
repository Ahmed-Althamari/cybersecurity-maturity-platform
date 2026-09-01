# ADR-0003: NestJS Backend

**Status**: Accepted

## Context

The API surface (`docs/api-reference.md`) spans 11 controllers with a
consistent authentication/authorization/audit-logging cross-cutting
concern applied uniformly — a case for a framework with real dependency
injection and first-class interceptor/guard primitives, rather than
composing Express middleware by hand.

## Decision

NestJS on top of Express, with:
- `JwtAuthGuard`/`RolesGuard` (custom, not a third-party RBAC library) for
  authentication/authorization — see `docs/security-architecture.md`.
- A single global `AuditInterceptor` (`APP_INTERCEPTOR`) rather than
  per-controller audit calls, for logging — see
  `docs/security-architecture.md`'s "Audit logging" section.
- A global `ValidationPipe` for request validation (`whitelist`/
  `forbidNonWhitelisted`/`transform`).

## Alternatives considered

Express (bare), Fastify-based frameworks, a non-Node backend (FastAPI, Go).

## Consequences

- Dependency injection makes the guard/interceptor/pipe cross-cutting
  concerns genuinely reusable and testable in isolation (e.g.
  `roles.guard.spec.ts` tests `RolesGuard` directly, not through an HTTP
  request).
- **A real cost realized in practice**: Nest's DI *timing* is subtle
  enough to have caused a genuine production-breaking bug — see
  `docs/security-architecture.md`'s account of `JwtModule.register()`
  reading `process.env` before `ConfigModule` had loaded `.env`, only
  fixed by switching to `registerAsync()`. A framework with less implicit
  bootstrap ordering might not have this exact failure mode, though it
  would likely have its own.
- Nest's decorator-metadata-based guards (`@Roles()` read via
  `Reflect.getMetadata`) are powerful but fragile to *where* the decorator
  is applied — the class-vs-method-level `@Roles()` bug documented in
  `docs/security-architecture.md` is a direct consequence of this
  mechanism, not something a more explicit (e.g. function-composition-based)
  authorization approach would have allowed to happen silently.
