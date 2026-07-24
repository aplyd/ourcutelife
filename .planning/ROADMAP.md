# Roadmap

## Current product priority

The accepted next product direction is:

1. Daily prompt notification lifecycle.
2. Generated and reusable answered-prompt library.
3. Quality Time workflow replacing the forward-looking Plans/Dates/Matches model.

Phase 4's open-ended accessibility sweep is no longer the default source of work. Existing verified accessibility and date-plan work remains preserved while the new phases are discussed, planned, implemented, and Argent-verified.

## Phase 1 — Relationship app restructure

**Status:** implemented_pending_remaining_today_route_taps
**Goal:** Implement the accepted product spec that reorganizes the app around Today, Chat, Plans, and Me with private-until-mutual and invoked-AI principles.

Source spec: `docs/product-spec-relationship-app-restructure.md`

Audit: `phases/01-relationship-app-restructure/01-01-AUDIT.md`

Implementation status: bottom tabs are aligned around Today, Chat, Plans, and Me. Code/static checks passed, and a rebuilt/reinstalled `com.ourcutelife.app` completed the Today → Chat → Plans → Me Argent walkthrough on an iOS 26.5 simulator. Repeat focused device verification when a later UI slice changes these routes.

Potential task slices:

- Navigation/tab rename and route skeleton audit.
- Today tab layout and daily prompt states.
- Plans tab category grid, match flow routes, add/random/history routes.
- Chat tab MVP with explicit coach invocation affordances.
- Me tab account/profile/settings surface.
- UI copy cleanup: warm labels and honest placeholders.

## Phase 2 — Date plans restructure

**Status:** implemented_then_superseded_for_forward_product_work
**Goal:** Separate plan items from dates; add date templates, Our Dates state, recommendations, and date lifecycle queries/UI.

Source spec: `docs/product-spec-date-plans-restructure.md`

Potential task slices:

- Convex schema/query plan for `planIdeas.kind`, date templates, date lifecycle state.
- Seed starter dates from matched items.
- UI copy and Plans tab restructure around matched plan items vs dates.
- Our Dates MVP screen and lifecycle actions.
- Verification with tests/typecheck and Argent simulator walkthrough.

Current implementation order:

- [x] Audit backend/UI semantics for plan items vs dates.
- [x] Tighten date decoration so private unmatched partner-created plan items are not revealed through date surfaces.
- [x] Polish remaining visible copy for plan-item/date terminology in swipe/history routes.
- [x] Rebuild/reinstall dev app on the iOS 26.5 simulator and run Argent Today → Chat → Plans → Me walkthrough evidence.
- [x] Audit remaining Plans route copy for plan-item/date terminology mismatches.
- [x] Add date-plan dedupe-key hardening after MVP semantics/verification are stable.
- [x] Draft the safe backfill plan for existing date plans that lack `itemKey`.
- [x] Add/run a no-live-service validation path for the item-key backfill before any approved live migration.
- [x] Make mock-auth date lifecycle actions stateful for reliable simulator walkthroughs.
- [x] Show scheduled/completed timing and rated lifecycle state directly on date cards.
- [x] Present affordability tiers as `Free`/`$`/`$$` instead of literal-looking dollar amounts.
- [x] Audit and fix the next bounded accepted-spec Plans/date UX mismatch: keep scheduling, completion, and rating inside Our Dates rather than on Explore recommendations.
- [x] Audit lifecycle-action clarity within Our Dates and make accepted-date controls progress by state.

Forward note: do not continue expanding this model as the product roadmap. Phase 7 replaces it with Quality Time while preserving private-until-mutual guarantees and reusing sound infrastructure where appropriate.

## Phase 3 — Agentic engineering foundation

**Status:** active
**Goal:** Add repo-local workflow docs, validation/review tools, testing/visual/performance guidance, and feedback capture so autonomous agents can work with less context loss and less false confidence.

Current implementation order:

- [x] Add `AGENT_WORKFLOW.md` and `docs/agent/*` foundation docs.
- [x] Add `tools/agent_validate` and `tools/agent_review` wrappers.
- [x] Add recent-commit sweep script.
- [x] Add worksheet template and git-tag convention.
- [x] Add scripted Argent visual-regression baseline flow.
- [x] Add real test harness plan beyond lint/typecheck/Argent smoke.
- [x] Add no-new-dependency unit harness starter for date-plan privacy helper coverage.

## Phase 4 — Polish, verification, and shipping

**Status:** paused_after_verified_slices
**Goal:** Run focused QA on core flows, fix gaps, and prepare PR/release notes.

Current implementation order:

- [x] Establish and replay the non-destructive Today / Chat / Plans / Me Argent baseline.
- [x] Close P4-QA-001 native button semantics on the plan-item match route.
- [x] Verify Me account actions expose explicit button semantics without performing destructive account changes.
- [ ] Continue one bounded accepted-spec core-flow QA slice at a time with route, accessibility, screenshot, and debugger evidence.
- [ ] Prepare release notes only after focused QA is complete.

## Phase 5 — Daily prompt notification lifecycle

**Status:** in_progress_slice_05_06_approved_legacy_cron_retired
**Goal:** Deliver fair, permission-aware prompt timing that alternates the first partner and notifies the second partner only after answering has begun.

Context: `phases/05-daily-prompt-notification-lifecycle/CONTEXT.md`

Research: `phases/05-daily-prompt-notification-lifecycle/RESEARCH.md`

Implementation plan: `phases/05-daily-prompt-notification-lifecycle/05-01-PLAN.md`

Required slices:

- [x] Slice 05-01: implement and verify pure lifecycle/timezone, recipient-order, idempotency-key, and transition-guard primitives.
- [x] Slice 05-02: add and verify the additive schema and Convex test harness.
- [x] Slice 05-03: model authenticated notification permission/device readiness for both partners and implement the canonical couple timezone policy.
- [x] Slice 05-04: transactionally persist immutable couple-day timezone/date/random-minute/recipient plans with create-or-return replay and a private Today-state query.
- [x] Slice 05-05: define the authoritative first-non-empty answer-start event, schedule the second boundary exactly five minutes later, persist stable logical/job identities, and skip or cancel the delayed step when the second recipient starts early.
- [x] Slice 05-06: independently approve the locally implemented idempotent mocked dispatch and deterministic outcome-persistence boundary.
- [x] Retire the superseded fixed-hour reminder cron so it cannot bypass the new lifecycle during later release work.
- Make real notification dispatch idempotent across retries, permission changes, app reinstalls, and timezone/daylight-saving changes.
- Add deterministic tests plus device notification verification where the simulator/runtime permits it.

## Phase 6 — Generated and reusable daily prompts

**Status:** pending_discussion_and_plan
**Goal:** Generate warm, varied daily prompts and build a privacy-safe library whose ranking improves when couples actually complete them.

Required slices:

- Read the Convex AI guidelines and audit the current prompt schema/cloud-function path.
- Integrate the Vercel AI SDK in the cloud function with explicit model/provider configuration and failure fallback.
- Write and test generation guidance inspired by evidence-based Gottman principles without affiliation, copied proprietary material, diagnosis, or therapy claims.
- Add answered-prompt persistence after both partners submit, with no cross-couple answer or identity leakage.
- Seed new couples from reusable prompts and increment ranking on each additional couple completion.
- Balance ranking with recency, diversity, deduplication, safety filtering, and per-couple prompt history.

## Phase 7 — Quality Time

**Status:** pending_discussion_and_plan
**Goal:** Replace draining back-and-forth planning with a private, mutual flow that turns each partner's current preferences into concrete shared options.

Required slices:

- Map reusable data/routes from the current Plans model and write a migration-safe replacement plan.
- Initiator chooses now/future time plus Eat, Drink, Explore/Adventure, Entertainment, and/or Romance.
- Initiator accepts 3–5 private cards per selected category before the request can be sent.
- Partner receives the completed request, chooses current-interest categories, and swipes only relevant inventory.
- Stop each agreed category when a mutual option is found and present the combined Quality Time outcome.
- Preserve private rejections and authorship; cover no-match, insufficient inventory, abandonment, expiration, rescheduling, and cancellation.
- Verify the complete two-partner lifecycle with tests and Argent evidence.
