# 01-03 Phase 1 gap audit — Navigation + Today

Updated: 2026-07-11T09:58:00-07:00

## Scope

Follow-up audit against Phase 1 of `docs/product-spec-relationship-app-restructure.md` after the bottom-tab alignment slice.

Files inspected:

- `src/app/(tabs)/_layout.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/chat.tsx`
- `src/app/(tabs)/plans.tsx`
- `src/app/(tabs)/me.tsx`
- `src/app/(sheet)/moments/new.tsx`
- `src/app/moments/index.tsx`
- `src/app/moments/[id].tsx`
- `src/app/(sheet)/prompts/today.tsx`
- `docs/product-spec-relationship-app-restructure.md`

## Findings

### Phase 1 acceptance state

- Bottom tabs are now `Today | Chat | Plans | Me` in `src/app/(tabs)/_layout.tsx`.
- `Me` is available as a primary tab and contains profile, relationship, settings, sign out, and leave-couple confirmation surfaces.
- Today includes the expected spine: header/subheader, Together For card, Daily Prompt card, weekly game/quiz bento cards, recent moments, and Add Moment FAB.
- `/moments`, `/moments/[id]`, and `/moments/new` exist, so removing the old Moments tab from primary navigation did not remove moment history/detail/add flows.
- Daily prompt answers are handled through `/prompts/today`, not saved as moments in the inspected UI path.
- Recent Moments maps backend tone `bad` to the visible label `HARD`.

### Small cleanup completed in this slice

- Today now uses `viewer.partner?.fullName ?? viewer.partner?.email ?? "your person"` for partner copy instead of a hard-coded `"your person"` value.

### Remaining Phase 1 verification gap

- Argent simulator walkthrough is still blocked by the local Xcode/simulator runtime mismatch captured in `.planning/STATE.md`.
- Once the simulator can launch the app, the walkthrough should verify:
  1. Bottom tabs render as Today, Chat, Plans, Me.
  2. Today scrolls and the Add Moment FAB opens `/moments/new`.
  3. Recent Moments `See all` opens `/moments`.
  4. Daily Prompt opens `/prompts/today`.
  5. Me tab shows profile/relationship/settings/account controls and sign out.

## Recommendation

Treat Phase 1 code as ready for visual verification. If simulator remains blocked, the next roadmap work can safely move to Phase 2 planning/code audit for Plans privacy/date-item separation while preserving the visual QA blocker as an environment task.

## Verification

- Pending after this audit/code slice: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `git diff --check`.
