# Phase 5 Context — Daily Prompt Notification Lifecycle

## Goal

Implement REQ-PROMPT-001 through REQ-PROMPT-005 as one bounded lifecycle: schedule exactly one first-partner prompt notification only after both partners are notification-ready, alternate the first partner, choose and persist a random first-delivery minute in the couple's 7:00–9:00 PM window, and schedule the other partner exactly five minutes after the first partner begins entering an answer.

Phase 5 does not generate prompts or build the reusable answered-prompt library; those remain Phase 6.

## Accepted behavior

- Both partners must each have at least one current device registration whose OS permission is `granted` and whose Expo token is enabled before a couple-day can be scheduled.
- One partner is the assigned first recipient. Assignment alternates by the most recent persisted couple-day assignment, not by successful delivery or response.
- The first delivery is chosen once from local minutes `19:00` through `20:59` inclusive and persisted as an absolute timestamp.
- The second partner is not included in the initial send.
- `started answering` means the first transition from an empty answer to a non-empty answer in the prompt input. Opening/focusing the sheet is not sufficient.
- The server records the first accepted start event once. If it belongs to the assigned first recipient, it persists the second delivery for `startedAt + 5 minutes` exactly once.
- Duplicate app events, scheduler runs, token registration, permission reports, retries, and timezone reports converge on the existing couple-day records instead of creating a second logical delivery.

## Explicit timezone policy

- Add one persisted IANA timezone, `couples.promptTimezone`, as the couple's canonical daily-prompt timezone.
- Initialize it once from the couple creator's latest valid granted-device timezone after both partners are ready. If that value is unavailable or invalid, remain blocked; do not silently fall back to `America/Los_Angeles`, UTC, or the other partner's travel timezone.
- Both partners use the same canonical timezone for prompt-date keys, first-delivery local time, and day boundaries, even if devices travel or partners are temporarily in different zones.
- Snapshot `timezone` into every couple-day lifecycle row. A later timezone change applies only to future, not-yet-created couple-days. Existing scheduled/sent rows are immutable except for terminal state progression.
- Daylight-saving conversion occurs only when converting the persisted local date/minute to `firstScheduledAt`; retries reuse the stored absolute timestamp and timezone snapshot.
- A future settings surface may explicitly change `promptTimezone`; Phase 5 needs the authenticated mutation and status query, not a redesigned settings UI.

## Conservatively resolved assumptions

- Exactly two active `coupleMembers` are required. Couples with fewer or more are blocked and produce no delivery.
- First-day fallback is `couples.createdByUserId` if that user is still one of the two members; otherwise use earliest `joinedAt`, breaking ties by user ID. Persist the result so it never changes on retry.
- A partner is ready when at least one device registration is granted and has an enabled token. Denied/revoked registrations on other devices do not override an active granted device.
- For each logical recipient delivery, send only to that user's most recently updated eligible token. This avoids duplicate alerts across stale/reinstalled devices; later multi-device fan-out is out of scope.
- Permission state must be reported on app foreground/session start and after a permission request. Reinstall/token rotation updates device state but cannot recreate a couple-day delivery.
- If the second partner has already started or submitted before the delayed send becomes due, mark the second step `skipped_already_started`; do not send a redundant notification.
- If `startedAt + 5 minutes` crosses the couple-local date boundary, mark the delayed step `skipped_stale`; do not deep-link the partner into a different day's prompt.
- Provider ambiguity is resolved in favor of no duplicate: reserve one attempt before the network call. A crash after dispatch leaves the attempt `sending_unknown`; automated retries do not resend that idempotency key. Missing delivery may be reconciled from an Expo ticket/receipt in a later bounded slice, but duplicate suppression wins over blind retry.
- Notification content is generic. It may state that today's prompt is ready, but never contains prompt text, either answer, private tags/moments, response status details, or therapy/diagnostic language.

## Lifecycle state machine

One `dailyPromptLifecycles` row exists per `(coupleId, promptDate)`.

Primary states:

1. `blocked_permissions` — row may be materialized for observability, but no scheduler job exists.
2. `first_scheduled` — both partners are ready; timezone, recipient order, random minute, and `firstScheduledAt` are frozen.
3. `first_sending` — a unique first-step attempt was reserved.
4. `first_sent` — Expo accepted the first-step message and ticket metadata was recorded.
5. `first_started` — assigned first user emitted the authoritative non-empty answer-start event.
6. `second_scheduled` — `secondScheduledAt = firstStartedAt + 300_000` is frozen and one scheduled job exists.
7. `second_sending` — a unique second-step attempt was reserved.
8. `second_sent` — Expo accepted the second-step message.
9. `completed` — both answers exist; notification lifecycle is terminal.
10. `skipped` — terminal reason such as stale date, membership change, permission loss before a due send, or partner already started.

A lifecycle may store first and second step status separately so `first_sent` and `second_scheduled` remain queryable without losing history. Allowed transitions are monotonic. No retry may move a sent/terminal step backward, replace recipients, reroll time, or change the timezone snapshot.

Permission loss before a reserved send marks that step skipped. Permission/timezone changes never delete lifecycle or attempt history.

## Boundaries

In scope:

- permission/device readiness reporting
- canonical couple timezone and prompt-date alignment
- couple-day scheduling and recipient alternation
- first non-empty answer-start event
- delayed second scheduling
- Expo send attempt reservation/results
- deterministic unit and Convex tests
- non-production Argent verification contract

Out of scope:

- Phase 6 AI generation/reuse/ranking
- production deploy or migration execution
- notification analytics, marketing pushes, or rich content
- guaranteed exactly-once delivery by Expo/APNs (only exactly-once logical dispatch reservation is under app control)
- broad settings redesign
- Android behavior beyond preserving platform validators and pure logic
