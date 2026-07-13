# 02-02 Route copy audit — Plans/date semantics

Updated: 2026-07-12T16:23:00-07:00

## Scope

Audit the remaining Plans-related route surfaces against `docs/product-spec-date-plans-restructure.md` and `docs/product-spec-relationship-app-restructure.md` without changing runtime code. This follows the Phase 2 privacy/date-decoration work and the latest Argent Plans walkthrough.

Files inspected:

- `src/app/(tabs)/plans.tsx`
- `src/app/plans/match/[category].tsx`
- `src/app/plans/history.tsx`
- `src/app/(sheet)/plans/new.tsx`
- `src/app/(sheet)/plans/random.tsx`

## Findings

### Product-language alignment

- Plans root clearly separates date surfaces from plan-item surfaces:
  - `Our Dates` is described as `The decision list for date night.`
  - `Explore Dates` is described as `Leaderboard-style date ideas built from matched items.`
  - `Matched Items` is described as `History of mutual yeses. These are ingredients, not dates.`
- The swipe route uses plan-item language throughout: `{Category} plan items`, `No more ... plan item cards`, and `Add plan item`.
- Match history is labeled `Matched plan items` and the empty state tells users to `swipe activities and places`, matching the rule that swipe stays on plan items only.
- Add-item sheet uses privacy-preserving copy: `Suggest it safely` and `Your partner can swipe on it, but they won’t know you created it unless it becomes a match.`
- Random sheet remains scoped to plan-item/category picks rather than dates, which matches the relationship-app spec's dice/random action for plan items.

### No immediate runtime-code change needed

No blocking copy mismatch was found in these route files. The remaining Phase 2 risk is not visible terminology; it is longer-term hardening such as date-plan dedupe keys and, eventually, test coverage around privacy/date decoration behavior.

## Suggested next safe action

Keep Phase 2 code stable unless a concrete bug appears. The next bounded engineering slice should be either:

1. date-plan dedupe-key planning/implementation, or
2. a small test-harness slice that can lock down private-until-mutual date decoration without requiring live Convex state.

## Verification

- Static audit only; no runtime code changed in this slice.
- `pnpm format:check` passed.
- `pnpm lint` passed with 0 warnings and 0 errors.
- `pnpm typecheck` passed.
- `git diff --check` passed.
- `tools/agent_review` passed for tracked-file diff; this slice only adds planning Markdown and has no runtime code or secrets.
