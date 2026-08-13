# Surprise picker explicit roll/reroll evidence — 2026-08-07

Device: iPhone 17 Pro, iOS 26.5, UDID `F736E64F-ED8F-475C-BD05-7C156B568F74`  
App: mock-auth `com.ourcutelife.app`  
Exact route: `ourcutelife:///plans/random`

## Automated RED/GREEN

- RED: focused source contract failed 0/3 before implementation.
- GREEN: the same focused contract passed 3/3.
- `pnpm test:unit`: 168/168 passed (the prior 165-test baseline plus these three tests).
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with 0 errors and the four preserved `convex/prompts.ts` `no-console` warnings.
- `pnpm exec oxfmt --check 'src/app/(sheet)/plans/random.tsx' tests/unit/surprise-roll-accessibility.test.ts`: passed.
- `git diff --check`: passed.
- `EXPO_PUBLIC_MOCK_AUTH=1 pnpm exec expo export --platform ios --output-dir .tmp/surprise-ios-export`: passed; iOS bundled 2,807 modules and exported successfully.
- `git diff --name-only -- convex 'convex/_generated'`: empty.

## Argent runtime evidence

1. `argent run open-url ... --url 'ourcutelife:///plans/random'` returned `{ "opened": true, "url": "ourcutelife:///plans/random" }`.
2. Public AX inspection reported `AXButton "Roll surprise picks"`; the component tree reported the explicit control and no result card before submission.
3. Tapping Food and Activity off retained the control with an empty selected set; `empty-selection-disabled.png` retains its disabled visual state. The focused source contract independently proves native `disabled` and accessibility `disabled` both use `selected.length === 0 || isRolling`, while accessibility `busy` uses `isRolling`.
4. Selecting only Food and tapping Roll changed the control to Reroll and produced exactly one result card (`Sunset picnic QA date`), retained in `food-first-roll.png`.
5. Tapping Reroll again completed and retained exactly one Food-selected result card in `food-reroll.png`. The deterministic mock has only one plan fixture, so a different title is neither expected nor claimed; the focused contract proves each reroll advances the query argument identity while the unchanged server query deduplicates categories and returns at most one private projection per category.
6. `debugger-log-registry` returned `totalEntries: 0`, an empty level map, and no clusters after the roll/reroll gestures.

Native app-scoped inspection was attempted repeatedly. `native-devtools-status` reported `envSetup: true`, `appRunning: true`, `connected: false`, `requiresRestart: true`, and `nextLaunchWillBeInjected: true`; `native-describe-screen` continued returning `restart_required` even after `restart-app`. The public AX service proves the control is a named `AXButton`, but the native disabled/busy trait capture required by the verification contract is therefore unavailable. Busy was also too brief to capture in the synchronous mock query. This evidence does **not** claim complete runtime accessibility verification.

## Screenshot SHA-256

- `current-auto-picks.png`: `19f8ac151a8689fc03889c0dbae07d401b9e9a6f54d0dba16e8fea4eefe384b9`
- `initial-explicit-roll.png`: `2db12c456a1ae119a693c61e4fc1b74d8a16fb644379e28c661e9826014f520c`
- `empty-selection-disabled.png`: `daef7207a1524a2c7944a40539d2f64722ed9f8684f88434a021fd5373636585`
- `food-first-roll.png`: `ef476c5184bb9208ca75cf04ed05f7d01dfc689196e3991553127a70b5e94c70`
- `food-reroll.png`: `7abcbcdb464bc23b33856e3aad9a1584626ded1068577d71396c0a98c681f5c2`
