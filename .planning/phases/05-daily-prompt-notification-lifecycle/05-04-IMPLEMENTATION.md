# Phase 5 Slice 05-04 — Transactional Couple-Day Lifecycle Planning

Completed: 2026-07-22 17:46 PDT

## Outcome

Implemented the authenticated, server-authoritative couple-day lifecycle reconciler and member-private Today-state query. The slice persists an immutable couple/date/timezone/random-minute/recipient plan but does not dispatch notifications, record answer starts, schedule the second partner, add cron jobs, change UI, migrate live data, or deploy.

## Files

- `convex/dailyPromptLifecycles.ts`
  - Public `reconcileToday` mutation and `getTodayState` query accept no client-supplied user, couple, date, time, or random-minute authority.
  - Authentication resolves exactly one membership and fails closed for missing or ambiguous membership.
  - Reconciliation requires exactly two distinct members, a canonical valid couple timezone, one ready device for each member, and the existing daily prompt plus Tiny Quiz question content.
  - Couple-local date, inclusive 19:00–20:59 minute, absolute timestamp, first/second recipients, and initial statuses are persisted transactionally.
  - First-day ordering uses the creator/join-order fallback from Slice 05-01; later days alternate from the latest prior persisted lifecycle.
  - Same-day replay returns the existing immutable row. After 20:59 with no row, planning rolls to the next local date. In-window planning samples only the remaining current-day minutes so it does not persist a schedule stale by whole minutes.
  - Duplicate current or latest-prior logical rows fail closed.
  - Today state exposes complete prompt content, coarse setup blockers, and viewer-relative role/status only; it does not expose recipient IDs, couple IDs, device IDs, or push tokens.
- `convex/dailyPromptLifecycles.test.ts`
  - 21 focused Convex tests cover creation, replay, rollover, DST, late-window bounds, alternation, deep history, duplicate rows, authentication, membership cardinality, readiness, prompt content, public argument rejection, privacy, and setup blockers.
- `convex/prompts.ts`
  - Exposes the existing deterministic daily prompt and Tiny Quiz question through a server-side two-question adapter; no Phase 6 generation or persistence behavior was added.
- `convex/schema.ts`
  - Adds a readiness lookup index ordered by couple, user, enabled state, permission state, and token so lifecycle readiness performs a bounded indexed lookup without an arbitrary stale-device cap.

## RED → GREEN evidence

The delegated implementation and hardening retained vertical test evidence in `/tmp/ourcutelife-05-04-tdd.log`.

- Initial Slice 05-04 RED established missing lifecycle planning/state behavior before implementation.
- Hardening Cycle 8 RED: 5 failures / 19 tests.
  - Duplicate latest-prior lifecycle rows were silently accepted.
  - Today state omitted member-count, readiness, and prompt-content blockers.
  - A ready device beyond stale registrations was falsely ignored.
- Hardening Cycle 8 GREEN: 19/19 passed after shared setup gates, bounded duplicate detection, and cap-free readiness correctness.
- Independent no-edit Codex review found two Medium issues:
  - late in-window reconciliation could persist a first schedule earlier than server now;
  - readiness used an unbounded device collection.
- Review-fix RED: 2 failures / 21 tests for 20:30 and 20:59 local scheduling.
- Review-fix GREEN: 21/21 passed after remaining-window minute selection and an indexed bounded ready-device query.
- Coordinator review found the remaining sub-minute version of the stale-schedule issue: `20:30:30` could still persist `20:30:00`, and `20:59:30` could still create today's expired final-minute schedule.
- Coordinator-fix RED: 2 failures / 23 tests.
- Coordinator-fix GREEN: 23/23 passed after comparing server now to the absolute start of the current/final eligible local minute.
- Final no-edit review found a timezone-watermark Medium: moving from a far-ahead timezone to a far-behind timezone could derive a prompt date earlier than the latest persisted lifecycle.
- Watermark-fix RED: 1 failure / 24 tests reproduced a Tokyo July 23 lifecycle followed by a Honolulu July 22 derivation.
- Watermark-fix GREEN: 24/24 passed after reconciliation and Today state began reusing the latest persisted lifecycle whenever the newly derived date is equal or earlier.

## Final verification

- Focused Slice 05-04 suite: 24/24 passed.
- Focused lifecycle plus notification-device suites: 43/43 passed.
- `pnpm test:unit`: 69/69 passed.
- `pnpm test:convex`: 49/49 passed across three files.
- `pnpm typecheck`: passed.
- `pnpm lint`: 0 warnings and 0 errors across 100 files.
- Targeted `oxfmt --check`: passed for the Slice 05-04 source, tests, shared prompt/schema edits, report, ROADMAP, and STATE.
- `git diff --check`: passed.
- `tools/agent_review`: no obvious added-line security patterns; independent semantic review was run separately.

## Privacy and security

- Public APIs derive identity, couple ownership, current time, local date, and randomness on the server.
- Public validators accept no authority-bearing IDs, date/time, or random values.
- Exactly-one viewer membership and exact-two distinct couple membership are enforced independently.
- Readiness is evaluated by a bounded couple/user index and returns only a coarse blocker.
- Existing rows are replayed without exposing partner IDs or routing data.
- The latest persisted lifecycle is a forward-only date watermark across canonical timezone changes.
- Duplicate current-day and duplicate latest-prior logical rows fail closed.
- Convex mutation transaction semantics provide create-or-return retry safety for concurrent reconciliation attempts against the indexed couple/date read set.

## Argent evidence

Argent is not applicable to this backend-only planning/query slice: no mobile UI, navigation, permission prompt, notification delivery, or device-visible behavior changed. Later notification and UI integration slices retain the mandatory simulator/device verification contract.

## Remaining boundary

Slice 05-04 does not dispatch the first notification, define or persist the authoritative answer-start event, schedule the second partner five minutes later, execute cron jobs, add retry/provider ambiguity handling, or integrate the Today UI.

Next bounded slice: **05-05 — authoritative first-non-empty answer-start recording and idempotent second-partner scheduling.**
