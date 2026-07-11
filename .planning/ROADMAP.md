# Roadmap

## Phase 1 — Relationship app restructure

**Status:** implemented_pending_fresh_argent_walkthrough
**Goal:** Implement the accepted product spec that reorganizes the app around Today, Chat, Plans, and Me with private-until-mutual and invoked-AI principles.

Source spec: `docs/product-spec-relationship-app-restructure.md`

Audit: `phases/01-relationship-app-restructure/01-01-AUDIT.md`

Implementation status: bottom tabs are aligned around Today, Chat, Plans, and Me. Code/static checks passed. Argent can now launch an installed `com.ourcutelife.app` on an iOS 26.5 simulator, but the remaining verification gap is rebuilding/reinstalling the latest source edits and repeating the full walkthrough against that fresh build.

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
- [ ] Consider date-plan dedupe-key hardening after MVP semantics/verification are stable.

## Phase 3 — Agentic engineering foundation

**Status:** active
**Goal:** Add repo-local workflow docs, validation/review tools, testing/visual/performance guidance, and feedback capture so autonomous agents can work with less context loss and less false confidence.

Current implementation order:

- [x] Add `AGENT_WORKFLOW.md` and `docs/agent/*` foundation docs.
- [x] Add `tools/agent_validate` and `tools/agent_review` wrappers.
- [ ] Add worksheet template and git-tag convention.
- [ ] Add scripted Argent visual-regression baseline flow.
- [ ] Add real test harness plan beyond lint/typecheck/Argent smoke.

## Phase 4 — Polish, verification, and shipping

**Status:** pending
**Goal:** Run focused QA on core flows, fix gaps, and prepare PR/release notes.
