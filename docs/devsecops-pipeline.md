# DevSecOps Pipeline

Six workflow files under `.github/workflows/` plus `.github/dependabot.yml`
implement CI, SAST, dependency scanning, secret scanning, DAST, container
scanning/SBOM, and deployment. This document describes exactly what each
one does today, including the deliberate report-only posture most of the
security tooling currently runs in.

## `ci.yml` — the required check

Six jobs, `push`/`pull_request` to `main` plus `workflow_dispatch`; a
`concurrency` group cancels a stale in-progress run when new commits land
on the same ref.

| Job | DB? | What it runs |
|---|---|---|
| `lint-and-typecheck` | no | `npm ci` → `npm run db:generate` (needed even without a live DB — `@cmmp/database` re-exports the generated Prisma Client, which every workspace's type-check depends on) → `npm run lint` → `npm run type-check` |
| `unit-tests` | no | `npm test` (root `turbo run test` — every workspace's own fully-mocked suite) |
| `build` | no | `npm run build` (`turbo run build`, the whole workspace graph) |
| `integration-tests` | **yes** — `postgres:15-alpine` service container | `npm run db:migrate` → `npm run db:seed` → `npm run test:integration --workspace=@cmmp/api` (boots the real `AppModule`, nothing mocked — see Phase 14) |
| `e2e-tests` | **yes** — same service container | migrate → seed → `npx playwright install --with-deps chromium` → `npx playwright test` (both dev servers started by `playwright.config.ts`'s own `webServer` entries) |
| `security-gate` | — | `needs:` all five jobs above; `if: always()` so it still runs to report even if an upstream job failed; fails if `contains(needs.*.result, 'failure')` or `'cancelled')`. This is the **one** check branch protection should require — see below. |

The `integration-tests`/`e2e-tests` jobs seed the demo tenant
(`ciso@example.local`, `viewer@example.local`) before running — a real bug
was caught before this was ever committed by simulating a genuinely fresh
CI runner locally (drop-and-recreate Postgres, migrate only, run the suite
without seeding first, confirm it fails on login, then add the seed step
and re-confirm).

## `codeql.yml` — SAST

`github/codeql-action` with the `javascript-typescript` extractor and the
`security-and-quality` query pack (broader than the default
`security-extended` in that it also flags code-quality issues, not just
vulnerabilities). Runs on push/PR **and** a weekly Monday cron — the cron
exists specifically so a new query added to the pack surfaces findings
against *unchanged* code too, not only new PR diffs. No build step: the
JS/TS extractor works from source directly.

## `dependabot.yml` — dependency scanning

Three ecosystems:

1. **`npm` at `/`** — a single entry, correct for an npm-workspaces
   monorepo with one root `package-lock.json` (not one entry per
   workspace, which would be wrong here). Weekly on Mondays, grouped by
   `production-dependencies`/`development-dependencies` so routine minor/
   patch bumps batch into a couple of PRs instead of dozens; anything
   Dependabot flags as a security advisory is exempted from grouping and
   opens its own PR immediately, per Dependabot's own default behavior.
2. **`github-actions` at `/`** — keeps the workflow files' own pinned
   action versions current.
3. **`docker` at `/infrastructure`** — tracks the base images
   (`node:20-alpine`, `postgres:15-alpine`) referenced by both Dockerfiles.

## `gitleaks.yml` — secret scanning

`gitleaks/gitleaks-action@v2` on push/PR, with `fetch-depth: 0` — Gitleaks
needs full history, not just the merge commit, to actually scan every
commit a PR introduces rather than just its final diff.

## `dast.yml` — OWASP ZAP baseline

Brings the **real Compose stack** up (`docker compose up -d --build`,
throwaway `JWT_SECRET`/`NEXTAUTH_SECRET` values scoped to this job only),
polls `http://localhost:3000/auth/signin` for up to 5 minutes, then runs
`zaproxy/action-baseline`. This is deliberately a **baseline (passive-only)**
scan — it spiders the app and inspects response headers/cookies/etc., but
never submits a form or attempts exploitation — which is what makes it safe
to run unattended against a real, running instance in CI (an authenticated
active scan is explicitly out of scope for this phase). `fail_action: false`
means findings are reported (HTML report uploaded as an artifact, 14-day
retention) but don't fail the job yet — see "Report-only posture" below.
The stack is always torn down (`docker compose down -v`, `if: always()`)
whether the scan passed or not.

## `container-scan.yml` — Trivy + SBOM

Matrix over `api`/`web`:

1. Builds the real image with `docker/build-push-action` (`load: true`,
   `push: false` — loaded into the local Docker daemon for scanning, never
   pushed anywhere from this workflow).
2. Scans it with `aquasecurity/trivy-action` for `CRITICAL,HIGH` findings,
   SARIF output uploaded to the repo's Security tab (`exit-code: "0"` —
   report-only, see below).
3. Generates a per-image SPDX SBOM (`anchore/sbom-action`), 90-day
   retention.

A separate `sbom-dependencies` job generates one more SBOM — a CycloneDX
document of the **full npm dependency tree across every workspace**
(`@cyclonedx/cyclonedx-npm`), which is broader than what actually ships
inside either container image; the two are complementary, not redundant.

## `deploy.yml` — build, publish, (eventually) deploy

See `docs/deployment-guide.md` for the full walkthrough:
`verify` (re-run all CI gates) → `build-and-push` (GHCR, tagged by SHA/
branch/semver) → `deploy` (gated behind a GitHub Environment named
`production`, currently a placeholder since no hosting target is chosen).

## Report-only posture — and how to flip it

Trivy (`exit-code: "0"`) and ZAP (`fail_action: false`) are deliberately
**not** hard gates yet. This is a considered choice, not an oversight: both
tools are running against this codebase for the first time, and nothing
has been triaged — an immediate hard gate would likely block on
pre-existing, unreviewed findings (e.g. a missing security header ZAP
flags by default) rather than catching an actual regression, training
everyone to route around the gate instead of trusting it.

**To flip to enforcing**, once a human has done a first triage pass over
both tools' current findings (accepting or fixing each one):
- `container-scan.yml`: change Trivy's `exit-code: "0"` to `"1"`.
- `dast.yml`: change ZAP's `fail_action: false` to `true`.

Neither CodeQL nor Gitleaks needs this treatment — both already fail their
own job on a finding by default; there's no report-only mode for them in
this pipeline.

## What no committed workflow file can do

GitHub's branch-protection "required status checks" is a repository
**Settings** action, not something a workflow YAML file configures. A repo
admin still needs to go to **Settings → Branches** and mark
`Security Gate` (from `ci.yml`), `Gitleaks`, and CodeQL's
`Analyze (javascript-typescript)` job as required checks before any of
this actually blocks a merge. Until that's done, every workflow here runs
and reports, but nothing stops a red PR from merging.

`.github/CODEOWNERS` (pre-existing, untouched since Phase 1) references
placeholder GitHub teams (`@security-team`, `@devops-team`, etc.) that
don't exist in this personal-account repo. GitHub silently ignores
CODEOWNERS entries for teams/users it can't resolve — this isn't actively
broken, just inert until real reviewers/teams are assigned.

## What hasn't been run for real

This pipeline was built and verified in a sandbox with **no GitHub Actions
runner and no Docker Hub registry access** (outbound access to the image
CDN is blocked by the sandbox's egress policy). Every individual shell
command each workflow invokes was run manually — against a genuinely
freshly-recreated local Postgres, not leftover seeded state — to simulate
a first-ever CI run as closely as possible, and every workflow YAML file
was parsed with `yaml.safe_load` to catch structural errors. What was
**not** possible: an actual GitHub Actions execution of any of these six
files, or a real `docker build` for the image-based jobs
(`container-scan.yml`, `dast.yml`, `deploy.yml`). Whoever has real CI
access should watch the first live run of each workflow closely and expect
to tune Trivy/ZAP's thresholds during that first triage pass.
