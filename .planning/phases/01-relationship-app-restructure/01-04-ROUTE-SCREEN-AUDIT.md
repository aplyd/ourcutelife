# 01-04 Route/screen audit — Phase 1 and remaining primary surfaces

Updated: 2026-07-12T10:11:36-07:00

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

1. **Legacy tab-directory routes are now guarded:** `src/app/(tabs)/swipe.tsx` and `src/app/(tabs)/review.tsx` remain as compatibility route files, but they now immediately redirect to accepted product surfaces instead of exposing stale tab-directory screens.
   - `/swipe` redirects to `/plans`, where Phase 2 plan-item/date work is consolidated.
   - `/review` redirects to `/chat`, matching the spec direction that AI-mediated reflection/review belongs under Chat when revived.
2. **Plans root is Phase 2+ rather than Phase 1-only:** `src/app/(tabs)/plans.tsx` already includes Our Dates/date-leaderboard behavior from the date-plans restructure. That is acceptable for Phase 2 work, but Phase 1 acceptance should not rely on Plans root visual QA beyond confirming the Plans tab exists and does not crash.
3. **Argent/device proof now covers the remaining Today route taps:** direct `xcodebuild` plus Argent reinstall/launch previously verified the four bottom tabs and the Today Add Moment sheet on iPhone 17 Pro / iOS 26.5 with mock auth. The latest Argent run additionally verified that Today `Answer prompt` opens the daily prompt sheet and `Recent moments` → `See all` opens the `/moments` history screen.

## Suggested next safe action

Phase 1 navigation is visually verified enough to move forward. Next safe work is either a small Phase 2 Plans/date-plan audit slice or a narrowly scoped fix if another simulator/dev-build issue appears.

## Verification

- Code/docs slice verification: `pnpm typecheck` passed.
- Code/docs slice verification: `pnpm format:check` passed.
- Code/docs slice verification: `git diff --check` passed.
- Review: `tools/agent_review` passed with no obvious added-line security patterns.
- Device verification: `EXPO_PUBLIC_MOCK_AUTH=1 xcodebuild -workspace ios/ourcutelife.xcworkspace -scheme ourcutelife -configuration Debug -destination 'id=F736E64F-ED8F-475C-BD05-7C156B568F74' -derivedDataPath ios/build build` passed with `** BUILD SUCCEEDED **`.
- Device verification: Argent `reinstall-app` and `launch-app` passed for `com.ourcutelife.app` on iPhone 17 Pro / iOS 26.5.
- Device verification: Argent described Today, Chat, Plans, and Me tab screens and the Today Add Moment sheet.
- Device verification: Argent launched `com.ourcutelife.app`, scrolled Today so `Answer prompt` was clear of the tab bar, tapped it, and described the daily prompt sheet with `Write your answer…` and `Submit answer` visible.
- Device verification: Argent dismissed the prompt sheet, tapped `Recent moments` → `See all`, and described the `/moments` screen with `MOMENTS`, `Your private relationship journal`, `Log a moment`, and the mock `GOOD` timeline item visible.
