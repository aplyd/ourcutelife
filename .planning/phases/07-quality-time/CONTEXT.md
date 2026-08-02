# Phase 7 Context — Quality Time

Updated: 2026-08-01T21:14:31-07:00
Status: planning accepted; implementation not started

## Goal and locked contract

Replace the forward-looking Plans/Dates/Matches loop with a couple-initiated `Quality Time` workflow without changing or deleting the working legacy model until the replacement is independently verified.

Source constraints:

- `.planning/REQUIREMENTS.md` `REQ-PROD-001`, `REQ-PROD-006`–`007`, and `REQ-QT-001`–`008`.
- `.planning/DECISIONS.md` `D-006`–`007`.
- Accepted historical inputs: `docs/product-spec-relationship-app-restructure.md` and `docs/product-spec-date-plans-restructure.md`.

Locked Phase 7 language:

- Categories: `Eat`, `Drink`, `Explore/Adventure`, `Entertainment`, `Romance`.
- Timing: `now` or an explicit future timestamp.
- The initiator selects one or more categories and privately accepts 3–5 unique cards in every selected category before sending.
- The responder selects current-interest categories from the request and sees cards only in that intersection.
- A chosen category stops after its first mutual option. The outcome reveals mutual options only.
- Rejections, non-matching accepts, decision order, and user-authorship remain private.

## Current implementation map

| Existing object/surface                                                                         | Phase 7 disposition                                   | Reason / boundary                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `couples`, `coupleMembers`, authenticated session lookup                                        | **Reuse**                                             | Couple ownership and exact membership remain authoritative; never accept caller-supplied user identity.                                                                                              |
| `planIdeas` content fields (`title`, `description`, `kind`, cost/duration/tags/location/source) | **Reuse initially as inventory**                      | Cards are useful inventory. Quality Time must reference them through request-scoped records/projections and must not mutate legacy swipe state.                                                      |
| `planIdeas.createdByUserId`                                                                     | **Reuse as private provenance**                       | Strip it from every pre-mutual responder projection. A mutual outcome may reveal the option, but authorship should remain hidden unless a separately accepted product decision requires attribution. |
| Legacy categories (`food`, `drinks`, `activity`, `entertainment`, `intimacy`)                   | **Adapt, do not rewrite**                             | Map to Eat, Drink, Explore/Adventure, Entertainment, Romance at the Quality Time boundary. Keep old enum values and rows intact during coexistence.                                                  |
| `planPrivacy.canRevealDatePlanItem`                                                             | **Reuse the principle, not the exact helper**         | It protects date decoration, but request-scoped shortlist/response privacy needs a new fail-closed pure policy. Do not weaken the existing helper.                                                   |
| `planSwipes`                                                                                    | **Superseded for Quality Time**                       | Lifetime/global likes and passes cannot represent request-scoped current preference. No Quality Time dual-write.                                                                                     |
| `planMatches`, `planArchiveVotes`                                                               | **Superseded for Quality Time**                       | A Quality Time match belongs to one request/category and must not expose unrelated historical mutual state. Preserve legacy history.                                                                 |
| `datePlans` and `itemKey`                                                                       | **Preserve, not reuse as request/outcome state**      | Date bundles and dedupe remain readable legacy data; they do not model initiator/responder stages or private shortlists. Do not backfill for Phase 7.                                                |
| `datePlanLikes`, `savedDatePlans`, `datePlanRatings`, `datePlanState`, `datePlanDedupe`         | **Superseded for forward workflow; preserve history** | Legacy engagement/lifecycle semantics must not be dual-written from Quality Time. A later explicit product decision may define completion/history import.                                            |
| `/plans`                                                                                        | **Coexistence host, later cutover point**             | Keep the current screen unchanged until additive Quality Time routes and both-partner lifecycle verification pass.                                                                                   |
| `/plans/match/[category]`, `/plans/history`, `/plans/new`, `/plans/random`                      | **Legacy compatibility routes**                       | Do not repurpose: their contracts write/read global plan swipe/match state. Keep available during rollback.                                                                                          |
| `convex/plans.ts` queries/mutations                                                             | **Legacy compatibility API**                          | Preserve behavior. New Quality Time APIs live in a separate module and never silently write legacy tables.                                                                                           |
| `src/lib/devMock.ts` Plans fixtures                                                             | **Preserve; extend separately later**                 | Deterministic two-partner Quality Time fixtures will be needed for UI verification, but not in the first slice.                                                                                      |
| Notification device/readiness infrastructure                                                    | **Potential later reuse**                             | A request notification may be added only after transactional send-readiness. Do not reuse prompt lifecycle tables or schedule/send anything in the first slice.                                      |

## Additive target shape (later slices, not authorized by this context alone)

Use separate request-scoped tables rather than overloading legacy rows:

1. `qualityTimeRequests`: couple, initiator, responder, timing snapshot, selected-category snapshot, status, expiry/cancel timestamps, and version.
2. `qualityTimeOptions`: one bounded request/category/card reference with immutable display snapshot and private provenance.
3. `qualityTimeDecisions`: request/option/user decision with uniqueness by request + option + user. Never return raw partner decision rows.
4. `qualityTimeOutcomes`: at most one mutual option per chosen category, created transactionally and safe to reveal to both partners.

Exact schema/index validators require a later bounded plan. Arrays must remain bounded or be child rows; reads must be indexed and bounded. Draft, send, response, match, exhaustion, expiration, cancellation, and rescheduling transitions must be server-authoritative and fail closed on duplicate/ambiguous rows.

## Private-until-mutual guarantees

All later schema/API/UI slices must preserve these non-negotiable rules:

1. A responder cannot read or receive notification of a draft request.
2. `send` succeeds only when every initiator-selected category has 3–5 unique accepted cards; the readiness check and status transition are one server transaction.
3. Pre-mutual projections never include `createdByUserId`, initiator decision values/order, responder decisions, rejected option IDs, or hidden-category decisions.
4. The responder may receive neutral card content needed to swipe, but no field/copy may state which cards the initiator liked or passed.
5. The initiator may receive coarse progress/status only while waiting; they cannot inspect responder categories, passes, likes, or sequence.
6. A category outcome is revealable only after both users accepted the same request-scoped option. Stop that category immediately and reveal no remaining decisions.
7. Exhaustion/no-match/abandonment/expiration/cancellation returns a neutral state, never the other partner's rejection or authorship evidence.
8. Membership and role are derived server-side; cross-couple IDs, changed membership, duplicate decisions/outcomes, stale versions, and malformed counts fail closed.
9. No Quality Time operation writes `planSwipes`, `planMatches`, date lifecycle tables, or prompt notification tables.

## Coexistence, migration, and rollback

- **Additive only:** new pure policy, then optional new tables/APIs/routes in later approved slices. No rename, delete, backfill, or reinterpretation of existing rows.
- **No dual-write:** Quality Time decisions/outcomes do not create legacy swipes, matches, dates, likes, saves, schedules, completions, or ratings.
- **Route coexistence:** keep `/plans` and every existing Plans route functional. Add future routes under `/plans/quality-time/*`; expose their entry only after backend tests and deterministic mock fixtures are ready.
- **Read isolation:** legacy queries read legacy tables; Quality Time queries read request-scoped state plus bounded `planIdeas` inventory. Any inventory adapter strips private provenance.
- **Cutover gate:** remove or demote legacy forward-planning sections only after a complete two-partner Quality Time run, privacy-negative tests, and Argent evidence are independently approved.
- **Rollback:** hide/disable the Quality Time entry and stop its new API callers. Leave additive rows untouched for diagnosis; restore `/plans` as the sole entry. Because there is no dual-write or destructive migration, legacy behavior/data remains authoritative and usable.
- **Cleanup is separate:** table/route removal, legacy data conversion, optional `itemKey` backfill, notification delivery, and history import each require later explicit approval. Never infer production migration approval from Phase 7 UI approval.

## Mandatory later mobile/UI verification contract

The first implementation slice is pure logic and requires no simulator run. Any later mobile/UI slice must use Argent on a deterministic mock-auth two-partner fixture and record:

1. **Routes:** retain baseline screenshots/accessibility for `/plans`, `/plans/match/food`, `/plans/history`, `/plans/new`, and `/plans/random`; exercise only the changed new route(s): `/plans/quality-time/new`, `/plans/quality-time/[requestId]`, `/plans/quality-time/[requestId]/respond`, and/or `/plans/quality-time/[requestId]/outcome`.
2. **Accessibility tree:** use public `describe` and, when available, native app-scoped inspection. Record named button semantics and selected/disabled/busy state for timing, category, card Pass/Accept, Send, Cancel, and outcome controls. Assert that creator names and either partner's private rejection/decision labels are absent before mutual outcome.
3. **Screenshots:** capture the unchanged `/plans` baseline plus each changed checkpoint: initiator draft, 3–5-per-category send-ready state, responder category choice/swipe, neutral exhaustion/no-match state when in scope, and mutual-only outcome. Store under a dated `.planning/artifacts/` directory and report SHA-256 values.
4. **Debugger evidence:** connect to the repository runtime, confirm source maps are ready, and finish with `debugger_log_registry`; report log counts and investigate every warning/error rather than claiming a clean run. Record the route and simulator/device identity.
5. **Safety:** use fixture-only/local state. Do not notify, submit to live Convex, manufacture live partner data, touch credentials, or claim physical notification delivery from a simulator.
