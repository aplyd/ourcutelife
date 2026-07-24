# Phase 5 Slice 05-06 Increment — Mocked Dispatch and Outcome Persistence

Completed: 2026-07-23 17:29 PDT

## Outcome

Implemented the mocked-provider dispatch and deterministic outcome-persistence increment behind the atomic reservation boundary, then test-first corrected both Medium findings from independent review. No real Expo/APNs provider adapter was added or called.

The injected dispatcher now reserves, durably changes the exact attempt from `reserved` to provisional `sending_unknown` before invoking the provider, consumes the raw token only while constructing the ephemeral generic push message, and finalizes accepted/rejected/ambiguous outcomes exactly once through an explicit `outcomePersistedAt` marker. Reservation stores only a SHA-256 token hash, and a stale `DeviceNotRegistered` rejection disables routing only when that hash still matches the current token on the exact owned device row. Existing attempts still suppress every dispatch replay before provider invocation.

## Files

- `convex/dailyPromptDelivery.ts`
  - Adds typed reservation, provider, and persistence boundaries.
  - Adds `dispatchReservedDailyPrompt`, which reserves first, requires dispatch-start disposition `started`, returns a non-send result for every other start disposition, then builds the generic route-only message from the ephemeral token, invokes the injected provider, converts thrown provider errors to `sending_unknown`, and persists the classified result.
  - Does not import an Expo SDK, call `fetch`, read credentials, or expose a real provider implementation.
- `convex/dailyPromptDeliveryOutcome.ts`
  - Adds the internal atomic outcome mutation.
  - Validates one exact idempotency-key attempt, its lifecycle/couple/date/recipient/step ownership, a dispatch-started provisional `sending_unknown` attempt, and the matching `sending` lifecycle step before writing.
  - Persists only accepted ticket ID, rejected error code, or ambiguous status.
  - Advances only the accepted step to `sent`; marks only the rejected step `skipped`; keeps ambiguous lifecycle state `sending` so no retry can infer resend permission.
  - Disables the exact reserved device only for `DeviceNotRegistered`, and rejects a mismatched caller-provided disable classification.
  - Returns the already persisted status without overwriting it on replay, including a conflicting replay outcome.
- `convex/dailyPromptDeliveryOutcome.test.ts`
  - Adds six Convex tests covering accepted, two deterministic rejection classes, ambiguity, conflicting replay, and an end-to-end mocked-provider integration around the real reservation and persistence mutations.
  - The integration invokes the dispatcher twice and proves one provider call, one attempt, one accepted ticket, and a second `attempt_exists` no-send result.
- `tests/unit/daily-prompt-delivery.test.ts`
  - Adds pure injected-provider coverage for ephemeral-token consumption, privacy-safe persistence arguments, accepted mapping, `DeviceNotRegistered`, and thrown ambiguity.
- `.planning/STATE.md`
  - Records the verified increment, exact known full-Convex limitation, backend-only Argent non-applicability, and next review gate.
- `.planning/phases/05-daily-prompt-notification-lifecycle/05-06-IMPLEMENTATION.md`
  - This report.

## Test-first evidence

- Unit RED: compilation failed because `dispatchReservedDailyPrompt` did not exist; the new callback also had no inferred outcome type before the boundary types existed.
- Convex RED: all 5 initial outcome cases failed because `dailyPromptDeliveryOutcome` did not exist.
- First GREEN: cumulative unit suite passed 78/78; outcome plus reservation suites passed 15/15; typecheck passed.
- Integration RED: the real-reservation mocked-provider test failed with `invalid_membership` because its initial outcome-only fixture lacked the exact two-member reservation prerequisite.
- Integration GREEN: after making the fixture valid for the real reservation boundary, the outcome suite passed 6/6 and the combined delivery reservation/outcome suites passed 16/16.

## Deterministic behavior and privacy

- Accepted: attempt becomes `provider_accepted`, retains only `expoTicketId`, and the exact lifecycle step becomes `sent` with its sent timestamp.
- Rejected: attempt becomes `provider_rejected`, retains only `expoErrorCode`, and the exact lifecycle step becomes `skipped` with a deterministic reason.
- Ambiguous/malformed/thrown: attempt becomes `sending_unknown`; lifecycle remains `sending`; the existing attempt blocks redispatch.
- `DeviceNotRegistered`: the exact `(recipientUserId, deviceId, coupleId)` routing row is required and atomically disabled.
- Every other rejection: routing remains enabled.
- A forged `disableDevice` value that disagrees with `expoErrorCode === "DeviceNotRegistered"` fails closed.
- Attempt history never receives the raw Expo token. The orchestration unit test also proves persistence arguments do not contain it.
- A conflicting persistence replay returns the first stored status and cannot replace its ticket/error metadata.

## Verification

- Focused Convex delivery suites:
  - `pnpm exec vitest run convex/dailyPromptDeliveryOutcome.test.ts convex/dailyPromptDelivery.test.ts`
  - Passed 15/15 before the final integration fixture extension.
  - `pnpm exec vitest run convex/dailyPromptDeliveryOutcome.test.ts`
  - Final outcome suite passed 6/6; the cumulative full run later passed all 16 reservation/outcome tests.
- `pnpm test:unit`: passed 78/78.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with 0 warnings and 0 errors across 108 files.
- Targeted `pnpm exec oxfmt --write` and `--check` across the four changed TypeScript files: passed.
- `git diff --check`: passed before the report/state update and rerun in the final gate.
- `pnpm test:convex`: exercised all six Convex test files; 85/87 passed. All 16 delivery reservation/outcome tests and every non-prompt suite passed. Two existing `convex/prompts.test.ts` cases failed because their fixed `2026-07-22` lifecycle fixture is no longer the current `America/New_York` date, yielding `Daily prompt date is not current.` before the expected duplicate/mismatch assertion. This is the same wall-clock dependency already documented in `.planning/STATE.md`; this bounded dispatch increment did not modify prompt authority or broaden into that unrelated repair.
- `tools/agent_review`: passed; its added-line security grep reported no obvious patterns and requested independent review for meaningful code changes.

## Argent applicability

Argent is not applicable to this increment because no mobile route, component, permission UI, deep-link handler, app fixture, native notification registration, or other mobile surface changed. The provider is injected and mocked entirely in local unit/Convex tests, and no notification was sent. The Phase 5 later non-production end-to-end device verification gate remains required; this report does not claim simulator push delivery.

## Scope and external effects

No recurring cron, receipt polling, Phase 6 work, production provider adapter, Expo/APNs request, notification send, credential access, live data migration, deployment, staging, commit, push, reset, stash, or unrelated formatting occurred.

## Independent-review Medium correction — 2026-07-23 21:41 PDT

The bounded correction touched only Slice 05-06 delivery schema/orchestration/tests and this report/state:

- `convex/schema.ts` adds optional `dispatchStartedAt` and `outcomePersistedAt` attempt markers.
- `convex/dailyPromptDeliveryToken.ts` adds the Web Crypto SHA-256 helper used only to derive a one-way routing-token fingerprint.
- `convex/dailyPromptDeliveryReservation.ts` persists that hash with the exact attempt while still returning the raw token only ephemerally to dispatch.
- `convex/dailyPromptDeliveryStart.ts` adds the internal exact-attempt/lifecycle/recipient/step-owned mutation that durably changes `reserved` to provisional `sending_unknown` before provider invocation.
- `convex/dailyPromptDelivery.ts` requires that dispatch-start persistence to finish before message construction/provider invocation.
- `convex/dailyPromptDeliveryOutcome.ts` finalizes only a dispatch-started provisional attempt; accepted, rejected, and ambiguous outcomes atomically write `outcomePersistedAt` once. Finalized or legacy terminal attempts replay without mutation. `DeviceNotRegistered` disables the exact owned device only when its current raw token hashes to the reservation hash; a missing or mismatched hash fails safe and leaves routing enabled.
- `convex/dailyPromptDelivery.test.ts`, `convex/dailyPromptDeliveryOutcome.test.ts`, and `tests/unit/daily-prompt-delivery.test.ts` cover the hash/no-raw-token contract, pre-provider durable ambiguity and ordering, all three exact-once finalizations, finalized-unknown conflict immutability, stale rejection after rotation, and one provider call across replay.

### Correction RED

Captured in `/tmp/ourcutelife-05-06-medium-correction-red.log` before implementation:

- `pnpm test:unit` failed compilation because `startDispatch` did not exist in `DailyPromptDispatchDependencies`.
- Focused Convex delivery coverage had 9 failures and 10 passes: reservation lacked `tokenHash`, and eight start/finalization cases failed because `dailyPromptDeliveryStart` did not exist.

### Correction GREEN and cumulative evidence

- Focused delivery command `pnpm exec vitest run convex/dailyPromptDelivery.test.ts convex/dailyPromptDeliveryOutcome.test.ts`: **19/19 passed**.
- `pnpm test:unit`: **78/78 passed**.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with **0 warnings and 0 errors across 110 files**.
- `pnpm test:convex`: **88/90 passed**. All 19 delivery tests and all non-prompt suites passed. Exactly the same two known fixed-date `convex/prompts.test.ts` cases failed because the `2026-07-22` fixture is no longer current in `America/New_York`; both received `Daily prompt date is not current.` before their intended duplicate/mismatch assertion. No new Convex failure appeared.
- Targeted `pnpm exec oxfmt --write` and `--check` passed across all 11 touched TS/MD files.
- `git diff --check`: passed.
- `tools/agent_review`: passed its review-packet and added-line security grep with no obvious patterns. Its packet is Git-diff based and therefore did **not** list the untracked primary Slice 05-06 TypeScript/report files; those files were manually reviewed and exercised by the focused/unit/Convex/type/lint gates, so no broader tool coverage is claimed.

### Privacy and idempotency reasoning

The new notification-device/delivery-attempt path keeps raw Expo tokens out of attempt history: attempts store the exact device ID plus a one-way SHA-256 token hash, while dispatch-start and outcome mutation arguments also contain no token. The raw token crosses this path only from the notification-device routing row through the reservation return and ephemeral provider message. This claim is intentionally scoped to the new path because the retained legacy `pushTokens.token` field is also durable. Comparing a fresh current-token hash to the reserved hash binds `DeviceNotRegistered` to the token actually sent, so token A cannot disable rotated token B on the same row.

The attempt is already durable before external work, and dispatch-start durably marks possible-send ambiguity before the provider can run. Therefore a crash during or after provider invocation leaves `sending_unknown`, and the pre-existing idempotency-key attempt blocks blind resend. `dispatchStartedAt` distinguishes a finalizable provisional unknown from a legacy/final unknown; `outcomePersistedAt` makes the first accepted/rejected/ambiguous finalization immutable, including a conflicting replay after finalized unknown. Lifecycle progression and successful accepted ordering remain unchanged after the new pre-provider durability boundary.

No real provider/service/database, credential, notification, install, deployment, migration, external communication, commit, stage, stash, reset, or push occurred.

## Final-review Low correction — 2026-07-23 21:54 PDT

All three final-review Low findings were corrected in a bounded test-first pass. This is the implementation's final local status; independent final approval is **not** claimed.

### Authorization hardening

- `startDailyPromptDeliveryDispatch` now distinguishes a provisional dispatch replay (`already_started`: `dispatchStartedAt` exists and `outcomePersistedAt` does not) from finalized or legacy unknown state (`already_finalized`).
- `dispatchReservedDailyPrompt` treats only exact disposition `started` as provider authorization. `already_started` and `already_finalized` return privacy-safe `no_send` results with reasons `dispatch_already_started` and `dispatch_already_finalized`; neither path constructs a message, calls the provider, or persists an outcome.
- Existing reservation idempotency, raw-token confinement, SHA-256 token binding, stale-token `DeviceNotRegistered` protection, exact-once first outcome, and at-most-once provider semantics remain unchanged.

### Direct correction coverage

- Pure dispatcher coverage proves both non-start dispositions produce no provider or persistence call.
- Convex coverage directly distinguishes provisional, finalized, and legacy unknown starts.
- A simulated post-provider crash throws before persistence, leaves the attempt provisional `sending_unknown`, and proves replay returns `attempt_exists` without a second provider call.
- Concurrent full dispatcher calls converge on one attempt, one provider call, one persisted accepted outcome, and one no-send result.
- Conflicting concurrent accepted/rejected persistence calls converge on exactly one immutable first result; the other returns `already_persisted` with that same status.

### RED / GREEN / final verification

- RED is retained at `/tmp/ourcutelife-05-06-low-correction-red.log`: unit compilation rejected the new `already_finalized` contract, and focused Convex ran 22/23 with finalized unknown incorrectly returning `already_started`.
- GREEN is retained at `/tmp/ourcutelife-05-06-low-correction-green.log`: cumulative unit passed 79/79 and focused delivery passed 23/23.
- Final focused delivery: `pnpm exec vitest run convex/dailyPromptDelivery.test.ts convex/dailyPromptDeliveryOutcome.test.ts` — **23/23 passed**.
- Full unit: `pnpm test:unit` — **79/79 passed**.
- TypeScript: `pnpm typecheck` — passed.
- Lint: `pnpm lint` — **0 warnings and 0 errors across 110 files**.
- Full Convex: `pnpm test:convex` — **92/94 passed**. All 23 delivery tests and every non-prompt test passed. Exactly two unrelated `convex/prompts.test.ts` cases failed because fixed prompt date `2026-07-22` is no longer current in `America/New_York`; both received `Daily prompt date is not current.` before their expected answer-start mismatch/duplicate assertions. No delivery failure appeared.
- Targeted `oxfmt --write` and `--check` passed for the four correction TypeScript files. The report and state were subsequently included in the final targeted formatting gate.
- `git diff --check` and `tools/agent_review` were rerun after the final report/state update; results are recorded in state and the handoff.
- The complete untracked-file list was manually inspected after implementation. Primary untracked Slice 05-06 code/tests/report were read and exercised directly; artifact and planning paths remained within the preserved dirty tree. No untracked file was staged, deleted, or rewritten outside this correction's named files.

### Scope / external effects

No real provider, network request, notification, service, credential, live database, deploy, migration, Argent action, commit, stage, stash, reset, push, or external communication occurred. This backend-only correction changed no mobile surface, so Argent remained not applicable. Independent final approval was still a separate gate at this checkpoint; the subsequent final-review closure is recorded below.

## Final independent-review Low closure — 2026-07-23 22:05 PDT

Final independent review returned **PASS** with no Critical, High, or Medium findings and two non-blocking Low findings. Both Lows are now closed without production behavior changes:

- Documentation now narrowly states that the new notification-device/delivery-attempt path keeps raw tokens out of attempt history and explicitly acknowledges the retained durable legacy `pushTokens.token` field.
- Focused negative-path regression coverage directly exercises the previously uncovered fail-closed guards while preserving the existing privacy and idempotency behavior.

### Negative-path coverage map

- Pure classifier: wrong-typed `details` and wrong-typed nested `details.error` both classify as `sending_unknown`.
- Outcome metadata: whitespace-only accepted ticket IDs and rejected error codes reject without finalizing the provisional attempt or advancing the lifecycle.
- Disable classification: both forged directions (`DeviceNotRegistered` + `false`, another code + `true`) reject without finalizing.
- Attempt identity: duplicate rows sharing one idempotency key reject before persistence.
- Lifecycle binding: recipient ownership mismatch and non-`sending` lifecycle state reject before persistence.
- Device binding: exact user/device lookup with mismatched couple ownership rejects without disabling the device or finalizing the attempt.

### Final verification

- Focused delivery: `pnpm exec vitest run convex/dailyPromptDelivery.test.ts convex/dailyPromptDeliveryOutcome.test.ts` — **28/28 passed** across 2 files (10 reservation + 18 outcome tests).
- Full unit: `pnpm test:unit` — **79/79 passed**; the existing malformed-provider test now also covers both wrong-typed nested-detail cases.
- TypeScript: `pnpm typecheck` — passed.
- Lint: `pnpm lint` — **0 warnings and 0 errors across 110 files**.
- Full Convex: `pnpm test:convex` — **97/99 passed** across 6 files. All 28 focused delivery tests and every non-prompt test passed. Only the same two known `convex/prompts.test.ts` fixed-date cases failed: each received `Daily prompt date is not current.` before its expected answer-start mismatch/duplicate assertion.
- Targeted `oxfmt --write` and `--check` and final `git diff --check` passed across the affected files. `tools/agent_review` passed its tracked-diff packet and added-line security grep with no obvious patterns; because it omits untracked files, no tool review of those files is claimed.
- Affected untracked files were manually inspected; no unrelated untracked content was rewritten, staged, or deleted.

No real provider/service/credential/notification, network request, live database, deployment, migration, Argent action, commit, stage, stash, reset, push, or external communication occurred.
