# Phase 6 Slice 06-05 — Reusable Prompt Inventory Readiness Implementation

Date: 2026-08-01

## Scope completed

- Added versioned provider-neutral inventory readiness policy `daily-prompt-inventory-v1` with a healthy floor of 12 approved rows, the existing five-candidate generation cap, the existing 64-row approved selection bound, and deterministic duplicate context capped at 12 normalized fingerprints.
- Added exact-shape validation and fail-closed outcomes for malformed, duplicate, oversized, unavailable, or internally inconsistent inventory evidence. Every non-invalid snapshot must contain exactly `min(approvedCount, 12)` unique normalized fingerprints and cannot claim more than the six server-owned seeds. Valid seed evidence must match one of those seed fingerprints; AI evidence cannot claim a seed fingerprint.
- Added one internal query over `dailyPrompts.by_safety_status_and_completion_count_and_created_at` using `.take(64)`. It reuses the existing document validator, verifies seed metadata, excludes pending/rejected rows through the approved index prefix, and returns only aggregate counts, disposition, requested count, policy version, and bounded approved fingerprints.
- Added a readiness-aware preflight to the existing internal Node generation action. Healthy or invalid evidence returns before provider construction; below-floor evidence supplies only the computed count and bounded fingerprints to the existing injected orchestration; unavailable configuration still invokes neither provider nor persistence.
- Kept generation internal and unscheduled. No schema, client/mobile/UI, cron, scheduler, lifecycle, ranking, assignment, answer, completion, notification, provider configuration, or fallback behavior changed.

## Test-first evidence

- RED: `pnpm exec vitest run convex/dailyPromptInventoryReadiness.test.ts` failed because `./dailyPromptInventoryReadiness` did not exist.
- Initial GREEN: focused readiness coverage passed **24/24**, including empty, seed-only, below-floor, exact-floor, above-floor, capped request, deterministic 12-fingerprint context, malformed/duplicate/oversized evidence, approved-index filtering, malformed persisted rows, healthy/invalid/unavailable preflight denial, computed replenishment authorization, missing configuration, provider failure, and rejected batch behavior.
- Independent review then found one Medium: truncated fingerprint evidence and an impossible seed count could still pass snapshot validation and authorize provider construction. Correction RED passed 24 tests and failed exactly the three new consistency cases; correction GREEN passed **27/27**. Negative preflight coverage proves truncated context and seven claimed seeds return `inventory_invalid` before provider construction, invocation, or persistence, while 20 approved rows with the intended 12-fingerprint cap remain valid.

## Verification

- Focused readiness, generation, ranking, assignment, prompt, Phase 5 lifecycle/delivery, and production-wiring suites: **222/222 passed** across 11 files.
- Full unit suite: **84/84 passed**.
- Full Convex suite: **241/241 passed** across 12 files.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with **0 warnings and 0 errors** across 128 files.
- Required `pnpm format:fix` completed after scope review without broadening the worktree.
- Final repository format, whitespace, `tools/agent_validate`, `tools/agent_review`, and `tools/agent_commit_sweep` gates passed. Source search confirmed `generateReusableDailyPrompts` appears only at its declaration; there is no client, lifecycle, scheduler, or cron invocation path.
- Final strict independent no-edit review returned **PASS / APPROVE** with **0 Critical, 0 High, and 0 Medium findings**. It independently passed 134/134 focused tests, 84/84 unit tests, 241/241 Convex tests, typecheck, lint with 0 warnings/errors, formatting across 304 files, whitespace, validation/review/sweep gates, and proved all nine lane files and repository status unchanged.

## Privacy, provider authorization, and fallback

The readiness helper and internal query receive no answers, responses, completion rows/counts, users, couples, assignments, lifecycles, Moments, Chat, devices/tokens, notification state, timezone, or location. The provider preflight accepts only the validated aggregate snapshot and passes only approved global normalized fingerprints plus the computed candidate count to the existing orchestration. Injected spies prove healthy, invalid, unavailable, ambiguous, and unconfigured states make zero provider-construction, provider-invocation, and persistence calls. Provider failures and rejected batches leave the approved inventory and automatic six-seed fallback untouched.

## Argent applicability

Argent is not applicable because this backend-only slice changes no route, rendered content, accessibility contract, interaction, notification delivery, or mobile runtime behavior. No mobile surface changed.

## External effects

No provider/network/model call, credential access/change, deployment, migration, live-data operation, notification send, installation, external communication, commit, or push occurred.
