# State

Updated: 2026-07-12T03:36:00-07:00

## Current position

Phase 1 relationship-app restructure is committed locally and code-complete enough for visual verification. Phase 2 date-plans restructure has first privacy/copy/simulator verification slices committed locally. Phase 3 agentic engineering foundation is active; the first docs/tooling slice and recent-commit sweep script slice are committed locally.

## What exists

- Canonical project context: `AGENTS.md`, `AGENT_WORKFLOW.md`, `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`.
- Product specs:
  - `docs/product-spec-relationship-app-restructure.md`
  - `docs/product-spec-date-plans-restructure.md`
- Agent foundation docs under `docs/agent/`: coding conventions, testing, review, visual verification, performance, feedback.
- Repo agent tools: `tools/agent_validate`, `tools/agent_review`, `tools/agent_commit_sweep`; package scripts `agent:validate`, `agent:review`, `agent:sweep`.
- Phase 1 planning/audits/summaries under `.planning/phases/01-relationship-app-restructure/`, including latest route audit `.planning/phases/01-relationship-app-restructure/01-04-ROUTE-SCREEN-AUDIT.md`.
- Phase 2 planning/audit under `.planning/phases/02-date-plans-restructure/`.
- Phase 3 foundation slice: `.planning/phases/03-agentic-engineering-foundation/03-01-FOUNDATION.md`.
- Fresh iOS 26.5 simulator build/install verification works via direct `xcodebuild` plus Argent reinstall/launch.

## Verification / latest work

Latest watchdog slice:

- Coordinator verified and committed the route/screen audit as `docs: audit relationship app routes`.
- Added `.planning/phases/01-relationship-app-restructure/01-04-ROUTE-SCREEN-AUDIT.md` after inspecting remaining primary tab routes and adjacent plan routes.
- Confirmed visible native tab triggers in `src/app/(tabs)/_layout.tsx` are exactly `Today`, `Chat`, `Plans`, and `Me`.
- Confirmed Today and Me still align with Phase 1 at code-inspection level.
- Identified a remaining navigation/spec cleanup item: legacy route files `src/app/(tabs)/swipe.tsx` and `src/app/(tabs)/review.tsx` still live under the tabs route group even though they are not part of the accepted four-tab spine. They should be deleted, moved, redirected, or explicitly hidden in a later bounded slice after choosing the safest preservation path.

Verification for latest slice:

- `npx oxfmt --check .planning/STATE.md .planning/phases/01-relationship-app-restructure/01-04-ROUTE-SCREEN-AUDIT.md` passed.
- `git diff --check` passed.

Recent committed app slice:

- Commit `c3c92a9` tightened remaining plan-item/date language and recorded fresh simulator verification.
- `pnpm format:fix`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `git diff --check` passed.
- Direct `xcodebuild` + Argent reinstall/launch verified fresh Today → Chat → Plans → Me tab navigation on iOS 26.5 simulator.

Recent foundation slice verified for local commit:

- Added `tools/agent_commit_sweep` plus `pnpm agent:sweep` to review recent commits for changed files, verification mentions, secret-like assignments, and advisory deploy/destructive-operation terms.
- Updated `AGENT_WORKFLOW.md`, `.planning/ROADMAP.md`, and `.planning/phases/03-agentic-engineering-foundation/03-01-FOUNDATION.md` to reference the sweep flow.
- Verification run: `pnpm format:fix` passed.
- Verification run: `bash -n tools/agent_commit_sweep` passed.
- Verification run: `tools/agent_commit_sweep` passed; it swept the last 5 commits, found verification mentions in `c3c92a9` and `d419ddf`, no secret assignments, and one advisory docs-only deploy/secrets policy line.
- Verification run: `pnpm agent:sweep` passed with the same evidence.
- Verification run: `pnpm format:check AGENT_WORKFLOW.md .planning/ROADMAP.md .planning/phases/03-agentic-engineering-foundation/03-01-FOUNDATION.md package.json` passed.
- Verification run: `git diff --check` passed.
- Review run: `tools/agent_review` passed for tracked diffs; the new script was additionally inspected with `git diff --no-index -- /dev/null tools/agent_commit_sweep`.

## Current blocker

No hard simulator blocker remains for the iOS 26.5 `iPhone 17 Pro`: direct `xcodebuild` to the simulator destination, Argent reinstall, launch, and tab walkthrough all passed. Expo CLI `pnpm exec expo run:ios --device "F736E64F-ED8F-475C-BD05-7C156B568F74"` still misclassifies the UDID as a physical-device build and fails on missing signing certificates, so use the direct `xcodebuild` + Argent reinstall path for simulator verification unless Expo device selection is fixed.

Do not deploy production, run production migrations, change paid-service settings, touch credentials/secrets/billing, delete data, or message customers/users without Austin approval.

## Next safe actions

1. Resolve the legacy `(tabs)/swipe.tsx` and `(tabs)/review.tsx` route decision in a small non-destructive slice, likely by preserving code but moving/redirecting the routes if they are not intended product surfaces.
2. Add worksheet template and git-tag convention.
3. Add scripted Argent visual-regression baseline flow.
4. Implement the first pure unit harness slice: identify/extract one small pure validator/helper, add Vitest plus `pnpm test:unit`, and verify the test can fail for a local mutation.

## Blockers / questions

- Ask Austin before production deploys, destructive migrations, credential/security changes, paid service changes, external customer messaging, or major product pivots.
