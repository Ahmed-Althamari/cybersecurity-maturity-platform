# ADR-0009: NextAuth.js Authentication

**Status**: Accepted

## Context

The frontend (ADR-0002) needs a session mechanism that plays well with
Next.js's server/client split, while the actual identity and authorization
source of truth is the NestJS API's own JWT-based auth (ADR-0003) — the
two shouldn't become two separate, conflicting identity systems.

## Decision

NextAuth.js's `CredentialsProvider`, configured so its `authorize()`
callback calls the real `POST /api/v1/auth/login` on the NestJS API and
carries the **NestJS-issued JWT itself** inside the NextAuth session
(`types/next-auth.d.ts` module augmentation adds the token, tenantId,
organisationId, and role/roles onto the session shape) — NextAuth never
mints its own separate token. Every subsequent frontend API call attaches
that same real JWT as a Bearer token.

## Alternatives considered

Auth0, AWS Cognito, a hand-rolled JWT flow with no auth library at all on
the frontend.

## Consequences

- **Exactly one identity/token system**, not two competing ones — the
  NestJS API is the sole source of truth for who a user is and what
  they're allowed to do; NextAuth is purely a session-carrying convenience
  on the frontend.
- **This wasn't the starting state.** Phase 1's scaffold had NextAuth's
  `authorize()` wired to a hardcoded `demoUsers` array with a
  `// TODO: call actual authentication API` comment — a placeholder that
  survived until Phase 10 actually wired it to the real endpoint. Anyone
  reading old scaffold code or early documentation should not assume
  NextAuth was ever a real, independent auth path in this project's
  history.
- Inherits every real limitation of the underlying NestJS JWT scheme
  documented in `docs/security-architecture.md` — a 24h non-revocable
  token, no rate limiting on the login call it proxies to, etc. NextAuth
  adds no additional security boundary beyond session-cookie handling on
  the Next.js side; it does not compensate for gaps in the API's own auth.
- OIDC/SSO integration (mentioned as a future direction) is not built —
  `CredentialsProvider` is the only configured provider today.
