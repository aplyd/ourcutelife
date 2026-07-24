# Work worksheet — worksheet and verification-tag convention

- Date: 2026-07-18
- Owner: Hermes coordinator
- Roadmap slice: Phase 3 — worksheet template and git-tag convention
- Base: `main` at `c24e6fd`
- Status: verified

## Outcome

Future bounded work can carry compact, durable proof and optional immutable local verification milestones without implying release or deployment approval.

## Scope

- In: worksheet template, usage/tag guidance, workflow/planning references
- Out: app/runtime changes, tag creation/push, deploys, migrations, credentials, external communication

## Existing work protected

The worktree started on `main`, 18 commits ahead of origin, with extensive pre-existing app, Convex, planning, artifact, and test changes. This slice did not rewrite those runtime files.

## Changes

- Added the reusable worksheet and the `verified/YYYY-MM-DD/<slug>` annotated-tag convention.
- Marked the roadmap gap complete and normalized the already-completed Phase 1 audit inbox item.

## Verification evidence

- `pnpm exec oxfmt --check ...` (six slice files) — passed after formatting the two new files
- `git diff --check` — passed
- `git check-ref-format refs/tags/verified/2026-07-18/example-slice` — passed
- `tools/agent_validate` — reached repo-wide format check, then failed only on pre-existing drift in `src/app/(tabs)/plans.tsx`
- Runtime/device: not applicable; documentation/process only, with no mobile/UI behavior change
- Review: bounded diff and link/file existence checked locally; no independent reviewer dispatched for docs-only slice

## Blockers and handoff

- Austin needed: approve any future remote tag push; no approval needed for this local docs slice
- Follow-up: scripted Argent visual-regression baseline flow remains the next explicit Phase 3 gap
- Commit: not committed (mixed dirty worktree and no autonomous commit authorization)
- Push: not pushed (not authorized)
- Verification tag: not created (slice is uncommitted; tag rules intentionally prohibit it)
