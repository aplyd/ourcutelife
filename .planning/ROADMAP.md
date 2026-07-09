# Roadmap

## Phase 1 — Relationship app restructure

**Status:** audit_complete
**Goal:** Implement the accepted product spec that reorganizes the app around Today, Chat, Plans, and Me with private-until-mutual and invoked-AI principles.

Source spec: `docs/product-spec-relationship-app-restructure.md`

Audit: `phases/01-relationship-app-restructure/01-01-AUDIT.md`

First implementation slice: expose Me in the bottom tab bar and demote the old Swipe tab from primary navigation. Code/static checks passed; Argent walkthrough remains pending because simulator launch failed.

Potential task slices:

- Navigation/tab rename and route skeleton audit.
- Today tab layout and daily prompt states.
- Plans tab category grid, match flow routes, add/random/history routes.
- Chat tab MVP with explicit coach invocation affordances.
- Me tab account/profile/settings surface.
- UI copy cleanup: warm labels and honest placeholders.

## Phase 2 — Date plans restructure

**Status:** pending_discussion
**Goal:** Separate plan items from dates; add date templates, Our Dates state, recommendations, and date lifecycle queries/UI.

Source spec: `docs/product-spec-date-plans-restructure.md`

Potential task slices:

- Convex schema/query plan for `planIdeas.kind`, date templates, date lifecycle state.
- Seed starter dates from matched items.
- UI copy and Plans tab restructure around matched plan items vs dates.
- Our Dates MVP screen and lifecycle actions.
- Verification with tests/typecheck and Argent simulator walkthrough.

## Phase 3 — Polish, verification, and shipping

**Status:** pending
**Goal:** Run focused QA on core flows, fix gaps, and prepare PR/release notes.
