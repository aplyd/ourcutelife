# Phase 5 Slice 05-05 — Authoritative Answer Start and Second Boundary Scheduling

Completed: 2026-07-22 19:23 PDT

## Outcome

Implemented the authoritative answer-start boundary in the daily-prompt input and save paths. The first empty/whitespace-only → non-empty input transition now calls a no-authority-argument server mutation, records one couple-owned answer-start event with server time, preserves the existing response return value and upsert behavior, and transactionally schedules or completes the second delivery step. Continued non-whitespace edits retry after a transient start failure, and Save still converges as a fallback. This slice does not dispatch a push notification, reserve provider delivery, process receipts, add recurring cron behavior, migrate live data, or deploy.

## Files

- `convex/prompts.ts`
  - Adds public `startAnswering({})`, deriving user, couple, current lifecycle, date, and timestamp only from canonical server authority.
  - Keeps the public `answer` arguments and response ID behavior unchanged.
  - Resolves exactly one canonical authenticated app user by `tokenIdentifier`; no email fallback is accepted.
  - Requires exactly one membership and exact two-member lifecycle ownership.
  - Resolves the current persisted lifecycle with the same forward-only date watermark used by reconciliation, preserving immutable timezone snapshots.
  - Inserts or reuses exactly one answer-start for the lifecycle/user and fails closed on duplicate or cross-couple start/response rows.
  - Schedules the second boundary at the persisted start timestamp plus exactly five minutes only when the first recipient starts while step two is pending.
  - Persists one logical delivery key and the exact Convex scheduler job ID transactionally.
  - Skips step two with `skipped_already_started` when the second recipient starts first. If the second recipient starts after the delayed boundary was scheduled but before it ran, the exact persisted job is canceled and the step legally transitions from scheduled to skipped.
  - Replays input/save retries without additional events or jobs and validates scheduled/skipped/delivered state before reuse, including exact pending, in-progress, and successful scheduler states.
  - Requires the delayed boundary's exact persisted scheduler row to be `inProgress`; pending direct/stale invocation fails closed.
- `convex/prompts.test.ts`
  - Adds 22 focused Convex tests for input-before-submit timing, first-recipient scheduling, whitespace, canonical authentication, exact membership, lifecycle authority, stale dates, duplicates, cross-couple ownership, malformed states, replay, concurrent saves, whitespace-existing responses, early and post-boundary second-recipient starts, first-recipient submission after boundary success, in-progress races, scheduled-job cancellation, stale/direct boundary rejection, genuine in-progress boundary execution, and public argument rejection.
- `convex/dailyPromptDateResolver.ts`
  - Extracts the shared forward-only authoritative date resolver so planning and answering cannot drift.
- `convex/dailyPromptLifecycles.ts`
  - Reuses the extracted resolver without changing the completed Slice 05-04 planning contract.
- `convex/schema.ts`
  - Adds optional `secondDeliveryKey` and `secondSchedulerJobId` lifecycle fields for stable second-step and scheduler identities.
- `src/app/(sheet)/prompts/today.tsx`
  - Calls `startAnswering({})` on the first non-whitespace input transition, retries on later non-whitespace edits after transient failure, and awaits the same in-flight promise before submit.
- `tests/unit/daily-prompt-accessibility.test.ts`
  - Locks the TextInput wiring and submit-await contract while preserving its accessible name and button state semantics.

## RED → GREEN evidence

Exact retained output: `/tmp/ourcutelife-05-05-tdd.log`.

- Cycle 1 RED: 2/2 failed before the answer-start boundary existed.
- Cycle 1 GREEN: 2/2 passed after first-start recording and +5-minute scheduling.
- Cycle 3 RED: 1/8 failed because replay did not converge from an existing start row.
- Cycle 3 GREEN: 8/8 passed after insert-or-return convergence.
- Independent-review fix RED: 5/15 failed, reproducing missing scheduler identity, ambiguous canonical auth, timezone-watermark rejection, cross-couple/duplicate ownership acceptance, and illegal lifecycle-state acceptance.
- Independent-review fix GREEN: 15/15 passed.
- Coordinator early-start RED: 2/17 failed because a second-recipient start did not cancel an already scheduled delayed boundary and malformed scheduled state did not fail closed.
- Intermediate GREEN attempts intentionally remained red while scheduler-row and malformed-ID expectations were corrected.
- Coordinator focused GREEN: 17/17 passed.
- Final-review RED: the focused suite was 17/19 because `startAnswering` did not exist and a pending direct boundary invocation was accepted; the UI source contract was 70/71 because TextInput still called only `setAnswer`.
- Final-review GREEN: the focused suite reached 20/20 after adding input-start authority, exact in-progress scheduler identity validation, and a real scheduler-execution proof; unit tests reached 71/71 after wiring the mobile input transition.
- Final re-review RED: a successful delayed boundary stranded later second-partner answers, and the UI retried a transient start failure only on Submit. Focused backend and UI contract regressions reproduced both.
- Final re-review GREEN: exact pending/in-progress/successful scheduler identity is now accepted by answer replay, pending jobs alone are canceled, later edits retry failed start requests, and both first- and second-partner post-boundary saves are proven. Focused prompts reached 22/22 and unit reached 75/75 in the concurrent working tree.

## Review

`tools/agent_review` reported no obvious added-line security patterns. A separate no-edit Codex review made no edits and reported no Critical findings, two High findings, and five Medium findings. All were accepted and fixed test-first:

- High: answer authority used the current timezone instead of the persisted forward-only lifecycle watermark.
- High: existing start/response rows were not proven to belong to the resolved lifecycle/couple and duplicate logical rows were not rejected.
- Medium: answer auth allowed email fallback and did not reject duplicate canonical users.
- Medium: second-step scheduling did not persist the exact scheduler job identity.
- Medium: scheduled replay did not verify the persisted scheduler job.
- Medium: illegal first/second lifecycle statuses could pass through answer-start handling.
- Medium: malformed replay state could be silently reused instead of failing closed.

Coordinator review additionally found that a second-recipient start after scheduling but before execution left the delayed job pending. Focused RED tests reproduced it; the fix validates and cancels the exact job before legally skipping the second step.

Final coordinator verification found two additional malformed/scale edges and fixed both test-first:

- An existing answer-start event could disagree with `lifecycle.firstStartedAt`, causing the delayed boundary to preserve one timestamp while deriving its schedule from another. A focused RED case now requires this state to fail closed before response or scheduler side effects.
- The delayed boundary reintroduced an unbounded notification-device collection. A source-contract RED case now locks it to the bounded `by_ready_lookup` index and a single eligible-device read.

An initial separate no-edit review after the coordinator fixes changed no files, reran the focused prompt and lifecycle suites (47/47), and reported no Critical, High, or Medium findings. A broader follow-up review then found two remaining issues that superseded that result and were fixed test-first:

- High: the real mobile TextInput recorded start only when Submit called `answer`, so a user could type for minutes before the five-minute boundary began. `startAnswering({})` now records the server-authoritative first non-whitespace transition and Submit awaits it.
- Medium: the delayed boundary accepted any non-empty scheduler ID and could act during a pending direct/stale invocation. It now validates the exact persisted job's function, args, time, and `inProgress` execution state. A real scheduled execution test proves the matching job succeeds.

The final independent no-edit re-review then found one High and one Medium issue: a successful boundary left `secondStatus` scheduled while answer replay accepted only a pending job, and continued typing did not retry a failed start request. Both were fixed test-first. Coordinator follow-up also covered the symmetric first-partner save after boundary success and the in-progress race. A fresh final no-edit review changed no files and returned **PASS** with no Critical, High, or Medium findings. Its only Low suggestion was to separate “never attempted” from “retry required” in future UI state cleanup so editing a legacy populated response cannot issue an unnecessary start request; Save remains correct and this does not block Slice 05-05 approval.

## Final verification

- Focused Slice 05-05 suite: 22/22 passed.
- Focused prompts plus lifecycle helper/integration suites: 52/52 passed in final independent review.
- `pnpm test:unit`: 75/75 passed in the current concurrent working tree.
- `pnpm test:convex`: 71/71 passed across four files.
- `pnpm typecheck`: passed.
- `pnpm lint`: 0 warnings and 0 errors across 104 files.
- Canonical targeted `oxfmt --check`: passed across the eleven affected source, test, and planning files.
- `git diff --check`: passed.
- `tools/agent_review`: passed its added-line security scan.

## Privacy and safety

- Public authority remains only canonical auth; the start mutation accepts no user, couple, lifecycle, date, timestamp, scheduler, delivery, or start-event identity.
- Couple/lifecycle/date ownership and exact membership cardinality fail closed before answer-start side effects.
- Persisted lifecycle and answer-start timestamps must agree before any second-step state can be reused or scheduled.
- Delayed readiness checks use the bounded eligible-device index rather than collecting installation history.
- The boundary validates that its exact persisted scheduler row is executing before evaluating eligibility or mutating lifecycle state.
- Convex mutation transaction semantics cover response persistence, answer-start creation/reuse, lifecycle transition, scheduler creation/cancellation, and scheduler-ID persistence.
- No credentials, production services, real accounts, live notifications, deploys, migrations, staging, commits, stashes, resets, pushes, or production cron were used.

## Argent evidence

Argent 0.13.0 reloaded the updated Metro bundle on the booted iOS 26.5 iPhone 17 Pro simulator. The real Daily Prompt sheet was opened, whitespace-only input remained non-starting, non-whitespace text exercised the new input path without UI/runtime errors, and Submit awaited the start path before dismissing successfully. After the retry remediation, Metro was reloaded again and two successive edits exercised the updated handler with no JS errors or warnings. Accessibility discovery confirmed the `Daily prompt answer` input and `Submit daily prompt answer` button remained exposed. No real notification was delivered.

## Remaining boundary

Slice 05-05 schedules and validates only an internal delayed boundary. It does not create provider delivery attempts, dispatch notifications, handle provider receipts/ambiguity/retries, or run recurring lifecycle reconciliation.

Next bounded slice: **05-06 — idempotent device-aware dispatch, provider receipt/ambiguity handling, and required runtime/device verification.**
