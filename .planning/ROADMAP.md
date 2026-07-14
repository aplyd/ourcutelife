# Roadmap

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

**Status:** active
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
- [ ] Audit lifecycle-action clarity within Our Dates before changing additional production behavior.

## Phase 3 — Agentic engineering foundation

**Status:** active
**Goal:** Add repo-local workflow docs, validation/review tools, testing/visual/performance guidance, and feedback capture so autonomous agents can work with less context loss and less false confidence.

Current implementation order:

- [x] Add `AGENT_WORKFLOW.md` and `docs/agent/*` foundation docs.
- [x] Add `tools/agent_validate` and `tools/agent_review` wrappers.
- [x] Add recent-commit sweep script.
- [ ] Add worksheet template and git-tag convention.
- [ ] Add scripted Argent visual-regression baseline flow.
- [x] Add real test harness plan beyond lint/typecheck/Argent smoke.
- [x] Add no-new-dependency unit harness starter for date-plan privacy helper coverage.

## Phase 4 — Polish, verification, and shipping

**Status:** pending
**Goal:** Run focused QA on core flows, fix gaps, and prepare PR/release notes.
