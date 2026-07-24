# Plans date-action accessibility audit

Audited: 2026-07-22T01:32:10-0700
Closed: 2026-07-22T03:07:09-07:00
Status: complete; implementation and device verification passed

## Highest-value remaining accepted-spec mismatch

The accepted Plans experience says dates can be liked, saved, scheduled, completed, and rated. Those core date actions are visually present and functional, but the shared `Action` control in `src/app/(tabs)/plans.tsx` does not expose native button semantics.

Current iOS accessibility evidence on the Plans root:

- `Schedule` is exposed as `AXGroup "Schedule"`, not a button.
- `Mark done` is exposed as `AXGroup "Mark done"`, not a button.
- Explore Date actions such as `Like` and `Saved` are likewise exposed as groups.
- Native view lookup resolves `Schedule` to an `RCTViewComponentView` without button traits.
- The same shared `Action` helper also renders completed-date rating choices, so the gap affects the full saved → scheduled → completed → rated lifecycle.
- Final debugger registry contained 0 entries, so no runtime warning/error confounded the observation.

Retained baseline:

- `artifacts/04-18/plans-lifecycle-accessibility-baseline.png`
- SHA-256: `1546547cb7ce06f18c4d80d91ca22c8d1e2847c2ad35854d2a64c20241a90088`

## Bounded implementation slice

Update only the shared Plans `Action` control and focused source-contract coverage so lifecycle actions expose explicit native button semantics and stable accessible names while preserving all existing labels, handlers, navigation, and mutations. If selected state is added for `Liked` / `Saved`, it must mirror existing state only; do not change lifecycle behavior or backend contracts.

The separate unlabeled dice filter and related-date/archive affordances remain later audit candidates and are intentionally outside this slice.

## Required verification

- Add a focused unit/source-contract test for role, name, and any retained state.
- Run `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, and `git diff --check`.
- With Argent on iOS, open Plans and scroll to `Our Dates`.
- Confirm visible lifecycle controls are `AXButton` elements with the expected names.
- Non-destructively inspect Explore Date actions as buttons; do not tap any control that mutates saved/scheduled/completed/rating state.
- If a completed fixture already exists, inspect rating choices without submitting one; do not manufacture state through mutations.
- Retain a screenshot and confirm the final debugger log registry has 0 warnings/errors.

## Closure verification

The shared Plans `Action` control now exposes an explicit native button role and uses its existing visible label as a stable accessible name. The existing handlers, labels, lifecycle state, navigation, mutations, styling, and backend contracts are unchanged.

- Focused coverage was captured RED before implementation and GREEN afterward; the full unit suite passed 54/54.
- `pnpm typecheck` passed.
- `pnpm lint` passed with 0 warnings/errors.
- The new focused test is formatted. Repository-wide formatting of `src/app/(tabs)/plans.tsx` remains blocked by preserved pre-existing drift in that already-dirty file; this slice did not broad-format or overwrite the surrounding work.
- `git diff --check` passed.
- Fresh Argent inspection on iPhone 17 Pro / iOS 26.5 opened Plans without activating any date action. Public accessibility output reported `Schedule`, `Mark done`, `Like`, and `Saved` as `AXButton` elements. The debugger registry contained 0 entries/warnings/errors.
- Completion screenshot: `artifacts/04-18/plans-date-action-accessibility-complete.png`.
- Completion screenshot SHA-256: `a0208a3f018499af937cb253156f30d7068b2b81a4dc763b5c75636c0a1b6a49`.
