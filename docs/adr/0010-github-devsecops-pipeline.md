# ADR-0010: GitHub DevSecOps Pipeline

**Status**: Accepted

## Context

A security-maturity assessment product carries an obvious expectation
that its own delivery pipeline demonstrates the practices it helps
customers assess against (SAST, dependency scanning, secret scanning,
DAST, container scanning, SBOM generation) — and the project is already
hosted on GitHub, with no separate CI infrastructure to operate.

## Decision

Six GitHub Actions workflows plus Dependabot, entirely native to GitHub —
no external CI system. See `docs/devsecops-pipeline.md` for the full,
current behavior of each:

- `ci.yml` — lint/type-check/unit/build/integration/E2E, gated by one
  aggregator job (`security-gate`).
- `codeql.yml` — SAST.
- `dependabot.yml` — dependency scanning (npm, github-actions, docker).
- `gitleaks.yml` — secret scanning.
- `dast.yml` — OWASP ZAP baseline (passive) DAST against the real Compose
  stack.
- `container-scan.yml` — Trivy CVE scanning + three SBOM artifacts (two
  per-image SPDX, one CycloneDX dependency-tree).
- `deploy.yml` — build/publish to GHCR, gated deploy placeholder.

## Alternatives considered

Jenkins, GitLab CI, CircleCI — all would require either migrating off
GitHub or maintaining a second platform's worth of pipeline config
alongside GitHub's own PR/issue workflow.

## Consequences

- Security scanning lives next to the code it scans, with results
  surfaced directly in GitHub's own Security tab (CodeQL, Trivy SARIF
  uploads) — no separate dashboard to check.
- **Deliberately report-only on Trivy and ZAP for now** — both tools are
  running against this codebase for the first time, with nothing yet
  triaged; hard-failing immediately would likely block on pre-existing,
  unreviewed findings rather than catch a real regression. See
  `docs/devsecops-pipeline.md`'s "Report-only posture" section for exactly
  what flips this to enforcing, and when that should happen.
- GitHub Actions' own required-status-checks setting (Settings → Branches)
  is **not** something any committed workflow file can configure — a repo
  admin must still mark `Security Gate`, `Gitleaks`, and CodeQL's analyze
  job as required, by hand, in the repository's own settings.
- Every one of these six workflows was built and verified in a sandbox
  with **no real GitHub Actions runner and no Docker Hub registry access**
  — every individual command was run manually against a genuinely fresh
  local Postgres to simulate a first CI run as closely as possible, but
  none of these workflow files has actually executed on GitHub's own
  infrastructure yet as of this writing. Whoever has real CI access should
  watch the first live run of each closely.
