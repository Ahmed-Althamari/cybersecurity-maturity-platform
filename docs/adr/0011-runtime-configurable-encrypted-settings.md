# ADR-0011: Runtime-Configurable Encrypted Settings

**Status**: Accepted

## Context

Every secret in CMMP up to this point (`JWT_SECRET`, `NEXTAUTH_SECRET`,
`DATABASE_URL`, the original `ANTHROPIC_API_KEY`) was a plain environment
variable, set at deploy time and requiring a redeploy to change. That's a
reasonable default for secrets the whole application depends on to boot
(`JWT_SECRET`), but it's a poor fit for an optional integration credential
an operator might want to add, rotate, or remove *after* the app is
already running — specifically, the Anthropic API key that powers
`AiMappingService`'s column-mapping suggestion (`docs/excel-import-guide.md`).

## Decision

A second, database-backed secrets path, purpose-built for this case: a
`PlatformSetting` key/value table (`docs/data-model.md`), a `PLATFORM_ADMIN`-
only `/settings/integrations/anthropic-api-key` API (`docs/api-reference.md`),
and a settings page in the frontend (`/admin/settings`) to drive it. Values
are encrypted with AES-256-GCM before being stored — the first real
implementation of `@cmmp/security`, previously an empty Phase-1 scaffold —
under a *separate* `SETTINGS_ENCRYPTION_KEY` environment variable, which
still has to be a plain env var since something has to anchor the
encryption chain without circularity. The database value takes priority
over the environment variable when both are set, and `AiMappingService`
resolves it fresh on every call rather than caching it, so a change takes
effect immediately with no API restart.

## Alternatives considered

- **Keep it env-var only.** Simplest, but means every key rotation needs a
  redeploy, and there's no way for an admin to self-serve setting it up
  without shell/infrastructure access.
- **Store the key in plaintext** in a settings table. Rejected outright —
  a live secret sitting in plaintext in the primary application database
  is a materially worse exposure than a `.env` file (more copies via
  backups/replicas, more code paths that could accidentally log or return
  it).
- **A general-purpose secrets vault** (HashiCorp Vault, AWS Secrets
  Manager). The "right" long-term answer for a real production system
  (see `docs/architecture.md`'s aspirational mention of one), but a new
  infrastructure dependency was out of proportion for configuring one
  optional integration key — this ADR's design is the smallest thing that
  actually solves the problem, not a rejection of ever adopting a real
  vault later.

## Consequences

- Losing or rotating `SETTINGS_ENCRYPTION_KEY` makes any previously-saved
  value undecryptable. `SettingsService` treats that as "not configured"
  (falling back to the environment variable, if set) rather than
  throwing — consistent with this whole feature being a pure enhancement,
  never a hard dependency, everywhere else in its design. An operator
  rotating this key needs to know saved settings will need re-entering
  through the UI afterward; this isn't automated.
- `SettingsController`'s three endpoints return only `IntegrationSettingsStatus`
  (booleans/enums) — the key itself is never serialized into any HTTP
  response, on a read or immediately after the write that just set it.
  Combined with `AuditInterceptor` only ever logging the *response* body
  (never the request body — see `docs/security-architecture.md`), the key
  can't end up in the audit trail either, without either of those two
  facts needing to specially know about each other.
- This pattern (an encrypted `PlatformSetting` row, a `PLATFORM_ADMIN`-only
  status-only API, a write-only settings-page form) is now the template
  for any future runtime-configurable integration secret CMMP adds — not
  just the Anthropic key it was built for.
