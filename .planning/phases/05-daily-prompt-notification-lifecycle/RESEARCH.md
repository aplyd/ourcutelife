# Phase 5 Research — Existing Notification and Prompt Audit

## Audit method

Read-only inspection covered `AGENTS.md`, `AGENT_WORKFLOW.md`, `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/DECISIONS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `convex/_generated/ai/guidelines.md`, the files below, and the current test/package configuration. A Codex CLI worker was run with `codex exec --yolo` under an explicit no-edit/no-commit/no-deploy/no-migration constraint. The dirty tree remained preserved.

## Current implementation by exact file

### `src/lib/notifications.ts`

- `requestNotificationPermissions()` reads OS permission and immediately requests if not already granted.
- `getServerPushRegistration()` returns the Expo token, platform, AsyncStorage-generated device ID, and `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- It returns `null` on denied permission, so denial/revocation is never reported to the server.
- The AsyncStorage ID changes on reinstall. No permission status, observed-at time, app state, or token rotation relation is persisted server-side.

### `src/app/_layout.tsx`

- `RootStack` calls `getServerPushRegistration()` after any authenticated session appears and invokes `api.push.registerToken`.
- Permission prompting is an app-start side effect, errors are swallowed, and no foreground permission reconciliation exists.
- No couple-readiness/status UI is present.

### `convex/schema.ts`

- `pushTokens` stores `userId`, token, platform, optional device/timezone, `enabled`, token-local `lastPromptReminderDate`, and timestamps.
- `promptResponses` stores the submitted answer and prompt text by user/date.
- Missing: durable OS permission status, couple timezone policy, couple-day lifecycle, recipient assignment, scheduled timestamps, start event, send attempts, provider ticket/outcome, and idempotency keys.

### `convex/crons.ts`

- An hourly cron (`0 * * * *`) calls `internal.push.sendDailyPromptReminders`.
- Hourly cadence cannot deliver a persisted random minute without scheduler jobs or a finer due-work mechanism.

### `convex/push.ts`

- `registerToken` validates an Expo token and upserts by token, always setting `enabled: true`.
- `dueDailyPromptReminders` takes the first 100 enabled tokens, uses each token's timezone (or silent `America/Los_Angeles` fallback), and selects tokens whose local hour equals 19 and whose token-local date was not marked sent.
- It skips a user if a `promptResponses` row exists for that token-local date.
- `sendDailyPromptReminders` sends every selected token the same generic push, disables `DeviceNotRegistered`, and marks successful token rows after the provider call.
- Current behavior therefore sends both partners/all eligible devices around fixed 7 PM, has no couple-level permission gate, no alternation/random minute/start trigger, and no durable couple-day idempotency.
- Failure window: Expo may accept a push and the follow-up mutation may fail, allowing resend.
- Scale risk: `.take(100)` from `by_enabled` can repeatedly starve later rows; there is no cursor/batch continuation.

### `convex/prompts.ts`

- `todayKey()` uses UTC (`toISOString().slice(0, 10)`), while push uses token-local dates.
- `today` generates/selects content independently for each user's UTC day and reveals partner response only after both responses exist.
- `answer` upserts only at submit time and overwrites `createdAt` on an edit.
- The client supplies `promptDate` and `prompt`; the server does not derive the canonical couple-local prompt day.
- There is no authoritative answer-start event.

### `src/app/(sheet)/prompts/today.tsx`

- `handleSave()` invokes `api.prompts.answer` only on submit.
- Opening, focusing, and typing do not emit lifecycle events.
- Existing private-until-both-submit rendering must be preserved.

### `src/lib/devMock.ts`

- `mockPrompt` has no `promptDate`, start lifecycle, permission readiness, or scheduled delivery data.
- Mock mutations are mostly no-ops except date-plan lifecycle changes, so eventual non-production two-partner notification UI verification needs a bounded fixture path or backend test harness.

### `tests/unit/daily-prompt-accessibility.test.ts` and `package.json`

- Existing coverage checks static accessibility contracts only.
- `pnpm test:unit` compiles source-contract and pure Node tests; it does not execute Convex functions.
- `convex-test`, Vitest, and `@edge-runtime/vm` are not configured even though the generated Convex guidance requires them for Convex tests.

## Requirement gap matrix

| Requirement                | Current evidence              | Gap                                                     |
| -------------------------- | ----------------------------- | ------------------------------------------------------- |
| Both partners grant        | one enabled token is enough   | no per-user permission truth or couple readiness        |
| Alternate first            | all due tokens selected       | no recipient order/history                              |
| Random 7–9 PM              | fixed local hour 19           | no persisted minute or couple timezone                  |
| Second at first-start +5m  | both can receive initial push | no start event/delayed job                              |
| Idempotent changes/retries | token/date sent marker        | not couple/user step scoped; provider/DB failure window |

## Technical constraints from Convex guidance

- Define schema only in `convex/schema.ts` and name indexes with all index fields.
- Use internal functions for scheduler/provider operations; public functions require validators and server-derived authentication.
- Do not accept a user ID for authorization.
- Prefer indexed and bounded queries; avoid unbounded arrays and `.collect()` for growing datasets.
- Use `ctx.scheduler.runAt`/`runAfter` for exact persisted execution points and internal function references from `_generated/api`.
- Keep Node actions separate if Node-only APIs are introduced; plain `fetch()` does not require `"use node"`.
- Use `convex-test` with Vitest and `@edge-runtime/vm` for backend behavior.

## Main risks to design around

1. UTC prompt dates and per-device reminder dates can point partners at different prompt days.
2. Multiple/stale tokens can multiply pushes to one user.
3. Permission revocation is invisible until provider rejection.
4. Token upsert by token alone can transfer an existing token row to a different user without a user/device uniqueness policy.
5. Random values recomputed during retry would violate stable scheduling.
6. Scheduler duplication and duplicate client events need database uniqueness/idempotency guards.
7. External push dispatch cannot be transactionally atomic with Convex state; ambiguous sends must not be blindly retried.
8. Pair membership changes can leave scheduled recipients invalid unless due-send revalidates membership and permission.
9. Notification content and operational logs could leak prompt/answer information if payloads are not deliberately generic/minimal.

## Recommended conclusion

Replace the token-hour reminder as the authority with a couple-day lifecycle. Keep `pushTokens` as provider routing material, but move readiness, timezone policy, recipient order, schedule, start event, and dispatch idempotency into indexed durable records. Use pure deterministic helpers plus Convex integration tests before wiring UI/device behavior.
