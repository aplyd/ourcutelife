# Phase 5 Slice 05-02 Implementation Report

Date: 2026-07-22
Branch: `main` (local branch was 18 commits ahead of `origin/main` during verification)

## Scope completed

Implemented only the additive Convex schema and backend test harness from Slice 05-02:

- `convex/schema.ts`
- `convex/dailyPromptLifecycle.test.ts`
- `vitest.config.ts`
- `package.json`
- `pnpm-lock.yaml`

The schema now retains legacy `pushTokens` and `lastPromptReminderDate`, adds optional couple prompt-timezone fields, and adds `notificationDevices`, `dailyPromptLifecycles`, `dailyPromptDeliveryAttempts`, and `dailyPromptAnswerStarts` with the planned validators and indexes. The pre-existing dirty-tree `by_couple_and_date_plan` index was preserved unchanged.

The harness uses `convex-test` `0.0.54`, Vitest `4.1.10`, `@edge-runtime/vm` `5.0.0`, edge-runtime test configuration, and an `import.meta.glob("./**/*.ts")` module map. Vite `8.1.5` is a direct development dependency so the generated-guidance module-map API remains typed under the repository-wide TypeScript check. The existing Node test command remains separate as `test:unit`; Convex tests run through `test:convex`.

No permission reconciliation, scheduler, Expo dispatch, UI, public/internal mutation, migration, deployment, notification send, staging, commit, or push was performed. No unrelated file was reset, stashed, formatted, or staged. Argent is not applicable to this backend/schema harness slice.

## TDD evidence

The retained transcript is `/tmp/ourcutelife-05-02-tdd.log`.

Vertical RED→GREEN cycles were recorded for:

1. Missing `test:convex` script/harness → legacy couple and `pushTokens.lastPromptReminderDate` inserts pass.
2. Missing optional couple timezone fields → timezone-field insert passes.
3. Missing `notificationDevices` schema → invalid permission status was incorrectly accepted on an unknown table; after the table/validators/indexes were added, all 3 tests passed.
4. Missing `dailyPromptLifecycles` schema → invalid step status was incorrectly accepted; after the table/validators/indexes were added, all 4 tests passed.
5. Missing `dailyPromptDeliveryAttempts` schema → invalid delivery step was incorrectly accepted; after the table/validators/indexes were added, all 5 tests passed.
6. Missing `dailyPromptAnswerStarts` schema → invalid source was incorrectly accepted; after the table/validators/indexes were added, all 6 tests passed.
7. Independent-review remediation RED inserted both partners' answer-start rows and failed because the couple/date index test used `.unique()`; GREEN changed that assertion to return both rows while retaining the per-user/date lookup. Final focused result: 6/6 passing.
8. Coordinator exact-plan RED showed a device row without `platform` was accepted; GREEN made the planned `platform` field required while retaining the explicit `unknown` union member.

## Verification

Fresh coordinator results after implementation and the review correction:

- `pnpm exec vitest run convex/dailyPromptLifecycle.test.ts`: PASS, 1 file and 6/6 tests.
- `pnpm test:unit`: PASS, 65/65 tests.
- `pnpm test:convex`: PASS, 1 file and 6/6 tests.
- `pnpm typecheck`: PASS (`tsc --noEmit`).
- `pnpm lint`: PASS, 0 warnings and 0 errors across 95 files.
- `pnpm exec oxfmt --check convex/schema.ts convex/dailyPromptLifecycle.test.ts vitest.config.ts package.json pnpm-lock.yaml .planning/ROADMAP.md .planning/STATE.md .planning/phases/05-daily-prompt-notification-lifecycle/05-02-IMPLEMENTATION.md`: PASS; all matched files were correctly formatted (7 files processed; the generated lockfile path is formatter-ignored).
- `git diff --check`: PASS, no output.
- `tools/agent_review`: completed; no obvious added-line security patterns found and independent review was requested for meaningful code.

Final verification transcript: `/tmp/ourcutelife-05-02-final-verification.log`.

## Independent no-edit review

A separate `codex exec --yolo` review made no edits. It reported no Critical findings, one High, two Medium, and one Low candidate:

- The High request for a required whole-lifecycle status was not applied because Slice 05-02 explicitly specifies first/second step status unions but no persisted whole-lifecycle status field; adding it would invent a required schema contract beyond this slice.
- The skip-history Medium was not applied because the planned singular reason/timestamp record is disambiguated by the two persisted step statuses and this lifecycle permits at most one skipped delivery step; splitting it would invent fields not named by the plan.
- The valid Medium cardinality finding was fixed test-first: the couple/date answer-start index now proves it can return both partners rather than assuming uniqueness.
- The Low request for a three-field answer-start index was not applied because the plan explicitly names only `by_couple_id_and_prompt_date` and `by_user_id_and_prompt_date`; idempotent mutation behavior belongs to Slice 05-05.

There are no unresolved accepted Critical/High/Medium findings.

## Limitations and next slice

This slice establishes storage validation and index access only. Convex indexes do not independently enforce logical uniqueness; the later authenticated mutations must create-or-return existing lifecycle, attempt, and answer-start rows transactionally using the documented invariants. No live data was migrated or validated against a deployment.

Next: Slice 05-03, implementing authenticated permission/device reconciliation and couple-timezone policy with focused backend/client tests. Do not implement schedulers or notification dispatch until their later planned slices.
