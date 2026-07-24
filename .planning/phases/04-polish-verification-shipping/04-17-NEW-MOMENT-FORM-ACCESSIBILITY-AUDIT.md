# 04-17 — New Moment form accessibility audit

Date: 2026-07-21
Status: Verified

## Outcome

The next bounded accepted-spec Phase 4 slice should give the New Moment date, summary, and feeling fields stable accessible names and expose Save as an explicit native button whose disabled/busy state mirrors the existing save gate.

This is an accessibility-only slice. It must not change moment privacy, field values, validation, tone/tag behavior, mutation payload, persistence, routing, copy, layout, styling, fixtures, or backend behavior.

## Why this is the next slice

The accepted Today flow requires an Add Moment entry and `/moments/new` form route. The route is present and its tone choices are already verified native buttons, but the primary form controls remain ambiguous to assistive technology:

- `src/app/(sheet)/moments/new.tsx:104-135` renders the date, summary, and feeling inputs without explicit accessible names. The installed app exposes the populated date only as an unlabeled group value and derives generic group names for the two reflections from placeholder text.
- `src/app/(sheet)/moments/new.tsx:214-221` renders the existing Save action without an explicit button role or stable action label. The installed blank form exposes `Save private moment` as a disabled generic group rather than a native button.

This route is a core accepted Today job, and the gap affects the fields required to save a private moment. The already-closed New Moment tone slice does not cover these inputs or Save.

## Bounded implementation contract

1. Add stable accessible names to the existing inputs: `Moment date`, `What happened`, and `How the moment felt`.
2. Add `accessibilityRole="button"` and `accessibilityLabel="Save private moment"` to the existing Save `Pressable`.
3. Add an accessibility state that mirrors the existing `!canSave` disabled gate and `isSaving` busy state.
4. Keep `handleSave`, `canSave`, the mutation payload, privacy copy, field values, validation, tone/tag behavior, persistence, routing, layout, and styling unchanged.
5. Add focused source-contract coverage binding the metadata to the existing controls and save gate.

## Non-destructive Argent verification contract

1. Launch the mock-auth app and open Today (`/`).
2. Activate only `Add a moment` to reach `/moments/new`.
3. Accessibility inspection must expose the populated date field as `Moment date`, the two required reflection fields as `What happened` and `How the moment felt`, and Save as a native `Save private moment` button.
4. On the untouched blank form, Save must expose disabled state. Enter disposable local text in only the two required reflection fields and require Save to become enabled; do not activate Save.
5. Confirm Good remains the only selected tone and no tags are selected or changed.
6. Screenshot target: the scrolled New Moment form with tone choices, tags, and the disabled Save action visible before entering drafts.
7. Dismiss/restart without saving, confirm no moment was created, and require no warnings or errors in the connected debugger log registry.

## Audit evidence

- Device: iPhone 17 Pro, iOS 26.5.
- Simulator: `F736E64F-ED8F-475C-BD05-7C156B568F74`.
- Bundle: `com.ourcutelife.app`, installed mock-auth runtime.
- Route: direct non-mutating deep link to `/moments/new`, presented over the existing Plans tab.
- Public inspection exposed the date as an unlabeled `AXGroup` with value `2026-07-21`, the summary and feeling inputs as generic groups named only by placeholder text, and `Save private moment` as `AXGroup`.
- Independent native inspection exposed the date `RCTUITextField` with no label/traits, both reflection `RCTUITextView` elements with placeholder-derived labels and no traits, and Save with `traits: ["notEnabled"]` but no `button` trait.
- Good remained `button, selected`; Mixed and Hard remained unselected native buttons. No field, tone, tag, Save action, or backend mutation was activated.
- The connected debugger resolved `/Users/austinftacnik/dev/ourcutelife` and reported two normal startup entries (one log and one info), with 0 warnings and 0 errors.
- Screenshot: `.planning/artifacts/2026-07-21-new-moment-form-accessibility-audit/new-moment-form.png`.
- Screenshot SHA-256: `603b76f4fd7bc4bee0b3bc1a3703d210968ce89ecb8c8c5b5505cb9b50bf7166`.
- No application code, backend data, deployment, migration, credential, external communication, commit, or push changed.

## Implementation result

The existing New Moment controls now expose stable `Moment date`, `What happened`, and `How the moment felt` accessible names. The existing Save `Pressable` is a native `Save private moment` button, with `accessibilityState={{ disabled: !canSave, busy: isSaving }}` mirroring the retained save gate exactly.

No handler, privacy behavior, payload, copy, validation, tone/tag behavior, layout, styling, fixture, route, persistence, or backend behavior changed.

Focused source-contract coverage is in `tests/unit/new-moment-form-accessibility.test.ts` and binds each name to its existing state setter plus Save metadata to the existing `disabled={!canSave}` / `onPress={handleSave}` control.

## Automated verification

- RED before implementation: `pnpm test:unit` ran 53 tests, with the two new focused contracts failing and all 51 pre-existing tests passing (`51/53`, exit 1).
- Focused GREEN: compiling only `tests/unit/new-moment-form-accessibility.test.ts` and running its emitted Node test passed `2/2`.
- Full GREEN: `pnpm test:unit` passed `53/53`.
- `pnpm typecheck` passed.
- `pnpm lint` initially hit a transient `tsgolint` SIGSEGV (`exit 1`); an immediate full rerun passed with `0 warnings and 0 errors` on 88 files. A later validation run executed concurrently with unit/type checks and transiently failed to resolve installed `expo-updates`; the final isolated full rerun again passed with `0 warnings and 0 errors` on 88 files. Targeted lint passed with `0 warnings and 0 errors` on the two slice files.
- Targeted `oxfmt --check` passed for the route and focused test after formatting the new test.
- `git diff --check` passed.
- `tools/agent_review` reported no obvious added-line security patterns.

## Completion Argent verification

Device: iPhone 17 Pro, iOS 26.5  
Simulator: `F736E64F-ED8F-475C-BD05-7C156B568F74`  
Bundle: `com.ourcutelife.app`, installed mock-auth runtime  
Route: Today → `Add a moment` → `/moments/new`

Argent restarted the app against the current Metro source, opened Today, and activated only `Add a moment`. Public and independent native inspection established:

- populated date: public `AXGroup "Moment date" value="2026-07-22"`; native `RCTUITextField`, label `Moment date`, value `2026-07-22`
- blank summary: public/native accessible name begins with the explicit `What happened` label and appends the existing placeholder; after local text entry, native label was exactly `What happened`
- blank feeling: public/native accessible name begins with the explicit `How the moment felt` label and appends the existing placeholder; after local text entry, native label was exactly `How the moment felt`
- blank Save: public `AXButton "Save private moment"`; native label `Save private moment`, traits `["button", "notEnabled"]`
- after entering only disposable `Disposable summary` and `Disposable feeling` drafts: native Save traits changed to `["button"]`; Save was never activated
- Good remained the sole selected tone (`["button", "selected"]`); Mixed and Hard remained unselected `["button"]` controls
- all eight tags retained empty traits and none was selected or changed

The disabled-form screenshot was captured after scrolling the sheet to show all three tones, all tags, and disabled Save. After the enabled-state inspection, the sheet was dismissed by tapping outside it and the app was restarted. Today then contained no `Disposable` text and showed only the existing `Open moment: Mocked a sweet product moment so agents can verify the timeline.` fixture, proving no moment was created. The final debugger connection resolved `/Users/austinftacnik/dev/ourcutelife`; its registry contained `0` total entries, hence `0` warnings and `0` errors. One immediate debugger-registry call during the restart briefly reported no Metro CDP target; retry after two seconds connected successfully and returned the final empty registry.

## Completion evidence

- Screenshot: `.planning/artifacts/2026-07-21-new-moment-form-accessibility/new-moment-form.png`
- Screenshot SHA-256: `f55a6da4ce463f592c0f358311cb814efb269236817588bb4b68b1b6330f16be`
- Regression coverage: `tests/unit/new-moment-form-accessibility.test.ts`
- No Save action, mutation, backend-data change, credential use, production access, deployment, migration, external communication, commit, or push occurred.
