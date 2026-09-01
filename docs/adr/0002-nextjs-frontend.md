# ADR-0002: Next.js Frontend

**Status**: Accepted

## Context

CMMP's frontend needs server-side rendering for fast first paint on
data-heavy dashboards, a straightforward way to host authentication logic
server-side (see ADR-0009), and a mature ecosystem for chart libraries
(Recharts) and component primitives.

## Decision

Next.js (Pages Router — `apps/web/pages/**`), with
`output: "standalone"` (added during Phase 15 specifically so the Docker
runtime image can copy only the traced `node_modules` each page actually
needs, rather than the whole monorepo's `node_modules`).

## Alternatives considered

Vue, Svelte, Remix.

## Consequences

- **Server-side auth boundary**: NextAuth's `CredentialsProvider.authorize()`
  runs inside the Next.js server process, not the browser — this is what
  makes ADR-0009's design possible, but also introduced a real Docker
  networking bug (the callback used the browser-facing
  `NEXT_PUBLIC_API_URL`, which resolves to the wrong container from
  *inside* `web`'s own container — see `docs/deployment-guide.md`'s
  `INTERNAL_API_URL` split, fixed in Phase 15).
- Pages Router (not the App Router) was used throughout — a Phase 1
  decision carried through every subsequent phase; nothing in this
  codebase mixes the two routing paradigms.
- Recharts (`RadarChart`, `BarChart`) renders every dashboard
  visualization (maturity radar, gap bars, distribution chart) — chosen
  for its React-native API over a lower-level charting library, at the
  cost of less layout control than e.g. D3 directly.
- `class-variance-authority`/`clsx`/`tailwind-merge`/`@radix-ui/react-slot`
  back a small shadcn-style `components/ui/*` primitive set (Card, Button,
  Badge) built in Phase 10 — no actual shadcn/ui CLI-generated components
  exist; only the styling conventions were adopted.
