# 02-01 Date plans restructure audit

Updated: 2026-07-11T10:14:00-07:00

## Scope

Start of Phase 2 for `docs/product-spec-date-plans-restructure.md`: separate private plan-item swiping from matched items, Explore Dates, and Our Dates.

Inspected:

- `docs/product-spec-date-plans-restructure.md`
- `convex/schema.ts`
- `convex/plans.ts`
- `src/app/(tabs)/plans.tsx`
- `src/app/plans/match/[category].tsx`
- `src/app/(sheet)/plans/new.tsx`

## Current baseline

The backend already contains more of the date-plans slice than the UI implies:

- `planIdeas.kind` exists as optional `activity | place`.
- `planIdeas.createdByUserId` exists and `publicIdea(..., revealCreator)` supports private/revealed creator metadata.
- `datePlans`, `datePlanLikes`, `savedDatePlans`, and `datePlanRatings` tables exist.
- `plans.ts` has date-related queries/mutations including contextual recommendations, date leaderboard sorting, Our Dates, likes/saves/scheduling/completion/rating helpers, and date generation for matched items.
- The Plans tab already has visible sections for matched ideas, Explore Dates, and Our Dates.

## Findings

### P1 — UI appears to be ahead of the old roadmap checkpoint

The product spec’s MVP backend objects are present, and `Plans` tab already separates concepts visually. The next work should avoid rebuilding schema and should instead verify/clean up semantics, privacy, and UX.

### P1 — Privacy rule needs explicit verification and likely tightening

Spec says: “Partner-created items stay private until matched.”

Observed:

- Swipe list calls `publicIdea(idea, false)`, which hides `createdByUserId`.
- Matched items call `publicIdea(idea, true)`, which reveals creator metadata after match.
- Date decoration calls `publicIdea(idea, true)` for every item inside every date plan.

Risk:

- If a suggested/manual date ever includes an unmatched partner-created item, date recommendations/leaderboard/Our Dates can reveal its creator metadata and item details before a mutual match.

Recommended first code slice:

- In `decorateDatePlan`, reveal creator/details only for matched item IDs, viewer-created items, or seed/public items.
- If a date plan includes private unmatched items, either hide those items from the decorated `items` list or return a redacted placeholder until matched.
- Add a small helper and type-safe tests/fixtures if the project has a testing path; otherwise verify with `pnpm typecheck` and a targeted Convex dry run if available.

### P1 — Saved date state is couple-wide, not per-user duplicated

`savedDatePlans` indexes by couple/status/date plan, which matches “Our Dates” as a couple-owned decision list. This is aligned with the spec.

### P2 — Date plan dedupe is scan-based

`ensureDateForIdea` and `ensureDateForPair` scan the latest 100 date plans to dedupe. This is safe enough for MVP but can miss older duplicates once the table grows.

Later option:

- Add a stable `dedupeKey` to `datePlans` for generated plans.

### P2 — Leaderboard is local/couple-scoped

The spec explicitly says real global area leaderboard is out of scope. Current couple-scoped sort modes are acceptable for MVP.

## Recommended next implementation order

1. Tighten/redact private unmatched plan items in date decoration.
2. Verify Plans tab UI labels/buttons reflect “plan item” vs “date” consistently.
3. Add thin seed/demo path notes for date plans after simulator launches.
4. Consider date-plan dedupe key later, not in the first slice.

## Verification target for next code slice

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `git diff --check`
- Argent Plans-tab walkthrough when simulator environment is fixed.
