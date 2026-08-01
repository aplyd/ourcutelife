# Phase 6 Slice 06-04 — Approved Library Selection and Ranking Implementation

Date: 2026-08-01

## Scope completed

- Added a pure deterministic ranking boundary that accepts only bounded approved-prompt evidence: prompt ID, normalized fingerprint, principle, category, aggregate completion count, bounded recent assignment metadata, and a deterministic selection seed.
- Kept the existing 64-row approved index window and 12-lifecycle recency window explicit and shared between query and ranking code.
- Preserved recent-prompt exclusion whenever a fresh candidate exists, with automatic approved-inventory/seed fallback when every bounded candidate is recent.
- Ranked recency-eligible prompts first by the lowest exact-once aggregate completion count, then by the lowest recent category-plus-principle frequency, then by normalized-fingerprint ordering and deterministic seeded tie-breaking.
- Added fail-closed validation for empty/malformed evidence, unsafe aggregate counts, oversized windows, duplicate candidate IDs, and duplicate normalized fingerprints. The lifecycle retains its exact indexed fingerprint check before assignment.
- Preserved immutable assignment, canonical read/write behavior, answer privacy, exact-once completion counting, generation fallback independence, and every Phase 5 notification path. No schema, generation action, cron, notification file, or mobile surface changed.

## Test-first evidence

- Pure RED: focused Vitest failed because `./dailyPromptSelection` did not exist.
- Pure GREEN: the new focused ranking suite passed **8/8**.
- Integration RED: lifecycle assignment selected a seed instead of the uniquely least-completed approved prompt.
- Integration GREEN: the focused aggregate-completion assignment test passed after the lifecycle used the ranking boundary.

## Verification

- Focused selection, assignment, prompt, and generation suites: **107/107 passed** across 5 files.
- Full unit suite: **84/84 passed**.
- Full Convex suite: **214/214 passed** across 11 files.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with **0 warnings and 0 errors** across 125 files.
- Required `pnpm format:fix` completed without broadening the code worktree; repository formatting and `git diff --check` passed.
- `tools/agent_validate`, `tools/agent_review`, and `tools/agent_commit_sweep`: passed. The review tool's tracked-diff packet omits untracked files by design, so the untracked ranker/tests/planning records were also inspected directly and by the independent reviewer.
- Independent reviews: **PASS / APPROVE**, with **0 Critical, 0 High, 0 Medium, and 0 Low findings**. A separate no-edit reviewer inspected all tracked and untracked Slice 06-04 files, reran the five focused suites at **107/107**, passed typecheck and `git diff --check`, and proved the worktree status unchanged. The earlier read-only Codex review separately found no Medium-or-higher risks and confirmed bounded deterministic ranking, approved-only metadata, exact selected-fingerprint verification, seed fallback, immutable assignment, exact-once completion evidence, and unchanged Phase 5 notification paths.
- Expected pre-existing failure-path diagnostics and timer-overflow warning appeared during the green Convex suite; no test failed.

## Privacy and fallback boundary

The pure ranker receives no raw prompt text, answer, response row, user/couple identity, Moment, Chat, device/token, lifecycle delivery state, notification content, or provider output. The surrounding lifecycle query uses couple ID/date only to fetch the already-authoritative bounded assignment history and derive the existing deterministic seed; only bounded prompt ID, normalized fingerprint, category, principle, and aggregate completion-count metadata crosses into ranking. Selection remains approved-only, and seed insertion still runs before ranking, so unavailable or empty AI inventory cannot remove the six automatic fallbacks.

## Argent applicability

Argent is not applicable: this is backend-only selection/ranking logic with no client route, rendered content, accessibility assertion, interaction, notification delivery, or mobile runtime change. Existing `/prompts/today` evidence remains the latest UI proof.

## External effects

No provider/model call, credential access/change, notification send, live database operation, migration, deployment, install, production configuration, billing change, external communication, commit, push, stash, reset, or destructive action occurred.
