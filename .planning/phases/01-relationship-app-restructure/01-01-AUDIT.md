# 01-01 Audit — Relationship app restructure

Updated: 2026-07-08T19:30:43-07:00

## Scope

Non-mutating audit of the current app routes/screens against `docs/product-spec-relationship-app-restructure.md`.

Files inspected:

- `docs/product-spec-relationship-app-restructure.md`
- `src/app/(tabs)/_layout.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/chat.tsx`
- `src/app/(tabs)/plans.tsx`
- `src/app/(tabs)/me.tsx`
- route inventory under `src/app/`
- `package.json`

Verification run:

- `pnpm typecheck` — passed.

## Findings

### Already mostly implemented locally

- Today tab (`src/app/(tabs)/index.tsx`) includes the accepted Today spine: Together For card, Daily Prompt card, weekly game/quiz bento cards, recent moments preview, and Add Moment FAB.
- Daily prompt answers are routed through `/prompts/today`; recent moment tone `bad` is displayed as `HARD` in the UI.
- Chat tab (`src/app/(tabs)/chat.tsx`) exists and is shaped around explicit coach invocation modes (`Ask coach`, `Rephrase`) rather than proactive/lurking AI.
- Plans tab (`src/app/(tabs)/plans.tsx`) already includes the Phase 2 language split between matched plan items and dates: `Our Dates`, `Explore Dates`, and `Matched Items`; categories include `Intimacy`.
- Me tab (`src/app/(tabs)/me.tsx`) exists with profile, relationship, settings, sign out, and leave-couple confirmation placeholder.
- Non-tab routes needed by the spec are present: `/moments`, `/moments/[id]`, `/moments/new`, `/plans/history`, `/plans/match/[category]`, `/plans/new`, `/plans/random`.

### Main gap / likely next implementation slice

- `src/app/(tabs)/_layout.tsx` still exposes bottom tabs as `Today | Chat | Swipe | Plans`. The accepted spec requires `Today | Chat | Plans | Me`.
- Because `me.tsx` exists but is not registered as a NativeTabs trigger, Me appears to be hidden from the main tab bar. Sign-out may therefore be reachable via header affordance but not the intended primary Me tab.
- The old `swipe` tab still exists as a tab surface. The spec wants category-specific match flow as a non-tab route (`/plans/match/[category]`).

### Coordination notes

- The working tree is already dirty with many app/planning changes; avoid broad refactors until Austin or a worker intentionally owns this local branch state.
- Mobile/UI verification should include Argent after the tab-layout slice: boot simulator, walk through Today → Chat → Plans → Me, and capture screenshots or component-tree evidence.

## Atomic worker plan candidate

### Slice: expose Me tab and demote Swipe from bottom nav

Expected changes:

1. Update `src/app/(tabs)/_layout.tsx` to use four triggers: `index`/Today, `chat`/Chat, `plans`/Plans, `me`/Me.
2. Remove `swipe` from the tab bar without deleting the screen unless a separate cleanup plan says to delete it.
3. Ensure Plans retains route paths to `/plans/match/[category]` for swipe/match flows.
4. Keep product constraints intact: private-until-mutual, invoked-AI, warm labels.

Verification:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- Argent walkthrough: launch app on iOS simulator, confirm bottom tabs read Today/Chat/Plans/Me, open Me, verify sign out and relationship/settings sections are visible, open Plans and confirm category/match routes still work.
