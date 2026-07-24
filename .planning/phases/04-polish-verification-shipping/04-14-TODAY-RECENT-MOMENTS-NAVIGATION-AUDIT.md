# 04-14 — Today recent-moments navigation audit

Date: 2026-07-20
Status: Implemented and verified

## Outcome

The next bounded accepted-spec Phase 4 slice should make the two Today recent-moments navigation paths explicit native buttons:

- `See all` should expose a stable name such as `See all moments` and retain `/moments`.
- Each preview row should expose a descriptive name such as `Open moment: {summary}` and retain `/moments/{id}`.

This is an accessibility-only slice. It must not change moment visibility, content, ordering, routing, persistence, styling, or backend behavior.

## Implementation result

`src/app/(tabs)/index.tsx` now gives the existing Today navigation controls explicit React Native accessibility metadata:

- `See all` has `accessibilityRole="button"` and `accessibilityLabel="See all moments"`; its existing `router.push("/moments")` handler is unchanged.
- Each recent-moment preview has `accessibilityRole="button"` and the dynamic label `Open moment: {summary}`; its existing `/moments/{id}` handler is unchanged.

No visibility, content, ordering, styling, persistence, routing destination, fixture, or backend behavior changed.

## Why this is the next slice

The accepted relationship-app spec requires each recent-moment row to open moment detail and `See all` to open moment history (`docs/product-spec-relationship-app-restructure.md`, lines 94–100). The controls are visibly present and route correctly, but `src/app/(tabs)/index.tsx` lines 204–229 renders both actions as `Pressable` elements without explicit accessibility roles or stable action labels.

On the installed mock-auth app, Argent reported both controls as generic groups rather than native buttons:

- `AXGroup "See all"`
- `AXGroup "GOOD, Jul 19, Mocked a sweet product moment so agents can verify the timeline."`

This is higher priority than visual-only polish because it affects the primary Today-to-journal navigation path for assistive-technology users. The linked `/moments` history and `/moments/[id]` destination controls were already verified in prior slices; this closes the remaining entry-point mismatch without expanding scope.

## Non-destructive Argent verification contract

1. Launch the mock-auth app and open Today (`/`).
2. Scroll to `Recent moments` without activating a form or mutation.
3. Accessibility inspection must expose `See all moments` and `Open moment: Mocked a sweet product moment so agents can verify the timeline.` as native buttons.
4. Activate `See all moments`, require the `/moments` screen marker, then return.
5. Activate the fixture preview, require the `/moments/mock_moment_1` detail marker, then return.
6. Screenshot target: Today with `Recent moments`, `See all`, and the fixture preview visible.
7. Require no warnings or errors in the connected debugger log registry.

## Audit evidence

- Device: iPhone 17 Pro, iOS 26.5
- Simulator: `F736E64F-ED8F-475C-BD05-7C156B568F74`
- Bundle: `com.ourcutelife.app`
- Route: `/`
- Installed app launched successfully.
- Argent accessibility inspection reproduced the two generic-group controls.
- Connected debugger resolved this repository and reported 0 log entries.
- No control was activated, no backend mutation ran, and no application code changed in this audit.

## Implementation verification evidence

### RED / GREEN regression coverage

- Added `tests/unit/today-recent-moments-accessibility.test.ts`, which binds both labels and explicit button roles to their retained route handlers.
- RED: the focused test failed 0/1 because the existing `/moments` `Pressable` did not match `accessibilityRole="button"`.
- GREEN: the same focused test passed 1/1 after the accessibility-only implementation.
- Full unit suite: `pnpm test:unit` passed 49/49.

### Static and repository checks

- `pnpm typecheck`: passed.
- `pnpm lint`: passed with 0 warnings and 0 errors across 85 files.
- `pnpm exec oxfmt --check 'src/app/(tabs)/index.tsx' tests/unit/today-recent-moments-accessibility.test.ts`: passed for both slice files.
- `pnpm format:check`: reached all 237 files and remains blocked only by preserved pre-existing drift in four already-dirty historical artifact JSON files and `src/app/(tabs)/plans.tsx`; neither product file nor test in this slice was listed.
- `git diff --check`: passed.
- `tools/agent_review`: passed its changed-file and added-line security review with no obvious added-line security patterns; the review packet continues to include the preserved cumulative dirty tree.
- `tools/agent_validate`: reached its repository-wide format gate and stopped on the same five preserved pre-existing files; no slice file was listed.

### Argent mobile/UI verification

- Device: iPhone 17 Pro, iOS 26.5.
- Simulator: `F736E64F-ED8F-475C-BD05-7C156B568F74`.
- Bundle: `com.ourcutelife.app`, mock-auth runtime.
- Argent: v0.13.0.
- After an Argent clean app restart, `debugger-connect` and `debugger-status` resolved project root `/Users/austinftacnik/dev/ourcutelife`, app `com.ourcutelife.app (iPhone 17 Pro)`, 9 loaded scripts, and a ready source map.
- On Today (`/`), after one non-mutating scroll to `Recent moments`, public accessibility inspection independently reported:
  - `AXButton "See all moments"`
  - `AXButton "Open moment: Mocked a sweet product moment so agents can verify the timeline."`
- Low-level native inspection independently reported both controls with `traits: ["button"]` and `viewClassName: "RCTViewComponentView"`.
- Activated `See all moments`; the destination exposed the `/moments` marker `MOMENTS`, `Your private relationship journal`, `Log a moment`, and the fixture history row. Returned with the native edge-back gesture.
- Activated the Today fixture preview; the destination exposed the `/moments/mock_moment_1` detail markers `PRIVATE MOMENT`, `Good moment`, `Sunday, July 19, 2026`, and the exact fixture summary. Edit and Delete were not activated.
- These were navigation-only actions. No create, edit, delete, save, form submission, backend mutation, credential, deployment, commit, or push occurred.
- Final debugger log registry: 0 total entries, with no warnings or errors.
- Screenshot: `.planning/artifacts/2026-07-20-today-recent-moments-accessibility/today-recent-moments.png` (362×787 PNG from the 402×874 simulator screen; Today `Recent moments`, visible `See all`, and fixture preview).
- Screenshot SHA-256: `aa63c34bbdc5dc00ece9691eaa9f2a6ed0885b426f751443694519addfef895c`.
