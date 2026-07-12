# 01-04 Route/screen audit — Phase 1 and remaining primary surfaces

Updated: 2026-07-12T00:00:00-07:00

## Scope

Audit the app-router surfaces against `docs/product-spec-relationship-app-restructure.md` without changing runtime code. This complements `01-03-PHASE1-GAP-AUDIT.md` by checking the remaining primary tab files and leftover tab-directory routes.

Files inspected:

- `src/app/(tabs)/_layout.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/chat.tsx`
- `src/app/(tabs)/plans.tsx`
- `src/app/(tabs)/me.tsx`
- `src/app/(tabs)/swipe.tsx`
- `src/app/(tabs)/review.tsx`
- `src/app/(sheet)/plans/new.tsx`
- `src/app/(sheet)/plans/random.tsx`
- `src/app/plans/history.tsx`
- `src/app/plans/match/[category].tsx`

## Findings

### Phase 1 surfaces still align

- `src/app/(tabs)/_layout.tsx` exposes exactly four native tab triggers: `Today`, `Chat`, `Plans`, and `Me`.
- Today still contains the accepted Phase 1 sections: relationship duration, daily prompt, weekly game/quiz cards, recent moments, and Add Moment FAB.
- Today routes prompt answers through `/prompts/today` and moment creation/history/detail through the moment routes, keeping prompts separate from journal moments.
- Me contains the expected profile, relationship, theme/settings, sign-out, and confirmed/non-destructive leave-couple placeholder surfaces.

### Remaining route/spec mismatches to resolve before calling navigation fully clean

1. **Legacy tab-directory routes still exist:** `src/app/(tabs)/swipe.tsx` and `src/app/(tabs)/review.tsx` remain under the tabs route group even though the accepted tab spine is only Today, Chat, Plans, Me.
   - `swipe.tsx` overlaps with `/plans/match/[category]` and the Phase 2 plan-item swipe model.
   - `review.tsx` exposes monthly AI review generation/sharing behavior that the spec lists as deferred under Chat.
   - Recommended next slice: decide whether these should be deleted, moved to non-tab/internal routes, or explicitly hidden/redirected so they cannot appear as stale product surfaces.
2. **Plans root is Phase 2+ rather than Phase 1-only:** `src/app/(tabs)/plans.tsx` already includes Our Dates/date-leaderboard behavior from the date-plans restructure. That is acceptable for Phase 2 work, but Phase 1 acceptance should not rely on Plans root visual QA beyond confirming the Plans tab exists and does not crash.
3. **Argent/device proof remains the final Phase 1 gate:** no simulator walkthrough was performed in this audit. The still-needed walkthrough is the same as `01-03`: launch with mock auth if needed, verify the four bottom tabs, Today scrolling/FAB/prompt/moment history routes, and Me account/settings controls.

## Suggested next safe action

Resolve the stale `(tabs)/swipe.tsx` and `(tabs)/review.tsx` routing decision in a bounded slice before deeper UI polish. Prefer a non-destructive redirect/hide approach first if there is uncertainty about whether Austin still wants those screens preserved.

## Verification

- Documentation-only audit. Run `pnpm format:check .planning/phases/01-relationship-app-restructure/01-04-ROUTE-SCREEN-AUDIT.md` or repo format check after this file is updated.
